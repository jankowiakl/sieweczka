require('dotenv').config();
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./db');

const app = express();
app.use(express.json({ limit: '5mb' }));
app.use(cors({ origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : false }));

const photoDir = process.env.PHOTO_DIR || '/data/photos';
const parsedMaxPhotoMb = Number(process.env.MAX_PHOTO_MB || 25);
const maxPhotoMb = Number.isFinite(parsedMaxPhotoMb) ? parsedMaxPhotoMb : 25;
const jwtExpiresIn = process.env.JWT_EXPIRES_IN || '30d';
fs.mkdirSync(photoDir, { recursive: true });

const photoStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, photoDir),
  filename: (req, file, cb) => {
    const id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    req.photoId = id;
    const ext = path.extname(file.originalname || '').toLowerCase().replace(/[^a-z0-9.]/g, '').slice(0, 12);
    cb(null, `${id}${ext || '.bin'}`);
  }
});
const uploadPhoto = multer({
  storage: photoStorage,
  limits: { fileSize: Math.max(1, maxPhotoMb) * 1024 * 1024 }
});

const userPublicFields = 'id,email,name,role,is_active,created_at,updated_at,last_login_at';

function randomId(prefix) {
  return `${prefix}_${crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(16).slice(2)}`}`;
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function jwtSecret() {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is not configured');
  return process.env.JWT_SECRET;
}

function publicUser(row) {
  if (!row) return null;
  return { id: row.id, email: row.email, name: row.name, role: row.role };
}

function actorPayload(user) {
  if (!user || user.legacy) return {};
  return {
    updatedBy: user.id,
    updatedByName: user.name,
  };
}

async function audit(user, action, entityType, entityId, payload = {}) {
  await db.query(
    'INSERT INTO audit_log (user_id,action,entity_type,entity_id,payload) VALUES ($1,$2,$3,$4,$5)',
    [user?.id || null, action, entityType, entityId || null, payload]
  );
}

async function authenticateUser(req, res, next) {
  try {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (!token) return res.status(401).json({ error: 'unauthorized' });

    if (allowLegacySyncToken(req, token)) {
      req.user = { id: 'legacy-sync-token', email: 'legacy-sync-token', name: 'Legacy sync token', role: 'admin', legacy: true, isActive: true };
      return next();
    }

    const decoded = jwt.verify(token, jwtSecret());
    const q = await db.query(`SELECT ${userPublicFields} FROM users WHERE id = $1`, [decoded.sub]);
    const user = q.rows[0];
    if (!user || !user.is_active) return res.status(401).json({ error: 'inactive or missing user' });
    req.user = { id: user.id, email: user.email, name: user.name, role: user.role, isActive: user.is_active };
    next();
  } catch {
    res.status(401).json({ error: 'unauthorized' });
  }
}

function allowLegacySyncToken(_req, token) {
  return !!process.env.SYNC_TOKEN && token === process.env.SYNC_TOKEN;
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) return res.status(403).json({ error: 'forbidden' });
    next();
  };
}

function deletedAtFrom(entity) {
  return entity?.deletedAt || entity?.deleted_at || null;
}

function deletedByFrom(entity) {
  return entity?.deletedBy || entity?.deleted_by || null;
}

function deleteReasonFrom(entity) {
  return entity?.deleteReason || entity?.delete_reason || null;
}

function withActorPayload(payload, user, existing = null) {
  if (!user || user.legacy) return payload;
  return {
    ...payload,
    createdBy: payload.createdBy || existing?.created_by || user.id,
    createdByName: payload.createdByName || user.name,
    updatedBy: user.id,
    updatedByName: user.name
  };
}

const upsertRecordSql = `INSERT INTO records (uid,nest_id,species,observer,season,lat,lon,created_at,updated_at,deleted_at,client_id,payload,created_by,updated_by,deleted_by,delete_reason,server_updated_at)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,now())
ON CONFLICT (uid) DO UPDATE SET
nest_id=EXCLUDED.nest_id,species=EXCLUDED.species,observer=EXCLUDED.observer,season=EXCLUDED.season,lat=EXCLUDED.lat,lon=EXCLUDED.lon,created_at=EXCLUDED.created_at,updated_at=EXCLUDED.updated_at,deleted_at=EXCLUDED.deleted_at,client_id=EXCLUDED.client_id,payload=EXCLUDED.payload,created_by=COALESCE(records.created_by, EXCLUDED.created_by),updated_by=EXCLUDED.updated_by,deleted_by=EXCLUDED.deleted_by,delete_reason=EXCLUDED.delete_reason,server_updated_at=now()
WHERE records.updated_at IS NULL OR EXCLUDED.updated_at > records.updated_at
RETURNING uid`;

const upsertWorkingNestSql = `INSERT INTO working_nests (id,status,note,lat,lon,created_at,updated_at,deleted_at,client_id,payload,created_by,updated_by,deleted_by,delete_reason,server_updated_at)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,now())
ON CONFLICT (id) DO UPDATE SET
status=EXCLUDED.status,note=EXCLUDED.note,lat=EXCLUDED.lat,lon=EXCLUDED.lon,created_at=EXCLUDED.created_at,updated_at=EXCLUDED.updated_at,deleted_at=EXCLUDED.deleted_at,client_id=EXCLUDED.client_id,payload=EXCLUDED.payload,created_by=COALESCE(working_nests.created_by, EXCLUDED.created_by),updated_by=EXCLUDED.updated_by,deleted_by=EXCLUDED.deleted_by,delete_reason=EXCLUDED.delete_reason,server_updated_at=now()
WHERE working_nests.updated_at IS NULL OR EXCLUDED.updated_at > working_nests.updated_at
RETURNING id`;

async function upsertRecord(clientId, r, user) {
  const existing = (await db.query('SELECT created_by FROM records WHERE uid = $1', [r.uid])).rows[0] || null;
  const payload = withActorPayload(r, user, existing);
  const createdBy = r.createdBy || r.created_by || existing?.created_by || (user?.legacy ? null : user?.id) || null;
  const updatedBy = r.updatedBy || r.updated_by || (user?.legacy ? null : user?.id) || null;
  const q = await db.query(upsertRecordSql, [r.uid, r.nestId || null, r.species || null, r.observer || null, r.season || null, r.lat ?? null, r.lon ?? null, r.createdAt || null, r.updatedAt || null, deletedAtFrom(r), clientId || r.clientId || null, payload, createdBy, updatedBy, deletedByFrom(r), deleteReasonFrom(r)]);
  if (q.rows.length) await audit(user, 'record_upsert', 'record', r.uid, { clientId });
}

async function upsertWorkingNest(clientId, w, user) {
  const id = w.id || randomId('working');
  const existing = (await db.query('SELECT created_by FROM working_nests WHERE id = $1', [id])).rows[0] || null;
  const updatedAt = w.updatedAt || new Date().toISOString();
  const payload = withActorPayload({ ...w, id, updatedAt }, user, existing);
  const createdBy = w.createdBy || w.created_by || existing?.created_by || (user?.legacy ? null : user?.id) || null;
  const updatedBy = w.updatedBy || w.updated_by || (user?.legacy ? null : user?.id) || null;
  const q = await db.query(upsertWorkingNestSql, [id, w.status || null, w.note || w.notes || null, w.lat ?? null, w.lon ?? null, w.createdAt || updatedAt, updatedAt, deletedAtFrom(w), clientId || w.clientId || null, payload, createdBy, updatedBy, deletedByFrom(w), deleteReasonFrom(w)]);
  if (q.rows.length) await audit(user, 'working_nest_upsert', 'working_nest', id, { clientId });
}

function photoRowToApi(row) {
  return {
    id: row.id,
    recordUid: row.record_uid,
    workingNestId: row.working_nest_id,
    localRef: row.local_ref,
    photoRole: row.photo_role,
    filename: row.filename,
    originalName: row.original_name,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes == null ? null : Number(row.size_bytes),
    sha256: row.sha256,
    uploadedAt: row.uploaded_at,
    uploadedBy: row.uploaded_by,
    deletedAt: row.deleted_at,
    deletedBy: row.deleted_by,
    deleteReason: row.delete_reason,
    clientId: row.client_id,
    payload: row.payload || {},
    url: `/api/photos/${row.id}`
  };
}

async function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

async function usersCount() {
  const q = await db.query('SELECT count(*)::int AS count FROM users');
  return q.rows[0].count;
}

async function countActiveAdmins() {
  const q = await db.query("SELECT count(*)::int AS count FROM users WHERE role='admin' AND is_active=true");
  return q.rows[0].count;
}

async function createUser({ email, name, role, password }, actor) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    const error = new Error('email is required');
    error.status = 400;
    throw error;
  }
  if (!String(name || '').trim()) {
    const error = new Error('name is required');
    error.status = 400;
    throw error;
  }
  if (!password) {
    const error = new Error('password is required');
    error.status = 400;
    throw error;
  }
  if (String(password).length < 8) {
    const error = new Error('password must have at least 8 characters');
    error.status = 400;
    throw error;
  }
  if (!['admin', 'coordinator', 'observer'].includes(role)) {
    const error = new Error('invalid role');
    error.status = 400;
    throw error;
  }
  const id = randomId('user');
  const passwordHash = await bcrypt.hash(String(password), 12);
  let q;
  try {
    q = await db.query(
      `INSERT INTO users (id,email,name,role,password_hash) VALUES ($1,$2,$3,$4,$5) RETURNING ${userPublicFields}`,
      [id, normalizedEmail, String(name).trim(), role, passwordHash]
    );
  } catch (error) {
    if (error.code === '23505') {
      error.status = 409;
      error.message = 'email already exists';
    }
    throw error;
  }
  await audit(actor, 'user_created', 'user', id, { email: normalizedEmail, role });
  return q.rows[0];
}

app.get('/health', async (_req, res) => { await db.query('SELECT 1'); res.json({ ok: true, time: new Date().toISOString() }); });

app.post('/api/bootstrap-admin', async (req, res, next) => {
  try {
    if ((await usersCount()) > 0) return res.status(409).json({ error: 'bootstrap already completed' });
    const user = await createUser({ ...req.body, role: 'admin' }, null);
    res.json({ ok: true, user: publicUser(user) });
  } catch (error) {
    next(error);
  }
});

app.post('/api/login', async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const q = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = q.rows[0];
    if (!user || !user.is_active) return res.status(401).json({ error: 'invalid credentials' });
    const ok = await bcrypt.compare(String(req.body?.password || ''), user.password_hash);
    if (!ok) return res.status(401).json({ error: 'invalid credentials' });
    await db.query('UPDATE users SET last_login_at = now() WHERE id = $1', [user.id]);
    const token = jwt.sign({ sub: user.id, role: user.role }, jwtSecret(), { expiresIn: jwtExpiresIn });
    await audit(user, 'login', 'user', user.id, {});
    res.json({ token, user: publicUser(user) });
  } catch (error) {
    next(error);
  }
});

app.get('/api/me', authenticateUser, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

app.get('/api/users', authenticateUser, requireRole('admin'), async (_req, res) => {
  const q = await db.query(`SELECT ${userPublicFields} FROM users ORDER BY created_at DESC`);
  res.json({ users: q.rows });
});

app.post('/api/users', authenticateUser, requireRole('admin'), async (req, res, next) => {
  try {
    const user = await createUser(req.body || {}, req.user);
    res.json({ ok: true, user });
  } catch (error) {
    next(error);
  }
});

app.patch('/api/users/:id', authenticateUser, requireRole('admin'), async (req, res, next) => {
  try {
    const current = (await db.query('SELECT role,is_active FROM users WHERE id = $1', [req.params.id])).rows[0];
    if (!current) return res.status(404).json({ error: 'not found' });
    const name = req.body.name == null ? null : String(req.body.name).trim();
    const role = req.body.role == null ? null : String(req.body.role);
    if (role && !['admin', 'coordinator', 'observer'].includes(role)) return res.status(400).json({ error: 'invalid role' });
    if (role && role !== 'admin' && req.params.id === req.user.id) return res.status(400).json({ error: 'cannot change your own admin role' });
    if (role && current.role === 'admin' && role !== 'admin' && current.is_active && (await countActiveAdmins()) <= 1) {
      return res.status(409).json({ error: 'cannot remove the last active admin' });
    }
    const q = await db.query(
      `UPDATE users SET name=COALESCE($2,name), role=COALESCE($3,role), updated_at=now() WHERE id=$1 RETURNING ${userPublicFields}`,
      [req.params.id, name, role]
    );
    if (role && role !== current.role) await audit(req.user, 'user_role_changed', 'user', req.params.id, { from: current.role, to: role });
    res.json({ ok: true, user: q.rows[0] });
  } catch (error) {
    next(error);
  }
});

app.post('/api/users/:id/reset-password', authenticateUser, requireRole('admin'), async (req, res, next) => {
  try {
    const password = String(req.body?.password || '');
    if (password.length < 8) return res.status(400).json({ error: 'password must have at least 8 characters' });
    const hash = await bcrypt.hash(password, 12);
    await db.query('UPDATE users SET password_hash=$2, updated_at=now() WHERE id=$1', [req.params.id, hash]);
    await audit(req.user, 'user_password_reset', 'user', req.params.id, {});
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.post('/api/users/:id/deactivate', authenticateUser, requireRole('admin'), async (req, res) => {
  if (req.params.id === req.user.id) return res.status(400).json({ error: 'cannot deactivate your own account' });
  const current = (await db.query('SELECT role,is_active FROM users WHERE id=$1', [req.params.id])).rows[0];
  if (!current) return res.status(404).json({ error: 'not found' });
  if (current.role === 'admin' && current.is_active && (await countActiveAdmins()) <= 1) {
    return res.status(409).json({ error: 'cannot remove the last active admin' });
  }
  await db.query('UPDATE users SET is_active=false, updated_at=now() WHERE id=$1', [req.params.id]);
  await audit(req.user, 'user_deactivated', 'user', req.params.id, {});
  res.json({ ok: true });
});

app.post('/api/users/:id/activate', authenticateUser, requireRole('admin'), async (req, res) => {
  await db.query('UPDATE users SET is_active=true, updated_at=now() WHERE id=$1', [req.params.id]);
  await audit(req.user, 'user_activated', 'user', req.params.id, {});
  res.json({ ok: true });
});

app.get('/api/records', authenticateUser, async (req, res) => {
  const after = req.query.updated_after || '1970-01-01T00:00:00Z';
  const q = await db.query('SELECT payload FROM records WHERE server_updated_at > $1 ORDER BY server_updated_at ASC', [after]);
  res.json({ records: q.rows.map((r) => r.payload), serverTime: new Date().toISOString() });
});

app.post('/api/records/bulk', authenticateUser, async (req, res) => {
  const records = Array.isArray(req.body?.records) ? req.body.records : [];
  const clientId = req.body?.clientId || null;
  for (const r of records) await upsertRecord(clientId, r, req.user);
  res.json({ ok: true, count: records.length });
});

app.post('/api/sync', authenticateUser, async (req, res) => {
  const { clientId, lastSyncAt, records = [], workingNests = [] } = req.body || {};
  for (const r of records) await upsertRecord(clientId, r, req.user);
  for (const w of workingNests) await upsertWorkingNest(clientId, w, req.user);

  const since = lastSyncAt || '1970-01-01T00:00:00Z';
  const qRecords = await db.query('SELECT payload FROM records WHERE server_updated_at > $1 ORDER BY server_updated_at ASC', [since]);
  const qWorking = await db.query('SELECT payload FROM working_nests WHERE server_updated_at > $1 ORDER BY server_updated_at ASC', [since]);
  res.json({ records: qRecords.rows.map((r) => r.payload), workingNests: qWorking.rows.map((r) => r.payload), serverTime: new Date().toISOString() });
});

app.post('/api/photos', authenticateUser, uploadPhoto.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'file is required' });
    const id = req.photoId;
    const storagePath = req.file.path;
    const sha256 = await sha256File(storagePath);
    const payload = {
      fieldNames: {
        recordUid: req.body.recordUid || null,
        workingNestId: req.body.workingNestId || null,
        localRef: req.body.localRef || null,
        photoRole: req.body.photoRole || null
      }
    };
    const q = await db.query(
      `INSERT INTO photos (id,record_uid,working_nest_id,local_ref,photo_role,filename,original_name,mime_type,size_bytes,sha256,storage_path,client_id,payload,uploaded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING *`,
      [
        id,
        req.body.recordUid || null,
        req.body.workingNestId || null,
        req.body.localRef || null,
        req.body.photoRole || null,
        req.file.filename,
        req.file.originalname || null,
        req.file.mimetype || 'application/octet-stream',
        req.file.size || 0,
        sha256,
        storagePath,
        req.body.clientId || null,
        payload,
        req.user?.legacy ? null : req.user?.id || null
      ]
    );
    await audit(req.user, 'photo_upload', 'photo', id, { recordUid: req.body.recordUid || null, workingNestId: req.body.workingNestId || null });
    res.json({ ok: true, photo: photoRowToApi(q.rows[0]) });
  } catch (error) {
    if (req.file?.path) fs.promises.unlink(req.file.path).catch(() => {});
    next(error);
  }
});

app.get('/api/photos/:id', authenticateUser, async (req, res) => {
  const q = await db.query('SELECT * FROM photos WHERE id = $1 AND deleted_at IS NULL', [req.params.id]);
  const row = q.rows[0];
  if (!row) return res.status(404).json({ error: 'photo not found' });
  const storagePath = row.storage_path;
  if (!storagePath || !fs.existsSync(storagePath)) return res.status(404).json({ error: 'photo file not found' });
  res.type(row.mime_type || 'application/octet-stream');
  res.sendFile(path.resolve(storagePath));
});

app.get('/api/records/:uid/photos', authenticateUser, async (req, res) => {
  const q = await db.query('SELECT * FROM photos WHERE record_uid = $1 AND deleted_at IS NULL ORDER BY uploaded_at ASC', [req.params.uid]);
  res.json({ photos: q.rows.map(photoRowToApi), serverTime: new Date().toISOString() });
});

app.get('/api/working-nests/:id/photos', authenticateUser, async (req, res) => {
  const q = await db.query('SELECT * FROM photos WHERE working_nest_id = $1 AND deleted_at IS NULL ORDER BY uploaded_at ASC', [req.params.id]);
  res.json({ photos: q.rows.map(photoRowToApi), serverTime: new Date().toISOString() });
});

async function softDeletePayload(table, idColumn, id, user, reason) {
  const q = await db.query(`SELECT payload, created_by FROM ${table} WHERE ${idColumn} = $1`, [id]);
  const row = q.rows[0];
  if (!row) return null;
  if (user.role === 'observer' && row.created_by !== user.id) return false;
  const now = new Date().toISOString();
  return {
    payload: {
      ...(row.payload || {}),
      deletedAt: now,
      deletedBy: user.legacy ? null : user.id,
      deleteReason: reason || '',
      updatedAt: now,
      updatedBy: user.legacy ? row.payload?.updatedBy : user.id,
      updatedByName: user.legacy ? row.payload?.updatedByName : user.name
    },
    now
  };
}

async function restorePayload(table, idColumn, id, user) {
  const q = await db.query(`SELECT payload FROM ${table} WHERE ${idColumn} = $1`, [id]);
  const row = q.rows[0];
  if (!row) return null;
  const now = new Date().toISOString();
  const payload = { ...(row.payload || {}), deletedAt: null, deletedBy: null, deleteReason: null, updatedAt: now, updatedBy: user.id, updatedByName: user.name };
  return { payload, now };
}

app.post('/api/records/:uid/delete', authenticateUser, requireRole('admin', 'coordinator', 'observer'), async (req, res) => {
  const state = await softDeletePayload('records', 'uid', req.params.uid, req.user, req.body?.reason || req.body?.deleteReason || '');
  if (state === false) return res.status(403).json({ error: 'forbidden' });
  if (!state) return res.status(404).json({ error: 'not found' });
  await db.query('UPDATE records SET deleted_at=$2, deleted_by=$3, delete_reason=$4, updated_at=$2, updated_by=$3, payload=$5, server_updated_at=now() WHERE uid=$1', [req.params.uid, state.now, req.user.legacy ? null : req.user.id, req.body?.reason || '', state.payload]);
  await audit(req.user, 'record_soft_deleted', 'record', req.params.uid, { reason: req.body?.reason || '' });
  res.json({ ok: true, record: state.payload });
});

app.post('/api/working-nests/:id/delete', authenticateUser, requireRole('admin', 'coordinator', 'observer'), async (req, res) => {
  const state = await softDeletePayload('working_nests', 'id', req.params.id, req.user, req.body?.reason || req.body?.deleteReason || '');
  if (state === false) return res.status(403).json({ error: 'forbidden' });
  if (!state) return res.status(404).json({ error: 'not found' });
  await db.query('UPDATE working_nests SET deleted_at=$2, deleted_by=$3, delete_reason=$4, updated_at=$2, updated_by=$3, payload=$5, server_updated_at=now() WHERE id=$1', [req.params.id, state.now, req.user.legacy ? null : req.user.id, req.body?.reason || '', state.payload]);
  await audit(req.user, 'working_nest_soft_deleted', 'working_nest', req.params.id, { reason: req.body?.reason || '' });
  res.json({ ok: true, workingNest: state.payload });
});

app.post('/api/photos/:id/delete', authenticateUser, requireRole('admin', 'coordinator', 'observer'), async (req, res) => {
  const q = await db.query('SELECT uploaded_by,payload FROM photos WHERE id=$1', [req.params.id]);
  const row = q.rows[0];
  if (!row) return res.status(404).json({ error: 'not found' });
  if (req.user.role === 'observer' && row.uploaded_by !== req.user.id) return res.status(403).json({ error: 'forbidden' });
  const now = new Date().toISOString();
  const payload = { ...(row.payload || {}), deletedAt: now, deletedBy: req.user.legacy ? null : req.user.id, deleteReason: req.body?.reason || '' };
  await db.query('UPDATE photos SET deleted_at=$2, deleted_by=$3, delete_reason=$4, payload=$5 WHERE id=$1', [req.params.id, now, req.user.legacy ? null : req.user.id, req.body?.reason || '', payload]);
  await audit(req.user, 'photo_soft_deleted', 'photo', req.params.id, { reason: req.body?.reason || '' });
  res.json({ ok: true });
});

app.post('/api/records/:uid/restore', authenticateUser, requireRole('admin'), async (req, res) => {
  const state = await restorePayload('records', 'uid', req.params.uid, req.user);
  if (!state) return res.status(404).json({ error: 'not found' });
  await db.query('UPDATE records SET deleted_at=NULL, deleted_by=NULL, delete_reason=NULL, updated_at=$2, updated_by=$3, payload=$4, server_updated_at=now() WHERE uid=$1', [req.params.uid, state.now, req.user.id, state.payload]);
  await audit(req.user, 'record_restored', 'record', req.params.uid, {});
  res.json({ ok: true, record: state.payload });
});

app.post('/api/working-nests/:id/restore', authenticateUser, requireRole('admin'), async (req, res) => {
  const state = await restorePayload('working_nests', 'id', req.params.id, req.user);
  if (!state) return res.status(404).json({ error: 'not found' });
  await db.query('UPDATE working_nests SET deleted_at=NULL, deleted_by=NULL, delete_reason=NULL, updated_at=$2, updated_by=$3, payload=$4, server_updated_at=now() WHERE id=$1', [req.params.id, state.now, req.user.id, state.payload]);
  await audit(req.user, 'working_nest_restored', 'working_nest', req.params.id, {});
  res.json({ ok: true, workingNest: state.payload });
});

app.post('/api/photos/:id/restore', authenticateUser, requireRole('admin'), async (req, res) => {
  const q = await db.query('SELECT payload FROM photos WHERE id=$1', [req.params.id]);
  const payload = { ...(q.rows[0]?.payload || {}), deletedAt: null, deletedBy: null, deleteReason: null };
  await db.query('UPDATE photos SET deleted_at=NULL, deleted_by=NULL, delete_reason=NULL, payload=$2 WHERE id=$1', [req.params.id, payload]);
  await audit(req.user, 'photo_restored', 'photo', req.params.id, {});
  res.json({ ok: true });
});

app.use((error, _req, res, _next) => {
  if (error instanceof multer.MulterError) return res.status(400).json({ error: error.message });
  if (error.status) return res.status(error.status).json({ error: error.message });
  if (['email, name and password are required', 'invalid role'].includes(error.message)) return res.status(400).json({ error: error.message });
  console.error(error);
  res.status(500).json({ error: 'internal server error' });
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`API listening on ${port}`));
