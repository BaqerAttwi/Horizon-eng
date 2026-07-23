const db = require('../db/connection');
const { recalcReservedQty } = require('./projectController');
const { calcItemPricing, recalcDivisionTotals, recalcPanelTotals } = require('../utils/pricing');
const { logActivity } = require('./activityController');

// One-time recalculation on startup to fix existing data
recalcReservedQty().catch(err => console.error('[CRM] init recalcReservedQty error:', err.message));

// ── Access Control Helper ──────────────────────────────────────
// Engineers can only access projects they lead or collaborate on
async function checkProjectAccess(req, res, projectId) {
  const user = req.worker;
  if (user.role === 'technician') {
    res.status(403).json({ error: 'Access denied — technicians can only use the Execution tab' });
    return false;
  }
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

    // Keep projects.total_panels (and progress %) in sync with the actual
    // panel count — it's only used to seed the initial auto-created batch,
    // so anything added afterward has to update it manually or progress
    // tracking silently goes stale.
    await recalcPanelTotals(result.insertId);

    const [rows] = await db.execute('SELECT * FROM project_crm_panels WHERE id=?', [result.insertId]);
    logActivity({ project_id: req.params.projectId, panel_id: result.insertId, action: 'panel_created', field_name: 'panel', new_value: panel_name || `Panel #${panel_number}`, performed_by: req.worker.id });
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

    const { panel_name, markupP, markupM, manpower_pct, note, show_note_in_client_pdf } = req.body;
    await db.execute(
      'UPDATE project_crm_panels SET panel_name=?, markupP=?, markupM=?, manpower_pct=?, note=?, show_note_in_client_pdf=?, updated_by=? WHERE id=? AND project_id=?',
      [panel_name||null, markupP||0, markupM||0, manpower_pct||0, note||null, show_note_in_client_pdf ? 1 : 0, req.worker.id, req.params.panelId, req.params.projectId]
    );

    // Cascade panel markups to items and divisions
    const [divisions] = await db.execute('SELECT id FROM panel_divisions WHERE panel_id=?', [req.params.panelId]);
    for (const div of divisions) {
      await db.execute(
        'UPDATE panel_divisions SET markupP=?, markupM=?, manpower_pct=? WHERE id=?',
        [markupP||0, markupM||0, manpower_pct||0, div.id]
      );
      await db.execute(
        'UPDATE panel_crm_items SET markupP_pct=?, manpower_pct=?, markupM_pct=? WHERE division_id=? AND (override_markup IS NULL OR override_markup = FALSE)',
        [markupP||0, manpower_pct||0, markupM||0, div.id]
      );
      await recalcDivisionTotals(div.id);
    }
    await recalcPanelTotals(req.params.panelId);

    logActivity({ project_id: req.params.projectId, panel_id: req.params.panelId, action: 'panel_updated', field_name: 'panel_markup', new_value: `markupP:${markupP||0} markupM:${markupM||0} man%:${manpower_pct||0}`, performed_by: req.worker.id });

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

    const [[deletedPanel]] = await db.execute('SELECT panel_name, panel_number, project_id FROM project_crm_panels WHERE id=?', [req.params.panelId]);
    if (!deletedPanel) return res.status(404).json({ error: 'Panel not found' });
    await db.execute('DELETE FROM project_crm_panels WHERE id=? AND project_id=?', [req.params.panelId, req.params.projectId]);
    // Re-number remaining panels sequentially starting from 1
    const [remaining] = await db.execute(
      'SELECT id FROM project_crm_panels WHERE project_id=? ORDER BY panel_number',
      [deletedPanel.project_id]
    );
    for (let i = 0; i < remaining.length; i++) {
      await db.execute('UPDATE project_crm_panels SET panel_number=? WHERE id=?', [i + 1, remaining[i].id]);
    }
    await recalcReservedQty();
    // Recalculate project totals from remaining panels
    const [panels] = await db.execute('SELECT id, total_price, is_completed FROM project_crm_panels WHERE project_id=?', [deletedPanel.project_id]);
    let projectTotal = panels.reduce((s, p) => s + (parseFloat(p.total_price) || 0), 0);
    const completedCount = panels.filter(p => p.is_completed).length;
    const [[proj]] = await db.execute('SELECT vat_pct, project_discount_pct FROM projects WHERE id=?', [deletedPanel.project_id]);
    const vatPct = parseFloat(proj?.vat_pct) || 0;
    const discPct = parseFloat(proj?.project_discount_pct) || 0;
    const discountAmount = projectTotal * (discPct / 100);
    const netAfterDiscount = projectTotal - discountAmount;
    const totalVat = netAfterDiscount * (vatPct / 100);
    const totalWithVat = netAfterDiscount + totalVat;
    await db.execute('UPDATE projects SET total_price=?, project_discount_amount=?, total_vat=?, total_with_vat=?, completed_panels=?, total_panels=? WHERE id=?',
      [projectTotal, discountAmount, totalVat, totalWithVat, completedCount, panels.length, deletedPanel.project_id]);
    logActivity({ project_id: req.params.projectId, panel_id: req.params.panelId, action: 'panel_deleted', field_name: 'panel_name', old_value: deletedPanel?.panel_name, performed_by: req.worker.id });
    res.json({ message: 'Panel deleted' });
  } catch (err) { console.error('[CRM] ❌ deletePanel:', err.message); next(err); }
}

