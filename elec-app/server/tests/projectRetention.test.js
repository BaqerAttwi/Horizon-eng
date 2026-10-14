const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
function load(file, dependency) {
  const module = {exports:{}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),{module,exports:module.exports,require:dependency});
  return module.exports;
}
for (const decision of ['rejected','recheck']) test(decision + ' saves content before advancing the editable version', async()=>{
  const writes=[];
  const project={id:9,current_version:3,quote_number:'Q9',total_price:100,total_with_vat:111};
  const connection={execute:async(sql,params)=>{
    if(sql.includes('SELECT * FROM projects')) return [[project]];
    if(sql.includes('SELECT i.*')) return [[{qty:2,reference:'A'}]];
    if(sql.includes('MAX(revision_number)')) return [[{n:7}]];
    writes.push({sql,params}); return [{}];
  }};
  const api=load('utils/rejectedVersion.js',()=>({captureQuotationSnapshot:async()=>({panels:[{panel_name:'Original'}]}),encodeSnapshot:JSON.stringify}));
  await api.preserveRejectedVersion(connection,9,'Change quantity',2,'admin',decision);
  const saved=JSON.parse(writes[0].params[7]);
  assert.equal(saved.project.admin_approval,decision);
  assert.equal(saved.project.current_version,3);
  assert.equal(saved.panels[0].panel_name,'Original');
  assert.equal(saved.items[0].qty,2);
  assert.match(writes[0].params[5], decision === 'recheck' ? /Recheck V3.*Change quantity/ : /Rejected V3.*Change quantity/);
  assert.match(writes[1].sql,/current_version=current_version\+1/);
});
test('expired project cannot be restored and does not reserve stock',async()=>{
  let reserves=0;
  const api=load('controllers/recycleBinController.js',name=>name.includes('connection')?{execute:async(sql)=>{
    assert.match(sql,/deleted_at > DATE_SUB\(NOW\(\), INTERVAL 1 YEAR\)/);return [{affectedRows:0}];
  }}:{recalcReservedQty:async()=>reserves++});
  const res={status(n){this.code=n;return this;},json(body){this.body=body;}};
  await api.restoreProject({params:{id:1}},res,e=>{throw e;});
  assert.equal(res.code,404);assert.equal(reserves,0);
});
test('purge only removes projects whose full year has expired',async()=>{
  const api=load('controllers/recycleBinController.js',()=>({execute:async sql=>{
    assert.match(sql,/DELETE FROM projects WHERE deleted_at IS NOT NULL AND deleted_at <= DATE_SUB\(NOW\(\), INTERVAL 1 YEAR\)/);
  }}));
  await api.purgeExpiredProjects();
});

for(const action of ['getProjects','getProject']) for(const role of ['secretary','stock_manager','technician','unknown']) test(action+' denies project metadata to '+role,async()=>{
  const source=fs.readFileSync(path.join(__dirname,'../controllers/projectController.js'),'utf8');
  const start=source.indexOf('async function '+action+'('),end=source.indexOf('\nasync function ',start+1);
  const run=vm.runInNewContext(source.slice(start,end)+'\n'+action,{console,db:{execute:async()=>assert.fail('Unauthorized database query')}});
  const res={status(code){this.code=code;return this},json(body){this.body=body}};
  await run({worker:{role},params:{id:1}},res,e=>{throw e});assert.equal(res.code,403);
});
