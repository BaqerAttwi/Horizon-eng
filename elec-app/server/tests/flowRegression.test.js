const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
function load(file,name,context) {
  const source=fs.readFileSync(path.join(__dirname,'../controllers',file),'utf8');
  const start=source.indexOf(`async function ${name}(`);
  const next=source.indexOf('\nasync function ',start+1);
  const end=next<0?source.indexOf('\nmodule.exports',start):next;
  return vm.runInNewContext(source.slice(start,end)+`\n${name}`,{console,...context});
}
const response=()=>({code:200,status(code){this.code=code;return this},json(body){this.body=body;return this}});

test('editing execution notes preserves completion and completed metadata',async()=>{
  let write;
  const update=load('executionController.js','toggleItemExecution',{
    checkExecutionAccess:async()=>true,logActivity(){},db:{execute:async(sql,params)=>{
      if(sql.includes('SELECT i.id, i.qty'))return [[{id:9,qty:2}]];
      if(sql.startsWith('SELECT id,is_completed'))return [[{id:1,is_completed:1,qty_done:2}]];
      if(sql.startsWith('UPDATE')){write={sql,params:Array.from(params)};return [{}]}
      return [[{is_completed:1,qty_done:2,completed_by:5,execution_notes:'New note'}]];
    }},
  });
  const res=response();await update({params:{projectId:1,itemId:9},worker:{id:7},body:{execution_notes:'New note'}},res,e=>{throw e});
  assert.equal(res.body.is_completed,1);assert.equal(res.body.qty_done,2);
  assert.doesNotMatch(write.sql,/is_completed|qty_done|completed_by|completed_at/);
  assert.deepEqual(write.params,['New note',1,9]);
});

for(const completed of [true,false])test(`execution checkbox ${completed?'fills':'clears'} completed quantity`,async()=>{
  let params;
  const update=load('executionController.js','toggleItemExecution',{
    checkExecutionAccess:async()=>true,logActivity(){},db:{execute:async(sql,values)=>{
      if(sql.includes('SELECT i.id, i.qty'))return [[{id:9,qty:4}]];
      if(sql.startsWith('SELECT id,is_completed'))return [[{id:1,is_completed:0,qty_done:2}]];
      if(sql.startsWith('UPDATE')){params=Array.from(values);return [{}]}
      return [[{is_completed:completed?1:0,qty_done:completed?4:0}]];
    }},
  });
  await update({params:{projectId:1,itemId:9},worker:{id:7},body:{is_completed:completed}},response(),e=>{throw e});
  assert.equal(params[0],completed?1:0);assert.equal(params[1],completed?4:0);
});

test('discount note changes preserve the saved percentage',async()=>{
  let write;
  const update=load('discountController.js','updateDiscount',{db:{execute:async(sql,params)=>{
    if(sql.startsWith('SELECT id'))return [[{id:1}]];
    if(sql.startsWith('UPDATE')){write={sql,params:Array.from(params)};return [{}]}
    return [[{discount_pct:15,notes:'Changed'}]];
  }}});
  const res=response();await update({params:{id:1},body:{notes:'Changed'}},res,e=>{throw e});
  assert.equal(res.body.discount_pct,15);assert.doesNotMatch(write.sql,/discount_pct/);assert.deepEqual(write.params,['Changed',1]);
});

test('bulk brand discounts validate the entire input before writing',async()=>{
  const update=load('discountController.js','bulkUpdateBrandDiscounts',{db:{execute:async()=>assert.fail('unexpected write')}});
  const res=response();await update({body:{discounts:[{brand_id:1,discount_pct:10},{brand_id:2,discount_pct:101}]}},res,e=>{throw e});
  assert.equal(res.code,400);
});
