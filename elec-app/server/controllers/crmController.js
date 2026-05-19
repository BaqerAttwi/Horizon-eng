const db = require('../db/connection');
const { recalcReservedQty } = require('./projectController');

// One-time recalculation on startup to fix existing data
recalcReservedQty().catch(err => console.error('[CRM] init recalcReservedQty error:', err.message));

// ── Access Control Helper ──────────────────────────────────────
// Engineers can only access projects they lead or collaborate on
async function checkProjectAccess(req, res, projectId) {
  const user = req.worker;
  if (user.role === 'engineer') {
    const [[access]] = await db.execute(
      `SELECT p.id FROM projects p
       LEFT JOIN project_engineer_requests per ON per.project_id = p.id
         AND per.target_engineer_id = ? AND per.status = 'accepted'
       WHERE p.id = ? AND p.deleted_at IS NULL
         AND (p.engineer_id = ? OR per.id IS NOT NULL)`,
      [user.id, projectId, user.id]
    );
    if (!access) {
      res.status(403).json({ error: 'Access denied — you are not assigned to this project' });
      return false;
    }
  }
  return true;
}

// Check access via panel ID (looks up project from panel)
async function checkPanelAccess(req, res, panelId) {
  const [[panel]] = await db.execute('SELECT project_id FROM project_crm_panels WHERE id=?', [panelId]);
  if (!panel) { res.status(404).json({ error: 'Panel not found' }); return false; }
  return checkProjectAccess(req, res, panel.project_id);
}

// ── Helpers ───────────────────────────────────────────────────

function calcItemPricing(item) {
  const base = parseFloat(item.base_price_usd) || 0;
  const markupP_pct = parseFloat(item.markupP_pct) || 0;
  const discount_pct = parseFloat(item.discount_pct) || 0;
  const manpower_pct = parseFloat(item.manpower_pct) || 0;
  const markupM_pct = parseFloat(item.markupM_pct) || 0;
  const qty = parseInt(item.qty) || 1;

  const baseTotal = base * qty;
  const discount_amt = baseTotal * (discount_pct / 100);
  const afterDiscount = baseTotal - discount_amt;
  const markupP_amt = afterDiscount * (markupP_pct / 100);
  const totalpriceT = afterDiscount + markupP_amt;
  const manpower_amt = afterDiscount * (manpower_pct / 100);
  const markupM_amt = manpower_amt * (markupM_pct / 100);
  const totalfinalProduct = totalpriceT + manpower_amt + markupM_amt;

  return {
    markupP_amt,
    discount_amt,
    totalpriceT,
    manpower_amt,
    markupM_amt,
    totalfinalProduct,
  };
}

async function recalcDivisionTotals(divisionId) {
  const [items] = await db.execute(
    'SELECT id, base_price_usd, markupP_pct, discount_pct, manpower_pct, markupM_pct, qty FROM panel_crm_items WHERE division_id=?',
    [divisionId]
  );
  let divTotal = 0;
  for (const item of items) {
    const calc = calcItemPricing(item);
    await db.execute(
      `UPDATE panel_crm_items SET markupP_amt=?,discount_amt=?,totalpriceT=?,manpower_amt=?,markupM_amt=?,totalfinalProduct=? WHERE id=?`,
      [calc.markupP_amt, calc.discount_amt, calc.totalpriceT, calc.manpower_amt, calc.markupM_amt, calc.totalfinalProduct, item.id]
    );
    divTotal += calc.totalfinalProduct;
  }
  return divTotal;
}

async function recalcPanelTotals(panelId) {
  const [divisions] = await db.execute('SELECT id FROM panel_divisions WHERE panel_id=?', [panelId]);
  let panelTotal = 0;
  for (const div of divisions) {
    panelTotal += await recalcDivisionTotals(div.id);
  }
  await db.execute('UPDATE project_crm_panels SET total_price=? WHERE id=?', [panelTotal, panelId]);

    // Recalc project totals
    const [projectRow] = await db.execute('SELECT project_id FROM project_crm_panels WHERE id=?', [panelId]);
    if (projectRow.length) {
      const [panels] = await db.execute('SELECT id, total_price, is_completed FROM project_crm_panels WHERE project_id=?', [projectRow[0].project_id]);
      let projectTotal = panels.reduce((s, p) => s + (parseFloat(p.total_price) || 0), 0);
      const completedCount = panels.filter(p => p.is_completed).length;
      await db.execute('UPDATE projects SET total_price=?, completed_panels=? WHERE id=?',
        [projectTotal, completedCount, projectRow[0].project_id]);
    }
}

