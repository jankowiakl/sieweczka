require('dotenv').config();
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const db = require('./db');

const app = express();
app.use(express.json({ limit: '5mb' }));
app.use(cors({ origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : false }));

const photoDir = process.env.PHOTO_DIR || '/data/photos';
const parsedMaxPhotoMb = Number(process.env.MAX_PHOTO_MB || 25);
const maxPhotoMb = Number.isFinite(parsedMaxPhotoMb) ? parsedMaxPhotoMb : 25;
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

app.use((req, res, next) => {
  if (req.path === '/health') return next();
  const auth = req.headers.authorization || '';
  if (auth !== `Bearer ${process.env.SYNC_TOKEN}`) return res.status(401).json({ error: 'unauthorized' });
  next();
});

const upsertRecordSql = `INSERT INTO records (uid,nest_id,species,observer,season,lat,lon,created_at,updated_at,deleted_at,client_id,payload,server_updated_at)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,now())
ON CONFLICT (uid) DO UPDATE SET
nest_id=EXCLUDED.nest_id,species=EXCLUDED.species,observer=EXCLUDED.observer,season=EXCLUDED.season,lat=EXCLUDED.lat,lon=EXCLUDED.lon,created_at=EXCLUDED.created_at,updated_at=EXCLUDED.updated_at,deleted_at=EXCLUDED.deleted_at,client_id=EXCLUDED.client_id,payload=EXCLUDED.payload,server_updated_at=now()
WHERE records.updated_at IS NULL OR EXCLUDED.updated_at > records.updated_at`;

const upsertWorkingNestSql = `INSERT INTO working_nests (id,status,note,lat,lon,created_at,updated_at,deleted_at,client_id,payload,server_updated_at)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now())
ON CONFLICT (id) DO UPDATE SET
status=EXCLUDED.status,note=EXCLUDED.note,lat=EXCLUDED.lat,lon=EXCLUDED.lon,created_at=EXCLUDED.created_at,updated_at=EXCLUDED.updated_at,deleted_at=EXCLUDED.deleted_at,client_id=EXCLUDED.client_id,payload=EXCLUDED.payload,server_updated_at=now()
WHERE working_nests.updated_at IS NULL OR EXCLUDED.updated_at > working_nests.updated_at`;

async function upsertRecord(clientId, r) {
  await db.query(upsertRecordSql, [r.uid, r.nestId || null, r.species || null, r.observer || null, r.season || null, r.lat ?? null, r.lon ?? null, r.createdAt || null, r.updatedAt || null, r.deletedAt || null, clientId || r.clientId || null, r]);
}
async function upsertWorkingNest(clientId, w) {
  const id = w.id || (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const updatedAt = w.updatedAt || new Date().toISOString();
  await db.query(upsertWorkingNestSql, [id, w.status || null, w.note || w.notes || null, w.lat ?? null, w.lon ?? null, w.createdAt || updatedAt, updatedAt, w.deletedAt || null, clientId || w.clientId || null, { ...w, id, updatedAt }]);
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

app.get('/health', async (_req, res) => { await db.query('SELECT 1'); res.json({ ok: true, time: new Date().toISOString() }); });
app.get('/api/records', async (req, res) => {
  const after = req.query.updated_after || '1970-01-01T00:00:00Z';
  const q = await db.query('SELECT payload FROM records WHERE server_updated_at > $1 ORDER BY server_updated_at ASC', [after]);
  res.json({ records: q.rows.map((r) => r.payload), serverTime: new Date().toISOString() });
});
app.post('/api/records/bulk', async (req, res) => {
  const records = Array.isArray(req.body?.records) ? req.body.records : [];
  const clientId = req.body?.clientId || null;
  for (const r of records) await upsertRecord(clientId, r);
  res.json({ ok: true, count: records.length });
});
app.post('/api/sync', async (req, res) => {
  const { clientId, lastSyncAt, records = [], workingNests = [] } = req.body || {};
  for (const r of records) await upsertRecord(clientId, r);
  for (const w of workingNests) await upsertWorkingNest(clientId, w);

  const since = lastSyncAt || '1970-01-01T00:00:00Z';
  const qRecords = await db.query('SELECT payload FROM records WHERE server_updated_at > $1 ORDER BY server_updated_at ASC', [since]);
  const qWorking = await db.query('SELECT payload FROM working_nests WHERE server_updated_at > $1 ORDER BY server_updated_at ASC', [since]);
  res.json({ records: qRecords.rows.map((r) => r.payload), workingNests: qWorking.rows.map((r) => r.payload), serverTime: new Date().toISOString() });
});

app.post('/api/photos', uploadPhoto.single('file'), async (req, res, next) => {
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
      `INSERT INTO photos (id,record_uid,working_nest_id,local_ref,photo_role,filename,original_name,mime_type,size_bytes,sha256,storage_path,client_id,payload)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       ON CONFLICT (id) DO UPDATE SET uploaded_at=now()
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
        payload
      ]
    );
    res.json({ ok: true, photo: photoRowToApi(q.rows[0]) });
  } catch (error) {
    if (req.file?.path) fs.promises.unlink(req.file.path).catch(() => {});
    next(error);
  }
});

app.get('/api/photos/:id', async (req, res) => {
  const q = await db.query('SELECT * FROM photos WHERE id = $1', [req.params.id]);
  const row = q.rows[0];
  if (!row) return res.status(404).json({ error: 'photo not found' });
  const storagePath = row.storage_path;
  if (!storagePath || !fs.existsSync(storagePath)) return res.status(404).json({ error: 'photo file not found' });
  res.type(row.mime_type || 'application/octet-stream');
  res.sendFile(path.resolve(storagePath));
});

app.get('/api/records/:uid/photos', async (req, res) => {
  const q = await db.query('SELECT * FROM photos WHERE record_uid = $1 ORDER BY uploaded_at ASC', [req.params.uid]);
  res.json({ photos: q.rows.map(photoRowToApi), serverTime: new Date().toISOString() });
});

app.get('/api/working-nests/:id/photos', async (req, res) => {
  const q = await db.query('SELECT * FROM photos WHERE working_nest_id = $1 ORDER BY uploaded_at ASC', [req.params.id]);
  res.json({ photos: q.rows.map(photoRowToApi), serverTime: new Date().toISOString() });
});

app.use((error, _req, res, _next) => {
  if (error instanceof multer.MulterError) return res.status(400).json({ error: error.message });
  console.error(error);
  res.status(500).json({ error: 'internal server error' });
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`API listening on ${port}`));
