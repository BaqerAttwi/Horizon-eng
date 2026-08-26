const db = require('../db/connection');

// Engineer access filter: returns { clause, params } for parameterized queries
function engineerProjectFilter(userId) {
  return {
    clause: `AND (p.engineer_id = ? OR p.id IN (
      SELECT per.project_id FROM project_engineer_requests per
      WHERE per.target_engineer_id = ? AND per.status = 'accepted'
    ))`,
    params: [userId, userId]
  };
}

/**
 * PATCH /api/reservations/product/:productId/reserved-qty
 * Adjust reserved_qty for a product (reserve or release).
 */
async function updateReservedQty(req, res, next) {
  try {
    const { productId } = req.params;
    const { action, qty } = req.body;

    if (!['reserve', 'release'].includes(action)) {
      return res.status(400).json({ error: 'Action must be "reserve" or "release"' });
    }
    if (!Number.isInteger(qty) || qty < 1) {
      return res.status(400).json({ error: 'Qty must be a positive integer' });
    }

    const [products] = await db.execute(
      'SELECT id, stock_qty, reserved_qty FROM products WHERE id = ?',
      [productId]
    );
    if (!products.length) return res.status(404).json({ error: 'Product not found' });

    const product = products[0];
    let newReserved = product.reserved_qty;

    if (action === 'reserve') {
      newReserved += qty;
      if (newReserved > product.stock_qty) {
        return res.status(400).json({
          error: `Cannot reserve ${qty} more — only ${Math.max(0, product.stock_qty - product.reserved_qty)} available`
        });
      }
    } else {
      newReserved = Math.max(0, newReserved - qty);
    }

    await db.execute('UPDATE products SET reserved_qty = ? WHERE id = ?', [newReserved, productId]);
    await db.execute(`INSERT INTO reservation_history(product_id,old_qty,new_qty,change_qty,reason,changed_by)
      VALUES(?,?,?,?,?,?)`, [productId, product.reserved_qty, newReserved, newReserved-product.reserved_qty, action === 'reserve' ? 'manual_reserve' : 'manual_release', req.worker.id]);

    res.json({
      product_id: parseInt(productId),
      reserved_qty: newReserved,
      available_qty: product.stock_qty - newReserved,
    });
  } catch (err) {
    console.error('[Reservations] ❌ updateReservedQty:', err.message);
    next(err);
  }
}

async function getReservationHistory(req, res, next) {
  try {
    const limit = Math.min(500, Math.max(1, parseInt(req.query.limit) || 100));
    const params = [];
    let where = '';
    if (req.query.product_id) { where = 'WHERE h.product_id=?'; params.push(req.query.product_id); }
    params.push(limit);
    const [rows] = await db.query(`SELECT h.*,p.reference,p.description,pr.project_name,pcp.panel_name,w.name changed_by_name
      FROM reservation_history h JOIN products p ON p.id=h.product_id
      LEFT JOIN projects pr ON pr.id=h.project_id LEFT JOIN project_crm_panels pcp ON pcp.id=h.panel_id
      LEFT JOIN workers w ON w.id=h.changed_by ${where} ORDER BY h.created_at DESC,h.id DESC LIMIT ?`, params);
    res.json(rows);
  } catch (err) { next(err); }
}

/**
 * GET /api/reservations
 * Returns ALL active reservations across all projects and orders.
 * Engineers only see demand for their own + collaborated projects.
 */
