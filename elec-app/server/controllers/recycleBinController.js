const db = require('../db/connection');

async function purgeExpiredProjects() {
  // A single conditional delete prevents a concurrent restore from being purged.
  await db.execute('DELETE FROM projects WHERE deleted_at IS NOT NULL AND deleted_at <= DATE_SUB(NOW(), INTERVAL 1 YEAR)');
}
async function getRecycleBin(req,res,next) {
  try {
    const [rows] = await db.execute(
      'SELECT id,project_name,quote_number,deleted_at,DATE_ADD(deleted_at, INTERVAL 1 YEAR) expires_at FROM projects WHERE deleted_at > DATE_SUB(NOW(), INTERVAL 1 YEAR) ORDER BY deleted_at DESC');
    res.json(rows);
  } catch (error) { next(error); }
}
async function restoreProject(req,res,next) {
  try {
    const [result] = await db.execute(
      'UPDATE projects SET deleted_at=NULL WHERE id=? AND deleted_at > DATE_SUB(NOW(), INTERVAL 1 YEAR)', [req.params.id]);
    if (!result.affectedRows) return res.status(404).json({error:'Project is not in the recycle bin or its one-year retention has expired'});
    await require('./projectController').recalcReservedQty();
    res.json({message:'Project restored'});
  } catch (error) { next(error); }
}
module.exports = {getRecycleBin,restoreProject,purgeExpiredProjects};