// ── Panels ─────────────────────────────────────────────────────

async function getPanels(req, res, next) {
  try {
    const hasAccess = await checkProjectAccess(req, res, req.params.projectId);
    if (!hasAccess) return;

    const [panels] = await db.execute(
      `SELECT p.*, COUNT(d.id) as division_count
       FROM project_crm_panels p
       LEFT JOIN panel_divisions d ON d.panel_id = p.id
       WHERE p.project_id = ?
       GROUP BY p.id
       ORDER BY p.panel_number`,
      [req.params.projectId]
    );
    res.json(panels);
  } catch (err) { console.error('[CRM] ❌ getPanels:', err.message); next(err); }
}

async function createPanel(req, res, next) {
  try {
    const hasAccess = await checkProjectAccess(req, res, req.params.projectId);
    if (!hasAccess) return;

    const { panel_number, panel_name, markupP, markupM, manpower_pct } = req.body;
    if (!panel_number) return res.status(400).json({ error: 'panel_number required' });

    const [result] = await db.execute(
      'INSERT INTO project_crm_panels(project_id,panel_number,panel_name,markupP,markupM,manpower_pct) VALUES(?,?,?,?,?,?)',
      [req.params.projectId, panel_number, panel_name||null, markupP||0, markupM||0, manpower_pct||0]
    );

    const [rows] = await db.execute('SELECT * FROM project_crm_panels WHERE id=?', [result.insertId]);
    console.log(`[CRM] Panel created: project:${req.params.projectId} panel #${panel_number}`);
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Panel number already exists' });
    console.error('[CRM] ❌ createPanel:', err.message); next(err);
  }
}

async function updatePanel(req, res, next) {
  try {
    const hasAccess = await checkProjectAccess(req, res, req.params.projectId);
    if (!hasAccess) return;

    const { panel_name, markupP, markupM, manpower_pct } = req.body;
    await db.execute(
      'UPDATE project_crm_panels SET panel_name=?, markupP=?, markupM=?, manpower_pct=?, updated_by=? WHERE id=? AND project_id=?',
      [panel_name||null, markupP||0, markupM||0, manpower_pct||0, req.worker.id, req.params.panelId, req.params.projectId]
    );

    // Cascade panel markups to all items in this panel
    const [divisions] = await db.execute('SELECT id FROM panel_divisions WHERE panel_id=?', [req.params.panelId]);
    for (const div of divisions) {
      await db.execute(
        'UPDATE panel_crm_items SET markupP_pct=?, manpower_pct=?, markupM_pct=? WHERE division_id=?',
        [markupP||0, manpower_pct||0, markupM||0, div.id]
      );
      await recalcDivisionTotals(div.id);
    }
    await recalcPanelTotals(req.params.panelId);

    const [rows] = await db.execute(
      `SELECT pcp.*, w.name as updated_by_name
       FROM project_crm_panels pcp
       LEFT JOIN workers w ON pcp.updated_by = w.id
       WHERE pcp.id=?`,
      [req.params.panelId]
    );
    res.json(rows[0]);
  } catch (err) { console.error('[CRM] ❌ updatePanel:', err.message); next(err); }
}

async function deletePanel(req, res, next) {
  try {
    const hasAccess = await checkProjectAccess(req, res, req.params.projectId);
    if (!hasAccess) return;

    await db.execute('DELETE FROM project_crm_panels WHERE id=? AND project_id=?', [req.params.panelId, req.params.projectId]);
    await recalcPanelTotals(req.params.panelId);
    await recalcReservedQty();
    res.json({ message: 'Panel deleted' });
  } catch (err) { console.error('[CRM] ❌ deletePanel:', err.message); next(err); }
}