async function togglePanelComplete(req, res, next) {
  try {
    const hasAccess = await checkProjectAccess(req, res, req.params.projectId);
    if (!hasAccess) return;

    const [panels] = await db.execute('SELECT is_completed, panel_name FROM project_crm_panels WHERE id=? AND project_id=?', [req.params.panelId, req.params.projectId]);
    if (!panels.length) return res.status(404).json({ error: 'Panel not found' });
    const newVal = panels[0].is_completed ? 0 : 1;
    await db.execute('UPDATE project_crm_panels SET is_completed=?, updated_by=? WHERE id=?', [newVal, req.worker.id, req.params.panelId]);
    logActivity({ project_id: req.params.projectId, panel_id: req.params.panelId, action: 'panel_toggled', field_name: 'is_completed', old_value: panels[0].is_completed ? '1' : '0', new_value: newVal ? '1' : '0', performed_by: req.worker.id });
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
    const [[p]] = await db.execute('SELECT project_id FROM project_crm_panels WHERE id=?', [req.params.panelId]);
    if (p) logActivity({ project_id: p.project_id, panel_id: req.params.panelId, division_id: result.insertId, action: 'division_created', field_name: 'division_type', new_value: division_type, performed_by: req.worker.id });
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

    // Cascade division markups to items (skip manually overridden)
    await db.execute(
      'UPDATE panel_crm_items SET markupP_pct=?, manpower_pct=?, markupM_pct=? WHERE division_id=? AND (override_markup IS NULL OR override_markup = FALSE)',
      [markupP||0, manpower_pct||0, markupM||0, req.params.divisionId]
    );
    await recalcDivisionTotals(req.params.divisionId);
    await recalcPanelTotals(req.params.panelId);

    const [[divP]] = await db.execute('SELECT project_id FROM project_crm_panels WHERE id=?', [req.params.panelId]);
    if (divP) logActivity({ project_id: divP.project_id, panel_id: req.params.panelId, division_id: req.params.divisionId, action: 'division_updated', field_name: 'division_type', new_value: division_type, performed_by: req.worker.id });

    const [rows] = await db.execute('SELECT * FROM panel_divisions WHERE id=?', [req.params.divisionId]);
    res.json(rows[0]);
  } catch (err) { console.error('[CRM] ❌ updateDivision:', err.message); next(err); }
}

