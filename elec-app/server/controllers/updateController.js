const db = require('../db/connection');
const VALID_ROLES = ['owner','head_engineer','stock_manager','accounting','engineer','secretary','technician'];

async function getUpdates(req, res, next) {
  try {
    const roleFilter = req.worker.role === 'owner' ? '1=1' : `(u.target_roles='all' OR FIND_IN_SET(?,u.target_roles)>0)`;
    const params = req.worker.role === 'owner' ? [req.worker.id] : [req.worker.id, req.worker.role];
    const [updates] = await db.execute(`SELECT u.id,u.version,u.title,u.summary,u.features,u.target_roles,u.published_at,
      w.name created_by_name,(r.update_id IS NOT NULL) is_read
      FROM app_updates u LEFT JOIN app_update_reads r ON r.update_id=u.id AND r.worker_id=?
      LEFT JOIN workers w ON w.id=u.created_by WHERE u.is_published=1 AND ${roleFilter}
      ORDER BY u.published_at DESC,u.id DESC`, params);
    const normalized = updates.map(update => ({ ...update, features: parseFeatures(update.features) }));
    res.json({ updates: normalized, unread_count: normalized.filter(update => !update.is_read).length });
  } catch (error) { next(error); }
}

function parseFeatures(value) {
  if (!value) return [];
  try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; }
  catch { return String(value).split('\n').map(line => line.trim()).filter(Boolean); }
}

async function markUpdateRead(req, res, next) {
  try {
    await db.execute('INSERT IGNORE INTO app_update_reads(update_id,worker_id) VALUES(?,?)', [req.params.updateId, req.worker.id]);
    res.json({ success: true });
  } catch (error) { next(error); }
}

async function markAllUpdatesRead(req, res, next) {
  try {
    const roleFilter = req.worker.role === 'owner' ? '1=1' : `(target_roles='all' OR FIND_IN_SET(?,target_roles)>0)`;
    const params = req.worker.role === 'owner' ? [req.worker.id] : [req.worker.id, req.worker.role];
    await db.execute(`INSERT IGNORE INTO app_update_reads(worker_id,update_id)
      SELECT ?,id FROM app_updates WHERE is_published=1 AND ${roleFilter}`, params);
    res.json({ success: true });
  } catch (error) { next(error); }
}

async function createUpdate(req, res, next) {
  try {
    const version = String(req.body.version || '').trim();
    const title = String(req.body.title || '').trim();
    const summary = String(req.body.summary || '').trim();
    const features = Array.isArray(req.body.features) ? req.body.features.map(String).map(v=>v.trim()).filter(Boolean) : [];
    const roles = req.body.target_roles === 'all' ? ['all'] : [...new Set((req.body.target_roles || []).filter(role => VALID_ROLES.includes(role)))];
    if (!version || !title || !summary || !features.length || !roles.length) return res.status(400).json({ error: 'Version, title, summary, features, and audience are required' });
    const [result] = await db.execute(`INSERT INTO app_updates(version,title,summary,features,target_roles,created_by)
      VALUES(?,?,?,?,?,?)`, [version,title,summary,JSON.stringify(features),roles.join(','),req.worker.id]);
    res.status(201).json({ id: result.insertId, version, title });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'This update version/title already exists' });
    next(error);
  }
}

module.exports = { getUpdates, markUpdateRead, markAllUpdatesRead, createUpdate, VALID_ROLES };
