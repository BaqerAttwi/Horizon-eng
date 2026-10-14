const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function controller(db) {
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../controllers/procurementController.js'), 'utf8'), {
    module, require: name => name === '../db/connection' ? {execute: async (sql, params) => sql.startsWith('SELECT i.id,i.product_id,i.notes') ? [[]] : db.execute(sql,params)} : name.includes('notificationController') ? {} : { logActivity() {} },
  });
  return module.exports;
}
const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });
const request = quantity => ({ params: { projectId: '1', itemId: '9' }, worker: { id: 7 }, body: { quantity } });

test('procurement rejection requires a note before database writes', async () => {
  const api = controller({execute: async () => assert.fail('unexpected database access')});
  const res = response();
  await api.reviewProcurement({params:{projectId:'1'},worker:{id:7},body:{action:'reject',note:'  '}},res,e=>{throw e;});
  assert.equal(res.code,400);
});

test('empty project cannot receive procurement approval', async () => {
  const api = controller({execute: async sql => {
    if (sql.startsWith('SELECT id,project_name')) return [[{id:1,project_stage:'procurement'}]];
    assert.match(sql,/^SELECT pci.product_id/);
    return [[]];
  }});
  const res = response();
  await api.reviewProcurement({params:{projectId:'1'},worker:{id:7},body:{action:'approve'}},res,e=>{throw e;});
  assert.equal(res.code,409);
});

test('manual arrivals persist quantities for the exact project/item and reduce shortage', async () => {
  let received = 0;
  const db = { execute: async (sql, params) => {
    if (sql.startsWith('SELECT id,project_stage')) return [[{ id:1,project_stage:'procurement' }]];
    if (sql.startsWith('SELECT pci.id')) { assert.deepEqual(Array.from(params), [1,9]); assert.match(sql, /pci.product_id IS NULL/); return [[{ id:9,custom_name:'Manual switch' }]]; }
    if (sql.startsWith('INSERT INTO project_manual')) { assert.deepEqual(Array.from(params), [1,9,2,7]); received += params[2]; return [{}]; }
    assert.match(sql, /CASE WHEN pci.product_id IS NULL THEN pci.id/);
    return [[{ product_id:null,manual_item_id:9,required_qty:4,allocated_qty:received,available_for_project:received }]];
  } };
  const api = controller(db);
  const res = response();
  await api.receiveManualProcurementItem(request(2), res, e => { throw e; });
  assert.equal(res.body.items[0].shortage_qty, 2);
  await api.receiveManualProcurementItem(request(2), res, e => { throw e; });
  assert.equal(res.body.items[0].shortage_qty, 0);
  assert.equal(res.body.items[0].allocated_qty, 4);
});

test('manual receipt cannot target an item from another project', async () => {
  const api = controller({ execute: async sql => {
    if (sql.startsWith('SELECT id,project_stage')) return [[{id:1,project_stage:'procurement'}]];
    assert.match(sql, /WHERE pcp.project_id=\? AND pci.id=\? AND pci.product_id IS NULL/);
    return [[]];
  } });
  const res = response();
  await api.receiveManualProcurementItem(request(1), res, e => { throw e; });
  assert.equal(res.code,404);
});

test('manual arrivals reject fractions, zero and negative quantities before database access', async () => {
  const api = controller({ execute: async () => assert.fail('unexpected database access') });
  for (const qty of [0,-1,1.5,Infinity]) {
    const res = response();
    await api.receiveManualProcurementItem(request(qty), res, e => { throw e; });
    assert.equal(res.code,400);
  }
});

test('manual arrivals are blocked outside procurement', async () => {
  const api = controller({execute: async () => [[{id:1,project_stage:'assembly'}]]});
  const res = response();
  await api.receiveManualProcurementItem(request(1), res, e => { throw e; });
  assert.equal(res.code,409);
});

for (const belongsToProject of [true, false]) {
  test(`manual receipt resource guard ${belongsToProject ? 'accepts its CRM item' : 'rejects another project CRM item'}`, async () => {
    const module = { exports: {} };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../middleware/resourceScope.js'), 'utf8'), {
      module, require: () => ({ execute: async (sql, params) => {
        assert.match(sql, /FROM panel_crm_items i/);
        assert.doesNotMatch(sql, /FROM project_items/);
        assert.deepEqual(Array.from(params), ['9']);
        return [[{ project_id: belongsToProject ? 1 : 2, panel_id: 3, division_id: 4 }]];
      } }),
    });
    const res = response();
    const passed = await module.exports.checkResourceScope({
      path: '/procurement/projects/1/manual-items/9/receive',
      params: { projectId: '1', itemId: '9' }, body: { quantity: 2 },
    }, res);
    assert.equal(passed, belongsToProject);
    assert.equal(res.code, belongsToProject ? 200 : 404);
  });
}

for (const role of ['owner','head_engineer','stock_manager']) {
  test('procurement C.R. data respects ' + role + ' access and groups exact occurrences', async()=>{
    const api=controller({execute:async sql=>{
      if (sql.includes('FROM projects p')) return [[{id:1}]];
      if (sql.startsWith('SELECT pci.product_id')) return [[{product_id:4},{product_id:null,manual_item_id:9}]];
      assert.notEqual(role,'stock_manager');
      return [[{id:2,product_id:4,cr_amount:5},{id:3,product_id:4,cr_amount:7},{id:9,product_id:null,cr_amount:0},{id:10,product_id:null,cr_amount:12}]];
    }});
    const res=response();
    await api.getProcurementQueue({worker:{role}},res,e=>{throw e;});
    const [product,manual]=res.body[0].items;
    if (role==='stock_manager') {
      assert.equal(product.cr_amount,undefined);assert.equal(product.crm_item_ids,undefined);
    } else {
      assert.deepEqual(Array.from(product.crm_item_ids),[2,3]);assert.equal(product.cr_amount,null);
      assert.deepEqual(Array.from(manual.crm_item_ids),[9]);assert.equal(manual.cr_amount,0);
    }
  });
}

