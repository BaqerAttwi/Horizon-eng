const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function controller(db) {
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../controllers/procurementController.js'), 'utf8'), {
    module, require: name => name === '../db/connection' ? db : name.includes('notificationController') ? {} : { logActivity() {} },
  });
  return module.exports;
}
const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });
const request = quantity => ({ params: { projectId: '1', itemId: '9' }, worker: { id: 7 }, body: { quantity } });

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