async function deleteDivision(req, res, next) {
  try {
    const hasAccess = await checkPanelAccess(req, res, req.params.panelId);
    if (!hasAccess) return;

    const [[oldDiv]] = await db.execute('SELECT division_type FROM panel_divisions WHERE id=?', [req.params.divisionId]);
    await db.execute('DELETE FROM panel_divisions WHERE id=? AND panel_id=?', [req.params.divisionId, req.params.panelId]);
    await recalcPanelTotals(req.params.panelId);
    await recalcReservedQty();
    const [[divPDel]] = await db.execute('SELECT project_id FROM project_crm_panels WHERE id=?', [req.params.panelId]);
    if (divPDel) logActivity({ project_id: divPDel.project_id, panel_id: req.params.panelId, division_id: req.params.divisionId, action: 'division_deleted', field_name: 'division_type', old_value: oldDiv?.division_type, performed_by: req.worker.id });
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
      markupP_pct, discount_pct, manpower_pct, markupM_pct, notes, cost, cr_amount
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
        [req.params.projectId, custom_name || null, custom_desc || null, eur || null, usd || null, custom_brand || null]
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
        markupP_amt,discount_amt,totalpriceT,manpower_amt,markupM_amt,totalfinalProduct,notes,cost,cr_amount,override_markup,visible_in_client_pdf)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,1)`,
      [
        req.params.divisionId, product_id||null, mpId||null, is_manual||false,
        custom_name||null, custom_desc||null, custom_brand||null,
        custom_price_euro||null, custom_price_usd||null,
        qty||1, usd||null, eur||null, markupP_pct||0, disc||0, manpower_pct||0, markupM_pct||0,
        pricing.markupP_amt, pricing.discount_amt, pricing.totalpriceT,
        pricing.manpower_amt, pricing.markupM_amt, pricing.totalfinalProduct, notes||null, cost||0, cr_amount||0
      ]
    );

    await recalcPanelTotals(req.params.panelId);

    const [rows] = await db.execute('SELECT * FROM panel_crm_items WHERE id=?', [result.insertId]);
    logActivity({ project_id: req.params.projectId, panel_id: req.params.panelId, division_id: req.params.divisionId, item_id: result.insertId, action: 'item_created', field_name: 'base_price_usd', new_value: usd, performed_by: req.worker.id });
    await recalcReservedQty();
    res.status(201).json(rows[0]);
  } catch (err) { console.error('[CRM] ❌ createCrmItem:', err.message); next(err); }
}

async function updateCrmItem(req, res, next) {
  try {
    const hasAccess = await checkDivisionAccess(req, res, req.params.divisionId);
    if (!hasAccess) return;

    const { product_id, is_manual, qty, base_price_usd, base_price_euro, markupP_pct, discount_pct, manpower_pct, markupM_pct, notes, cost, cr_amount, visible_in_client_pdf, custom_name, custom_desc, custom_brand, custom_price_euro, custom_price_usd } = req.body;

    const [existing] = await db.execute('SELECT * FROM panel_crm_items WHERE id=? AND division_id=?', [req.params.itemId, req.params.divisionId]);
    if (!existing.length) return res.status(404).json({ error: 'Item not found' });

    const priceFieldsChanged = (
      (base_price_usd !== undefined && parseFloat(base_price_usd) !== parseFloat(existing[0].base_price_usd)) ||
      (base_price_euro !== undefined && parseFloat(base_price_euro) !== parseFloat(existing[0].base_price_euro))
    );

    if (req.worker.role === 'engineer' && priceFieldsChanged) {
      const { createPriceChangeRequest } = require('./priceChangeController');
      // Map frontend field names to price change request field names
      req.body.new_base_price_usd = base_price_usd;
      req.body.new_base_price_euro = base_price_euro;
      req.body.new_markupP_pct = markupP_pct;
      req.body.new_discount_pct = discount_pct;
      req.body.new_manpower_pct = manpower_pct;
      req.body.new_markupM_pct = markupM_pct;
      req.body.new_qty = qty;
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

    const markupChanged = (
      (markupP_pct !== undefined) || (manpower_pct !== undefined) || (markupM_pct !== undefined)
    );

    const updateFields = ['qty=?','base_price_usd=?','base_price_euro=?','markupP_pct=?','discount_pct=?',
      'manpower_pct=?','markupM_pct=?','markupP_amt=?','discount_amt=?','totalpriceT=?',
      'manpower_amt=?','markupM_amt=?','totalfinalProduct=?','notes=?','cost=?'];
    const updateParams = [
      item.qty, item.base_price_usd, item.base_price_euro, item.markupP_pct, item.discount_pct,
      item.manpower_pct, item.markupM_pct, pricing.markupP_amt, pricing.discount_amt,
      pricing.totalpriceT, pricing.manpower_amt, pricing.markupM_amt, pricing.totalfinalProduct,
      notes !== undefined ? notes : existing[0].notes,
      cost !== undefined ? cost : existing[0].cost,
    ];

    if (product_id !== undefined) {
      updateFields.push('product_id=?');
      updateParams.push(product_id);
    }
    if (is_manual !== undefined) {
      updateFields.push('is_manual=?');
      updateParams.push(is_manual);
    }
    if (custom_name !== undefined) {
      updateFields.push('custom_name=?');
      updateParams.push(custom_name);
    }
    if (custom_desc !== undefined) {
      updateFields.push('custom_desc=?');
      updateParams.push(custom_desc);
    }
    if (custom_brand !== undefined) {
      updateFields.push('custom_brand=?');
      updateParams.push(custom_brand);
    }
    if (custom_price_euro !== undefined) {
      updateFields.push('custom_price_euro=?');
      updateParams.push(custom_price_euro);
    }
    if (custom_price_usd !== undefined) {
      updateFields.push('custom_price_usd=?');
      updateParams.push(custom_price_usd);
    }
    if (markupChanged) updateFields.push('override_markup=1');
    if (cr_amount !== undefined) { updateFields.push('cr_amount=?'); updateParams.push(cr_amount); }
    if (visible_in_client_pdf !== undefined) {
      updateFields.push('visible_in_client_pdf=?');
      updateParams.push(visible_in_client_pdf);
    }

    updateParams.push(req.params.itemId);
    await db.execute(`UPDATE panel_crm_items SET ${updateFields.join(',')} WHERE id=?`, updateParams);

    await recalcPanelTotals(req.params.panelId);
    await recalcReservedQty();

    // Log changed fields
    const changedFields = [];
    if (qty !== undefined && parseFloat(qty) !== parseFloat(existing[0].qty)) changedFields.push(`qty: ${existing[0].qty}→${qty}`);
    if (base_price_usd !== undefined && parseFloat(base_price_usd) !== parseFloat(existing[0].base_price_usd)) changedFields.push(`base_price_usd: ${existing[0].base_price_usd}→${base_price_usd}`);
    if (base_price_euro !== undefined && parseFloat(base_price_euro) !== parseFloat(existing[0].base_price_euro)) changedFields.push(`base_price_euro: ${existing[0].base_price_euro}→${base_price_euro}`);
    if (markupP_pct !== undefined && parseFloat(markupP_pct) !== parseFloat(existing[0].markupP_pct)) changedFields.push(`markupP_pct: ${existing[0].markupP_pct}→${markupP_pct}`);
    if (discount_pct !== undefined && parseFloat(discount_pct) !== parseFloat(existing[0].discount_pct)) changedFields.push(`discount_pct: ${existing[0].discount_pct}→${discount_pct}`);
    if (manpower_pct !== undefined && parseFloat(manpower_pct) !== parseFloat(existing[0].manpower_pct)) changedFields.push(`manpower_pct: ${existing[0].manpower_pct}→${manpower_pct}`);
    if (markupM_pct !== undefined && parseFloat(markupM_pct) !== parseFloat(existing[0].markupM_pct)) changedFields.push(`markupM_pct: ${existing[0].markupM_pct}→${markupM_pct}`);
    if (cost !== undefined && parseFloat(cost) !== parseFloat(existing[0].cost)) changedFields.push(`cost: ${existing[0].cost}→${cost}`);
    if (notes !== undefined && notes !== existing[0].notes) changedFields.push('notes updated');
    if (changedFields.length) {
      logActivity({ project_id: req.params.projectId, panel_id: req.params.panelId, division_id: req.params.divisionId, item_id: req.params.itemId, action: 'item_updated', field_name: 'multiple', old_value: existing[0].base_price_usd, new_value: changedFields.join('; '), performed_by: req.worker.id });
    } else {
      logActivity({ project_id: req.params.projectId, panel_id: req.params.panelId, division_id: req.params.divisionId, item_id: req.params.itemId, action: 'item_updated', field_name: 'visible_in_client_pdf', new_value: String(visible_in_client_pdf), performed_by: req.worker.id });
    }

    const [rows] = await db.execute('SELECT * FROM panel_crm_items WHERE id=?', [req.params.itemId]);
    res.json(rows[0]);
  } catch (err) { console.error('[CRM] ❌ updateCrmItem:', err.message); next(err); }
}

async function deleteCrmItem(req, res, next) {
  try {
    const hasAccess = await checkDivisionAccess(req, res, req.params.divisionId);
    if (!hasAccess) return;

    const [[deletedItem]] = await db.execute('SELECT base_price_usd, qty FROM panel_crm_items WHERE id=?', [req.params.itemId]);
    await db.execute('DELETE FROM panel_crm_items WHERE id=? AND division_id=?', [req.params.itemId, req.params.divisionId]);
    await recalcPanelTotals(req.params.panelId);
    await recalcReservedQty();
    logActivity({ project_id: req.params.projectId, panel_id: req.params.panelId, division_id: req.params.divisionId, item_id: req.params.itemId, action: 'item_deleted', field_name: 'base_price_usd', old_value: deletedItem?.base_price_usd, performed_by: req.worker.id });
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

    // Bulk-fetch divisions/items/group-instances for ALL panels in a handful of
    // round trips instead of one query per panel/division (was O(panels*divisions)
    // sequential queries — the main cause of slow CRM page loads).
    if (panels.length) {
      const panelIds = panels.map(p => p.id);
      const [allDivisions] = await db.query(
        `SELECT d.*, COUNT(i.id) as item_count
         FROM panel_divisions d
         LEFT JOIN panel_crm_items i ON i.division_id=d.id
         WHERE d.panel_id IN (?) GROUP BY d.id ORDER BY d.id`,
        [panelIds]
      );

      const divisionIds = allDivisions.map(d => d.id);
      let allItems = [], allGroupInstances = [];
      if (divisionIds.length) {
        [[allItems], [allGroupInstances]] = await Promise.all([
          db.query(
            `SELECT i.*, p.reference, p.description as product_desc, b.name as brand_name,
                    p.price_euro, p.price_usd
             FROM panel_crm_items i
             LEFT JOIN products p ON i.product_id = p.id
             LEFT JOIN brands b ON p.brand_id = b.id
             WHERE i.division_id IN (?) ORDER BY i.id`,
            [divisionIds]
          ),
          db.query(
            `SELECT dig.*, ig.name as group_name
             FROM division_item_group_instances dig
             JOIN item_groups ig ON dig.item_group_id = ig.id
             WHERE dig.division_id IN (?)
             ORDER BY dig.created_at`,
            [divisionIds]
          ),
        ]);
      }

      const itemsByDivision = {};
      for (const item of allItems) (itemsByDivision[item.division_id] ||= []).push(item);
      const giByDivision = {};
      for (const gi of allGroupInstances) (giByDivision[gi.division_id] ||= []).push(gi);

      const divisionsByPanel = {};
      for (const div of allDivisions) {
        const items = itemsByDivision[div.id] || [];
        const groupInstances = giByDivision[div.id] || [];
        for (const gi of groupInstances) {
          gi.items = items.filter(i => i.source_group_instance_id === gi.id);
        }
        div.group_instances = groupInstances;
        div.items = items;
        (divisionsByPanel[div.panel_id] ||= []).push(div);
      }
      for (const panel of panels) panel.divisions = divisionsByPanel[panel.id] || [];
    } else {
      for (const panel of panels) panel.divisions = [];
    }

    // Get manual products
    const [manualProducts] = await db.execute(
      'SELECT * FROM panel_manual_products WHERE project_id=?',
      [projectId]
    );

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
      'INSERT INTO project_crm_panels(project_id,panel_number,panel_name,markupP,markupM,manpower_pct,note,show_note_in_client_pdf,updated_by) VALUES(?,?,?,?,?,?,?,?,?)',
      [targetProjectId, nextPanelNum, sourcePanel.panel_name || `Panel #${nextPanelNum}`, sourcePanel.markupP, sourcePanel.markupM, sourcePanel.manpower_pct, sourcePanel.note, sourcePanel.show_note_in_client_pdf, currentUserId]
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
            markupP_amt,discount_amt,totalpriceT,manpower_amt,markupM_amt,totalfinalProduct,cost,cr_amount,notes,override_markup,visible_in_client_pdf)
           VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [newDivisionId, si.product_id, newManualProductId, si.is_manual,
           si.custom_name, si.custom_desc, si.custom_brand, si.custom_price_euro, si.custom_price_usd,
           si.qty, si.base_price_usd, si.base_price_euro, si.markupP_pct, si.discount_pct, si.manpower_pct, si.markupM_pct,
           si.markupP_amt, si.discount_amt, si.totalpriceT, si.manpower_amt, si.markupM_amt, si.totalfinalProduct, si.cost, si.cr_amount||0, si.notes, 0, si.visible_in_client_pdf]
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
    logActivity({ project_id: targetProjectId, panel_id: newPanelId, action: 'panel_copied', field_name: 'source_panel_id', old_value: String(sourcePanelId), new_value: sourcePanel.panel_name, performed_by: req.worker.id });
    res.status(201).json(newPanel);
  } catch (err) { console.error('[CRM] ❌ copyPanelFromProject:', err.message); next(err); }
}

