require('dotenv').config();
const express = require('express');
const cors = require('cors');
const db = require('./db');

const app = express();
app.use(cors({ origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : false }));

app.use((req, res, next) => {
  if (req.path === '/health') return next();
  const auth = req.headers.authorization || '';
  if (auth !== `Bearer ${process.env.SYNC_TOKEN}`) return res.status(401).json({ error: 'unauthorized' });
  next();
});

app.use('/api/photos/:id/content', express.raw({ type: '*/*', limit: process.env.PHOTO_UPLOAD_LIMIT || '25mb' }));
app.use(express.json({ limit: '5mb' }));

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

const upsertPhotoMetaSql = `INSERT INTO photos (id,record_uid,kind,position,filename,mime_type,size_bytes,checksum,updated_at,deleted_at,client_id,payload,server_updated_at)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,now())
ON CONFLICT (id) DO UPDATE SET
record_uid=EXCLUDED.record_uid,kind=EXCLUDED.kind,position=EXCLUDED.position,filename=EXCLUDED.filename,mime_type=EXCLUDED.mime_type,size_bytes=EXCLUDED.size_bytes,checksum=EXCLUDED.checksum,updated_at=EXCLUDED.updated_at,deleted_at=EXCLUDED.deleted_at,client_id=EXCLUDED.client_id,payload=EXCLUDED.payload,server_updated_at=now()
WHERE photos.updated_at IS NULL OR EXCLUDED.updated_at >= photos.updated_at`;

function safeId(id) {
  const value = String(id || '').trim();
  if (!value || value.length > 240 || !/^[A-Za-z0-9_.:-]+$/.test(value)) return null;
  return value;
}

async function upsertRecord(clientId, r) {
  await db.query(upsertRecordSql, [r.uid, r.nestId || null, r.species || null, r.observer || null, r.season || null, r.lat ?? null, r.lon ?? null, r.createdAt || null, r.updatedAt || null, r.deletedAt || null, clientId || r.clientId || null, r]);
}
async function upsertWorkingNest(clientId, w) {
  const id = w.id || (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const updatedAt = w.updatedAt || new Date().toISOString();
  await db.query(upsertWorkingNestSql, [id, w.status || null, w.note || w.notes || null, w.lat ?? null, w.lon ?? null, w.createdAt || updatedAt, updatedAt, w.deletedAt || null, clientId || w.clientId || null, { ...w, id, updatedAt }]);
}
async function upsertPhotoMeta(clientId, p) {
  const id = safeId(p.id);
  if (!id) return;
  const updatedAt = p.updatedAt || new Date().toISOString();
  await db.query(upsertPhotoMetaSql, [
    id,
    p.recordUid || p.record_uid || null,
    p.kind || null,
    Number.isFinite(Number(p.position)) ? Number(p.position) : null,
    p.filename || null,
    p.mimeType || p.mime_type || null,
    Number.isFinite(Number(p.sizeBytes ?? p.size_bytes)) ? Number(p.sizeBytes ?? p.size_bytes) : null,
    p.checksum || null,
    updatedAt,
    p.deletedAt || null,
    clientId || p.clientId || null,
    { ...p, id, updatedAt },
  ]);
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
  const { clientId, lastSyncAt, records = [], workingNests = [], photos = [] } = req.body || {};
  for (const r of records) await upsertRecord(clientId, r);
  for (const w of workingNests) await upsertWorkingNest(clientId, w);
  for (const p of photos) await upsertPhotoMeta(clientId, p);

  const since = lastSyncAt || '1970-01-01T00:00:00Z';
  const qRecords = await db.query('SELECT payload FROM records WHERE server_updated_at > $1 ORDER BY server_updated_at ASC', [since]);
  const qWorking = await db.query('SELECT payload FROM working_nests WHERE server_updated_at > $1 ORDER BY server_updated_at ASC', [since]);
  const qPhotos = await db.query('SELECT id,payload,(data IS NOT NULL) AS has_data FROM photos WHERE server_updated_at > $1 ORDER BY server_updated_at ASC', [since]);
  const missingPhotoIds = [];
  for (const p of photos) {
    const id = safeId(p.id);
    if (!id) continue;
    const hasData = await db.query('SELECT data IS NOT NULL AS has_data FROM photos WHERE id=$1', [id]);
    if (!hasData.rows[0]?.has_data) missingPhotoIds.push(id);
  }
  res.json({
    records: qRecords.rows.map((r) => r.payload),
    workingNests: qWorking.rows.map((r) => r.payload),
    photos: qPhotos.rows.map((r) => ({ ...r.payload, id: r.id, hasData: r.has_data })),
    missingPhotoIds,
    serverTime: new Date().toISOString(),
  });
});

app.get('/api/photos', async (req, res) => {
  const after = req.query.updated_after || '1970-01-01T00:00:00Z';
  const q = await db.query('SELECT id,payload,(data IS NOT NULL) AS has_data FROM photos WHERE server_updated_at > $1 ORDER BY server_updated_at ASC', [after]);
  res.json({ photos: q.rows.map((r) => ({ ...r.payload, id: r.id, hasData: r.has_data })), serverTime: new Date().toISOString() });
});

app.get('/api/photos/:id/content', async (req, res) => {
  const id = safeId(req.params.id);
  if (!id) return res.status(400).json({ error: 'invalid_photo_id' });
  const q = await db.query('SELECT mime_type,data FROM photos WHERE id=$1 AND deleted_at IS NULL', [id]);
  if (!q.rows[0]?.data) return res.status(404).json({ error: 'photo_not_found' });
  res.type(q.rows[0].mime_type || 'application/octet-stream').send(q.rows[0].data);
});

app.put('/api/photos/:id/content', async (req, res) => {
  const id = safeId(req.params.id);
  if (!id) return res.status(400).json({ error: 'invalid_photo_id' });
  const contentType = req.headers['content-type'] || 'application/octet-stream';
  const buf = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || '');
  await db.query(
    `INSERT INTO photos (id,mime_type,size_bytes,data,payload,updated_at,server_updated_at)
     VALUES ($1,$2,$3,$4,jsonb_build_object('id',$1,'mimeType',$2,'sizeBytes',$3),now(),now())
     ON CONFLICT (id) DO UPDATE SET mime_type=COALESCE(photos.mime_type,EXCLUDED.mime_type),size_bytes=EXCLUDED.size_bytes,data=EXCLUDED.data,server_updated_at=now()`,
    [id, contentType, buf.length, buf],
  );
  res.json({ ok: true, id, sizeBytes: buf.length });
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`API listening on ${port}`));