async function togglePanelComplete(req, res, next) {
  try {
    const hasAccess = await checkProjectAccess(req, res, req.params.projectId);
    if (!hasAccess) return;

    const [panels] = await db.execute('SELECT is_completed FROM project_crm_panels WHERE id=? AND project_id=?', [req.params.panelId, req.params.projectId]);
    if (!panels.length) return res.status(404).json({ error: 'Panel not found' });
    const newVal = panels[0].is_completed ? 0 : 1;
    await db.execute('UPDATE project_crm_panels SET is_completed=?, updated_by=? WHERE id=?', [newVal, req.worker.id, req.params.panelId]);
    await recalcPanelTotals(req.params.panelId);
    const [rows] = await db.execute(
      `SELECT pcp.*, w.name as updated_by_name
       FROM project_crm_panels pcp
       LEFT JOIN workers w ON pcp.updated_by = w.id
       WHERE pcp.id=?`,
      [req.params.panelId]
    );
    res.json(rows[0]);
  } catch (err) { console.error('[CRM] ❌ togglePanelComplete:', err.message); next(err); }
}

// ── Divisions ──────────────────────────────────────────────────

async function getDivisions(req, res, next) {
  try {
    const hasAccess = await checkPanelAccess(req, res, req.params.panelId);
    if (!hasAccess) return;

    const [divisions] = await db.execute(
      `SELECT d.*,
        (SELECT COUNT(*) FROM panel_crm_items i WHERE i.division_id=d.id) as item_count
       FROM panel_divisions d WHERE d.panel_id=? ORDER BY d.id`,
      [req.params.panelId]
    );
    res.json(divisions);
  } catch (err) { console.error('[CRM] ❌ getDivisions:', err.message); next(err); }
}

async function createDivision(req, res, next) {
  try {
    const hasAccess = await checkPanelAccess(req, res, req.params.panelId);
    if (!hasAccess) return;

    const { division_type, markupP, markupM, manpower_pct } = req.body;
    if (!division_type) return res.status(400).json({ error: 'division_type required' });

    const [result] = await db.execute(
      'INSERT INTO panel_divisions(panel_id,division_type,markupP,markupM,manpower_pct) VALUES(?,?,?,?,?)',
      [req.params.panelId, division_type, markupP||0, markupM||0, manpower_pct||0]
    );

    const [rows] = await db.execute('SELECT * FROM panel_divisions WHERE id=?', [result.insertId]);
    console.log(`[CRM] Division created: panel:${req.params.panelId} type:${division_type}`);
    res.status(201).json(rows[0]);
  } catch (err) { console.error('[CRM] ❌ createDivision:', err.message); next(err); }
}

async function updateDivision(req, res, next) {
  try {
    const hasAccess = await checkPanelAccess(req, res, req.params.panelId);
    if (!hasAccess) return;

    const { division_type, markupP, markupM, manpower_pct } = req.body;
    await db.execute(
      'UPDATE panel_divisions SET division_type=?, markupP=?, markupM=?, manpower_pct=? WHERE id=? AND panel_id=?',
      [division_type, markupP||0, markupM||0, manpower_pct||0, req.params.divisionId, req.params.panelId]
    );

    // Cascade division markups to all items in this division
    await db.execute(
      'UPDATE panel_crm_items SET markupP_pct=?, manpower_pct=?, markupM_pct=? WHERE division_id=?',
      [markupP||0, manpower_pct||0, markupM||0, req.params.divisionId]
    );
    await recalcDivisionTotals(req.params.divisionId);
    await recalcPanelTotals(req.params.panelId);

    const [rows] = await db.execute('SELECT * FROM panel_divisions WHERE id=?', [req.params.divisionId]);
    res.json(rows[0]);
  } catch (err) { console.error('[CRM] ❌ updateDivision:', err.message); next(err); }
}

async function deleteDivision(req, res, next) {
  try {
    const hasAccess = await checkPanelAccess(req, res, req.params.panelId);
    if (!hasAccess) return;

    await db.execute('DELETE FROM panel_divisions WHERE id=? AND panel_id=?', [req.params.divisionId, req.params.panelId]);
    await recalcPanelTotals(req.params.panelId);
    res.json({ message: 'Division deleted' });
  } catch (err) { console.error('[CRM] ❌ deleteDivision:', err.message); next(err); }
}

