const db = require('../db/connection');
const { logActivity } = require('./activityController');
const { createNotification, notifyRoles } = require('./notificationController');
const { canManageWorkflow } = require('../utils/rolePolicy');
const { recalcReservedQty } = require('./projectController');
const { recalcDivisionTotals, recalcPanelTotals } = require('../utils/pricing');
const zlib = require('zlib');

const STAGES = ['design','quotation','approval','procurement','assembly','testing','delivered'];
const encodeSnapshot = snapshot => `gz:${zlib.gzipSync(JSON.stringify(snapshot)).toString('base64')}`;
const decodeSnapshot = value => {
  if (!value) return null;
  const text = Buffer.isBuffer(value) ? value.toString() : String(value);
  return text.startsWith('gz:') ? JSON.parse(zlib.gunzipSync(Buffer.from(text.slice(3), 'base64')).toString()) : JSON.parse(text);
};

async function captureQuotationSnapshot(projectId, executor = db) {
  const [[project]] = await executor.execute(`SELECT quote_number,exchange_rate_eur_usd,vat_pct,project_discount_pct,
    project_discount_amount,total_vat,total_price,total_cost,total_with_vat,payment_terms,client_pdf_note,total_panels
    FROM projects WHERE id=?`, [projectId]);
  const [manualProducts] = await executor.execute('SELECT * FROM panel_manual_products WHERE project_id=? ORDER BY id', [projectId]);
  const [panels] = await executor.execute('SELECT * FROM project_crm_panels WHERE project_id=? ORDER BY panel_number', [projectId]);
  for (const panel of panels) {
    const [divisions] = await executor.execute('SELECT * FROM panel_divisions WHERE panel_id=? ORDER BY id', [panel.id]);
    for (const division of divisions) {
      const [items] = await executor.execute(`SELECT i.*,p.reference,p.description product_description,b.name brand_name
        FROM panel_crm_items i LEFT JOIN products p ON p.id=i.product_id LEFT JOIN brands b ON b.id=p.brand_id
        WHERE i.division_id=? ORDER BY i.id`, [division.id]);
      division.items = items;
    }
    panel.divisions = divisions;
  }
  return { version: 1, captured_at: new Date().toISOString(), project, manualProducts, panels };
}

async function assertProjectAccess(req, res, projectId) {
  const { checkProjectAccess } = require('./crmController');
  return checkProjectAccess(req, res, projectId);
}

async function validateForwardTransition(project, target) {
  if (target === 'quotation' && !project.ready_for_review) return 'Mark the design Ready for Review first';
  if (target === 'approval' && !project.quote_number) return 'A quotation number is required';
  if (target === 'procurement' && (project.admin_approval !== 'approved' || project.client_approval !== 'approved')) return 'Internal and client approval are both required';
  if (target === 'assembly') {
    if (project.procurement_status !== 'approved') return 'Stock Manager, Owner, or Head Engineer must approve Procurement before Assembly';
    const {getDemand}=require('./procurementController');
    if ((await getDemand(project.id)).some(item=>item.shortage_qty>0)) return 'Resolve project procurement shortages before Assembly';
  }
  if (target === 'testing' && Number(project.completed_panels) < Number(project.total_panels || 0)) return 'All planned panels must be assembled first';
  if (target === 'delivered') {
    const [[incomplete]] = await db.execute(`SELECT COUNT(*) AS n FROM project_crm_panels p
      LEFT JOIN panel_completion pc ON pc.panel_id=p.id AND pc.project_id=p.project_id
      WHERE p.project_id=? AND COALESCE(pc.is_completed,0)=0`, [project.id]);
    if (Number(incomplete.n)) return 'Every panel must pass testing before delivery';
  }
  return null;
}

