const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const security = require('../utils/accountSecurity');

function load(file, dependencies, env = {}) {
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    module, exports: module.exports, Buffer, URL, console: { log() {}, warn() {}, error() {} }, process: { env },
    require: name => { if (!(name in dependencies)) throw Error('Unexpected dependency ' + name); return dependencies[name]; },
  });
  return module.exports;
}
const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });

test('numeric validation rejects nested invalid values before writes', () => {
  const { numericValidation } = require('../middleware/numericValidation');
  for (const item of [{ qty: 1.5 }, { amount: 'Infinity' }, { discount_pct: 101 }, { markupP_pct: -1 }, { quantity: true }]) {
    const res = response();
    let continued = false;
    numericValidation({ body: { items: [item] } }, res, () => { continued = true; });
    assert.equal(res.code, 400);
    assert.equal(continued, false);
  }
});

test('old notification messages cannot expose prices after financial redaction', () => {
  const { redactFinancials } = require('../utils/financialPrivacy');
  const result = redactFinancials({ title: 'Price Change Approved', message: 'Price changed from $100 to $200' });
  assert.equal(result.message, 'Item changes were approved.');
});

test('manual reservations lock stock and roll back when history fails', async () => {
  const events = [];
  const connection = {
    beginTransaction: async () => events.push('begin'),
    execute: async sql => {
      events.push(sql);
      if (sql.startsWith('SELECT')) return [[{ id: 1, stock_qty: 10, reserved_qty: 2 }]];
      if (sql.startsWith('INSERT')) throw Error('History unavailable');
      return [{}];
    },
    commit: async () => events.push('commit'), rollback: async () => events.push('rollback'), release: () => events.push('release'),
  };
  const controller = load('controllers/reservationController.js', { '../db/connection': { getConnection: async () => connection } });
  let failure;
  await controller.updateReservedQty({ params: { productId: 1 }, body: { action: 'reserve', qty: 3 }, worker: { id: 1 } }, response(), err => { failure = err; });
  assert.match(failure.message, /History unavailable/);
  assert.ok(events.some(event => event.includes('FOR UPDATE')));
  assert.equal(events.includes('commit'), false);
  assert.deepEqual(events.slice(-2), ['rollback', 'release']);
});

test('head engineer cannot create, promote, modify or reset owner accounts', async () => {
  const writes = [];
  const db = { execute: async (sql, params) => { if (!sql.startsWith('SELECT')) writes.push(sql); return [[{ role: 'owner' }]]; } };
  const workers = load('controllers/workerController.js', { bcryptjs: { hash: async () => 'hash' }, '../db/connection': db, '../utils/accountSecurity': security });
  for (const [action, body] of [['createWorker', { name: 'Attacker', role: 'owner', password: 'secret123' }], ['updateWorker', { name: 'Changed owner' }], ['updateWorker', { role: 'owner' }]]) {
    const res = response();
    await workers[action]({ worker: { role: 'head_engineer' }, params: { id: 1 }, body }, res, error => { throw error; });
    assert.equal(res.code, 403);
  }
  const auth = load('controllers/authController.js', { bcryptjs: {}, jsonwebtoken: {}, '../db/connection': db, '../utils/rolePolicy': require('../utils/rolePolicy'), '../utils/accountSecurity': security }, { JWT_SECRET: 'test-secret' });
  const res = response();
  await auth.setPassword({ worker: { role: 'head_engineer' }, body: { worker_id: 1, new_password: 'secret123' } }, res, error => { throw error; });
  assert.equal(res.code, 403);
  assert.equal(writes.length, 0);
  assert.equal(security.canManageAccount('owner', 'owner'), true);
  assert.equal(security.canManageAccount('head_engineer', 'engineer'), true);
});

test('bcrypt passwords reject malformed values and truncation beyond 72 bytes', () => {
  assert.equal(security.validPassword('secret123'), true);
  for (const value of [123456, {}, null, 'tiny', 'x'.repeat(73), 'é'.repeat(37)]) assert.equal(security.validPassword(value), false);
});

