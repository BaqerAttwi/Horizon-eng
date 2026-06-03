const db = require('../db/connection');
const { logActivity } = require('./activityController');
const { recalcDivisionTotals, recalcPanelTotals } = require('../utils/pricing');

async function addGroupToDivision(req, res, next) {
  try {
    const { divisionId } = req.params;
    const { item_group_id, quantity } = req.body;
    const groupQty = Math.max(1, parseInt(quantity) || 1);

    // Verify group exists
    const [[group]] = await db.execute('SELECT * FROM item_groups WHERE id = ?', [item_group_id]);
    if (!group) return res.status(404).json({ error: 'Item group not found' });

    // Verify division exists and get panel/project info + markup defaults
    const [[div]] = await db.execute(
      `SELECT pd.*, pcp.project_id, pcp.id as panel_id,
              pcp.markupP as panel_markupP, pcp.markupM as panel_markupM, pcp.manpower_pct as panel_manpower_pct
       FROM panel_divisions pd
       JOIN project_crm_panels pcp ON pd.panel_id = pcp.id
       WHERE pd.id = ?`, [divisionId]
    );
    if (!div) return res.status(404).json({ error: 'Division not found' });

    // Get project exchange rate for EUR↔USD conversion
    const [[proj]] = await db.execute('SELECT exchange_rate_eur_usd FROM projects WHERE id = ?', [div.project_id]);
    const rate = parseFloat(proj?.exchange_rate_eur_usd) || 1.08;

    // Inherit markup from division or fallback to panel
    const markupP = parseFloat(div.markupP) || parseFloat(div.panel_markupP) || 0;
    const markupM = parseFloat(div.markupM) || parseFloat(div.panel_markupM) || 0;
    const manpower = parseFloat(div.manpower_pct) || parseFloat(div.panel_manpower_pct) || 0;

    console.log(`[DivisionItemGroup] Adding group "${group.name}" (x${groupQty}) to division ${divisionId} — inherited markupP:${markupP}, manpower:${manpower}, markupM:${markupM}`);
    const [instanceResult] = await db.execute(
      'INSERT INTO division_item_group_instances (division_id, item_group_id, quantity) VALUES (?, ?, ?)',
      [divisionId, item_group_id, groupQty]
    );
    const instanceId = instanceResult.insertId;

    // Get group items
    const [groupItems] = await db.execute(
      `SELECT gi.*, COALESCE(gi.price_usd, p.price_usd) as effective_price_usd,
              COALESCE(gi.price_euro, p.price_euro) as effective_price_euro
       FROM item_group_items gi
       LEFT JOIN products p ON gi.product_id = p.id
       WHERE gi.group_id = ?`, [item_group_id]
    );

      // Insert items with pricing calculated
    for (const grpItem of groupItems) {
      const itemQty = (grpItem.qty ?? 1) * groupQty;
      let basePriceUsd = parseFloat(grpItem.effective_price_usd) || 0;
      let basePriceEur = parseFloat(grpItem.effective_price_euro) || 0;
      if (!basePriceUsd && basePriceEur) basePriceUsd = basePriceEur * rate;
      if (!basePriceEur && basePriceUsd) basePriceEur = basePriceUsd / rate;

      await db.execute(
        `INSERT INTO panel_crm_items (
          division_id, product_id, is_manual, custom_name, custom_desc,
          base_price_usd, base_price_euro, qty,
          markupP_pct, manpower_pct, markupM_pct, discount_pct,
          override_markup, visible_in_client_pdf, source_group_instance_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, FALSE, TRUE, ?)`,
        [
          divisionId,
          grpItem.product_id || null,
          grpItem.is_manual ? 1 : 0,
          grpItem.custom_name || null,
          grpItem.description || null,
          basePriceUsd,
          basePriceEur,
          itemQty,
          markupP, manpower, markupM, 0,
          instanceId
        ]
      );
    }

    // Recalc totals (this also computes pricing for all items)
    await recalcDivisionTotals(divisionId);
    await recalcPanelTotals(div.panel_id);

    logActivity({
      project_id: div.project_id,
      panel_id: div.panel_id,
      division_id: divisionId,
      action: 'division_group_instance_added',
      field_name: 'item_group_id',
      old_value: null,
      new_value: `${group.name} x${groupQty} (${groupItems.length} items)`,
      performed_by: req.worker.id
    });

    res.status(201).json({
      id: instanceId,
      division_id: divisionId,
      item_group_id,
      quantity: groupQty,
      group_name: group.name,
      items_count: groupItems.length
    });
  } catch (err) {
    console.error('[DivisionItemGroup] ❌ addGroupToDivision:', err.message);
    next(err);
  }
}

