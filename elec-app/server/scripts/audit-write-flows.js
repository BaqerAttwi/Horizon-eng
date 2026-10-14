// Real HTTP/controller/database integration tests in a disposable schema.
// Copies table structures only; never copies user records or processes email.
require('dotenv').config();
const mysql = require('mysql2/promise');
const express = require('express');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

async function main() {
  const originalDatabase = process.env.DB_NAME || 'elec_app';
  const scratch = `codex_flow_audit_${Date.now()}`;
  const config = { host:process.env.DB_HOST || 'localhost',port:Number(process.env.DB_PORT || 3306),user:process.env.DB_USER || 'root',password:process.env.DB_PASSWORD || '',database:originalDatabase };
  const admin = await mysql.createConnection(config);
  let fixture, db, closeReviewLocks, server, created = false;
  const results=[];
  let readChecks=0;
  try {
    const [tables] = await admin.query("SHOW FULL TABLES WHERE Table_type='BASE TABLE'");
    const definitions=[];
    for (const row of tables) {
      const table = Object.values(row)[0];
      const [[definition]] = await admin.query('SHOW CREATE TABLE ??',[table]);
      definitions.push(definition['Create Table']);
    }
    assert.match(scratch,/^codex_flow_audit_\d+$/);
    await admin.query(`CREATE DATABASE \`${scratch}\``); created=true;
    fixture = await mysql.createConnection({...config,database:scratch});
    await fixture.query('SET FOREIGN_KEY_CHECKS=0');
    for (const definition of definitions) await fixture.query(definition);
    await fixture.query('SET FOREIGN_KEY_CHECKS=1');
    process.env.DB_NAME=scratch;
    process.env.COOKIE_SECURE='false';
    process.env.RESEND_API_KEY='';
    db=require('../db/connection');
    ({closeReviewLocks}=require('../middleware/projectReview'));
    const router=require('../routes');
    const {JWT_SECRET}=require('../controllers/authController');
    const {passwordFingerprint}=require('../utils/accountSecurity');
    const hash=await bcrypt.hash('FixturePassword123',4);
    const users={},tokens={};
    for (const role of ['owner','head_engineer','engineer','accounting','stock_manager','secretary','technician']) {
      const [row]=await fixture.execute('INSERT INTO workers(name,email,role,password_hash) VALUES(?,?,?,?)',[`Audit ${role}`,`${role}@example.com`,role,hash]);
      users[role]=row.insertId;
      tokens[role]=jwt.sign({id:row.insertId,credential:passwordFingerprint(hash)},JWT_SECRET,{expiresIn:'15m'});
    }
    await fixture.execute('INSERT INTO division_types(name,color,sort_order,is_active,created_by) VALUES(?,?,?,?,?)',['Power','#123456',1,1,users.owner]);
    const [second]=await fixture.execute('INSERT INTO workers(name,email,role,password_hash) VALUES(?,?,?,?)',['Audit collaborator','collaborator@example.com','engineer',hash]);
    const app=express(); app.use(cookieParser());app.use(express.json());app.use('/api',router);
    app.use('/api',(req,res)=>res.status(404).json({error:'API route not found'}));
    app.use(express.static(path.join(__dirname,'../../client/dist')));
    app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'../../client/dist/index.html')));
    app.use((error,req,res,next)=>res.status(500).json({error:error.code || error.message}));
    server=await new Promise(resolve=>{const running=app.listen(0,'127.0.0.1',()=>resolve(running));});
    const base=`http://127.0.0.1:${server.address().port}/api`;
    async function call(role,method,url,body,status=200) {
      const response=await fetch(base+url,{method,redirect:'manual',headers:{cookie:`token=${tokens[role]}`,'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
      const raw=await response.text();let data;try{data=JSON.parse(raw)}catch{data=raw}
      assert.equal(response.status,status,`${method} ${url}: ${data?.error || raw.slice(0,100)}`);
      return data;
    }
    async function flow(name,run){try{await run();results.push({flow:name,status:'passed'});}catch(error){results.push({flow:name,status:'failed',error:error.message});}}
    async function upload(url,bytes,filename,mime,status=200) {
      const form=new FormData();form.append('file',new Blob([bytes],{type:mime}),filename);
      const response=await fetch(base+url,{method:'POST',headers:{cookie:`token=${tokens.owner}`},body:form,signal:AbortSignal.timeout(30000)});
      const data=await response.json();assert.equal(response.status,status,data.error);return data;
    }
    let client,product,project,panel,division,stockItem,manualItem,group,instance;
    await flow('Login, profile, email permissions and account administration',async()=>{
      await call('owner','POST','/auth/login',{email:'owner@example.com',password:'FixturePassword123'});
      await call('owner','GET','/auth/me');
      await call('engineer','PATCH','/auth/me',{name:'Updated Engineer',phone:'123'});
      await call('engineer','PATCH','/auth/me',{name:'Engineer',email:'changed@example.com'},403);
      await call('owner','PATCH',`/workers/${users.engineer}`,{email:'updated@example.com'});
      await call('head_engineer','PATCH',`/workers/${users.engineer}`,{email:'bad@example.com'},403);
      const worker=await call('owner','POST','/workers',{name:'Temporary',role:'engineer',password:'FixturePassword123',email:'temporary@example.com'},201);
      await call('head_engineer','PATCH',`/workers/${worker.id}`,{name:'Renamed'});
      await call('owner','DELETE',`/workers/${worker.id}`);
      await call('owner','POST','/auth/logout',{});
    });
    await flow('Client creation, editing, validation and deletion',async()=>{
      client=await call('secretary','POST','/clients',{name:'Audit Client',type:'company',phone:'123'},201);
      await call('accounting','PATCH',`/clients/${client.id}`,{credit_limit:1000,address:'Test address'});
      await call('secretary','PATCH',`/clients/${client.id}`,{name:''},400);
      const disposable=await call('owner','POST','/clients',{name:'Disposable'},201);
      await call('owner','DELETE',`/clients/${disposable.id}`);
    });
    await flow('Inventory stock/pricing and brand discount lifecycle',async()=>{
      product=await call('stock_manager','POST','/products/provision',{smart_code:'AUDIT',qty:20},201);
      await call('owner','PATCH',`/products/${product.id}`,{price_usd:10,price_euro:8,price_cost:5});
      await call('stock_manager','PATCH',`/products/${product.id}`,{price_usd:99},403);
      await call('stock_manager','PATCH',`/products/${product.id}`,{stock_qty:-1},400);
      await call('owner','POST','/discounts',{product_id:product.id,discount_pct:110},400);
      const discount=await call('owner','POST','/discounts',{product_id:product.id,discount_pct:10,notes:'original'},201);
      const changed=await call('accounting','PATCH',`/discounts/${discount.id}`,{notes:'Changed note'});
      assert.equal(Number(changed.discount_pct),10,'Editing a discount note resets its percentage');
      await call('owner','DELETE',`/discounts/${discount.id}`);
    });
    await flow('Project creation, panel/division/item pricing and visibility',async()=>{
      project=await call('engineer','POST','/projects',{project_name:'Audit Project',client_id:client.id,total_panels:0},201);
      const full=await call('owner','GET',`/projects/${project.id}`);assert.equal(Number(full.vat_pct),11);
      panel=await call('owner','POST',`/projects/${project.id}/panels`,{panel_number:1,panel_name:'Audit Panel',markupP:10},201);
      division=await call('owner','POST',`/projects/${project.id}/panels/${panel.id}/divisions`,{division_type:'Power',markupP:0,markupM:0,manpower_pct:0},201);
      const itemBase=`/projects/${project.id}/panels/${panel.id}/divisions/${division.id}/items`;
      stockItem=await call('owner','POST',itemBase,{product_id:product.id,qty:2},201);
      manualItem=await call('owner','POST',itemBase,{is_manual:1,custom_name:'Manual audit item',custom_desc:'Example',qty:2,base_price_usd:5},201);
      await call('engineer','PATCH',`${itemBase}/${manualItem.id}`,{visible_in_client_pdf:0});
      await call('engineer','PATCH',`${itemBase}/${manualItem.id}`,{visible_in_client_pdf:1});
      const crm=await call('owner','GET',`/projects/${project.id}/crm`);assert.ok(Number(crm.total_price)>0);
    });
    await flow('Collaboration invites, response and project access',async()=>{
      const invite=await call('engineer','POST','/engineer-requests',{project_id:project.id,target_engineer_id:second.insertId},201);
      const old=tokens.engineer;tokens.engineer=jwt.sign({id:second.insertId,credential:passwordFingerprint(hash)},JWT_SECRET,{expiresIn:'15m'});
      try{await call('engineer','PATCH',`/engineer-requests/${invite.id}/respond`,{action:'accept'});await call('engineer','GET',`/projects/${project.id}/crm`);}finally{tokens.engineer=old;}
    });
    await flow('Item groups, zero markup inheritance and quantity/description edits',async()=>{
      group=await call('engineer','POST','/item-groups',{name:'Audit Group',description:'Group description'},201);
      await call('engineer','POST',`/item-groups/${group.id}/items`,{product_id:product.id,qty:1},201);
      instance=await call('owner','POST',`/projects/${project.id}/panels/${panel.id}/divisions/${division.id}/group-instances`,{item_group_id:group.id,quantity:2},201);
      await call('owner','PATCH',`/group-instances/${instance.id}`,{description:'Edited group'});
      const crm=await call('owner','GET',`/projects/${project.id}/crm`);
      const item=crm.panels[0].divisions[0].group_instances[0].items[0];
      assert.equal(Number(item.markupP_pct),0,'Explicit division zero markup incorrectly falls back to panel markup');
    });
    await flow('Quotation revision capture and restore preserves group structure',async()=>{
      const rev=await call('owner','POST',`/projects/${project.id}/quotation-revisions`,{notes:'Audit revision'},201);
      const snapshot=await call('owner','GET',`/projects/${project.id}/quotation-revisions/${rev.id}/snapshot`);
      assert.equal(snapshot.panels[0].divisions[0].group_instances?.length,1,'Group instances are missing from quotation snapshot');
      await call('owner','POST',`/projects/${project.id}/quotation-revisions/${rev.id}/restore`,{});
      const crm=await call('owner','GET',`/projects/${project.id}/crm`);
      panel=crm.panels[0];division=panel.divisions[0];
      stockItem=division.items.find(i=>!i.is_manual&&!i.source_group_instance_id);manualItem=division.items.find(i=>i.is_manual);
      assert.equal(division.group_instances.length,1,'Group missing after restoration');
    });
    await flow('Review, quotation, client approval and procurement transitions',async()=>{
      await call('engineer','PATCH',`/projects/${project.id}/ready-for-review`,{});
      await call('owner','PATCH',`/projects/${project.id}/admin-approval`,{admin_approval:'approved'});
      await call('owner','PATCH',`/projects/${project.id}/stage`,{stage:'quotation'});
      await call('owner','PATCH',`/projects/${project.id}`,{client_approval:'approved'});
      await call('owner','PATCH',`/projects/${project.id}/stage`,{stage:'approval'});
      await call('owner','PATCH',`/projects/${project.id}/stage`,{stage:'procurement'});
      await call('stock_manager','PATCH',`/procurement/projects/${project.id}/review`,{action:'approve'},409);
      await call('stock_manager','PATCH',`/procurement/projects/${project.id}/manual-items/${manualItem.id}/receive`,{quantity:1});
      await call('stock_manager','PATCH',`/procurement/projects/${project.id}/manual-items/${manualItem.id}/receive`,{quantity:1});
      await call('stock_manager','PATCH',`/procurement/projects/${project.id}/review`,{action:'approve'});
      await call('owner','PATCH',`/projects/${project.id}/stage`,{stage:'assembly'});
      await call('owner','PATCH',`/projects/${project.id}/panels/${panel.id}/complete`,{});
      await call('owner','PATCH',`/projects/${project.id}/stage`,{stage:'testing'});
    });
    await flow('Technician assignments, completion, note edits and delivery',async()=>{
      await call('owner','POST',`/projects/${project.id}/technicians`,{worker_id:users.technician},201);
      await call('technician','GET','/technicians/my-projects');
      await call('technician','GET',`/projects/${project.id}/execution/view`);
      await call('technician','PATCH',`/projects/${project.id}/execution/items/${stockItem.id}`,{qty_done:2});
      const result=await call('technician','PATCH',`/projects/${project.id}/execution/items/${stockItem.id}`,{execution_notes:'Notes only'});
      assert.equal(Number(result.is_completed),1,'Note-only edit clears item completion');
      await call('technician','PATCH',`/projects/${project.id}/execution/panels/${panel.id}`,{is_completed:1});
      await call('owner','PATCH',`/projects/${project.id}/stage`,{stage:'delivered'});
    });
    await flow('Installment payments, debt and payment deletion',async()=>{
      const payment=await call('accounting','POST',`/projects/${project.id}/payments`,{amount:1,payment_date:'2026-10-13',next_payment_deadline:'2026-11-13'},201);
      const summary=await call('accounting','GET',`/projects/${project.id}/payments`);assert.equal(Number(summary.total_paid),1);
      await call('accounting','GET','/debt');
      await call('accounting','DELETE',`/projects/${project.id}/payments/${payment.id}`);
    });
    await flow('Attachments, announcements, updates and notifications',async()=>{
      const attachment=await call('owner','POST',`/projects/${project.id}/attachments`,{name:'Example link',link_url:'https://example.com'},201);
      await call('owner','GET',`/projects/${project.id}/attachments`);
      await call('owner','DELETE',`/projects/${project.id}/attachments/${attachment.id}`);
      const message=await call('secretary','POST','/messages',{content:'Test announcement'},201);
      await call('technician','GET','/messages');await call('secretary','DELETE',`/messages/${message.id}`);
      const update=await call('owner','POST','/updates',{version:'audit',title:'Audit',summary:'Audit summary',features:['Audit feature'],target_roles:'all'},201);
      await call('technician','PATCH',`/updates/${update.id}/read`,{});await call('technician','PATCH','/notifications/read-all',{});
    });
    await flow('Dashboard, calendar sources, analytics, export and role guards',async()=>{
      for(const url of ['/dashboard','/engineer-workload','/analytics/summary','/analytics/engineers','/analytics/clients','/reservations','/export/projects','/export/products','/export/reservations',`/export/crm/${project.id}`]) await call('owner','GET',url);
      for(const role of ['engineer','stock_manager','secretary','technician']) await call(role,'GET','/debt',undefined,403);
      await call('accounting','GET','/dashboard');await call('stock_manager','GET','/procurement/projects');await call('secretary','GET','/dashboard');
    });
    await flow('Division types create, rename and archive',async()=>{
      const type=await call('owner','POST','/division-types',{name:'Audit Custom Type',color:'#123456'},201);
      await call('owner','PATCH',`/division-types/${type.id}`,{name:'Renamed Type'});await call('owner','DELETE',`/division-types/${type.id}`);
    });
    let copiedProject,copiedPanel,copiedDivision,copiedItem;
    await flow('Copy panels preserves groups, quantities, overrides and manual items',async()=>{
      copiedProject=await call('owner','POST','/projects',{project_name:'Copied project',engineer_id:users.engineer,total_panels:0},201);
      await call('owner','POST',`/projects/${copiedProject.id}/panels/copy-from`,{sourceProjectId:project.id,sourcePanelId:panel.id},201);
      const copied=await call('owner','GET',`/projects/${copiedProject.id}/crm`);
      copiedPanel=copied.panels[0];copiedDivision=copiedPanel.divisions[0];copiedItem=copiedDivision.items.find(i=>!i.is_manual&&!i.source_group_instance_id);
      assert.equal(copiedDivision.group_instances.length,1);
      assert.equal(copiedDivision.group_instances[0].items.length,1);
      assert.equal(copiedDivision.items.filter(i=>i.is_manual).length,1);
    });
    await flow('Bulk pricing edits, replacement and project brand discounts',async()=>{
      await call('owner','POST',`/projects/${copiedProject.id}/items/bulk-update`,{item_ids:[copiedItem.id],changes:{markupP_pct:15}});
      await call('owner','POST',`/projects/${copiedProject.id}/items/bulk-replace`,{item_ids:[copiedItem.id],product_id:product.id,base_price_usd:10});
      await call('owner','POST',`/projects/${copiedProject.id}/items/apply-brand-discount`,{brand:'Unbranded',discount_pct:5});
      await call('owner','POST',`/projects/${copiedProject.id}/items/bulk-update`,{item_ids:[copiedItem.id],changes:{discount_pct:120}},400);
    });
    await flow('Price-change request approval and rejection',async()=>{
      const request=await call('engineer','POST','/price-changes',{item_id:copiedItem.id,new_markupP_pct:20},201);
      await call('owner','PATCH',`/price-changes/${request.id}/approve`,{});
      const secondRequest=await call('engineer','POST','/price-changes',{item_id:copiedItem.id,new_markupP_pct:30},201);
      await call('owner','PATCH',`/price-changes/${secondRequest.id}/reject`,{rejection_reason:'Test rejection'});
    });
    await flow('Manual product requests: approve, reject and direct owner addition',async()=>{
      const request=await call('engineer','POST','/manual-product-requests',{name:'AuditRequestedProduct',description:'Example',price_usd:3},201);
      await call('owner','PATCH',`/manual-product-requests/${request.request.id}/approve`,{});
      const rejected=await call('engineer','POST','/manual-product-requests',{name:'RejectedAuditProduct'},201);
      await call('owner','PATCH',`/manual-product-requests/${rejected.request.id}/reject`,{reason:'Test rejection'});
      await call('owner','POST','/manual-product-requests',{name:'DirectAuditProduct',price_usd:4},201);
    });
    await flow('Reservation add, release, insufficient stock and history',async()=>{
      await call('stock_manager','PATCH',`/reservations/product/${product.id}/reserved-qty`,{action:'reserve',qty:1});
      await call('stock_manager','PATCH',`/reservations/product/${product.id}/reserved-qty`,{action:'release',qty:1});
      await call('stock_manager','PATCH',`/reservations/product/${product.id}/reserved-qty`,{action:'reserve',qty:10000},400);
      await call('stock_manager','GET','/reservation-history');
    });
    await flow('PDF import confirmation creates grouped and manual items',async()=>{
      const imported=await call('owner','POST','/projects/import-pdf/create',{project_name:'Imported audit',engineer_id:users.engineer,panels:[{panel_number:1,panel_name:'Imported panel',divisions:[{division_type:'Power',items:[{item_group_id:group.id,qty:2},{name:'Imported manual',description:'Example',qty:1}]}]}]},201);
      const crm=await call('owner','GET',`/projects/${imported.project_id}/crm`);
      assert.equal(crm.panels[0].divisions[0].group_instances.length,1);
      assert.equal(Number(crm.vat_pct),11);
    });
    await flow('Manual product library, item removal and group/division/panel deletion',async()=>{
      const manual=await call('owner','POST',`/projects/${copiedProject.id}/manual-products`,{name:'Library item',description:'Example',price_usd:2},201);
      await call('owner','GET',`/projects/${copiedProject.id}/manual-products`);
      await call('owner','DELETE',`/projects/${copiedProject.id}/manual-products/${manual.id}`);
      await call('owner','DELETE',`/projects/${copiedProject.id}/panels/${copiedPanel.id}/divisions/${copiedDivision.id}/items/${copiedItem.id}`);
      await call('owner','DELETE',`/projects/${copiedProject.id}/panels/${copiedPanel.id}/divisions/${copiedDivision.id}`);
      await call('owner','DELETE',`/projects/${copiedProject.id}/panels/${copiedPanel.id}`);
      await call('owner','DELETE',`/projects/${copiedProject.id}`);
    });
    await flow('Excel import, PDF preview and unsupported upload handling',async()=>{
      const XLSX=require('xlsx');const book=XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([['Reference','Description','EUR','USD','Brand','Smart','Cost'],['AUDIT-XLSX','Imported example',8,10,'Audit brand','AX',5]]),'PL');
      const imported=await upload('/upload',XLSX.write(book,{type:'buffer',bookType:'xlsx'}),'audit.xlsx','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      assert.equal(imported.inserted,1);assert.equal(imported.errors.length,0);
      const {jsPDF}=require('../../client/node_modules/jspdf');const doc=new jsPDF();
      doc.text(['TECHNICAL OFFER','Panel #1 - Example','Division Part number Description QTY','INCOMING AUDIT-XLSX Imported example 2','End of Panel #1 - Example'],10,20);
      await upload('/projects/import-pdf/preview',Buffer.from(doc.output('arraybuffer')),'audit.pdf','application/pdf');
      await upload('/upload',Buffer.from('unsupported'),'audit.txt','text/plain',400);
    });
    await flow('Role assistant guidance and record lookups',async()=>{
      for(const role of Object.keys(users)) {
        const result=await call(role,'POST','/assistant/chat',{message:'What do I have today?'});assert.ok(result.reply);
      }
    });
    await flow('Read endpoint matrix across all seven roles',async()=>{
      const params={projectId:project.id,panelId:panel.id,divisionId:division.id,itemId:stockItem.id,productId:product.id,instanceId:instance.id};
      const [[revision]]=await fixture.execute('SELECT id FROM quotation_revisions WHERE project_id=? LIMIT 1',[project.id]);params.revisionId=revision?.id || 1;
      const routes=router.stack.filter(layer=>layer.route?.methods.get&&!['/onedrive/connect','/onedrive/callback','/attachments/:attachmentId/download'].includes(layer.route.path));
      let checks=0;
      for(const role of Object.keys(users)) for(const layer of routes) {
        const template=layer.route.path;
        const url=template.replace(/:([A-Za-z]+)/g,(_,key)=>key==='id'?(template.startsWith('/products')?product.id:template.startsWith('/item-groups')?group.id:project.id):params[key]||1);
        const response=await fetch(base+url,{headers:{cookie:`token=${tokens[role]}`},redirect:'manual',signal:AbortSignal.timeout(15000)});
        assert.ok([200,403,404,409].includes(response.status),`${role} GET ${template}: ${response.status}`);
        await response.arrayBuffer();checks++;
      }
      readChecks=checks;
    });
    await flow('Password changes invalidate the old session',async()=>{
      await call('secretary','POST','/auth/change-password',{current_password:'FixturePassword123',new_password:'ChangedFixture123'});
      await call('secretary','GET','/auth/me',undefined,401);
    });
    const destination=path.join(__dirname,'../../../tmp/audits/write-flows.json');fs.mkdirSync(path.dirname(destination),{recursive:true});fs.writeFileSync(destination,JSON.stringify(results,null,2));
    console.log(JSON.stringify({flows:results.length,passed:results.filter(r=>r.status==='passed').length,readChecks,results,report:destination},null,2));
    if(results.some(r=>r.status==='failed'))process.exitCode=1;
  } finally {
    if(server)await new Promise(resolve=>server.close(resolve));
    if(db)await db.end();if(closeReviewLocks)await closeReviewLocks();if(fixture)await fixture.end();
    if(created){assert.match(scratch,/^codex_flow_audit_\d+$/);assert.notEqual(scratch,originalDatabase);await admin.query(`DROP DATABASE \`${scratch}\``);}
    await admin.end();
  }
}
main().catch(error=>{console.error(error.code || error.message);process.exitCode=1;});
