const bcrypt = require('bcryptjs');
const db = require('../db/connection');
const { canManageAccount, validPassword } = require('../utils/accountSecurity');

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
    if (!validPassword(password)) return res.status(400).json({ error: 'Password must contain at least 6 characters and at most 72 UTF-8 bytes' });
    if (!canManageAccount(req.worker.role, role)) return res.status(403).json({ error: 'Only an owner can manage owner accounts' });
    const validRoles = ['owner','head_engineer','stock_manager','accounting','engineer','secretary','technician'];
    if (!validRoles.includes(role)) return res.status(400).json({ error: 'Invalid role' });
    const hash = await bcrypt.hash(password, 10);
    const [result] = await db.execute(
      'INSERT INTO workers(name,email,phone,role,password_hash) VALUES(?,?,?,?,?)',
      [name, email?.trim().toLowerCase()||null, phone||null, role, hash]
    );
    const [rows] = await db.execute(`SELECT ${COLUMNS} FROM workers WHERE id=?`, [result.insertId]);
    res.status(201).json(rows[0]);
  } catch (err) { console.error('[Workers] ❌ create:', err.message); next(err); }
}

async function updateWorker(req, res, next) {
  try {
    const { name, email, phone, role } = req.body;
    const validRoles = ['owner','head_engineer','stock_manager','accounting','engineer','secretary','technician'];
    if (role && !validRoles.includes(role)) return res.status(400).json({ error: 'Invalid role' });
    const [[target]] = await db.execute('SELECT role FROM workers WHERE id=?', [req.params.id]);
    if (!target) return res.status(404).json({ error: 'Worker not found' });
    if (!canManageAccount(req.worker.role, target.role, role || target.role)) return res.status(403).json({ error: 'Only an owner can manage owner accounts' });
    const fields = [], params = [];
    if (name)  { fields.push('name=?');  params.push(name); }
    if (email) { fields.push('email=?'); params.push(email.trim().toLowerCase()); }
    if (phone) { fields.push('phone=?'); params.push(phone); }
    if (role)  { fields.push('role=?');  params.push(role); }
    if (!fields.length) return res.status(400).json({ error: 'Nothing to update' });
    params.push(req.params.id);
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      // Lock owner rows together so concurrent demotions cannot remove the final owner.
      const [owners] = await conn.execute("SELECT id FROM workers WHERE role='owner' ORDER BY id FOR UPDATE");
      const [[current]] = await conn.execute('SELECT role FROM workers WHERE id=? FOR UPDATE', [req.params.id]);
      if (!current || !canManageAccount(req.worker.role, current.role, role || current.role)) {
        await conn.rollback();
        return res.status(current ? 403 : 404).json({ error: current ? 'Only an owner can manage owner accounts' : 'Worker not found' });
      }
      if (current.role === 'owner' && role && role !== 'owner' && owners.length <= 1) {
        await conn.rollback();
        return res.status(400).json({ error: 'The final owner account cannot be demoted' });
      }
      await conn.execute(`UPDATE workers SET ${fields.join(',')} WHERE id=?`, params);
      await conn.commit();
    } catch (error) { await conn.rollback(); throw error; } finally { conn.release(); }
    const [rows] = await db.execute(`SELECT ${COLUMNS} FROM workers WHERE id=?`, [req.params.id]);
    res.json(rows[0]);
  } catch (err) { console.error('[Workers] ❌ update:', err.message); next(err); }
}

async function deleteWorker(req, res, next) {
  let conn;
  let committed = false;
  try {
    const workerId = Number(req.params.id);
    if (workerId === Number(req.worker.id)) {
      return res.status(400).json({ error: 'You cannot delete your own account' });
    }
    conn = await db.getConnection();
    await conn.beginTransaction();
    const [[target]] = await conn.execute('SELECT role FROM workers WHERE id=? FOR UPDATE', [workerId]);
    if (!target) {
      await conn.rollback();
      committed = true;
      return res.status(404).json({ error: 'Worker not found' });
    }
    if (req.worker.role === 'head_engineer' && target.role !== 'engineer') {
      await conn.rollback(); committed = true;
      return res.status(403).json({ error: 'Head of Engineering can only manage engineer accounts' });
    }
    if (target.role === 'owner') {
      const [[{ owner_count }]] = await conn.execute("SELECT COUNT(*) AS owner_count FROM workers WHERE role='owner' FOR UPDATE");
      if (Number(owner_count) <= 1) {
        await conn.rollback();
        committed = true;
        return res.status(400).json({ error: 'The final owner account cannot be deleted' });
      }
    }
    await conn.execute('DELETE FROM workers WHERE id=?', [workerId]);
    await conn.commit();
    committed = true;
    res.json({ message: 'Deleted' });
  } catch (err) {
    if (conn && !committed) await conn.rollback();
    console.error('[Workers] ❌ delete:', err.message);
    next(err);
  } finally {
    if (conn) conn.release();
  }
}

module.exports = { getWorkers, createWorker, updateWorker, deleteWorker };
