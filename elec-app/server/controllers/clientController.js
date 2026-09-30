const db = require('../db/connection');

async function getClients(req, res, next) {
  try {
    const [clients] = await db.execute('SELECT * FROM clients WHERE deleted_at IS NULL ORDER BY name');
    res.json(clients);
  } catch (err) { next(err); }
}

async function createClient(req, res, next) {
  try {
    const { type, name, tax_id, credit_limit, phone, email, address } = req.body;
    if (!name) return res.status(400).json({ error: 'name required' });
    const [result] = await db.execute(
      'INSERT INTO clients(type,name,tax_id,credit_limit,phone,email,address) VALUES(?,?,?,?,?,?,?)',
      [type||'individual', name, tax_id||null, credit_limit||0, phone||null, email||null, address||null]
    );
    const [rows] = await db.execute('SELECT * FROM clients WHERE id=?', [result.insertId]);
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
}

async function updateClient(req, res, next) {
  try {
    const { type, name, tax_id, credit_limit, phone, email, address } = req.body;
    const fields = [], params = [];
    const [[existing]] = await db.execute('SELECT id FROM clients WHERE id=? AND deleted_at IS NULL', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Client not found' });
    if (name !== undefined && (typeof name !== 'string' || !name.trim())) return res.status(400).json({ error: 'Client name cannot be empty' });
    if (credit_limit !== undefined && (!Number.isFinite(Number(credit_limit)) || Number(credit_limit) < 0)) return res.status(400).json({ error: 'Credit limit must be a nonnegative number' });
    if (type)         { fields.push('type=?');         params.push(type); }
    if (name)         { fields.push('name=?');         params.push(name); }
    if (tax_id !== undefined)       { fields.push('tax_id=?');       params.push(tax_id || null); }
    if (credit_limit !== undefined) { fields.push('credit_limit=?'); params.push(Number(credit_limit)); }
    if (phone !== undefined)        { fields.push('phone=?');        params.push(phone || null); }
    if (email !== undefined)        { fields.push('email=?');        params.push(email || null); }
    if (address !== undefined)      { fields.push('address=?');      params.push(address || null); }
    if (!fields.length) return res.status(400).json({ error: 'Nothing to update' });
    params.push(req.params.id);
    await db.execute(`UPDATE clients SET ${fields.join(',')} WHERE id=?`, params);
    const [rows] = await db.execute('SELECT * FROM clients WHERE id=?', [req.params.id]);
    res.json(rows[0]);
  } catch (err) { next(err); }
}

async function deleteClient(req, res, next) {
  try {
    try {
      const [result] = await db.execute('UPDATE clients SET deleted_at = NOW() WHERE id=? AND deleted_at IS NULL', [req.params.id]);
      if (!result.affectedRows) return res.status(404).json({ error: 'Client not found' });
    } catch (e) {
      if (e.code === 'ER_BAD_FIELD_ERROR') {
        await db.execute('DELETE FROM clients WHERE id=?', [req.params.id]);
      } else { throw e; }
    }
    res.json({ message: 'Deleted' });
  } catch (err) { next(err); }
}

module.exports = { getClients, createClient, updateClient, deleteClient };