// ── Bulk Update Items ─────────────────────────────────────────
async function bulkUpdateItems(req, res, next) {
  try {
    const { projectId } = req.params;
    const hasAccess = await checkProjectAccess(req, res, projectId);
    if (!hasAccess) return;
    const { item_ids, changes } = req.body;
    if (!item_ids?.length || !changes) {
      return res.status(400).json({ error: 'item_ids array and changes object required' });
    }

    const markupChanged = changes.markupP_pct !== undefined || changes.manpower_pct !== undefined || changes.markupM_pct !== undefined;
    const updatedIds = new Set();

    for (const itemId of item_ids) {
      const [[item]] = await db.execute('SELECT * FROM panel_crm_items WHERE id = ?', [itemId]);
      if (!item) continue;

      const fields = [];
      const params = [];
      if (changes.markupP_pct !== undefined) { fields.push('markupP_pct=?'); params.push(changes.markupP_pct); }
      if (changes.manpower_pct !== undefined) { fields.push('manpower_pct=?'); params.push(changes.manpower_pct); }
      if (changes.markupM_pct !== undefined) { fields.push('markupM_pct=?'); params.push(changes.markupM_pct); }
      if (changes.discount_pct !== undefined) { fields.push('discount_pct=?'); params.push(changes.discount_pct); }
      if (markupChanged) fields.push('override_markup=1');

      if (!fields.length) continue;

      params.push(itemId);
      await db.execute(`UPDATE panel_crm_items SET ${fields.join(',')} WHERE id=?`, params);

      // Recalc pricing
      const [updated] = await db.execute('SELECT * FROM panel_crm_items WHERE id=?', [itemId]);
      const pricing = calcItemPricing(updated[0]);
      await db.execute(
        'UPDATE panel_crm_items SET markupP_amt=?,discount_amt=?,totalpriceT=?,manpower_amt=?,markupM_amt=?,totalfinalProduct=? WHERE id=?',
        [pricing.markupP_amt, pricing.discount_amt, pricing.totalpriceT, pricing.manpower_amt, pricing.markupM_amt, pricing.totalfinalProduct, itemId]
      );

      updatedIds.add(itemId);
    }

    // Recalc totals for affected divisions/panels
    const [affected] = await db.execute(
      `SELECT DISTINCT pci.division_id, pd.panel_id
       FROM panel_crm_items pci
       JOIN panel_divisions pd ON pci.division_id = pd.id
       WHERE pci.id IN (${item_ids.map(() => '?').join(',')})`,
      item_ids
    );
    for (const a of affected) {
      await recalcDivisionTotals(a.division_id);
      await recalcPanelTotals(a.panel_id);
    }

    logActivity({
      project_id: projectId,
      action: 'items_bulk_updated',
      field_name: 'bulk_changes',
      old_value: null,
      new_value: JSON.stringify({ item_ids: item_ids.length, changes }),
      performed_by: req.worker.id
    });

    res.json({ updated: updatedIds.size, fields: Object.keys(changes) });
  } catch (err) {
    console.error('[CRM] ❌ bulkUpdateItems:', err.message);
    next(err);
  }
}