// ── Manual Products ────────────────────────────────────────────

async function getManualProducts(req, res, next) {
  try {
    const hasAccess = await checkProjectAccess(req, res, req.params.projectId);
    if (!hasAccess) return;

    const [products] = await db.execute(
      'SELECT * FROM panel_manual_products WHERE project_id=? ORDER BY name',
      [req.params.projectId]
    );
    res.json(products);
  } catch (err) { console.error('[CRM] ❌ getManualProducts:', err.message); next(err); }
}

async function createManualProduct(req, res, next) {
  try {
    const hasAccess = await checkProjectAccess(req, res, req.params.projectId);
    if (!hasAccess) return;

    const { name, description, price_euro, price_usd, brand } = req.body;
    if (!name) return res.status(400).json({ error: 'name required' });

    const [result] = await db.execute(
      'INSERT INTO panel_manual_products(project_id,name,description,price_euro,price_usd,brand) VALUES(?,?,?,?,?,?)',
      [req.params.projectId, name, description||null, price_euro||null, price_usd||null, brand||null]
    );
    const [rows] = await db.execute('SELECT * FROM panel_manual_products WHERE id=?', [result.insertId]);
    res.status(201).json(rows[0]);
  } catch (err) { console.error('[CRM] ❌ createManualProduct:', err.message); next(err); }
}

async function deleteManualProduct(req, res, next) {
  try {
    const hasAccess = await checkProjectAccess(req, res, req.params.projectId);
    if (!hasAccess) return;

    await db.execute('DELETE FROM panel_manual_products WHERE id=? AND project_id=?', [req.params.productId, req.params.projectId]);
    res.json({ message: 'Manual product deleted' });
  } catch (err) { console.error('[CRM] ❌ deleteManualProduct:', err.message); next(err); }
}

// Check access via division ID (looks up project from division → panel → project)
async function checkDivisionAccess(req, res, divisionId) {
  const [[div]] = await db.execute(`
    SELECT pcp.project_id FROM panel_divisions d
    JOIN project_crm_panels pcp ON d.panel_id = pcp.id
    WHERE d.id = ?`, [divisionId]);
  if (!div) { res.status(404).json({ error: 'Division not found' }); return false; }
  return checkProjectAccess(req, res, div.project_id);
}

// ── CRM Items ──────────────────────────────────────────────────

async function getCrmItems(req, res, next) {
  try {
    const hasAccess = await checkDivisionAccess(req, res, req.params.divisionId);
    if (!hasAccess) return;

    const [items] = await db.execute(
      `SELECT i.*, p.reference, p.description as product_desc, b.name as brand_name,
              p.price_euro, p.price_usd
       FROM panel_crm_items i
       LEFT JOIN products p ON i.product_id = p.id
       LEFT JOIN brands b ON p.brand_id = b.id
       WHERE i.division_id = ?
       ORDER BY i.id`,
      [req.params.divisionId]
    );

    // Also include manual product details
    for (const item of items) {
      if (item.is_manual && item.manual_product_id) {
        const [mp] = await db.execute('SELECT * FROM panel_manual_products WHERE id=?', [item.manual_product_id]);
        if (mp.length) {
          item.custom_name = mp[0].name;
          item.custom_desc = mp[0].description;
          item.custom_brand = mp[0].brand;
          item.custom_price_euro = mp[0].price_euro;
          item.custom_price_usd = mp[0].price_usd;
        }
      }
    }
    res.json(items);
  } catch (err) { console.error('[CRM] ❌ getCrmItems:', err.message); next(err); }
}

