const db = require('../db/connection');
const { createNotification, notifyOwners } = require('./notificationController');

// ── Helper: generate a reference for a manual product ────────
async function generateReference(name) {
  const prefix = name.replace(/[^a-z0-9]/gi, '').substring(0, 8).toUpperCase();
  const [existing] = await db.execute(
    'SELECT COUNT(*) as cnt FROM products WHERE reference LIKE ?',
    [`${prefix}%`]
  );
  const num = (parseInt(existing[0].cnt) || 0) + 1;
  return `MAN-${prefix}-${String(num).padStart(3, '0')}`;
}

// ── Create a manual product request ──────────────────────────
async function createManualProductRequest(req, res, next) {
  try {
    const { name, description, price_usd, price_euro, brand, reference } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Product name is required' });

    const ref = reference || await generateReference(name.trim());
    const isOwner = req.worker.role === 'owner';

    if (isOwner) {
      // Owner: insert directly into products
      const [result] = await db.execute(
        `INSERT INTO products (reference, description, price_usd, price_euro, brand_id, stock_qty, reserved_qty)
         VALUES (?, ?, ?, ?, NULL, 0, 0)`,
        [ref, description || null, price_usd || null, price_euro || null]
      );
      const [newProduct] = await db.execute('SELECT * FROM products WHERE id=?', [result.insertId]);
      return res.status(201).json({ product: newProduct[0], auto_approved: true });
    }

    // Engineer: create a pending request
    const [result] = await db.execute(
      `INSERT INTO manual_product_requests (name, description, price_usd, price_euro, brand, reference, created_by, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [name.trim(), description || null, price_usd || null, price_euro || null, brand || null, ref, req.worker.id]
    );

    // Notify owners
    await notifyOwners('manual_product', `Manual Product Request: ${name}`,
      `${req.worker.name} wants to add a new product`, '/products');

    const [request] = await db.execute(
      `SELECT mpr.*, w.name as created_by_name
       FROM manual_product_requests mpr
       JOIN workers w ON w.id = mpr.created_by
       WHERE mpr.id=?`,
      [result.insertId]
    );

    res.status(201).json({ request: request[0], auto_approved: false });
  } catch (err) {
    console.error('[ManualProduct] ❌ create:', err.message);
    next(err);
  }
}

// ── Get requests (owner sees all, engineer sees own) ─────────
async function getManualProductRequests(req, res, next) {
  try {
    const { status } = req.query;
    let query = `SELECT mpr.*, w.name as created_by_name
                 FROM manual_product_requests mpr
                 JOIN workers w ON w.id = mpr.created_by
                 WHERE 1=1`;
    const params = [];

    if (req.worker.role !== 'owner') {
      query += ' AND mpr.created_by = ?';
      params.push(req.worker.id);
    }
    if (status) {
      query += ' AND mpr.status = ?';
      params.push(status);
    }
    query += ' ORDER BY mpr.created_at DESC';

    const [rows] = await db.execute(query, params);
    res.json(rows);
  } catch (err) {
    console.error('[ManualProduct] ❌ list:', err.message);
    next(err);
  }
}

// ── Approve a request (owner only) ───────────────────────────
async function approveManualProductRequest(req, res, next) {
  let conn;
  let committed = false;
  try {
    const { id } = req.params;

    conn = await db.getConnection();
    await conn.beginTransaction();
    const [requests] = await conn.execute(
      'SELECT * FROM manual_product_requests WHERE id=? AND status=?',
      [id, 'pending']
    );
    if (!requests.length) {
      await conn.rollback();
      committed = true;
      return res.status(404).json({ error: 'Pending request not found' });
    }
    const r = requests[0];

    // Generate reference if missing
    const ref = r.reference || await generateReference(r.name);
    const [productResult] = await conn.execute(
      `INSERT INTO products (reference, description, price_usd, price_euro, brand_id, stock_qty, reserved_qty)
       VALUES (?, ?, ?, ?, NULL, 0, 0)`,
      [ref, r.description, r.price_usd, r.price_euro]
    );

    // Update request status
    await conn.execute('UPDATE manual_product_requests SET status=? WHERE id=?', ['approved', id]);
    await conn.commit();
    committed = true;

    // Notify the requester
    await createNotification(r.created_by, 'manual_product_approved',
      `✅ Product "${r.name}" approved`,
      `Your manual product "${r.name}" has been approved and added to the database.`,
      '/products');

    const [newProduct] = await db.execute('SELECT * FROM products WHERE id=?', [productResult.insertId]);
    res.json({ product: newProduct[0], request_id: id });
  } catch (err) {
    if (conn && !committed) await conn.rollback();
    console.error('[ManualProduct] ❌ approve:', err.message);
    next(err);
  } finally {
    if (conn) conn.release();
  }
}

// ── Reject a request (owner only) ────────────────────────────
async function rejectManualProductRequest(req, res, next) {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const [requests] = await db.execute(
      'SELECT * FROM manual_product_requests WHERE id=? AND status=?',
      [id, 'pending']
    );
    if (!requests.length) return res.status(404).json({ error: 'Pending request not found' });
    const r = requests[0];

    await db.execute(
      'UPDATE manual_product_requests SET status=?, rejection_reason=? WHERE id=?',
      ['rejected', reason || null, id]
    );

    await createNotification(r.created_by, 'manual_product_rejected',
      `❌ Product "${r.name}" rejected`,
      reason ? `Reason: ${reason}` : 'Your product request was rejected.',
      '/products');

    res.json({ message: 'Request rejected', request_id: id });
  } catch (err) {
    console.error('[ManualProduct] ❌ reject:', err.message);
    next(err);
  }
}

module.exports = {
  createManualProductRequest,
  getManualProductRequests,
  approveManualProductRequest,
  rejectManualProductRequest,
};
