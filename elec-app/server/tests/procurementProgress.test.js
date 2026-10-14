const test=require('node:test');
const assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const path=require('node:path');
const helpers=import(pathToFileURL(path.join(__dirname,'../../client/src/utils/procurementProgress.js')).href);
test('readiness counts complete item lines rather than received units',async()=>{
  const {procurementProgress}=await helpers;
  const result=procurementProgress({items:[{required_qty:100,shortage_qty:0},{required_qty:2,shortage_qty:1},{required_qty:3,shortage_qty:'0'}]});
  assert.deepEqual(result,{total:3,ready:2,shortages:1,percent:67});
});
test('an empty project is never ready for approval and has zero percent readiness',async()=>{
  const {procurementProgress,matchesProcurementFilter}=await helpers;
  assert.deepEqual(procurementProgress({items:[]}),{total:0,ready:0,shortages:0,percent:0});
  assert.equal(matchesProcurementFilter({items:[],procurement_status:'pending'},'ready'),false);
});
test('ready for approval excludes approved and rejected projects even with no shortage',async()=>{
  const {matchesProcurementFilter}=await helpers;
  for(const status of ['pending','approved','rejected']) assert.equal(matchesProcurementFilter({procurement_status:status,items:[{shortage_qty:0}]},'ready'),status==='pending');
});
test('shortages remain visible independently of the review decision',async()=>{
  const {matchesProcurementFilter}=await helpers;
  for(const status of ['pending','approved','rejected']) assert.equal(matchesProcurementFilter({procurement_status:status,items:[{shortage_qty:2}]},'shortages'),true);
});
test('approved and rejected filters use the recorded decision',async()=>{
  const {matchesProcurementFilter}=await helpers;
  assert.equal(matchesProcurementFilter({procurement_status:'approved'},'approved'),true);
  assert.equal(matchesProcurementFilter({procurement_status:'rejected'},'rejected'),true);
  assert.equal(matchesProcurementFilter({procurement_status:'pending'},'approved'),false);
  assert.equal(matchesProcurementFilter({procurement_status:'pending'},'all'),true);
});
