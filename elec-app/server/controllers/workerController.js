const db = require('../db/connection');

async function getWorkers(req, res, next) {
  try {
    const { role } = req.query;
    let sql = 'SELECT * FROM workers';
    const params = [];
    if (role) { sql += ' WHERE role=?'; params.push(role); }
    sql += ' ORDER BY name';
    const [workers] = await db.execute(sql, params);
    console.log(`[Workers] GET role:"${role||'all'}" → ${workers.length}`);
    res.json(workers);
  } catch (err) { console.error('[Workers] ❌', err.message); next(err); }
}

async function createWorker(req, res, next) {
  try {
    const { name, email, phone, role } = req.body;
    if (!name || !role) return res.status(400).json({ error: 'name and role are required' });
    const validRoles = ['owner','accounting','engineer','secretary'];
    if (!validRoles.includes(role)) return res.status(400).json({ error: 'Invalid role' });
    const [result] = await db.execute(
      'INSERT INTO workers(name,email,phone,role) VALUES(?,?,?,?)',
      [name, email||null, phone||null, role]
    );
    const [rows] = await db.execute('SELECT * FROM workers WHERE id=?', [result.insertId]);
    console.log(`[Workers] Created: "${name}" role:${role} id:${result.insertId}`);
    res.status(201).json(rows[0]);
  } catch (err) { console.error('[Workers] ❌ create:', err.message); next(err); }
}

async function updateWorker(req, res, next) {
  try {
    const { name, email, phone, role } = req.body;
    const fields = [], params = [];
    if (name)  { fields.push('name=?');  params.push(name); }
    if (email) { fields.push('email=?'); params.push(email); }
    if (phone) { fields.push('phone=?'); params.push(phone); }
    if (role)  { fields.push('role=?');  params.push(role); }
    if (!fields.length) return res.status(400).json({ error: 'Nothing to update' });
    params.push(req.params.id);
    await db.execute(`UPDATE workers SET ${fields.join(',')} WHERE id=?`, params);
    const [rows] = await db.execute('SELECT * FROM workers WHERE id=?', [req.params.id]);
    console.log(`[Workers] Updated id:${req.params.id}`);
    res.json(rows[0]);
  } catch (err) { console.error('[Workers] ❌ update:', err.message); next(err); }
}

async function deleteWorker(req, res, next) {
  try {
    await db.execute('DELETE FROM workers WHERE id=?', [req.params.id]);
    console.log(`[Workers] Deleted id:${req.params.id}`);
    res.json({ message: 'Deleted' });
  } catch (err) { console.error('[Workers] ❌ delete:', err.message); next(err); }
}

module.exports = { getWorkers, createWorker, updateWorker, deleteWorker };
