const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { normalizeImportPanels } = require('../utils/importPanels');
const comparison = require('../utils/catalogComparison');
const { calcItemPricing } = require('../utils/pricingCore');
const res = () => ({ code:200, status(n) { this.code=n; return this; }, json(body) { this.body=body; return this; } });
function load(file, deps) {
  const module={exports:{}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'..',file),'utf8'), { module,exports:module.exports,console,
    require: name => { if (!(name in deps)) throw Error('Unexpected dependency '+name); return deps[name]; } });
  return module.exports;
}
const item = (id=1) => ({id,division_id:3,panel_id:2,catalog_id:10,catalog_usd:20,catalog_euro:null,base_price_usd:10,base_price_euro:5,qty:2,discount_pct:10,markupP_pct:5,manpower_pct:8,markupM_pct:3});
const selection = row => ({id:row.id,expected_usd:row.current_usd,expected_euro:row.current_euro,saved_usd:row.saved_usd,saved_euro:row.saved_euro});
test('flat import rows stay in their own panels and empty divisions remain empty',()=>{
  const panels=normalizeImportPanels([{panel_number:1},{panel_number:2},{panel_number:3,divisions:[]}],
    [{panel_number:1,name:'A',qty:1,division_type:'__proto__'},{panel_number:2,name:'B',qty:2}]);
  assert.deepEqual(panels.map(p=>p.divisions.flatMap(d=>d.items.map(i=>i.name))),[['A'],['B'],[]]);
  assert.deepEqual(normalizeImportPanels([{panel_number:1,divisions:[{items:[]}]}],[{name:'Wrong'}])[0].divisions[0].items,[]);
});
test('malformed import structures fail before any database work',()=>{
  for (const input of [{length:1},[null],[{divisions:{}}],[{divisions:[{items:{}}]}],[{panel_number:1},{panel_number:1}],
    [{quantity:1.5}],[{divisions:[{items:[{product_id:true}]}]}],[{divisions:[{items:[{name:'x'.repeat(251)}]}]}]]) {
    assert.throws(()=>normalizeImportPanels(input),e=>e.status===400);
  }
});
test('currency comparison handles EUR-only zero USD and four-decimal storage',()=>{
  const row=comparison.compareCatalogItem({...item(),catalog_usd:0,catalog_euro:10,base_price_usd:11.8,base_price_euro:10},1.18);
  assert.equal(row.current_usd,11.8); assert.equal(row.status,'Unchanged');
  const rounded=comparison.compareCatalogItem({...item(),catalog_euro:null,base_price_usd:20,base_price_euro:16.9492},1.18);
  assert.equal(rounded.status,'Unchanged');
  assert.equal(comparison.compareCatalogItem({...item(),catalog_id:null},1.18).status,'Unavailable in database');
  assert.equal(comparison.compareCatalogItem({...item(),catalog_usd:null,catalog_euro:null},1.18).status,'No database price');
});
test('price application rejects stale saved/catalog prices, missing items and duplicate IDs',()=>{
  const row=comparison.compareCatalogItem(item(),2), good=selection(row);
  assert.equal(comparison.validatePriceSelection([good],[row]).rows.length,1);
  for (const data of [[{...good,saved_usd:9}],[{...good,expected_usd:22}],[{...good,id:99}],[{...good,expected_usd:null}],[good,good]]) {
    assert.ok(comparison.validatePriceSelection(data,[row]).error);
  }
});
function priceController(failAt=0, access=true) {
  const events=[];
  const items=[item(1),item(2)];
  let writes=0;
  const connection={
    beginTransaction:async()=>events.push('begin'),commit:async()=>events.push('commit'),rollback:async()=>events.push('rollback'),release:()=>events.push('release'),
    execute:async(sql,params)=>{
      if(sql.startsWith('SELECT exchange')) return [[{exchange_rate_eur_usd:2}]];
      if(sql.startsWith('SELECT i.*')) { assert.match(sql,/FOR UPDATE/); return [items]; }
      if(sql.startsWith('UPDATE')) { events.push({sql,params}); if(++writes===failAt) throw Error('write failed'); }
      return [{}];
    },
  };
  const api=load('controllers/catalogPriceController.js',{
    '../db/connection':{getConnection:async()=>connection},
    './crmController':{checkProjectAccess:async()=>access},
    '../utils/pricing':{calcItemPricing,recalcPanelTotals:async(panel,executor)=>{assert.equal(executor,connection);events.push('totals');}},
    '../utils/catalogComparison':comparison,
  });
  return {api,events,items};
}
test('bulk prices and totals commit together and retain saved discount/markup',async()=>{
  const {api,events,items}=priceController(); const response=res();
  await api.apply({params:{projectId:9},body:{items:items.map(i=>selection(comparison.compareCatalogItem(i,2)))},worker:{id:4}},response,e=>{throw e;});
  assert.equal(response.body.updated,2);
  assert.ok(events.indexOf('totals')<events.indexOf('commit'));
  assert.equal(events.filter(e=>e==='totals').length,1);
  const update=events.find(e=>e.sql);
  assert.equal(update.params[7],calcItemPricing({...items[0],base_price_usd:20,base_price_euro:10},2).totalfinalProduct);
  assert.doesNotMatch(update.sql,/discount_pct=|markupP_pct=|qty=/);
});
test('bulk update failure rolls back without committing any prices',async()=>{
  const {api,events,items}=priceController(2); let error;
  await api.apply({params:{projectId:9},body:{items:items.map(i=>selection(comparison.compareCatalogItem(i,2)))},worker:{id:4}},res(),e=>{error=e;});
  assert.match(error.message,/write failed/); assert.ok(events.includes('rollback')); assert.ok(!events.includes('commit')); assert.equal(events.at(-1),'release');
});
test('out-of-project or stale price selections never write',async()=>{
  const {api,events}=priceController(); const response=res();
  await api.apply({params:{projectId:9},body:{items:[{id:999}]},worker:{id:4}},response,e=>{throw e;});
  assert.equal(response.code,409); assert.ok(!events.some(e=>e.sql)); assert.ok(events.includes('rollback'));
  const denied=priceController(0,false);
  await denied.api.apply({params:{projectId:9},body:{}},res(),e=>{throw e;}); assert.equal(denied.events.length,0);
});
function importController(failTotals=false) {
  const events=[];
  const connection={beginTransaction:async()=>events.push('begin'),commit:async()=>events.push('commit'),rollback:async()=>events.push('rollback'),release:()=>events.push('release'),
    execute:async(sql,params)=>{
      if(sql.startsWith('SELECT id FROM project_crm_panels')) return [[{id:2}]];
      events.push({sql,params});
      const placeholders=(sql.match(/\?/g)||[]).length;
      assert.equal(placeholders,params.length,'SQL parameter count');
      return [{insertId:2}];
    }};
  const api=load('controllers/pdfImportController.js',{
    '../utils/quotationNumber':{generateQuotationNumber:()=> 'TEST-001'},'pdf-parse':{},
    '../db/connection':{getConnection:async()=>connection},
    '../utils/importPanels':{normalizeImportPanels},
    '../middleware/numericValidation':require('../middleware/numericValidation'),
    './projectController':{recalcReservedQty:async executor=>{assert.equal(executor,connection);events.push('reservations');}},
    '../utils/pricing':{calcItemPricing,recalcPanelTotals:async(id,executor)=>{assert.equal(executor,connection);events.push('totals');if(failTotals)throw Error('totals failed');}},
  });
  return {api,events};
}
const importRequest = role => ({worker:{id:1,role},importSource:'legacy_excel',body:{project_name:'Old',client_id:1,exchange_rate_eur_usd:2,
  panels:[{panel_number:1,divisions:[{division_type:'ATS',items:[{name:'A',qty:2,base_price_usd:20,base_price_euro:10,cost:12}]}]}]}});