async function createCrmItem(req, res, next) {
  try {
    const hasAccess = await checkDivisionAccess(req, res, req.params.divisionId);
    if (!hasAccess) return;

    const {
      product_id, manual_product_id, is_manual, custom_name, custom_desc,
      custom_brand, custom_price_euro, custom_price_usd, qty, base_price_usd, base_price_euro,
      markupP_pct, discount_pct, manpower_pct, markupM_pct, notes, cost
    } = req.body;

    if (!req.params.divisionId) return res.status(400).json({ error: 'division_id required' });

    // Get project exchange rate
    const [projRows] = await db.execute('SELECT exchange_rate_eur_usd FROM projects WHERE id=?', [req.params.projectId]);
    const rate = projRows.length ? parseFloat(projRows[0].exchange_rate_eur_usd) || 1.08 : 1.08;

    // Auto-convert prices: fill in whichever is missing
    let eur = base_price_euro;
    let usd = base_price_usd;
    if (usd && !eur) { eur = (parseFloat(usd) / rate).toFixed(4); }
    else if (eur && !usd) { usd = (parseFloat(eur) * rate).toFixed(4); }
    else if (!usd && !eur && custom_price_euro) {
      usd = (parseFloat(custom_price_euro) * rate).toFixed(4);
      eur = custom_price_euro;
    }
    else if (!usd && !eur && custom_price_usd) {
      eur = (parseFloat(custom_price_usd) / rate).toFixed(4);
      usd = custom_price_usd;
    }

    // If manual, create a manual product first if not provided
    let mpId = manual_product_id;
    if (is_manual && !mpId) {
      const [mpResult] = await db.execute(
        'INSERT INTO panel_manual_products(project_id,name,description,price_euro,price_usd,brand) VALUES(?,?,?,?,?,?)',
        [req.body.project_id || 0, custom_name, custom_desc, eur, usd, custom_brand]
      );
      mpId = mpResult.insertId;
    }

    // Auto-fill discount if not provided
    let disc = discount_pct;
    if (disc === undefined && product_id) {
      const [d] = await db.execute(
        'SELECT pd.discount_pct FROM product_discounts pd WHERE pd.product_id=? OR pd.brand_id=(SELECT brand_id FROM products WHERE id=?) LIMIT 1',
        [product_id, product_id]
      );
      if (d.length) disc = d[0].discount_pct;
    }

    const pricing = calcItemPricing({
      base_price_usd: usd, markupP_pct: markupP_pct||0, discount_pct: disc||0,
      manpower_pct: manpower_pct||0, markupM_pct: markupM_pct||0, qty: qty||1
    });

    const [result] = await db.execute(
      `INSERT INTO panel_crm_items(division_id,product_id,manual_product_id,is_manual,
        custom_name,custom_desc,custom_brand,custom_price_euro,custom_price_usd,
        qty,base_price_usd,base_price_euro,markupP_pct,discount_pct,manpower_pct,markupM_pct,
        markupP_amt,discount_amt,totalpriceT,manpower_amt,markupM_amt,totalfinalProduct,notes,cost)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        req.params.divisionId, product_id||null, mpId||null, is_manual||false,
        custom_name||null, custom_desc||null, custom_brand||null,
        custom_price_euro||null, custom_price_usd||null,
        qty||1, usd, eur, markupP_pct||0, disc||0, manpower_pct||0, markupM_pct||0,
        pricing.markupP_amt, pricing.discount_amt, pricing.totalpriceT,
        pricing.manpower_amt, pricing.markupM_amt, pricing.totalfinalProduct, notes||null, cost||0
      ]
    );

    await recalcPanelTotals(req.params.panelId);

    const [rows] = await db.execute('SELECT * FROM panel_crm_items WHERE id=?', [result.insertId]);
    console.log(`[CRM] Item created in division:${req.params.divisionId}`);
    await recalcReservedQty();
    res.status(201).json(rows[0]);
  } catch (err) { console.error('[CRM] ❌ createCrmItem:', err.message); next(err); }
}

async function updateCrmItem(req, res, next) {
  try {
    const hasAccess = await checkDivisionAccess(req, res, req.params.divisionId);
    if (!hasAccess) return;

    const { qty, base_price_usd, base_price_euro, markupP_pct, discount_pct, manpower_pct, markupM_pct, notes, cost } = req.body;

    const [existing] = await db.execute('SELECT * FROM panel_crm_items WHERE id=? AND division_id=?', [req.params.itemId, req.params.divisionId]);
    if (!existing.length) return res.status(404).json({ error: 'Item not found' });

    const priceFieldsChanged = (
      (base_price_usd !== undefined && parseFloat(base_price_usd) !== parseFloat(existing[0].base_price_usd)) ||
      (base_price_euro !== undefined && parseFloat(base_price_euro) !== parseFloat(existing[0].base_price_euro))
    );

    if (req.worker.role === 'engineer' && priceFieldsChanged) {
      const { createPriceChangeRequest } = require('./priceChangeController');
      req.body.item_id = req.params.itemId;
      return createPriceChangeRequest(req, res, next);
    }

    // Get project exchange rate
    const [projRows] = await db.execute('SELECT exchange_rate_eur_usd FROM projects WHERE id=?', [req.params.projectId]);
    const rate = projRows.length ? parseFloat(projRows[0].exchange_rate_eur_usd) || 1.08 : 1.08;

    let usd = base_price_usd !== undefined ? base_price_usd : existing[0].base_price_usd;
    let eur = base_price_euro !== undefined ? base_price_euro : existing[0].base_price_euro;

    // Auto-convert EUR↔USD when only one is provided
    if (base_price_usd !== undefined && base_price_euro === undefined) {
      eur = (parseFloat(usd) / rate).toFixed(4);
    } else if (base_price_euro !== undefined && base_price_usd === undefined) {
      usd = (parseFloat(eur) * rate).toFixed(4);
    } else if (base_price_usd !== undefined && base_price_euro !== undefined) {
      usd = parseFloat(base_price_usd);
      eur = parseFloat(base_price_euro);
    }

    const item = {
      ...existing[0],
      qty: qty !== undefined ? qty : existing[0].qty,
      base_price_usd: usd,
      base_price_euro: eur,
      markupP_pct: markupP_pct !== undefined ? markupP_pct : existing[0].markupP_pct,
      discount_pct: discount_pct !== undefined ? discount_pct : existing[0].discount_pct,
      manpower_pct: manpower_pct !== undefined ? manpower_pct : existing[0].manpower_pct,
      markupM_pct: markupM_pct !== undefined ? markupM_pct : existing[0].markupM_pct,
    };

    const pricing = calcItemPricing(item);

    await db.execute(
      `UPDATE panel_crm_items SET qty=?,base_price_usd=?,base_price_euro=?,markupP_pct=?,discount_pct=?,
        manpower_pct=?,markupM_pct=?,markupP_amt=?,discount_amt=?,totalpriceT=?,
        manpower_amt=?,markupM_amt=?,totalfinalProduct=?,notes=?,cost=? WHERE id=?`,
      [
        item.qty, item.base_price_usd, item.base_price_euro, item.markupP_pct, item.discount_pct,
        item.manpower_pct, item.markupM_pct, pricing.markupP_amt, pricing.discount_amt,
        pricing.totalpriceT, pricing.manpower_amt, pricing.markupM_amt, pricing.totalfinalProduct,
        notes !== undefined ? notes : existing[0].notes,
        cost !== undefined ? cost : existing[0].cost,
        req.params.itemId
      ]
    );

    await recalcPanelTotals(req.params.panelId);
    await recalcReservedQty();

    const [rows] = await db.execute('SELECT * FROM panel_crm_items WHERE id=?', [req.params.itemId]);
    res.json(rows[0]);
  } catch (err) { console.error('[CRM] ❌ updateCrmItem:', err.message); next(err); }
}

async function deleteCrmItem(req, res, next) {
  try {
    const hasAccess = await checkDivisionAccess(req, res, req.params.divisionId);
    if (!hasAccess) return;

    await db.execute('DELETE FROM panel_crm_items WHERE id=? AND division_id=?', [req.params.itemId, req.params.divisionId]);
    await recalcPanelTotals(req.params.panelId);
    await recalcReservedQty();
    res.json({ message: 'Item deleted' });
  } catch (err) { console.error('[CRM] ❌ deleteCrmItem:', err.message); next(err); }
}

// ── Full project CRM structure ─────────────────────────────────

async function getProjectCrm(req, res, next) {
  try {
    const projectId = req.params.projectId;

    // Check engineer access
    const hasAccess = await checkProjectAccess(req, res, projectId);
    if (!hasAccess) return;

    // Get project info with exchange rate
    const [project] = await db.execute(
      `SELECT p.*, w.name as engineer_name, c.name as client_name
       FROM projects p
       LEFT JOIN workers w ON p.engineer_id=w.id
       LEFT JOIN clients c ON p.client_id=c.id
       WHERE p.id=?`,
      [projectId]
    );
    if (!project.length) return res.status(404).json({ error: 'Project not found' });

    // Get panels with divisions and items
    let [panels] = await db.execute(
      `SELECT pcp.*, w.name as updated_by_name
       FROM project_crm_panels pcp
       LEFT JOIN workers w ON pcp.updated_by = w.id
       WHERE pcp.project_id=? ORDER BY pcp.panel_number`,
      [projectId]
    );

    // Auto-create panels on first-time CRM load (only when no panels exist)
    const target = parseInt(project[0].total_panels) || 0;
    if (target > 0 && panels.length === 0) {
      for (let i = 1; i <= target; i++) {
        await db.execute(
          'INSERT INTO project_crm_panels(project_id,panel_number,panel_name,markupP,markupM,manpower_pct) VALUES(?,?,?,0,0,0)',
          [projectId, i, `Panel #${i}`]
        );
      }
      // Re-fetch
      const [updatedPanels] = await db.execute(
        `SELECT pcp.*, w.name as updated_by_name
         FROM project_crm_panels pcp
         LEFT JOIN workers w ON pcp.updated_by = w.id
         WHERE pcp.project_id=? ORDER BY pcp.panel_number`,
        [projectId]
      );
      panels = updatedPanels;
    }

    for (const panel of panels) {
      const [divisions] = await db.execute(
        `SELECT d.*, COUNT(i.id) as item_count
         FROM panel_divisions d
         LEFT JOIN panel_crm_items i ON i.division_id=d.id
         WHERE d.panel_id=? GROUP BY d.id ORDER BY d.id`,
        [panel.id]
      );

      panel.divisions = divisions;
      for (const div of divisions) {
        const [items] = await db.execute(
          `SELECT i.*, p.reference, p.description as product_desc, b.name as brand_name,
                  p.price_euro, p.price_usd
           FROM panel_crm_items i
           LEFT JOIN products p ON i.product_id = p.id
           LEFT JOIN brands b ON p.brand_id = b.id
           WHERE i.division_id=? ORDER BY i.id`,
          [div.id]
        );
        div.items = items;
      }
    }

    // Get manual products
    const [manualProducts] = await db.execute(
      'SELECT * FROM panel_manual_products WHERE project_id=?',
      [projectId]
    );

    console.log(`[CRM] Project ${projectId}: ${panels.length} panels loaded`);
    res.json({ ...project[0], panels, manualProducts });
  } catch (err) { console.error('[CRM] ❌ getProjectCrm:', err.message); next(err); }
}

