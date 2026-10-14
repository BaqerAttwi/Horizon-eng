const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../controllers/workflowController.js'),'utf8');
const start=source.indexOf('async function restoreQuotationRevision('),end=source.indexOf('\nasync function ',start+1);
for(const missing of [false,true]) test('restoring saved legacy items '+(missing?'rolls back if product is missing':'preserves quantities, pricing and notes'),async()=>{
  const writes=[];let committed=false,rolledBack=false;
  const conn={beginTransaction:async()=>{},commit:async()=>{committed=true},rollback:async()=>{rolledBack=true},release(){},execute:async(sql,params)=>{
    if(sql.includes('MAX(revision_number)'))return [[{n:3}]];
    if(sql==='SELECT id FROM products')return [missing?[]:[{id:4}]];
    writes.push({sql,params});return [{insertId:1}];
  }};
  const snapshot={project:{},items:[{product_id:4,qty:2,unit_cost:3,unit_price:5,price_currency:'USD',notes:'Saved note'}],panels:[]};
  const db={getConnection:async()=>conn,execute:async(sql)=>sql.includes('quotation_revisions')?[[{snapshot_json:JSON.stringify(snapshot),revision_number:1}]]:[[]]};
  const restore=vm.runInNewContext(source.slice(start,end)+'\nrestoreQuotationRevision',{db,assertProjectAccess:async()=>true,decodeSnapshot:JSON.parse,encodeSnapshot:JSON.stringify,captureQuotationSnapshot:async()=>({project:{},items:[]}),recalcReservedQty:async()=>{},logActivity(){}});
  const res={json(body){this.body=body}};let error;
  await restore({params:{projectId:1,revisionId:2},worker:{role:'owner',id:7}},res,e=>{error=e});
  assert.equal(committed,!missing);assert.equal(rolledBack,missing);
  if(missing){assert.equal(error.status,409);assert.equal(writes.some(w=>w.sql.startsWith('DELETE FROM project_items')),false)}
  else {assert.equal(error,undefined);const insert=writes.find(w=>w.sql.startsWith('INSERT INTO project_items'));assert.deepEqual(Array.from(insert.params),[1,4,2,3,5,'USD','Saved note']);}
});
