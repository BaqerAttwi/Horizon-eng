const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { redactFinancials, financialPrivacy } = require('../utils/financialPrivacy');

function load(file, dependencies, globals = {}) {
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    module, exports: module.exports, console, process: { env: { RESEND_API_KEY: 'test' } },
    require: name => { if (!(name in dependencies)) throw Error('Unexpected dependency ' + name); return dependencies[name]; },
    ...globals,
  });
  return module.exports;
}
function response() { return { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; } }; }

test('financial privacy redacts nested mutation results and financial activity values', () => {
  const input = { total_price: 450, panels: [{ quantity: 3, divisions: [{ items: [{ cost: 50, qty: 2 }] }] }],
    logs: [{ field_name: 'unit_price', old_value: '20', new_value: '30' }] };
  const safe = redactFinancials(input);
  assert.equal(safe.total_price, null);
  assert.equal(safe.panels[0].divisions[0].items[0].cost, null);
  assert.equal(safe.panels[0].quantity, 3);
  assert.equal(safe.logs[0].new_value, null);
  assert.equal(input.total_price, 450);
  const res = response();
  financialPrivacy({ worker: { role: 'owner' } }, res, () => {});
  res.json(input); assert.equal(res.body.total_price, 450);
});

function reviewModule(project) {
  const writes = [];
  const connection = { beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release() {},
    execute: async (...args) => { writes.push(args); return [{}]; } };
  const db = { execute: async () => [[project]], getConnection: async () => connection };
  const module = load('middleware/projectReview.js', {
    '../db/connection': db, 'mysql2/promise': { createPool: () => ({ end: async () => {} }) },
    '../controllers/crmController': { checkProjectAccess: async () => true },
    '../controllers/notificationController': { createNotification: async () => {} },
  });
  return { ...module, writes };
}
test('engineer submitted work and all canceled work reject edits before any writes', async () => {
  for (const [project, role] of [
    [{ ready_for_review: true, admin_approval: 'pending' }, 'engineer'],
    [{ status: 'cancelled', admin_approval: 'cancelled' }, 'owner'],
  ]) {
    const module = reviewModule(project), res = response();
    await module.guardProjectEdit({ reviewProjectId: 1, worker: { role }, body: {} }, res, () => assert.fail('edit passed lock'));
    assert.equal(res.code, 423); assert.equal(module.writes.length, 0);
  }
});
test('recheck permits engineer edits, and approved design edits invalidate approval with history', async () => {
  for (const approval of ['recheck','approved']) {
    const module = reviewModule({ admin_approval: approval, project_stage: 'quotation' });
    let passed = false;
    await module.guardProjectEdit({ reviewProjectId: 1, worker: { role: 'engineer', id: 7 }, method: 'POST', path: '/projects/1/panels', body: {} }, response(), error => { if (error) throw error; passed = true; });
    assert.equal(passed, true);
    assert.equal(module.writes.length, approval === 'approved' ? 2 : 0);
    if (approval === 'approved') { assert.match(module.writes[0][0], /admin_approval='pending'/); assert.match(module.writes[1][0], /project_review_history/); }
  }
});
test('recording client approval preserves internal approval', async () => {
  const module = reviewModule({ admin_approval: 'approved', ready_for_review: true });
  await module.guardProjectEdit({ reviewProjectId: 1, worker: { role: 'owner' }, method: 'PATCH', path: '/projects/1', body: { client_approval: 'approved' } }, response(), error => { if (error) throw error; });
  assert.equal(module.writes.length, 0);
});

function mailModule(outcome, attempts = 0) {
  const writes = [], sends = [];
  const connection = {
    release() {}, execute: async (sql, params) => {
      if (sql.includes('GET_LOCK')) return [[{ acquired: 1 }]];
      if (sql.startsWith('SELECT *')) return [[{ id: 19, attempts, recipient: 'engineer@example.invalid', subject: 'Review', text_body: 'Recheck notes', html_body: '<p>Recheck notes</p>' }]];
      writes.push({ sql, params }); return [{}];
    },
  };
  const module = load('utils/emailService.js', {
    resend: { Resend: class { constructor() { this.emails = { send: async (...args) => { sends.push(args); if (outcome instanceof Error) throw outcome; return outcome; } }; } } },
    '../db/connection': { getConnection: async () => connection, execute: async () => [{ insertId: 19 }] },
  });
  return { ...module, writes, sends };
}
test('provider error responses are retried and never marked accepted', async () => {
  const module = mailModule({ error: { message: 'Rate limit' }, data: null });
  await module.processEmailQueue();
  const retry = module.writes.find(row => row.sql.includes('next_attempt_at=DATE_ADD'));
  assert.equal(retry.params[0], 'queued'); assert.equal(retry.params[2], 60);
  assert.equal(module.writes.some(row => row.sql.includes("status='accepted'")), false);
  assert.equal(module.sends[0][1].idempotencyKey, 'crm-email-19');
});
test('timeouts exhaust retries; successful messages keep the provider id', async () => {
  const failed = mailModule(new Error('Timeout'), 5);
  await failed.processEmailQueue();
  assert.equal(failed.writes.find(row => row.sql.includes('next_attempt_at=DATE_ADD')).params[0], 'failed');
  const success = mailModule({ data: { id: 'provider-19' }, error: null });
  await success.processEmailQueue();
  assert.equal(success.writes.find(row => row.sql.includes("status='accepted'")).params[0], 'provider-19');
});
