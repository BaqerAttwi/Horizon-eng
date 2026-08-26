const db = require('../db/connection');
const { logActivity } = require('./activityController');
const { notifyOwners } = require('./notificationController');

// Technicians may only touch execution data on projects the owner assigned
// them to; owner/engineer access falls back to the standard project access
// rules (engineers must own/collaborate on the project).
async function checkExecutionAccess(req, res, projectId) {
  const user = req.worker;
  if (user.role === 'technician') {
    const [[assigned]] = await db.execute(
      'SELECT id FROM project_technicians WHERE project_id=? AND worker_id=?',
      [projectId, user.id]
    );
    if (!assigned) {
      res.status(403).json({ error: 'Access denied — you are not assigned to this project' });
      return false;
    }
    return true;
  }
  const { checkProjectAccess } = require('./crmController');
  return checkProjectAccess(req, res, projectId);
}

// ── Price-free execution view: panel/division/item names + qty only ──
async function getExecutionView(req, res, next) {
  try {
    const { projectId } = req.params;
    const hasAccess = await checkExecutionAccess(req, res, projectId);
    if (!hasAccess) return;

    const [[project]] = await db.execute(
      `SELECT p.id, p.project_name, p.status, p.deadline, p.execution_deadline,
              p.total_panels, p.completed_panels, c.name as client_name
       FROM projects p LEFT JOIN clients c ON p.client_id = c.id
       WHERE p.id = ? AND p.deleted_at IS NULL`,
      [projectId]
    );
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const [panels] = await db.execute(
      'SELECT id, panel_number, panel_name FROM project_crm_panels WHERE project_id=? ORDER BY panel_number',
      [projectId]
    );

    // Bulk-fetch divisions/items for all panels instead of one query per
    // panel/division (avoids O(panels*divisions) sequential round trips).
    if (panels.length) {
      const panelIds = panels.map(p => p.id);
      const [allDivisions] = await db.query(
        'SELECT id, panel_id, division_type FROM panel_divisions WHERE panel_id IN (?) ORDER BY id',
        [panelIds]
      );

      const divisionIds = allDivisions.map(d => d.id);
      let allItems = [];
      if (divisionIds.length) {
        [allItems] = await db.query(
          `SELECT i.id, i.division_id, i.qty, i.is_manual, i.custom_name, p.reference
           FROM panel_crm_items i
           LEFT JOIN products p ON i.product_id = p.id
           WHERE i.division_id IN (?) ORDER BY i.id`,
          [divisionIds]
        );
      }

      const itemsByDivision = {};
      for (const i of allItems) {
        (itemsByDivision[i.division_id] ||= []).push({
          id: i.id, qty: i.qty,
          custom_name: i.custom_name,
          reference: i.reference,
          is_manual: !!i.is_manual,
        });
      }
      const divisionsByPanel = {};
      for (const div of allDivisions) {
        div.items = itemsByDivision[div.id] || [];
        (divisionsByPanel[div.panel_id] ||= []).push(div);
      }
      for (const panel of panels) panel.divisions = divisionsByPanel[panel.id] || [];
    } else {
      for (const panel of panels) panel.divisions = [];
    }

    res.json({ project, panels });
  } catch (err) {
    console.error('[Execution] ❌ getExecutionView:', err.message);
    next(err);
  }
}

async function getExecutionStatus(req, res, next) {
  try {
    const { projectId } = req.params;
    const hasAccess = await checkExecutionAccess(req, res, projectId);
    if (!hasAccess) return;

    const [panelCompletion] = await db.execute(
      `SELECT pc.*, w.name as completed_by_name
       FROM panel_completion pc
       LEFT JOIN workers w ON pc.completed_by = w.id
       WHERE pc.project_id = ?`, [projectId]
    );

    const [itemCompletion] = await db.execute(
      `SELECT ic.*, w.name as completed_by_name
       FROM item_completion ic
       LEFT JOIN workers w ON ic.completed_by = w.id
       WHERE ic.project_id = ?`, [projectId]
    );

    const panelMap = {};
    for (const pc of panelCompletion) panelMap[pc.panel_id] = pc;
    const itemMap = {};
    for (const ic of itemCompletion) itemMap[ic.item_id] = ic;

    res.json({ panelCompletion: panelMap, itemCompletion: itemMap });
  } catch (err) {
    console.error('[Execution] ❌ getExecutionStatus:', err.message);
    next(err);
  }
}