async function updateProjectStage(req, res, next) {
  try {
    const projectId = Number(req.params.projectId);
    if (!await assertProjectAccess(req, res, projectId)) return;
    const target = String(req.body.stage || '').toLowerCase();
    const note = req.body.note?.trim() || null;
    if (!STAGES.includes(target)) return res.status(400).json({ error: 'Invalid project stage' });
    const [[project]] = await db.execute('SELECT * FROM projects WHERE id=? AND deleted_at IS NULL', [projectId]);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    if (!project.quote_number) {
      project.quote_number = `Q-${String(projectId).padStart(6, '0')}`;
      await db.execute('UPDATE projects SET quote_number=? WHERE id=?', [project.quote_number, projectId]);
    }
    const fromIndex = STAGES.indexOf(project.project_stage || 'design');
    const toIndex = STAGES.indexOf(target);
    if (toIndex === fromIndex) return res.status(400).json({ error: 'Project is already at this stage' });
    if (toIndex > fromIndex + 1) return res.status(400).json({ error: 'Stages must advance one step at a time' });
    if (toIndex < fromIndex && !canManageWorkflow(req.worker.role)) return res.status(403).json({ error: 'Only management can move a project backward' });
    if (toIndex > STAGES.indexOf('quotation') && !canManageWorkflow(req.worker.role)) {
      return res.status(403).json({ error: 'Management must approve and advance this project stage' });
    }
    if (toIndex > fromIndex) {
      const error = await validateForwardTransition(project, target);
      if (error) return res.status(400).json({ error });
    }
    await db.execute(`UPDATE projects SET project_stage=?,status=?,procurement_status=IF(?='procurement','pending',procurement_status),
      procurement_note=IF(?='procurement',NULL,procurement_note),procurement_reviewed_by=IF(?='procurement',NULL,procurement_reviewed_by),
      procurement_reviewed_at=IF(?='procurement',NULL,procurement_reviewed_at) WHERE id=?`,
      [target,target==='delivered'?'completed':'active',target,target,target,target,projectId]);
    await db.execute('INSERT INTO project_stage_history(project_id,from_stage,to_stage,note,changed_by) VALUES(?,?,?,?,?)', [projectId, project.project_stage || 'design', target, note, req.worker.id]);
    if (target==='assembly') await recalcReservedQty();
    if (target === 'quotation') {
      const snapshot = await captureQuotationSnapshot(projectId);
      await db.execute(`INSERT IGNORE INTO quotation_revisions(project_id,revision_number,quote_number,total_price,total_with_vat,notes,created_by,snapshot_json)
        VALUES(?,0,?,?,?,?,?,?)`, [projectId, project.quote_number, project.total_price, project.total_with_vat, note || 'Initial quotation', req.worker.id, encodeSnapshot(snapshot)]);
    }
    logActivity({ project_id: projectId, action: 'stage_changed', field_name: 'project_stage', old_value: project.project_stage || 'design', new_value: target, performed_by: req.worker.id });
    if (project.engineer_id && Number(project.engineer_id) !== Number(req.worker.id)) await createNotification(project.engineer_id, 'status', `Project moved to ${target}`, project.project_name, '/projects');
    await notifyRoles(['owner','head_engineer'], 'status', `${project.project_name}: ${target}`, `${req.worker.name} moved the project to ${target}`, '/projects');
    const [[updated]] = await db.execute('SELECT * FROM projects WHERE id=?', [projectId]);
    res.json(updated);
  } catch (err) { next(err); }
}

async function getStageHistory(req, res, next) {
  try {
    if (!await assertProjectAccess(req, res, req.params.projectId)) return;
    const [rows] = await db.execute(`SELECT h.*,w.name changed_by_name FROM project_stage_history h
      LEFT JOIN workers w ON w.id=h.changed_by WHERE h.project_id=? ORDER BY h.created_at DESC,h.id DESC`, [req.params.projectId]);
    res.json(rows);
  } catch (err) { next(err); }
}

async function createQuotationRevision(req, res, next) {
  try {
    const projectId = Number(req.params.projectId);
    if (!await assertProjectAccess(req, res, projectId)) return;
    if (!['owner','head_engineer'].includes(req.worker.role)) return res.status(403).json({ error: 'Management approval required' });
    const [[p]] = await db.execute('SELECT quote_number,total_price,total_with_vat,project_name FROM projects WHERE id=?', [projectId]);
    if (!p) return res.status(404).json({ error: 'Project not found' });
    if (!p.quote_number) {
      p.quote_number = `Q-${String(projectId).padStart(6, '0')}`;
      await db.execute('UPDATE projects SET quote_number=? WHERE id=?', [p.quote_number, projectId]);
    }
    const [[last]] = await db.execute('SELECT COALESCE(MAX(revision_number),0)+1 next_revision FROM quotation_revisions WHERE project_id=?', [projectId]);
    const revision = Number(last.next_revision);
    const snapshot = await captureQuotationSnapshot(projectId);
    await db.execute('INSERT INTO quotation_revisions(project_id,revision_number,quote_number,total_price,total_with_vat,notes,created_by,snapshot_json) VALUES(?,?,?,?,?,?,?,?)', [projectId, revision, p.quote_number, p.total_price, p.total_with_vat, req.body.notes?.trim() || null, req.worker.id, encodeSnapshot(snapshot)]);
    const [[row]] = await db.execute(`SELECT r.id,r.project_id,r.revision_number,r.quote_number,r.total_price,r.total_with_vat,r.notes,r.created_by,r.created_at,
      1 has_snapshot,w.name created_by_name FROM quotation_revisions r
      LEFT JOIN workers w ON w.id=r.created_by WHERE r.project_id=? AND r.revision_number=?`, [projectId, revision]);
    res.status(201).json(row);
  } catch (err) { next(err); }
}

