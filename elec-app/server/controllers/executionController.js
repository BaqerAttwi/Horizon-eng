const db = require('../db/connection');
const { logActivity } = require('./activityController');
const { notifyOwners } = require('./notificationController');

async function getExecutionStatus(req, res, next) {
  try {
    const { projectId } = req.params;

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
    const { is_completed, description } = req.body;

    const [[existing]] = await db.execute(
      'SELECT id FROM panel_completion WHERE project_id = ? AND panel_id = ?',
      [projectId, panelId]
    );

    if (existing) {
      await db.execute(
        'UPDATE panel_completion SET is_completed = ?, description = COALESCE(?, description), completed_by = ?, completed_at = IF(? = 1, NOW(), NULL) WHERE project_id = ? AND panel_id = ?',
        [is_completed ? 1 : 0, description || null, req.worker.id, is_completed ? 1 : 0, projectId, panelId]
      );
    } else {
      await db.execute(
        'INSERT INTO panel_completion (project_id, panel_id, is_completed, description, completed_by, completed_at) VALUES (?, ?, ?, ?, ?, IF(? = 1, NOW(), NULL))',
        [projectId, panelId, is_completed ? 1 : 0, description || null, req.worker.id, is_completed ? 1 : 0]
      );
    }

    logActivity({
      project_id: projectId, panel_id: panelId,
      action: is_completed ? 'execution_panel_completed' : 'execution_panel_uncompleted',
      field_name: 'execution_panel', new_value: description || null,
      performed_by: req.worker.id
    });

    const [[updated]] = await db.execute(
      `SELECT pc.*, w.name as completed_by_name
       FROM panel_completion pc
       LEFT JOIN workers w ON pc.completed_by = w.id
       WHERE pc.project_id = ? AND pc.panel_id = ?`,
      [projectId, panelId]
    );
    res.json(updated || { project_id: parseInt(projectId), panel_id: parseInt(panelId), is_completed: 0 });
  } catch (err) {
    console.error('[Execution] ❌ togglePanelExecution:', err.message);
    next(err);
  }
}

async function toggleItemExecution(req, res, next) {
  try {
    const { projectId, itemId } = req.params;
    const { is_completed } = req.body;

    const [[existing]] = await db.execute(
      'SELECT id FROM item_completion WHERE project_id = ? AND item_id = ?',
      [projectId, itemId]
    );

    if (existing) {
      await db.execute(
        'UPDATE item_completion SET is_completed = ?, completed_by = ?, completed_at = IF(? = 1, NOW(), NULL) WHERE project_id = ? AND item_id = ?',
        [is_completed ? 1 : 0, req.worker.id, is_completed ? 1 : 0, projectId, itemId]
      );
    } else {
      await db.execute(
        'INSERT INTO item_completion (project_id, item_id, is_completed, completed_by, completed_at) VALUES (?, ?, ?, ?, IF(? = 1, NOW(), NULL))',
        [projectId, itemId, is_completed ? 1 : 0, req.worker.id, is_completed ? 1 : 0]
      );
    }

    logActivity({
      project_id: projectId, item_id: itemId,
      action: is_completed ? 'execution_item_completed' : 'execution_item_uncompleted',
      field_name: 'execution_item',
      performed_by: req.worker.id
    });

    res.json({ project_id: parseInt(projectId), item_id: parseInt(itemId), is_completed: is_completed ? 1 : 0 });
  } catch (err) {
    console.error('[Execution] ❌ toggleItemExecution:', err.message);
    next(err);
  }
}

module.exports = { getExecutionStatus, togglePanelExecution, toggleItemExecution };
