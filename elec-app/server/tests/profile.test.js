const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function load(db) {
  const source = fs.readFileSync(path.join(__dirname, '../controllers/authController.js'), 'utf8');
  return vm.runInNewContext(source.slice(source.indexOf('async function updateProfile('), source.indexOf('module.exports =')) + '\nupdateProfile', {
    db, me: (req, res) => res.json({ id: req.worker.id }),
  });
}
const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });

test('profile updates only authenticated account and ignores supplied roles and account IDs', async () => {
  const calls = [];
  const update = load({ execute: async (sql, params) => calls.push({ sql, params: Array.from(params) }) });
  const res = response();
  await update({ worker: { id: 7, role: 'owner' }, body: { id: 99, role: 'owner', name: ' New Name ', email: 'USER@EXAMPLE.COM ', phone: '' } }, res, error => { throw error; });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].sql, 'UPDATE workers SET name=?, email=?, phone=? WHERE id=?');
  assert.deepEqual(calls[0].params, ['New Name', 'user@example.com', null, 7]);
  assert.equal(res.body.id, 7);
});

test('invalid profile email is rejected before database write', async () => {
  const update = load({ execute: async () => assert.fail('unexpected write') });
  const res = response();
  await update({ worker: { id: 7, role: 'owner' }, body: { name: 'Name', email: 'invalid' } }, res, error => { throw error; });
  assert.equal(res.code, 400);
});

test('duplicate profile email returns a conflict', async () => {
  const update = load({ execute: async () => { throw Object.assign(new Error('duplicate'), { code: 'ER_DUP_ENTRY' }); } });
  const res = response();
  await update({ worker: { id: 7, role: 'owner' }, body: { name: 'Name', email: 'user@example.com' } }, res, error => { throw error; });
  assert.equal(res.code, 409);
});

for (const role of ['engineer','head_engineer','stock_manager','accounting','secretary','technician']) {
  test(`${role} cannot change email through profile API`, async () => {
    const update = load({ execute: async () => assert.fail('unexpected write') });
    const res = response();
    await update({ worker: { id: 7, role }, body: { name: 'Name', email: 'new@example.com' } }, res, error => { throw error; });
    assert.equal(res.code, 403);
  });
}

test('non-owner can update name and phone without changing email', async () => {
  const calls = [];
  const update = load({ execute: async (sql, params) => calls.push({ sql, params: Array.from(params) }) });
  const res = response();
  await update({ worker: { id: 7, role: 'engineer' }, body: { name: 'Name', phone: '123' } }, res, error => { throw error; });
  assert.equal(res.code, 200);
  assert.equal(calls[0].sql, 'UPDATE workers SET name=?, phone=? WHERE id=?');
  assert.deepEqual(calls[0].params, ['Name', '123', 7]);
});

test('head engineer cannot change another worker email', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../controllers/workerController.js'), 'utf8');
  const start = source.indexOf('async function updateWorker(');
  const end = source.indexOf('\nasync function ', start + 1);
  const update = vm.runInNewContext(source.slice(start, end) + '\nupdateWorker', {
    db: { execute: async () => assert.fail('unexpected write') },
  });
  const res = response();
  await update({ worker: { id:7, role:'head_engineer' }, params: {id:9}, body: {email:'new@example.com'} }, res, error => { throw error; });
  assert.equal(res.code,403);
});
