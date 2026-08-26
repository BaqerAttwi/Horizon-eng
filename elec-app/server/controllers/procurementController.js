const db = require('../db/connection');
const { createNotification, notifyRoles } = require('./notificationController');
const { logActivity } = require('./activityController');

async function getDemand(projectId) {
  const [rows] = await db.execute(`SELECT pci.product_id,COALESCE(pr.reference,pci.custom_name,'Manual item') item_name,
    COALESCE(pr.description,pci.custom_desc,'') description,SUM(pci.qty*COALESCE(pcp.quantity,1)) required_qty,
    pr.stock_qty,pr.reserved_qty,COALESCE(ppa.allocated_qty,0) allocated_qty,
    CASE WHEN pci.product_id IS NULL THEN 0 ELSE GREATEST(0,pr.stock_qty-GREATEST(pr.reserved_qty-SUM(pci.qty*COALESCE(pcp.quantity,1)),0))+COALESCE(ppa.allocated_qty,0) END available_for_project
    FROM panel_crm_items pci JOIN panel_divisions pd ON pd.id=pci.division_id
    JOIN project_crm_panels pcp ON pcp.id=pd.panel_id LEFT JOIN products pr ON pr.id=pci.product_id
    LEFT JOIN project_procurement_allocations ppa ON ppa.project_id=pcp.project_id AND ppa.product_id=pci.product_id
    WHERE pcp.project_id=? GROUP BY pci.product_id,item_name,description,pr.stock_qty,pr.reserved_qty,ppa.allocated_qty ORDER BY item_name`,[projectId]);
  return rows.map(row=>({...row,required_qty:Number(row.required_qty)||0,stock_qty:Number(row.stock_qty)||0,reserved_qty:Number(row.reserved_qty)||0,
    allocated_qty:Number(row.allocated_qty)||0,available_for_project:Number(row.available_for_project)||0,shortage_qty:Math.max(0,(Number(row.required_qty)||0)-(Number(row.available_for_project)||0))}));
}

async function getProcurementQueue(req,res,next) {
  try {
    const [projects]=await db.execute(`SELECT p.id,p.project_name,p.quote_number,p.project_stage,p.deadline,p.procurement_status,
      p.procurement_note,p.procurement_reviewed_at,w.name engineer_name,r.name reviewed_by_name FROM projects p
      LEFT JOIN workers w ON w.id=p.engineer_id LEFT JOIN workers r ON r.id=p.procurement_reviewed_by
      WHERE p.deleted_at IS NULL AND p.project_stage='procurement' ORDER BY p.updated_at ASC`);
    for (const project of projects) { project.items=await getDemand(project.id); project.shortage_count=project.items.filter(item=>item.shortage_qty>0).length; }
    res.json(projects);
  } catch(error) { next(error); }
}

async function reviewProcurement(req,res,next) {
  try {
    const projectId=Number(req.params.projectId),action=String(req.body.action||'').toLowerCase(),note=req.body.note?.trim()||null;
    if (!['approve','reject'].includes(action)) return res.status(400).json({error:'action must be approve or reject'});
    const [[project]]=await db.execute('SELECT id,project_name,project_stage,engineer_id FROM projects WHERE id=? AND deleted_at IS NULL',[projectId]);
    if (!project) return res.status(404).json({error:'Project not found'});
    if (project.project_stage!=='procurement') return res.status(409).json({error:'Project is not in Procurement'});
    const items=await getDemand(projectId),shortages=items.filter(item=>item.shortage_qty>0);
    if (action==='approve'&&shortages.length) return res.status(409).json({error:`Cannot approve: ${shortages.length} item${shortages.length===1?' has':'s have'} a stock shortage`});
    const status=action==='approve'?'approved':'rejected';
    await db.execute('UPDATE projects SET procurement_status=?,procurement_note=?,procurement_reviewed_by=?,procurement_reviewed_at=NOW() WHERE id=?',[status,note,req.worker.id,projectId]);
    logActivity({project_id:projectId,action:`procurement_${status}`,field_name:'procurement_status',new_value:note||status,performed_by:req.worker.id});
    if (project.engineer_id) await createNotification(project.engineer_id,'stock',`Procurement ${status}: ${project.project_name}`,note||`Stock Manager ${status} procurement`,'/projects');
    await notifyRoles(['owner','head_engineer'],'stock',`Procurement ${status}: ${project.project_name}`,note||`${req.worker.name} ${status} procurement`,'/projects');
    res.json({project_id:projectId,procurement_status:status,procurement_note:note,items});
  } catch(error) { next(error); }
}

async function receiveProcurementStock(req,res,next) {
  try {
    const projectId=Number(req.params.projectId),productId=Number(req.params.productId),quantity=Number(req.body.quantity);
    if (!Number.isInteger(quantity)||quantity<1) return res.status(400).json({error:'quantity must be a positive whole number'});
    const [[project]]=await db.execute("SELECT id,project_name,project_stage FROM projects WHERE id=? AND deleted_at IS NULL",[projectId]);
    if (!project) return res.status(404).json({error:'Project not found'});
    if (project.project_stage!=='procurement') return res.status(409).json({error:'Stock can only be received here while the project is in Procurement'});
    const [[required]]=await db.execute(`SELECT pci.product_id FROM panel_crm_items pci JOIN panel_divisions pd ON pd.id=pci.division_id
      JOIN project_crm_panels pcp ON pcp.id=pd.panel_id WHERE pcp.project_id=? AND pci.product_id=? LIMIT 1`,[projectId,productId]);
    if (!required) return res.status(404).json({error:'Product is not required by this project'});
    const [[product]]=await db.execute('SELECT id,reference FROM products WHERE id=?',[productId]);
    if (!product) return res.status(404).json({error:'Product not found'});
    await db.execute(`INSERT INTO project_procurement_allocations(project_id,product_id,allocated_qty,updated_by)
      VALUES(?,?,?,?) ON DUPLICATE KEY UPDATE allocated_qty=allocated_qty+VALUES(allocated_qty),updated_by=VALUES(updated_by)`,
      [projectId,productId,quantity,req.worker.id]);
    const [[allocation]]=await db.execute('SELECT allocated_qty FROM project_procurement_allocations WHERE project_id=? AND product_id=?',[projectId,productId]);
    logActivity({project_id:projectId,action:'procurement_quantity_allocated',field_name:product.reference,new_value:`+${quantity} allocated to this project`,performed_by:req.worker.id});
    res.json({product_id:productId,reference:product.reference,added:quantity,allocated_qty:Number(allocation.allocated_qty),items:await getDemand(projectId)});
  } catch(error) { next(error); }
}

module.exports={getProcurementQueue,reviewProcurement,receiveProcurementStock,getDemand};
