const db = require('../db/connection');

async function getGroups(req, res, next) {
  try {
    const user = req.worker;
    const [groups] = await db.execute(
      `SELECT g.*, w.name AS created_by_name,
        (SELECT COUNT(*) FROM item_group_items WHERE group_id=g.id) AS item_count
       FROM item_groups g
       JOIN workers w ON w.id = g.created_by
       WHERE g.is_public = TRUE OR g.created_by = ?
       ORDER BY g.created_at DESC`,
      [user.id]
    );
    res.json(groups);
  } catch (err) {
    console.error('[ItemGroup] ❌ getGroups:', err.message);
    next(err);
  }
}

async function getGroup(req, res, next) {
  try {
    const { id } = req.params;
    const [groups] = await db.execute(
      `SELECT g.*, w.name AS created_by_name
       FROM item_groups g
       JOIN workers w ON w.id = g.created_by
       WHERE g.id = ? AND (g.is_public = TRUE OR g.created_by = ?)`,
      [id, req.worker.id]
    );
    if (!groups.length) return res.status(404).json({ error: 'Group not found' });
    res.json(groups[0]);
  } catch (err) {
    console.error('[ItemGroup] ❌ getGroup:', err.message);
    next(err);
  }
}

async function createGroup(req, res, next) {
  try {
    const { name, is_public } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Group name required' });

    const [result] = await db.execute(
      'INSERT INTO item_groups (name, created_by, is_public) VALUES (?, ?, ?)',
      [name.trim(), req.worker.id, is_public ? 1 : 0]
    );

    const [rows] = await db.execute(
      `SELECT g.*, w.name AS created_by_name
       FROM item_groups g JOIN workers w ON w.id=g.created_by WHERE g.id=?`,
      [result.insertId]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('[ItemGroup] ❌ createGroup:', err.message);
    next(err);
  }
}

async function updateGroup(req, res, next) {
  try {
    const { id } = req.params;
    const { name, is_public } = req.body;

    const [existing] = await db.execute(
      'SELECT * FROM item_groups WHERE id=? AND (created_by=? OR ? IN (SELECT id FROM workers WHERE role=\'owner\'))',
      [id, req.worker.id, req.worker.id]
    );
    if (!existing.length) return res.status(404).json({ error: 'Group not found or access denied' });

    if (name !== undefined) {
      if (!name.trim()) return res.status(400).json({ error: 'Group name cannot be empty' });
      await db.execute('UPDATE item_groups SET name=? WHERE id=?', [name.trim(), id]);
    }
    if (is_public !== undefined) {
      await db.execute('UPDATE item_groups SET is_public=? WHERE id=?', [is_public ? 1 : 0, id]);
    }

    const [rows] = await db.execute(
      `SELECT g.*, w.name AS created_by_name
       FROM item_groups g JOIN workers w ON w.id=g.created_by WHERE g.id=?`,
      [id]
    );
    res.json(rows[0]);
  } catch (err) {
    console.error('[ItemGroup] ❌ updateGroup:', err.message);
    next(err);
  }
}

async function deleteGroup(req, res, next) {
  try {
    const { id } = req.params;
    const [existing] = await db.execute(
      'SELECT * FROM item_groups WHERE id=? AND (created_by=? OR ? IN (SELECT id FROM workers WHERE role=\'owner\'))',
      [id, req.worker.id, req.worker.id]
    );
    if (!existing.length) return res.status(404).json({ error: 'Group not found or access denied' });

    await db.execute('DELETE FROM item_groups WHERE id=?', [id]);
    res.json({ message: 'Group deleted' });
  } catch (err) {
    console.error('[ItemGroup] ❌ deleteGroup:', err.message);
    next(err);
  }
}

async function getGroupItems(req, res, next) {
  try {
    const { id } = req.params;
    const [items] = await db.execute(
      `SELECT gi.*, p.reference, p.description,
              COALESCE(gi.price_usd, p.price_usd) AS price_usd,
              COALESCE(gi.price_euro, p.price_euro) AS price_euro,
              b.name AS brand_name
       FROM item_group_items gi
       LEFT JOIN products p ON gi.product_id = p.id
       LEFT JOIN brands b ON p.brand_id = b.id
       WHERE gi.group_id = ?
       ORDER BY gi.id`,
      [id]
    );
    res.json(items);
  } catch (err) {
    console.error('[ItemGroup] ❌ getGroupItems:', err.message);
    next(err);
  }
}

async function addGroupItem(req, res, next) {
  try {
    const { id } = req.params;
    const { product_id, is_manual, custom_name, description, price_usd, price_euro, qty } = req.body;

    const [existing] = await db.execute(
      'SELECT * FROM item_groups WHERE id=? AND (created_by=? OR ? IN (SELECT id FROM workers WHERE role=\'owner\'))',
      [id, req.worker.id, req.worker.id]
    );
    if (!existing.length) return res.status(404).json({ error: 'Group not found or access denied' });

    if (!product_id && !custom_name) return res.status(400).json({ error: 'product_id or custom_name required' });

    let finalUsd = price_usd || null;
    let finalEur = price_euro || null;
    if (!finalUsd && finalEur) finalUsd = parseFloat(finalEur) * 1.08;
    if (!finalEur && finalUsd) finalEur = parseFloat(finalUsd) / 1.08;

    const [result] = await db.execute(
      'INSERT INTO item_group_items (group_id, product_id, is_manual, custom_name, description, price_usd, price_euro, qty) VALUES (?,?,?,?,?,?,?,?)',
      [id, product_id || null, is_manual ? 1 : 0, custom_name || null, description || null, finalUsd, finalEur, qty ?? 1]
    );

    const [rows] = await db.execute(
      `SELECT gi.*, p.reference, p.description, p.price_euro, p.price_usd, b.name AS brand_name
       FROM item_group_items gi
       LEFT JOIN products p ON gi.product_id = p.id
       LEFT JOIN brands b ON p.brand_id = b.id
       WHERE gi.id=?`,
      [result.insertId]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('[ItemGroup] ❌ addGroupItem:', err.message);
    next(err);
  }
}

async function removeGroupItem(req, res, next) {
  try {
    const { id, itemId } = req.params;

    const [existing] = await db.execute(
      'SELECT * FROM item_groups WHERE id=? AND (created_by=? OR ? IN (SELECT id FROM workers WHERE role=\'owner\'))',
      [id, req.worker.id, req.worker.id]
    );
    if (!existing.length) return res.status(404).json({ error: 'Group not found or access denied' });

    await db.execute('DELETE FROM item_group_items WHERE id=? AND group_id=?', [itemId, id]);
    res.json({ message: 'Item removed from group' });
  } catch (err) {
    console.error('[ItemGroup] ❌ removeGroupItem:', err.message);
    next(err);
  }
}

module.exports = {
  getGroups,
  getGroup,
  createGroup,
  updateGroup,
  deleteGroup,
  getGroupItems,
  addGroupItem,
  removeGroupItem,
};