async function togglePanelExecution(req, res, next) {
  try {
    const { projectId, panelId } = req.params;
    const hasAccess = await checkExecutionAccess(req, res, projectId);
    if (!hasAccess) return;
    const { is_completed, description } = req.body;

    const [[panel]] = await db.execute(
      'SELECT id FROM project_crm_panels WHERE id=? AND project_id=?',
      [panelId, projectId]
    );
    if (!panel) return res.status(404).json({ error: 'Panel not found in this project' });

    const hasCompleted = is_completed !== undefined ? (is_completed ? 1 : 0) : undefined;

    const [[existing]] = await db.execute(
      'SELECT is_completed FROM panel_completion WHERE project_id = ? AND panel_id = ?',
      [projectId, panelId]
    );

    if (existing) {
      const sets = [];
      const params = [];
      if (description !== undefined) { sets.push('description = ?'); params.push(description); }
      if (hasCompleted !== undefined) {
        sets.push('is_completed = ?');
        sets.push('completed_at = IF(? = 1, NOW(), NULL)');
        params.push(hasCompleted, hasCompleted);
      }
      sets.push('completed_by = ?');
      params.push(req.worker.id);
      params.push(projectId, panelId);
      await db.execute(
        `UPDATE panel_completion SET ${sets.join(', ')} WHERE project_id = ? AND panel_id = ?`,
        params
      );
    } else {
      const finalCompleted = hasCompleted !== undefined ? hasCompleted : 0;
      const now = finalCompleted ? new Date() : null;
      await db.execute(
        'INSERT INTO panel_completion (project_id, panel_id, is_completed, description, completed_by, completed_at) VALUES (?, ?, ?, ?, ?, ?)',
        [projectId, panelId, finalCompleted, description || null, req.worker.id, now]
      );
    }

    if (hasCompleted !== undefined) {
      logActivity({
        project_id: projectId, panel_id: panelId,
        action: hasCompleted ? 'execution_panel_completed' : 'execution_panel_uncompleted',
        field_name: 'execution_panel', new_value: description || null,
        performed_by: req.worker.id
      });
    }

    // Marking a panel complete/incomplete cascades to every item inside it —
    // otherwise the panel shows "done" while its own items still look
    // untouched. Cascade both directions so unchecking a panel doesn't leave
    // items stuck marked complete either.
    let cascadedItems = [];
    if (hasCompleted !== undefined) {
      const [items] = await db.execute(
        `SELECT i.id, i.qty FROM panel_crm_items i
         JOIN panel_divisions d ON i.division_id = d.id
         WHERE d.panel_id = ?`,
        [panelId]
      );
      for (const item of items) {
        const qtyDone = hasCompleted ? (parseInt(item.qty) || 1) : 0;
        const now = hasCompleted ? new Date() : null;
        const [[existingItem]] = await db.execute(
          'SELECT id FROM item_completion WHERE project_id=? AND item_id=?',
          [projectId, item.id]
        );
        if (existingItem) {
          await db.execute(
            'UPDATE item_completion SET is_completed=?, qty_done=?, completed_by=?, completed_at=? WHERE project_id=? AND item_id=?',
            [hasCompleted, qtyDone, req.worker.id, now, projectId, item.id]
          );
        } else {
          await db.execute(
            'INSERT INTO item_completion (project_id, item_id, is_completed, qty_done, completed_by, completed_at) VALUES (?,?,?,?,?,?)',
            [projectId, item.id, hasCompleted, qtyDone, req.worker.id, now]
          );
        }
      }
      if (items.length) {
        const [rows] = await db.query(
          `SELECT ic.*, w.name as completed_by_name
           FROM item_completion ic
           LEFT JOIN workers w ON ic.completed_by = w.id
           WHERE ic.project_id = ? AND ic.item_id IN (?)`,
          [projectId, items.map(i => i.id)]
        );
        cascadedItems = rows;
      }
    }

    const [[updated]] = await db.execute(
      `SELECT pc.*, w.name as completed_by_name
       FROM panel_completion pc
       LEFT JOIN workers w ON pc.completed_by = w.id
       WHERE pc.project_id = ? AND pc.panel_id = ?`,
      [projectId, panelId]
    );
    res.json({ ...(updated || { project_id: parseInt(projectId), panel_id: parseInt(panelId), is_completed: 0 }), cascadedItems });
  } catch (err) {
    console.error('[Execution] ❌ togglePanelExecution:', err.message);
    next(err);
  }
}