async function copyPanelFromProject(req, res, next) {
  try {
    const { sourceProjectId, sourcePanelId } = req.body;
    const targetProjectId = req.params.projectId;

    // Check access to both source and target projects
    const hasTargetAccess = await checkProjectAccess(req, res, targetProjectId);
    if (!hasTargetAccess) return;
    const hasSourceAccess = await checkProjectAccess(req, res, sourceProjectId);
    if (!hasSourceAccess) return;

    const currentUserId = req.worker?.id;

    if (!sourceProjectId || !sourcePanelId) {
      return res.status(400).json({ error: 'sourceProjectId and sourcePanelId required' });
    }

    // 1. Fetch source panel
    const [panels] = await db.execute('SELECT * FROM project_crm_panels WHERE id=? AND project_id=?', [sourcePanelId, sourceProjectId]);
    if (!panels.length) return res.status(404).json({ error: 'Source panel not found' });
    const sourcePanel = panels[0];

    // 2. Get next panel_number for target project
    const [maxNum] = await db.execute('SELECT COALESCE(MAX(panel_number), 0) + 1 AS next_num FROM project_crm_panels WHERE project_id=?', [targetProjectId]);
    const nextPanelNum = maxNum[0].next_num;

    // 3. Create new panel
    const [panelResult] = await db.execute(
      'INSERT INTO project_crm_panels(project_id,panel_number,panel_name,markupP,markupM,manpower_pct,updated_by) VALUES(?,?,?,?,?,?,?)',
      [targetProjectId, nextPanelNum, sourcePanel.panel_name || `Panel #${nextPanelNum}`, sourcePanel.markupP, sourcePanel.markupM, sourcePanel.manpower_pct, currentUserId]
    );
    const newPanelId = panelResult.insertId;

    // 4. Fetch source divisions
    const [sourceDivs] = await db.execute('SELECT * FROM panel_divisions WHERE panel_id=?', [sourcePanelId]);

    const manualProductMap = {};

    for (const sd of sourceDivs) {
      const [divResult] = await db.execute(
        'INSERT INTO panel_divisions(panel_id,division_type,markupP,markupM,manpower_pct) VALUES(?,?,?,?,?)',
        [newPanelId, sd.division_type, sd.markupP, sd.markupM, sd.manpower_pct]
      );
      const newDivisionId = divResult.insertId;

      const [sourceItems] = await db.execute('SELECT * FROM panel_crm_items WHERE division_id=?', [sd.id]);

      for (const si of sourceItems) {
        let newManualProductId = si.manual_product_id;
        if (si.is_manual && si.manual_product_id) {
          if (!manualProductMap[si.manual_product_id]) {
            const [mp] = await db.execute('SELECT * FROM panel_manual_products WHERE id=?', [si.manual_product_id]);
            if (mp.length) {
              const [mpResult] = await db.execute(
                'INSERT INTO panel_manual_products(project_id,name,description,price_euro,price_usd,brand) VALUES(?,?,?,?,?,?)',
                [targetProjectId, mp[0].name, mp[0].description, mp[0].price_euro, mp[0].price_usd, mp[0].brand]
              );
              manualProductMap[si.manual_product_id] = mpResult.insertId;
            }
          }
          newManualProductId = manualProductMap[si.manual_product_id];
        }

        await db.execute(
          `INSERT INTO panel_crm_items(division_id,product_id,manual_product_id,is_manual,
            custom_name,custom_desc,custom_brand,custom_price_euro,custom_price_usd,
            qty,base_price_usd,base_price_euro,markupP_pct,discount_pct,manpower_pct,markupM_pct,
            markupP_amt,discount_amt,totalpriceT,manpower_amt,markupM_amt,totalfinalProduct,cost,notes)
           VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [newDivisionId, si.product_id, newManualProductId, si.is_manual,
           si.custom_name, si.custom_desc, si.custom_brand, si.custom_price_euro, si.custom_price_usd,
           si.qty, si.base_price_usd, si.base_price_euro, si.markupP_pct, si.discount_pct, si.manpower_pct, si.markupM_pct,
           si.markupP_amt, si.discount_amt, si.totalpriceT, si.manpower_amt, si.markupM_amt, si.totalfinalProduct, si.cost, si.notes]
        );
      }

      await recalcDivisionTotals(newDivisionId);
    }

    await recalcPanelTotals(newPanelId);

    // Return the new panel with nested data
    const [newPanelRows] = await db.execute('SELECT * FROM project_crm_panels WHERE id=?', [newPanelId]);
    const [newDivs] = await db.execute('SELECT * FROM panel_divisions WHERE panel_id=?', [newPanelId]);
    const newPanel = { ...newPanelRows[0], divisions: [] };
    for (const nd of newDivs) {
      const [ndItems] = await db.execute('SELECT * FROM panel_crm_items WHERE division_id=?', [nd.id]);
      newPanel.divisions.push({ ...nd, items: ndItems });
    }

    await recalcReservedQty();
    res.status(201).json(newPanel);
  } catch (err) { console.error('[CRM] ❌ copyPanelFromProject:', err.message); next(err); }
}

module.exports = {
  getPanels, createPanel, updatePanel, deletePanel, togglePanelComplete,
  getDivisions, createDivision, updateDivision, deleteDivision,
  getManualProducts, createManualProduct, deleteManualProduct,
  getCrmItems, createCrmItem, updateCrmItem, deleteCrmItem,
  getProjectCrm, copyPanelFromProject,
  recalcDivisionTotals, recalcPanelTotals,
  calcItemPricing,
};