test('password changes reject old and legacy tokens; current roles override signed roles', async () => {
  let storedHash = 'original-hash';
  let decoded = { id: 1, role: 'owner', credential: security.passwordFingerprint(storedHash) };
  const auth = load('middleware/auth.js', {
    jsonwebtoken: { verify: (token, secret, options) => { assert.equal(options.algorithms[0], 'HS256'); return decoded; } },
    '../db/connection': { execute: async () => [[{ id: 1, name: 'Engineer', role: 'engineer', password_hash: storedHash }]] },
    '../controllers/authController': { JWT_SECRET: 'test-secret' }, '../utils/rolePolicy': require('../utils/rolePolicy'), '../utils/accountSecurity': security,
  });
  const req = { headers: { authorization: 'Bearer test' } };
  let passed = false;
  await auth.requireAuth(req, response(), () => { passed = true; });
  assert.equal(passed, true); assert.equal(req.worker.role, 'engineer');
  storedHash = 'replacement-hash';
  const res = response();
  await auth.requireAuth(req, res, () => assert.fail('old token accepted'));
  assert.equal(res.code, 401);
  decoded = { id: 1 };
  const legacy = response();
  await auth.requireAuth(req, legacy, () => assert.fail('legacy token accepted'));
  assert.equal(legacy.code, 401);
});

test('nested resource mismatch is rejected before project locks or writes', async () => {
  const scope = load('middleware/resourceScope.js', { '../db/connection': { execute: async sql => [[sql.includes('panel_divisions') ? { project_id: 2, panel_id: 20, division_id: 200 } : { project_id: 1 }]] } });
  for (const params of [{ projectId: 1, divisionId: 200 }, { projectId: 2, panelId: 20, divisionId: 200 }, { projectId: 1, attachmentId: 50 }]) {
    const res = response();
    const valid = await scope.checkResourceScope({ params, body: {}, path: '' }, res);
    if (params.divisionId) { assert.equal(valid, false); assert.equal(res.code, 404); }
    else assert.equal(valid, true);
  }
  const actual = load('middleware/resourceScope.js', { '../db/connection': { execute: async () => [[{ project_id: 2 }]] } });
  const res = response();
  assert.equal(await actual.checkResourceScope({ params: {}, body: { project_id: 1, item_id: 4 } }, res), false);
  assert.equal(res.code, 404);
});

test('CSV exports neutralize formulas with whitespace prefixes and preserve numeric negatives', () => {
  const csv = load('controllers/exportController.js', { '../db/connection': {}, '../utils/rolePolicy': require('../utils/rolePolicy') });
  for (const value of ['=1+1', '+SUM(A1)', '-1+1', '@SUM(A1)', '\t=1+1', '\r=1+1', '  =1+1']) {
    assert.match(csv.escapeCsv(value).replace(/^"/, ''), /^'/);
  }
  assert.equal(csv.escapeCsv(-5), '"-5"');
  assert.equal(csv.escapeCsv('plain text'), 'plain text');
  assert.equal(csv.escapeCsv('one\rtwo'), '"one\rtwo"');
});

test('private group items cannot be enumerated by another user', async () => {
  let queries = 0;
  const groups = load('controllers/itemGroupController.js', { '../db/connection': { execute: async () => { queries++; return [[]]; } } });
  const res = response();
  await groups.getGroupItems({ params: { id: 4 }, worker: { id: 7, role: 'engineer' } }, res, error => { throw error; });
  assert.equal(res.code, 404); assert.equal(queries, 1);
});

test('browser mutation requests reject foreign origins while allowing the app and API clients', () => {
  const { requestOrigin } = load('middleware/requestOrigin.js', {}, { CLIENT_URL: 'https://crm.example.test' });
  for (const origin of ['https://attacker.example', 'null']) {
    const res = response();
    requestOrigin({ method: 'POST', protocol: 'https', headers: { host: 'crm.example.test', origin } }, res, () => assert.fail('foreign origin accepted'));
    assert.equal(res.code, 403);
  }
  for (const origin of ['https://crm.example.test', undefined]) {
    let passed = false;
    requestOrigin({ method: 'POST', protocol: 'https', headers: { host: 'crm.example.test', origin } }, response(), () => { passed = true; });
    assert.equal(passed, true);
  }
});

test('unknown roles never receive financial visibility', () => {
  for (const role of [undefined, null, 'admin', 'unknown']) assert.equal(require('../utils/rolePolicy').canViewPrices(role), false);
});