test('manual C.R. matches names across panels and divisions without including catalog or unrelated items', async()=>{
  const api=controller({execute:async(sql,params)=>{
    if (sql.includes('FROM projects p')) return [[{id:1}]];
    if (sql.startsWith('SELECT pci.product_id')) return [[{product_id:null,manual_item_id:9},{product_id:null,manual_item_id:12}]];
    assert.match(sql,/WHERE p.project_id=\?/);
    assert.deepEqual(Array.from(params),[1]);
    return [[
      {id:9,product_id:null,custom_name:' Manual Switch ',cr_amount:5},
      {id:10,product_id:null,custom_name:'manual switch',cr_amount:5},
      {id:11,product_id:null,custom_name:'Other switch',cr_amount:7},
      {id:12,product_id:null,custom_name:null,cr_amount:0},
      {id:13,product_id:null,custom_name:'',cr_amount:9},
      {id:14,product_id:4,custom_name:'Manual Switch',cr_amount:12}
    ]];
  }});
  const res=response();
  await api.getProcurementQueue({worker:{role:'owner'}},res,e=>{throw e;});
  const [manual,unnamed]=res.body[0].items;
  assert.deepEqual(Array.from(manual.crm_item_ids),[9,10]);
  assert.equal(manual.cr_amount,5);
  assert.deepEqual(Array.from(unnamed.crm_item_ids),[12]);
});

for (const manual of [true,false]) test('procurement note saves and clears within project scope: ' + (manual ? 'manual' : 'catalog'),async()=>{
  const writes=[];
  const api=controller({execute:async(sql,params)=>{
    if(sql.startsWith('SELECT id,project_stage')) return [[{id:1,project_stage:'procurement'}]];
    if(sql.startsWith('SELECT i.id')) { assert.deepEqual(Array.from(params),['1',manual?'9':'4']); return [[{id:9}]]; }
    assert.match(sql,/WHERE p.project_id=\?/);
    assert.match(sql,/i.id=\?/);
    assert.doesNotMatch(sql,/i.product_id=\?/);
    writes.push(Array.from(params)); return [{affectedRows:1}];
  }});
  for(const notes of ['Waiting for delivery','']) {
    const res=response();
    await api.updateProcurementItemNote({params:{projectId:'1',itemId:manual?'9':'4'},worker:{id:7},body:{notes}},res,e=>{throw e;});
    assert.equal(res.body.notes,notes);
  }
  assert.equal(writes.length,2);assert.equal(writes[1][0],'');
});
test('procurement note rejects invalid input before querying',async()=>{
  const api=controller({execute:async()=>assert.fail('Unexpected query')});
  for(const notes of [null,{},'x'.repeat(5001)]) {
    const res=response();await api.updateProcurementItemNote({body:{notes}},res,e=>{throw e;});assert.equal(res.code,400);
  }
});
test('procurement note cannot change another project item',async()=>{
  const api=controller({execute:async sql=>{
    if(sql.startsWith('SELECT id,project_stage')) return [[{id:1,project_stage:'procurement'}]];
    assert.match(sql,/^SELECT/);return [[]];
  }});
  const res=response();await api.updateProcurementItemNote({params:{projectId:1,itemId:99},body:{notes:'Test'}},res,e=>{throw e;});assert.equal(res.code,404);
});

test('procurement notes support older MySQL and preserve long notes without cross-item mixing',async()=>{
  const source=fs.readFileSync(path.join(__dirname,'../controllers/procurementController.js'),'utf8');
  const start=source.indexOf('async function getDemand('),end=source.indexOf('\nasync function ',start+1);
  const longNote='A'.repeat(4000);
  const getDemand=vm.runInNewContext(source.slice(start,end)+'\ngetDemand',{db:{execute:async sql=>{
    assert.doesNotMatch(sql,/JSON_ARRAYAGG|GROUP_CONCAT/);
    if(sql.startsWith('SELECT pci.product_id'))return [[{product_id:4},{product_id:null,manual_item_id:9}]];
    return [[{id:1,product_id:4,notes:longNote},{id:2,product_id:4,notes:longNote},{id:9,product_id:null,notes:'Manual note'},{id:10,product_id:null,notes:'Other note'}]];
  }}});
  const rows=await getDemand(1);assert.equal(rows[0].item_notes,longNote);assert.equal(rows[1].item_notes,'Manual note');
  assert.deepEqual(Array.from(rows[0].note_occurrences, row=>row.id),[1,2]);
  assert.deepEqual(Array.from(rows[1].note_occurrences, row=>row.id),[9]);
});

test('saving an occurrence note leaves the same product in another panel untouched',async()=>{
  const notes=new Map([[9,'First panel'],[10,'Second panel']]);
  const api=controller({execute:async(sql,params)=>{
    if(sql.startsWith('SELECT id,project_stage'))return [[{id:1,project_stage:'procurement'}]];
    if(sql.startsWith('SELECT i.id'))return [[{id:9}]];
    assert.match(sql,/WHERE p.project_id=\? AND i.id=\?/);
    assert.deepEqual(Array.from(params),['Changed',1,9]);notes.set(params[2],params[0]);return [{affectedRows:1}];
  }});
  await api.updateProcurementItemNote({params:{projectId:1,itemId:9},worker:{id:7},body:{notes:'Changed'}},response(),e=>{throw e;});
  assert.equal(notes.get(9),'Changed');assert.equal(notes.get(10),'Second panel');
});