// ── Bulk Replace Item Across Panels ──────────────────────────
async function bulkReplaceItem(req, res, next) {
  try {
    const { projectId } = req.params;
    const { item_ids, product_id, base_price_usd, base_price_euro } = req.body;
    if (!item_ids?.length || !product_id) {
      return res.status(400).json({ error: 'item_ids array and product_id required' });
    }

    const hasAccess = await checkProjectAccess(req, res, projectId);
    if (!hasAccess) return;

    const [projRows] = await db.execute('SELECT exchange_rate_eur_usd FROM projects WHERE id=?', [projectId]);
    const rate = projRows.length ? parseFloat(projRows[0].exchange_rate_eur_usd) || 1.08 : 1.08;
    let usd = parseFloat(base_price_usd) || 0;
    let eur = parseFloat(base_price_euro) || 0;
    if (!usd && eur) usd = eur * rate;
    if (usd && !eur) eur = usd / rate;

    const updatedIds = [];
    for (const itemId of item_ids) {
      const [existing] = await db.execute('SELECT * FROM panel_crm_items WHERE id=?', [itemId]);
      if (!existing.length) continue;

      const item = {
        ...existing[0],
        product_id: parseInt(product_id, 10),
        base_price_usd: usd,
        base_price_euro: eur,
        is_manual: 0,
        custom_name: null,
        custom_desc: null,
        custom_brand: null,
        custom_price_euro: null,
        custom_price_usd: null,
      };
      const pricing = calcItemPricing(item);

      await db.execute(
        `UPDATE panel_crm_items SET product_id=?,base_price_usd=?,base_price_euro=?,
         is_manual=0,custom_name=NULL,custom_desc=NULL,custom_brand=NULL,
         custom_price_euro=NULL,custom_price_usd=NULL,
         markupP_amt=?,discount_amt=?,totalpriceT=?,
         manpower_amt=?,markupM_amt=?,totalfinalProduct=?
         WHERE id=?`,
        [item.product_id, item.base_price_usd, item.base_price_euro,
         pricing.markupP_amt, pricing.discount_amt, pricing.totalpriceT,
         pricing.manpower_amt, pricing.markupM_amt, pricing.totalfinalProduct, itemId]
      );
      updatedIds.push(itemId);
    }

    // Recalc totals for affected divisions/panels
    const [affected] = await db.execute(
      `SELECT DISTINCT pci.division_id, pd.panel_id
       FROM panel_crm_items pci
       JOIN panel_divisions pd ON pci.division_id = pd.id
       WHERE pci.id IN (${item_ids.map(() => '?').join(',')})`,
      item_ids
    );
    for (const a of affected) {
      await recalcDivisionTotals(a.division_id);
      await recalcPanelTotals(a.panel_id);
    }
    await recalcReservedQty();

    logActivity({
      project_id: projectId,
      action: 'items_bulk_replaced',
      field_name: 'product_id',
      old_value: null,
      new_value: `Replaced ${updatedIds.length} items with product #${product_id}`,
      performed_by: req.worker.id,
    });

    res.json({ updated: updatedIds.length });
  } catch (err) {
    console.error('[CRM] ❌ bulkReplaceItem:', err.message);
    next(err);
  }
}