test('historical imports retain cost and commit totals/reservations before reporting success',async()=>{
  const {api,events}=importController();const response=res();
  await api.createFromImport(importRequest('owner'),response,e=>{throw e;});
  assert.equal(response.code,201);
  const saved=events.find(e=>e.sql?.startsWith('INSERT INTO panel_crm_items'));
  assert.equal(saved.params[10],20); assert.equal(saved.params[22],12);
  assert.ok(events.indexOf('totals')<events.indexOf('commit'));
  assert.ok(events.indexOf('reservations')<events.indexOf('commit'));
});
test('failed import totals roll back the project instead of committing a retryable duplicate',async()=>{
  const {api,events}=importController(true);let error;
  await api.createFromImport(importRequest('owner'),res(),e=>{error=e;});
  assert.match(error.message,/totals failed/);assert.ok(events.includes('rollback'));assert.ok(!events.includes('commit'));
});
test('engineers cannot inject manual monetary prices through technical offer imports',async()=>{
  const {api,events}=importController();const request=importRequest('engineer');delete request.importSource;
  await api.createFromImport(request,res(),e=>{throw e;});
  const saved=events.find(e=>e.sql?.startsWith('INSERT INTO panel_crm_items'));
  assert.equal(saved.params[10],0); assert.equal(saved.params[11],0);assert.equal(saved.params[22],0);
});
test('catalog price activity cannot reveal saved or database prices to engineers',()=>{
  const {redactFinancials}=require('../utils/financialPrivacy');
  const safe=redactFinancials({field_name:'catalog_prices',old_value:'{"usd":10}',new_value:'{"usd":20}',saved_usd:10,current_euro:8});
  assert.equal(safe.old_value,null);assert.equal(safe.new_value,null);assert.equal(safe.saved_usd,null);assert.equal(safe.current_euro,null);
});
test('actual import and catalog routes deny every role except owner and head engineer',()=>{
  const auth=load('middleware/auth.js',{'jsonwebtoken':{},'../db/connection':{},
    '../utils/accountSecurity':{},'../controllers/authController':{},'../utils/rolePolicy':require('../utils/rolePolicy')});
  const routes=[];
  const router=new Proxy({}, {get:(_,method)=> (url,...handlers)=>{if(method!=='use')routes.push({method,url,handlers});}});
  let stub;stub=new Proxy(function(){return stub;},{get:()=>stub});
  const module={exports:{}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../routes/index.js'),'utf8'),{module,console,
    require:name=>name==='express'?{Router:()=>router}:name==='../middleware/auth'?auth:stub});
  const restricted=routes.filter(r=>r.url.includes('/import-excel/') || r.url.includes('/check-prices'));
  assert.equal(restricted.length,5);
  for(const route of restricted) {
    for(const role of ['owner','head_engineer','engineer','accounting','stock_manager','secretary','technician','unknown']) {
      const response=res();let allowed=false;
      route.handlers[1]({worker:{role},method:route.method,path:route.url},response,()=>{allowed=true;});
      assert.equal(allowed,['owner','head_engineer'].includes(role),role+' '+route.url);
      if(!allowed)assert.equal(response.code,403);
    }
  }
});