async function updateGroupInstanceQuantity(req, res, next) {
  try {
    const { instanceId } = req.params;
    const { quantity } = req.body;
    const newQty = Math.max(1, parseInt(quantity) || 1);

    const [[instance]] = await db.execute(
      `SELECT dig.*, pd.panel_id, pcp.project_id
       FROM division_item_group_instances dig
       JOIN panel_divisions pd ON dig.division_id = pd.id
       JOIN project_crm_panels pcp ON pd.panel_id = pcp.id
       WHERE dig.id = ?`, [instanceId]
    );
    if (!instance) return res.status(404).json({ error: 'Group instance not found' });

    const oldQty = instance.quantity;

    // Get all items linked to this instance
    const [items] = await db.execute(
      'SELECT * FROM panel_crm_items WHERE source_group_instance_id = ?',
      [instanceId]
    );

    // Get the group items to know base qty per item
    const [groupItems] = await db.execute(
      'SELECT * FROM item_group_items WHERE group_id = ?',
      [instance.item_group_id]
    );
    const groupItemMap = {};
    for (const gi of groupItems) groupItemMap[gi.id || gi.product_id] = gi;

    // Update each item's quantity
    for (const item of items) {
      // Find matching group item by product_id or custom_name
      const match = groupItems.find(gi =>
        (gi.product_id && gi.product_id === item.product_id) ||
        (gi.custom_name && gi.custom_name === item.custom_name)
      );
      const baseQty = match ? (match.qty ?? 1) : 1;
      const newItemQty = baseQty * newQty;
      await db.execute('UPDATE panel_crm_items SET qty = ? WHERE id = ?', [newItemQty, item.id]);
    }

    await db.execute('UPDATE division_item_group_instances SET quantity = ? WHERE id = ?', [newQty, instanceId]);

    // Recalc totals
    await recalcDivisionTotals(instance.division_id);
    await recalcPanelTotals(instance.panel_id);

    logActivity({
      project_id: instance.project_id,
      panel_id: instance.panel_id,
      division_id: instance.division_id,
      action: 'division_group_instance_quantity_changed',
      field_name: 'quantity',
      old_value: String(oldQty),
      new_value: String(newQty),
      performed_by: req.worker.id
    });

    res.json({
      id: instanceId,
      quantity: newQty,
      items_updated: items.length
    });
  } catch (err) {
    console.error('[DivisionItemGroup] ❌ updateGroupInstanceQuantity:', err.message);
    next(err);
  }
}

async function removeGroupInstance(req, res, next) {
  try {
    const { instanceId } = req.params;

    const [[instance]] = await db.execute(
      `SELECT dig.*, pd.panel_id, pcp.project_id
       FROM division_item_group_instances dig
       JOIN panel_divisions pd ON dig.division_id = pd.id
       JOIN project_crm_panels pcp ON pd.panel_id = pcp.id
       WHERE dig.id = ?`, [instanceId]
    );
    if (!instance) return res.status(404).json({ error: 'Group instance not found' });

    // Delete child items
    await db.execute('DELETE FROM panel_crm_items WHERE source_group_instance_id = ?', [instanceId]);

    // Delete instance
    await db.execute('DELETE FROM division_item_group_instances WHERE id = ?', [instanceId]);

    logActivity({
      project_id: instance.project_id,
      panel_id: instance.panel_id,
      division_id: instance.division_id,
      action: 'division_group_instance_removed',
      field_name: 'source_group_instance_id',
      old_value: String(instanceId),
      performed_by: req.worker.id
    });

    // Recalc totals after removal
    await recalcDivisionTotals(instance.division_id);
    await recalcPanelTotals(instance.panel_id);

    res.json({ message: 'Group instance removed', items_deleted: true });
  } catch (err) {
    console.error('[DivisionItemGroup] ❌ removeGroupInstance:', err.message);
    next(err);
  }
}

async function getDivisionGroupInstances(req, res, next) {
  try {
    const { divisionId } = req.params;

    const [instances] = await db.execute(
      `SELECT dig.*, ig.name as group_name
       FROM division_item_group_instances dig
       JOIN item_groups ig ON dig.item_group_id = ig.id
       WHERE dig.division_id = ?
       ORDER BY dig.created_at`, [divisionId]
    );

    for (const inst of instances) {
      const [items] = await db.execute(
        `SELECT pci.*, pr.reference, pr.description as product_desc, pr.smart_code,
                b.name as brand_name, pr.price_usd as product_price_usd,
                pr.price_euro as product_price_euro
         FROM panel_crm_items pci
         LEFT JOIN products pr ON pci.product_id = pr.id
         LEFT JOIN brands b ON pr.brand_id = b.id
         WHERE pci.source_group_instance_id = ?
         ORDER BY pci.id`, [inst.id]
      );
      inst.items = items;
    }

    res.json(instances);
  } catch (err) {
    console.error('[DivisionItemGroup] ❌ getDivisionGroupInstances:', err.message);
    next(err);
  }
}

module.exports = { addGroupToDivision, updateGroupInstanceQuantity, removeGroupInstance, getDivisionGroupInstances };