// ── Apply Brand Discount to Project ─────────────────────────
async function applyBrandDiscount(req, res, next) {
  try {
    const { projectId } = req.params;
    const { brand, discount_pct } = req.body;
    if (brand === undefined || discount_pct === undefined) {
      return res.status(400).json({ error: 'brand and discount_pct required' });
    }

    const hasAccess = await checkProjectAccess(req, res, projectId);
    if (!hasAccess) return;

    const num = parseFloat(discount_pct) || 0;

    // Get project exchange rate for EUR→USD conversion
    const [[proj]] = await db.execute('SELECT exchange_rate_eur_usd FROM projects WHERE id=?', [projectId]);
    const rate = parseFloat(proj?.exchange_rate_eur_usd) || 1.08;

    // Find all items with matching brand in this project (handles both catalog and manual)
    const [items] = await db.execute(
      `SELECT pci.id, pci.base_price_usd, pci.base_price_euro, pci.qty, pci.markupP_pct, pci.manpower_pct, pci.markupM_pct
       FROM panel_crm_items pci
       JOIN panel_divisions pd ON pci.division_id = pd.id
       JOIN project_crm_panels pcp ON pd.panel_id = pcp.id
       LEFT JOIN products p ON pci.product_id = p.id
       LEFT JOIN brands b ON p.brand_id = b.id
       WHERE pcp.project_id = ?
         AND (b.name = ? OR (pci.is_manual = 1 AND pci.custom_brand = ?))`,
      [projectId, brand, brand]
    );

    if (!items.length) {
      return res.status(404).json({ error: `No items found for brand "${brand}"` });
    }

    const updatedIds = [];
    for (const item of items) {
      const pricing = calcItemPricing({ ...item, discount_pct: num }, rate);
      await db.execute(
        `UPDATE panel_crm_items SET discount_pct=?, markupP_amt=?,discount_amt=?,totalpriceT=?,
         manpower_amt=?,markupM_amt=?,totalfinalProduct=? WHERE id=?`,
        [num, pricing.markupP_amt, pricing.discount_amt, pricing.totalpriceT,
         pricing.manpower_amt, pricing.markupM_amt, pricing.totalfinalProduct, item.id]
      );
      updatedIds.push(item.id);
    }

    // Recalc totals for affected divisions/panels
    const [affected] = await db.execute(
      `SELECT DISTINCT pci.division_id, pd.panel_id
       FROM panel_crm_items pci
       JOIN panel_divisions pd ON pci.division_id = pd.id
       WHERE pci.id IN (${updatedIds.map(() => '?').join(',')})`,
      updatedIds
    );
    for (const a of affected) {
      await recalcDivisionTotals(a.division_id);
      await recalcPanelTotals(a.panel_id);
    }
    await recalcReservedQty();

    logActivity({
      project_id: projectId,
      action: 'brand_discount_applied',
      field_name: 'discount_pct',
      old_value: null,
      new_value: `Brand "${brand}" discount set to ${num}% (${updatedIds.length} items)`,
      performed_by: req.worker.id,
    });

    res.json({ updated: updatedIds.length, brand, discount_pct: num });
  } catch (err) {
    console.error('[CRM] ❌ applyBrandDiscount:', err.message);
    next(err);
  }
}

module.exports = {
  checkProjectAccess,
  getPanels, createPanel, updatePanel, deletePanel, togglePanelComplete,
  getDivisions, createDivision, updateDivision, deleteDivision,
  getManualProducts, createManualProduct, deleteManualProduct,
  getCrmItems, createCrmItem, updateCrmItem, deleteCrmItem,
  getProjectCrm, copyPanelFromProject, bulkUpdateItems, bulkReplaceItem,
  applyBrandDiscount,
  recalcDivisionTotals, recalcPanelTotals,
  calcItemPricing,
};