async function restoreQuotationRevision(req, res, next) {
  let conn;
  try {
    const projectId = Number(req.params.projectId);
    if (!await assertProjectAccess(req, res, projectId)) return;
    if (req.worker.role !== 'owner') return res.status(403).json({ error: 'Only Owner can restore a quotation revision' });
    const [[revision]] = await db.execute('SELECT * FROM quotation_revisions WHERE id=? AND project_id=?', [req.params.revisionId, projectId]);
    if (!revision) return res.status(404).json({ error: 'Quotation revision not found' });
    if (!revision.snapshot_json) return res.status(409).json({ error: 'This older revision contains totals only. Item restoration is available for newly saved revisions.' });
    const snapshot = decodeSnapshot(revision.snapshot_json);
    const current = await captureQuotationSnapshot(projectId);
    conn = await db.getConnection();
    await conn.beginTransaction();
    const [[last]] = await conn.execute('SELECT COALESCE(MAX(revision_number),0)+1 n FROM quotation_revisions WHERE project_id=? FOR UPDATE', [projectId]);
    await conn.execute(`INSERT INTO quotation_revisions(project_id,revision_number,quote_number,total_price,total_with_vat,notes,created_by,snapshot_json)
      VALUES(?,?,?,?,?,?,?,?)`, [projectId, last.n, current.project.quote_number, current.project.total_price, current.project.total_with_vat,
      `Automatic backup before restoring R${revision.revision_number}`, req.worker.id, encodeSnapshot(current)]);
    await conn.execute('DELETE FROM project_crm_panels WHERE project_id=?', [projectId]);
    await conn.execute('DELETE FROM panel_manual_products WHERE project_id=?', [projectId]);
    const [existingProductRows] = await conn.execute('SELECT id FROM products');
    const existingProductIds = new Set(existingProductRows.map(row => Number(row.id)));
    const manualMap = new Map();
    for (const manual of snapshot.manualProducts || []) {
      const [result] = await conn.execute(`INSERT INTO panel_manual_products(project_id,name,description,price_euro,price_usd,brand) VALUES(?,?,?,?,?,?)`,
        [projectId, manual.name, manual.description, manual.price_euro, manual.price_usd, manual.brand]);
      manualMap.set(Number(manual.id), result.insertId);
    }
    const newPanelIds = [];
    for (const panel of snapshot.panels || []) {
      const [panelResult] = await conn.execute(`INSERT INTO project_crm_panels(project_id,panel_number,panel_name,quantity,markupP,markupM,manpower_pct,total_price,is_completed,note,show_note_in_client_pdf,updated_by)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`, [projectId,panel.panel_number,panel.panel_name,panel.quantity,panel.markupP,panel.markupM,panel.manpower_pct,panel.total_price,0,panel.note,panel.show_note_in_client_pdf,req.worker.id]);
      newPanelIds.push(panelResult.insertId);
      for (const division of panel.divisions || []) {
        const [divResult] = await conn.execute(`INSERT INTO panel_divisions(panel_id,division_type,markupP,markupM,manpower_pct) VALUES(?,?,?,?,?)`,
          [panelResult.insertId,division.division_type,division.markupP,division.markupM,division.manpower_pct]);
        for (const item of division.items || []) {
          await conn.execute(`INSERT INTO panel_crm_items(division_id,product_id,manual_product_id,is_manual,custom_name,custom_desc,custom_brand,custom_price_euro,custom_price_usd,qty,base_price_usd,base_price_euro,markupP_pct,markupP_amt,discount_pct,discount_amt,totalpriceT,manpower_pct,manpower_amt,markupM_pct,markupM_amt,totalfinalProduct,cost,cr_amount,override_markup,visible_in_client_pdf,notes)
            VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [divResult.insertId,existingProductIds.has(Number(item.product_id))?item.product_id:null,item.manual_product_id?manualMap.get(Number(item.manual_product_id))||null:null,item.is_manual,item.custom_name,item.custom_desc,item.custom_brand,item.custom_price_euro,item.custom_price_usd,item.qty,item.base_price_usd,item.base_price_euro,item.markupP_pct,item.markupP_amt,item.discount_pct,item.discount_amt,item.totalpriceT,item.manpower_pct,item.manpower_amt,item.markupM_pct,item.markupM_amt,item.totalfinalProduct,item.cost,item.cr_amount,item.override_markup,item.visible_in_client_pdf,item.notes]);
        }
      }
    }
    const p = snapshot.project || {};
    await conn.execute(`UPDATE projects SET exchange_rate_eur_usd=?,vat_pct=?,project_discount_pct=?,project_discount_amount=?,total_vat=?,total_price=?,total_cost=?,total_with_vat=?,payment_terms=?,client_pdf_note=?,total_panels=?,completed_panels=0 WHERE id=?`,
      [p.exchange_rate_eur_usd,p.vat_pct,p.project_discount_pct,p.project_discount_amount,p.total_vat,p.total_price,p.total_cost,p.total_with_vat,p.payment_terms,p.client_pdf_note,p.total_panels,projectId]);
    await conn.commit();
    conn.release(); conn = null;
    for (const panelId of newPanelIds) await recalcPanelTotals(panelId);
    await recalcReservedQty();
    logActivity({ project_id: projectId, action: 'quotation_revision_restored', field_name: 'revision', new_value: `R${revision.revision_number}`, performed_by: req.worker.id });
    res.json({ message: `Revision R${revision.revision_number} restored`, backup_revision: Number(last.n) });
  } catch (err) {
    if (conn) { try { await conn.rollback(); } catch {} conn.release(); }
    next(err);
  }
}

async function getQuotationRevisions(req, res, next) {
  try {
    if (!await assertProjectAccess(req, res, req.params.projectId)) return;
    if (req.worker.role === 'engineer') return res.json([]);
    const [rows] = await db.execute(`SELECT r.id,r.project_id,r.revision_number,r.quote_number,r.total_price,r.total_with_vat,r.notes,r.created_by,r.created_at,
      (r.snapshot_json IS NOT NULL) has_snapshot,w.name created_by_name FROM quotation_revisions r LEFT JOIN workers w ON w.id=r.created_by
      WHERE r.project_id=? ORDER BY r.revision_number DESC`, [req.params.projectId]);
    res.json(rows);
  } catch (err) { next(err); }
}

async function getQuotationRevisionSnapshot(req, res, next) {
  try {
    if (!await assertProjectAccess(req, res, req.params.projectId)) return;
    if (!['owner','head_engineer'].includes(req.worker.role)) return res.status(403).json({ error: 'Management only' });
    const [[row]] = await db.execute('SELECT snapshot_json FROM quotation_revisions WHERE id=? AND project_id=?', [req.params.revisionId, req.params.projectId]);
    if (!row) return res.status(404).json({ error: 'Quotation revision not found' });
    if (!row.snapshot_json) return res.status(409).json({ error: 'This older revision contains totals only' });
    res.json(decodeSnapshot(row.snapshot_json));
  } catch (err) { next(err); }
}

async function getEngineerWorkload(req, res, next) {
  try {
    if (!['owner','head_engineer'].includes(req.worker.role)) return res.status(403).json({ error: 'Management only' });
    const [rows] = await db.execute(`SELECT w.id,w.name,COUNT(p.id) active_projects,
      COALESCE(AVG(COALESCE((p.completed_panels/NULLIF(p.total_panels,0))*100,0)),0) avg_progress,
      SUM(p.deadline<CURDATE() AND p.project_stage<>'delivered') overdue_projects
      FROM workers w LEFT JOIN projects p ON p.engineer_id=w.id AND p.deleted_at IS NULL AND p.project_stage<>'delivered'
      WHERE w.role='engineer' GROUP BY w.id,w.name ORDER BY active_projects DESC,w.name`);
    res.json(rows);
  } catch (err) { next(err); }
}

module.exports = { updateProjectStage, getStageHistory, createQuotationRevision, getQuotationRevisions, getQuotationRevisionSnapshot, restoreQuotationRevision, getEngineerWorkload, STAGES, captureQuotationSnapshot, encodeSnapshot, decodeSnapshot };
