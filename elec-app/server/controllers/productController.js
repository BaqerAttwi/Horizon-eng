const db = require('../db/connection');

// GET /api/products
async function getProducts(req, res, next) {
  try {
    const { search = '', brand = '', page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const params = [];
    let where = 'WHERE 1=1';

    if (search) {
      where += ' AND (p.reference LIKE ? OR p.description LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }
    if (brand) {
      where += ' AND b.name = ?';
      params.push(brand);
    }

    const [[{ total }]] = await db.execute(
      `SELECT COUNT(*) as total FROM products p LEFT JOIN brands b ON p.brand_id=b.id ${where}`,
      params
    );

    const [products] = await db.execute(
      `SELECT p.*, b.name as brand_name,
              (p.stock_qty - p.reserved_qty) as available_qty
       FROM products p
       LEFT JOIN brands b ON p.brand_id = b.id
       ${where} ORDER BY p.reference LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset]
    );

    console.log(`[Products] GET page:${page} search:"${search}" brand:"${brand}" → ${products.length}/${total} rows`);
    res.json({ products, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    console.error('[Products] ❌ getProducts:', err.message);
    next(err);
  }
}

// GET /api/products/:id
async function getProduct(req, res, next) {
  try {
    const [rows] = await db.execute(
      `SELECT p.*, b.name as brand_name, (p.stock_qty - p.reserved_qty) as available_qty
       FROM products p LEFT JOIN brands b ON p.brand_id=b.id WHERE p.id=?`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Product not found' });

    // Include active reservations
    const [reservations] = await db.execute(
      `SELECT oi.qty_reserved, oi.reserved_by_type, oi.reserved_by_name,
              oi.reservation_type, oi.order_id, o.status as order_status, o.channel
       FROM order_items oi JOIN orders o ON oi.order_id=o.id
       WHERE oi.product_id=? AND o.status NOT IN ('cancelled','delivered') AND oi.qty_reserved>0`,
      [req.params.id]
    );

    console.log(`[Products] GET id:${req.params.id} — reservations:${reservations.length}`);
    res.json({ ...rows[0], reservations });
  } catch (err) {
    console.error('[Products] ❌ getProduct:', err.message);
    next(err);
  }
}

// PATCH /api/products/:id
async function updateProduct(req, res, next) {
  try {
    const { stock_qty, price_cost, price_euro, price_usd, description } = req.body;
    const fields = [], params = [];

    if (stock_qty  !== undefined) { fields.push('stock_qty=?');   params.push(parseInt(stock_qty)); }
    if (price_cost !== undefined) { fields.push('price_cost=?');  params.push(price_cost === '' ? null : parseFloat(price_cost)); }
    if (price_euro !== undefined) { fields.push('price_euro=?');  params.push(price_euro === '' ? null : parseFloat(price_euro)); }
    if (price_usd  !== undefined) { fields.push('price_usd=?');   params.push(price_usd  === '' ? null : parseFloat(price_usd)); }
    if (description!== undefined) { fields.push('description=?'); params.push(description); }

    if (!fields.length) return res.status(400).json({ error: 'Nothing to update' });

    params.push(req.params.id);
    await db.execute(`UPDATE products SET ${fields.join(',')} WHERE id=?`, params);

    console.log(`[Products] PATCH id:${req.params.id} fields:`, req.body);
    const [updated] = await db.execute(
      `SELECT p.*, b.name as brand_name, (p.stock_qty-p.reserved_qty) as available_qty
       FROM products p LEFT JOIN brands b ON p.brand_id=b.id WHERE p.id=?`,
      [req.params.id]
    );
    res.json(updated[0]);
  } catch (err) {
    console.error('[Products] ❌ updateProduct:', err.message);
    next(err);
  }
}

// GET /api/brands
async function getBrands(req, res, next) {
  try {
    const [brands] = await db.execute('SELECT * FROM brands ORDER BY name');
    console.log('[Brands] GET →', brands.length, 'brands');
    res.json(brands);
  } catch (err) {
    console.error('[Brands] ❌:', err.message);
    next(err);
  }
}

module.exports = { getProducts, getProduct, updateProduct, getBrands };
