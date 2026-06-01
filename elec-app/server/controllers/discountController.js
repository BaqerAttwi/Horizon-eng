const db = require('../db/connection');

async function getDiscounts(req, res, next) {
  try {
    const { productId, brandId } = req.query;
    let where = 'WHERE 1=1';
    const params = [];

    if (productId) {
      where += ' AND pd.product_id = ?';
      params.push(parseInt(productId));
    }
    if (brandId) {
      where += ' AND pd.brand_id = ?';
      params.push(parseInt(brandId));
    }

    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50));
    const offset = (page - 1) * limit;

    const [[{ total }]] = await db.execute(
      `SELECT COUNT(*) as total FROM product_discounts pd ${where}`, params
    );

    const [discounts] = await db.execute(
      `SELECT pd.*, b.name as brand_name, pr.reference, pr.description
       FROM product_discounts pd
       LEFT JOIN products pr ON pd.product_id = pr.id
       LEFT JOIN brands b ON pd.brand_id = b.id
       ${where}
       ORDER BY pd.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    res.json({ data: discounts, total, page, limit });
  } catch (err) { console.error('[Discounts] ❌', err.message); next(err); }
}

async function createDiscount(req, res, next) {
  try {
    const { product_id, brand_id, discount_pct, notes } = req.body;
    if (!product_id && !brand_id) return res.status(400).json({ error: 'product_id or brand_id required' });

    const [result] = await db.execute(
      'INSERT INTO product_discounts(product_id,brand_id,discount_pct,notes) VALUES(?,?,?,?)',
      [product_id||null, brand_id||null, discount_pct||0, notes||null]
    );
    const [rows] = await db.execute(
      `SELECT pd.*, b.name as brand_name, pr.reference
       FROM product_discounts pd
       LEFT JOIN products pr ON pd.product_id = pr.id
       LEFT JOIN brands b ON pd.brand_id = b.id
       WHERE pd.id = ?`,
      [result.insertId]
    );
    console.log(`[Discounts] ✅ Created discount for product:${product_id} brand:${brand_id} → ${discount_pct}%`);
    res.status(201).json(rows[0]);
  } catch (err) { console.error('[Discounts] ❌', err.message); next(err); }
}

async function updateDiscount(req, res, next) {
  try {
    const { discount_pct, notes } = req.body;
    await db.execute('UPDATE product_discounts SET discount_pct=?,notes=? WHERE id=?',
      [discount_pct||0, notes||null, req.params.id]);
    const [rows] = await db.execute('SELECT * FROM product_discounts WHERE id=?', [req.params.id]);
    res.json(rows[0]);
  } catch (err) { console.error('[Discounts] ❌', err.message); next(err); }
}

async function deleteDiscount(req, res, next) {
  try {
    try {
      await db.execute('UPDATE product_discounts SET deleted_at = NOW() WHERE id=?', [req.params.id]);
    } catch (e) {
      if (e.code === 'ER_BAD_FIELD_ERROR') {
        await db.execute('DELETE FROM product_discounts WHERE id=?', [req.params.id]);
      } else { throw e; }
    }
    res.json({ message: 'Discount deleted' });
  } catch (err) { console.error('[Discounts] ❌', err.message); next(err); }
}

module.exports = { getDiscounts, createDiscount, updateDiscount, deleteDiscount };