async function toggleItemExecution(req, res, next) {
  try {
    const { projectId, itemId } = req.params;
    const hasAccess = await checkExecutionAccess(req, res, projectId);
    if (!hasAccess) return;
    const { is_completed, qty_done, execution_notes } = req.body;

    const [[projectItem]] = await db.execute(
      `SELECT i.id, i.qty
       FROM panel_crm_items i
       JOIN panel_divisions d ON d.id=i.division_id
       JOIN project_crm_panels p ON p.id=d.panel_id
       WHERE i.id=? AND p.project_id=?`,
      [itemId, projectId]
    );
    if (!projectItem) return res.status(404).json({ error: 'Item not found in this project' });

    // If qty_done provided, derive is_completed from item's qty
    let finalIsCompleted = is_completed ? 1 : 0;
    let finalQtyDone = undefined;
    if (qty_done !== undefined) {
      const itemQty = parseInt(projectItem.qty) || 1;
      finalQtyDone = Math.min(Math.max(0, parseInt(qty_done) || 0), itemQty);
      finalIsCompleted = finalQtyDone >= itemQty ? 1 : 0;
    }

    const [[existing]] = await db.execute(
      'SELECT id FROM item_completion WHERE project_id = ? AND item_id = ?',
      [projectId, itemId]
    );

    if (existing) {
      const sets = ['completed_by = ?', 'completed_at = IF(? = 1, NOW(), NULL)'];
      const params = [req.worker.id, finalIsCompleted];
      if (finalQtyDone !== undefined) {
        sets.unshift('qty_done = ?');
        params.unshift(finalQtyDone);
        sets.unshift('is_completed = ?');
        params.unshift(finalIsCompleted);
      } else {
        sets.unshift('is_completed = ?');
        params.unshift(finalIsCompleted);
      }
      if (execution_notes !== undefined) {
        sets.push('execution_notes = ?');
        params.push(execution_notes);
      }
      params.push(projectId, itemId);
      await db.execute(
        `UPDATE item_completion SET ${sets.join(', ')} WHERE project_id = ? AND item_id = ?`,
        params
      );
    } else {
      const now = finalIsCompleted ? new Date() : null;
      const cols = ['project_id', 'item_id', 'is_completed', 'completed_by', 'completed_at'];
      const vals = [projectId, itemId, finalIsCompleted, req.worker.id, now];
      if (finalQtyDone !== undefined) { cols.push('qty_done'); vals.push(finalQtyDone); }
      if (execution_notes !== undefined) { cols.push('execution_notes'); vals.push(execution_notes); }
      const placeholders = cols.map(() => '?').join(', ');
      await db.execute(
        `INSERT INTO item_completion (${cols.join(', ')}) VALUES (${placeholders})`,
        vals
      );
    }

    logActivity({
      project_id: projectId, item_id: itemId,
      action: finalIsCompleted ? 'execution_item_completed' : 'execution_item_uncompleted',
      field_name: 'execution_item',
      new_value: execution_notes || null,
      performed_by: req.worker.id
    });

    const [[updated]] = await db.execute(
      `SELECT ic.*, w.name as completed_by_name
       FROM item_completion ic
       LEFT JOIN workers w ON ic.completed_by = w.id
       WHERE ic.project_id = ? AND ic.item_id = ?`,
      [projectId, itemId]
    );
    res.json(updated || { project_id: parseInt(projectId), item_id: parseInt(itemId), is_completed: 0, qty_done: 0 });
  } catch (err) {
    console.error('[Execution] ❌ toggleItemExecution:', err.message);
    next(err);
  }
}

module.exports = { getExecutionStatus, togglePanelExecution, toggleItemExecution, getExecutionView };
