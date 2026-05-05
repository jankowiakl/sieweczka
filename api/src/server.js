require('dotenv').config();
const express = require('express');
const cors = require('cors');
const db = require('./db');
const app = express();
app.use(express.json({ limit: '5mb' }));
app.use(cors({ origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : false }));
app.use((req,res,next)=>{
  if (req.path === '/health') return next();
  const auth = req.headers.authorization || '';
  if (auth !== `Bearer ${process.env.SYNC_TOKEN}`) return res.status(401).json({ error: 'unauthorized' });
  next();
});
const upsertSql = `INSERT INTO records (uid,nest_id,species,observer,season,lat,lon,created_at,updated_at,deleted_at,client_id,payload,server_updated_at)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,now())
ON CONFLICT (uid) DO UPDATE SET
nest_id=EXCLUDED.nest_id,species=EXCLUDED.species,observer=EXCLUDED.observer,season=EXCLUDED.season,lat=EXCLUDED.lat,lon=EXCLUDED.lon,created_at=EXCLUDED.created_at,updated_at=EXCLUDED.updated_at,deleted_at=EXCLUDED.deleted_at,client_id=EXCLUDED.client_id,payload=EXCLUDED.payload,server_updated_at=now()
WHERE records.updated_at IS NULL OR EXCLUDED.updated_at >= records.updated_at`;
async function upsertRecord(clientId, r){
  await db.query(upsertSql,[r.uid,r.nestId||null,r.species||null,r.observer||null,r.season||null,r.lat??null,r.lon??null,r.createdAt||null,r.updatedAt||null,r.deletedAt||null,clientId||r.clientId||null,r]);
}
app.get('/health', async (_req,res)=>{ await db.query('SELECT 1'); res.json({ ok:true, time:new Date().toISOString() }); });
app.get('/api/records', async (req,res)=>{ const after = req.query.updated_after || '1970-01-01T00:00:00Z'; const q = await db.query('SELECT payload FROM records WHERE server_updated_at > $1 ORDER BY server_updated_at ASC',[after]); res.json({ records:q.rows.map(r=>r.payload), serverTime:new Date().toISOString()});});
app.post('/api/records/bulk', async (req,res)=>{ const records = Array.isArray(req.body?.records)?req.body.records:[]; const clientId=req.body?.clientId||null; for (const r of records) await upsertRecord(clientId,r); res.json({ ok:true, count:records.length }); });
app.post('/api/sync', async (req,res)=>{ const { clientId,lastSyncAt,records=[] } = req.body || {}; for (const r of records) await upsertRecord(clientId,r); const q=await db.query('SELECT payload FROM records WHERE server_updated_at > $1 ORDER BY server_updated_at ASC',[lastSyncAt||'1970-01-01T00:00:00Z']); res.json({ records:q.rows.map(r=>r.payload), serverTime:new Date().toISOString() }); });
const port = process.env.PORT || 3000; app.listen(port, ()=>console.log(`API listening on ${port}`));
