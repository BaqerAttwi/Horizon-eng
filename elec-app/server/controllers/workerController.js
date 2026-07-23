const bcrypt = require('bcryptjs');
const db = require('../db/connection');

const COLUMNS = 'id, name, email, phone, role, created_at';

async function getWorkers(req, res, next) {
  try {
    const { role } = req.query;
    let sql = `SELECT ${COLUMNS} FROM workers`;
    const params = [];
    if (role) { sql += ' WHERE role=?'; params.push(role); }
    sql += ' ORDER BY name';
    const [workers] = await db.execute(sql, params);
    res.json(workers);
  } catch (err) { console.error('[Workers] ❌', err.message); next(err); }
}

async function createWorker(req, res, next) {
  try {
    const { name, email, phone, role, password } = req.body;
    if (!name || !role) return res.status(400).json({ error: 'name and role are required' });
    if (!password || password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
    const validRoles = ['owner','accounting','engineer','secretary','technician'];
    if (!validRoles.includes(role)) return res.status(400).json({ error: 'Invalid role' });
    const hash = await bcrypt.hash(password, 10);
    const [result] = await db.execute(
      'INSERT INTO workers(name,email,phone,role,password_hash) VALUES(?,?,?,?,?)',
      [name, email||null, phone||null, role, hash]
    );
    const [rows] = await db.execute(`SELECT ${COLUMNS} FROM workers WHERE id=?`, [result.insertId]);
    res.status(201).json(rows[0]);
  } catch (err) { console.error('[Workers] ❌ create:', err.message); next(err); }
}

async function updateWorker(req, res, next) {
  try {
    const { name, email, phone, role } = req.body;
    const validRoles = ['owner','accounting','engineer','secretary','technician'];
    if (role && !validRoles.includes(role)) return res.status(400).json({ error: 'Invalid role' });
    const fields = [], params = [];
    if (name)  { fields.push('name=?');  params.push(name); }
    if (email) { fields.push('email=?'); params.push(email); }
    if (phone) { fields.push('phone=?'); params.push(phone); }
    if (role)  { fields.push('role=?');  params.push(role); }
    if (!fields.length) return res.status(400).json({ error: 'Nothing to update' });
    params.push(req.params.id);
    await db.execute(`UPDATE workers SET ${fields.join(',')} WHERE id=?`, params);
    const [rows] = await db.execute(`SELECT ${COLUMNS} FROM workers WHERE id=?`, [req.params.id]);
    res.json(rows[0]);
  } catch (err) { console.error('[Workers] ❌ update:', err.message); next(err); }
}

async function deleteWorker(req, res, next) {
  try {
    await db.execute('DELETE FROM workers WHERE id=?', [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch (err) { console.error('[Workers] ❌ delete:', err.message); next(err); }
}

module.exports = { getWorkers, createWorker, updateWorker, deleteWorker };
