// Exercise local read endpoints with real authentication. Does not submit writes,
// send email, or enter the OneDrive connection/callback flow.
require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const db = require('../db/connection');
const router = require('../routes');
const { JWT_SECRET } = require('../controllers/authController');
const { passwordFingerprint } = require('../utils/accountSecurity');
const { closeReviewLocks } = require('../middleware/projectReview');

async function main() {
  let server;
  try {
    const [workers] = await db.execute('SELECT id,role,password_hash FROM workers ORDER BY id');
    const [projects] = await db.execute('SELECT id FROM projects WHERE deleted_at IS NULL ORDER BY id DESC');
    const projectId = projects[0]?.id || 1;
    const [[panel]] = await db.execute('SELECT id FROM project_crm_panels WHERE project_id=? LIMIT 1', [projectId]);
    const [[division]] = await db.execute('SELECT id FROM panel_divisions WHERE panel_id=? LIMIT 1', [panel?.id || 0]);
    const [[item]] = await db.execute('SELECT id FROM panel_crm_items WHERE division_id=? LIMIT 1', [division?.id || 0]);
    const samples = { projectId, panelId:panel?.id || 1, divisionId:division?.id || 1, itemId:item?.id || 1 };
    const tables = { productId:'products', instanceId:'division_item_group_instances', attachmentId:'attachments', revisionId:'quotation_revisions', notificationId:'notifications', updateId:'app_updates' };
    for (const [key, table] of Object.entries(tables)) {
      const [[row]] = await db.execute(`SELECT id FROM ${table} LIMIT 1`);
      samples[key] = row?.id || 1;
    }
    const [[group]] = await db.execute('SELECT id FROM item_groups LIMIT 1');
    const app = express();
    app.use(cookieParser()); app.use(express.json()); app.use('/api',router);
    app.use((error, req, res, next) => res.status(500).json({ error:error.code || error.name }));
    server = await new Promise(resolve => { const running = app.listen(0,'127.0.0.1',()=>resolve(running)); });
    const base = `http://127.0.0.1:${server.address().port}/api`;
    const results = [];
    const routes = router.stack.filter(layer => layer.route?.methods.get && !['/onedrive/connect','/onedrive/callback','/attachments/:attachmentId/download'].includes(layer.route.path));
    for (const role of ['owner','head_engineer','engineer','accounting','stock_manager','secretary','technician']) {
      const worker = workers.find(row => row.role === role);
      if (!worker) { results.push({role,status:'not tested',reason:'No local account for this role'}); continue; }
      const token = jwt.sign({ id:worker.id,credential:passwordFingerprint(worker.password_hash) }, JWT_SECRET, { expiresIn:'10m' });
      for (const layer of routes) {
        const route = layer.route.path;
        let url = route.replace(/:([A-Za-z]+)/g, (_, key) => {
          if (key !== 'id') return samples[key] || 1;
          if (route.startsWith('/products')) return samples.productId;
          if (route.startsWith('/item-groups')) return group?.id || 1;
          return projectId;
        });
        const response = await fetch(base+url, { headers:{ cookie:`token=${token}` }, redirect:'manual', signal:AbortSignal.timeout(15000) });
        // Never persist payloads, names, email, prices, or credentials in this report.
        const result = {role,route,status:response.status};
        if (response.status >= 500) result.error = (await response.json()).error;
        else await response.arrayBuffer();
        results.push(result);
      }
    }
    const destination = path.join(__dirname,'../../../tmp/audits/read-flows.json');
    fs.mkdirSync(path.dirname(destination),{recursive:true});
    fs.writeFileSync(destination,JSON.stringify(results,null,2));
    const failures = results.filter(row => row.status >= 500);
    console.log(JSON.stringify({requests:results.filter(row=>typeof row.status==='number').length,roles:[...new Set(results.filter(row=>typeof row.status==='number').map(row=>row.role))],serverErrors:failures,unavailableRoles:results.filter(row=>row.status==='not tested'),report:destination},null,2));
    if (failures.length) process.exitCode=1;
  } finally {
    if (server) await new Promise(resolve=>server.close(resolve));
    await Promise.all([db.end(),closeReviewLocks()]);
  }
}
main().catch(error=>{console.error(error.code || error.message);process.exitCode=1;});
