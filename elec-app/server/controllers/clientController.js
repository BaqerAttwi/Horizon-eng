const db = require('../db/connection');

async function getClients(req, res, next) {
  try {
    const [clients] = await db.execute('SELECT * FROM clients ORDER BY name');
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
    console.log(`[Clients] Created: "${name}" id:${result.insertId}`);
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
}

async function updateClient(req, res, next) {
  try {
    const { type, name, tax_id, credit_limit, phone, email, address } = req.body;
    const fields = [], params = [];
    if (type)         { fields.push('type=?');         params.push(type); }
    if (name)         { fields.push('name=?');         params.push(name); }
    if (tax_id)       { fields.push('tax_id=?');       params.push(tax_id); }
    if (credit_limit) { fields.push('credit_limit=?'); params.push(credit_limit); }
    if (phone)        { fields.push('phone=?');        params.push(phone); }
    if (email)        { fields.push('email=?');        params.push(email); }
    if (address)      { fields.push('address=?');      params.push(address); }
    if (!fields.length) return res.status(400).json({ error: 'Nothing to update' });
    params.push(req.params.id);
    await db.execute(`UPDATE clients SET ${fields.join(',')} WHERE id=?`, params);
    const [rows] = await db.execute('SELECT * FROM clients WHERE id=?', [req.params.id]);
    res.json(rows[0]);
  } catch (err) { next(err); }
}

async function deleteClient(req, res, next) {
  try {
    await db.execute('DELETE FROM clients WHERE id=?', [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch (err) { next(err); }
}

module.exports = { getClients, createClient, updateClient, deleteClient };