async function getAllReservations(req, res, next) {
  try {
    const user = req.worker;
    const engFilter = user.role === 'engineer' ? engineerProjectFilter(user.id) : null;


    // All project items from active/draft projects with stock info
    const [projectDemands] = await db.execute(`
      SELECT
        pci.product_id,
        pr.reference,
        pr.description,
        pr.smart_code,
        b.name         AS brand_name,
        pr.stock_qty,
        pr.reserved_qty,
        (pr.stock_qty - pr.reserved_qty) AS available_qty,
        (pci.qty * COALESCE(pcp.quantity, 1)) AS demanded_qty,
        p.id           AS project_id,
        p.project_name,
        p.status       AS project_status,
        p.client_approval,
        p.admin_approval,
        p.deadline,
        w.name         AS engineer_name,
        c.name         AS client_name,
        'project'      AS source_type
      FROM panel_crm_items pci
      JOIN panel_divisions pd ON pci.division_id = pd.id
      JOIN project_crm_panels pcp ON pd.panel_id = pcp.id
      JOIN projects p ON pcp.project_id = p.id
      LEFT JOIN products pr ON pci.product_id = pr.id
      LEFT JOIN brands b ON pr.brand_id = b.id
      LEFT JOIN workers w ON p.engineer_id = w.id
      LEFT JOIN clients c ON p.client_id = c.id
      WHERE p.status NOT IN ('completed','cancelled')
        AND p.project_stage IN ('design','quotation','approval','procurement')
        AND pci.product_id IS NOT NULL
        ${engFilter ? engFilter.clause : ''}
      ORDER BY pr.reference, p.id
    `, engFilter ? engFilter.params : []);


    // Group by product_id to detect conflicts
    const productMap = {};
    for (const row of projectDemands) {
      const pid = row.product_id;
      if (!productMap[pid]) {
        productMap[pid] = {
          product_id:    pid,
          reference:     row.reference,
          description:   row.description,
          smart_code:    row.smart_code,
          brand_name:    row.brand_name,
          stock_qty:     row.stock_qty,
          reserved_qty:  row.reserved_qty,
          available_qty: row.available_qty,
          total_demanded: 0,
          demands: [],
        };
      }
      productMap[pid].total_demanded += row.demanded_qty;
      productMap[pid].demands.push({
        source_type:      row.source_type,
        project_id:       row.project_id,
        project_name:     row.project_name,
        project_status:   row.project_status,
        client_approval:  row.client_approval,
        admin_approval:   row.admin_approval,
        deadline:         row.deadline,
        engineer_name:    row.engineer_name,
        client_name:      row.client_name,
        qty:              row.demanded_qty,
      });
    }

    // Convert map to array and flag conflicts
    const result = Object.values(productMap).map(item => ({
      ...item,
      // conflict = more than one project demands this product
      has_conflict: item.demands.length > 1,
      // shortage = total demanded > stock available
      has_shortage: item.total_demanded > item.stock_qty,
    }));

    // Sort: conflicts first, then shortages, then normal
    result.sort((a, b) => {
      if (a.has_shortage && !b.has_shortage) return -1;
      if (!a.has_shortage && b.has_shortage) return 1;
      if (a.has_conflict && !b.has_conflict) return -1;
      if (!a.has_conflict && b.has_conflict) return 1;
      return a.reference.localeCompare(b.reference);
    });

    const conflicts = result.filter(r => r.has_conflict).length;
    const shortages = result.filter(r => r.has_shortage).length;
    const ok = result.filter(r => !r.has_shortage && !r.has_conflict).length;

    res.json({
      items: result,
      summary: {
        total_products: result.length,
        conflicts,
        shortages,
        ok,
      },
    });
  } catch (err) {
    console.error('[Reservations] ❌', err.message);
    next(err);
  }
}

/**
 * GET /api/reservations/product/:productId
 * All projects + orders demanding a specific product
 * Engineers only see demand from their own + collaborated projects.
 */
async function getProductDemand(req, res, next) {
  try {
    const user = req.worker;
    const { productId } = req.params;
    const engFilter = user.role === 'engineer' ? engineerProjectFilter(user.id) : null;


    const [product] = await db.execute(
      `SELECT p.*, b.name as brand_name, (p.stock_qty - p.reserved_qty) as available_qty
       FROM products p LEFT JOIN brands b ON p.brand_id=b.id WHERE p.id=?`,
      [productId]
    );
    if (!product.length) return res.status(404).json({ error: 'Product not found' });

    const [demands] = await db.execute(`
      SELECT
        (pci.qty * COALESCE(pcp.quantity, 1)) AS qty,
        p.id           AS project_id,
        p.project_name,
        p.status,
        p.client_approval,
        p.admin_approval,
        p.deadline,
        w.name         AS engineer_name,
        c.name         AS client_name
      FROM panel_crm_items pci
      JOIN panel_divisions pd ON pci.division_id = pd.id
      JOIN project_crm_panels pcp ON pd.panel_id = pcp.id
      JOIN projects p ON pcp.project_id = p.id
      LEFT JOIN workers w ON p.engineer_id = w.id
      LEFT JOIN clients c ON p.client_id   = c.id
      WHERE pci.product_id = ? AND p.status NOT IN ('completed','cancelled')
        AND p.project_stage IN ('design','quotation','approval','procurement')
        ${engFilter ? engFilter.clause : ''}
      ORDER BY p.deadline ASC
    `, engFilter ? [productId, ...engFilter.params] : [productId]);

    const totalDemanded = demands.reduce((s, d) => s + d.qty, 0);
    const stock = product[0].stock_qty;


    res.json({
      product:       product[0],
      demands,
      total_demanded: totalDemanded,
      has_shortage:   totalDemanded > stock,
      shortage_qty:   Math.max(0, totalDemanded - stock),
    });
  } catch (err) {
    console.error('[Reservations] ❌ productDemand:', err.message);
    next(err);
  }
}

module.exports = { getAllReservations, getProductDemand, updateReservedQty, getReservationHistory };
