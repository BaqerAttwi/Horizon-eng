// The live rows become the next editable copy; this snapshot never changes.
async function preserveRejectedVersion(connection, projectId, note, workerId, source, decision = 'rejected') {
  const { captureQuotationSnapshot, encodeSnapshot } = require('../controllers/workflowController');
  const [[project]] = await connection.execute('SELECT * FROM projects WHERE id=? FOR UPDATE', [projectId]);
  const snapshot = await captureQuotationSnapshot(projectId, connection);
  snapshot.project = { ...project, [source === 'client' ? 'client_approval' : 'admin_approval']: decision };
  const [items] = await connection.execute(
    'SELECT i.*,p.reference,p.description FROM project_items i LEFT JOIN products p ON p.id=i.product_id WHERE i.project_id=?', [projectId]);
  snapshot.items = items;
  const [[last]] = await connection.execute('SELECT COALESCE(MAX(revision_number),0)+1 n FROM quotation_revisions WHERE project_id=?', [projectId]);
  await connection.execute(
    'INSERT INTO quotation_revisions(project_id,revision_number,quote_number,total_price,total_with_vat,notes,created_by,snapshot_json) VALUES(?,?,?,?,?,?,?,?)',
    [projectId,last.n,project.quote_number || String(projectId),project.total_price,project.total_with_vat,
      (decision === 'recheck' ? 'Recheck V' : 'Rejected V') + project.current_version + ' (' + source + '): ' + (note || ''),workerId,encodeSnapshot(snapshot)]);
  await connection.execute(
    "UPDATE projects SET current_version=current_version+1,admin_approval='pending',client_approval='pending',ready_for_review=FALSE,project_stage=IF(project_stage IN ('quotation','approval'),'design',project_stage) WHERE id=?", [projectId]);
}
module.exports = { preserveRejectedVersion };
