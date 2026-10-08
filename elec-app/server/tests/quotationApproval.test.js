const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function controller(name, functionName, context) {
  const source = fs.readFileSync(path.join(__dirname, '../controllers', name), 'utf8');
  const start = source.indexOf(`async function ${functionName}(`);
  const end = source.indexOf('\nasync function ', start + 1);
  return vm.runInNewContext(source.slice(start, end === -1 ? undefined : end) + `\n${functionName}`, context);
}
function response() {
  return { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
}

for (const approval of ['pending', 'recheck', 'rejected', 'cancelled']) {
  test(`engineer cannot enter quotation with ${approval} approval`, async () => {
    const project = { id: 1, project_stage: 'design', ready_for_review: true, admin_approval: approval, quote_number: 'Q1' };
    const change = controller('workflowController.js', 'updateProjectStage', {
      db: { execute: async sql => { assert.match(sql, /^SELECT/); return [[project]]; } },
      assertProjectAccess: async () => true, STAGES: ['design','quotation','approval'],
      canManageWorkflow: () => false,
    });
    const res = response();
    await change({ params: { projectId: 1 }, body: { stage: 'quotation' }, worker: { role: 'engineer' } }, res, error => { throw error; });
    assert.equal(res.code, 400);
    assert.match(res.body.error, /approval|canceled/);
  });
}

for (const status of ['recheck', 'cancelled']) {
  test(`${status} requires nonempty notes before writing a decision`, async () => {
    const decide = controller('projectController.js', 'adminApproval', { console });
    const res = response();
    await decide({ body: { admin_approval: status, rejection_note: '  ' } }, res, error => { throw error; });
    assert.equal(res.code, 400);
    assert.match(res.body.error, /Notes are required/);
  });
  test(`${status} sends the decision and notes to the engineer`, async () => {
    const messages = [];
    const writes = [];
    const project = { id: 1, project_name: 'Panel A', engineer_id: 7, admin_approval: 'pending', ready_for_review: true };
    const decide = controller('projectController.js', 'adminApproval', {
      console, db: { execute: async (sql, params) => { if (sql.startsWith('UPDATE')) { writes.push(params); return [{}]; } return [[project]]; } },
      recalcReservedQty: async () => {}, logActivity: () => {}, persistReview: async (sql, params) => writes.push(params),
      createNotification: async (...args) => messages.push(args), notifyRoles: async () => {},
    });
    const res = response();
    await decide({ params: { id: 1 }, body: { admin_approval: status, rejection_note: 'Change panel quantity' }, worker: { id: 2, name: 'Owner' } }, res, error => { throw error; });
    assert.equal(res.code, 200);
    assert.equal(writes[0][0], status);
    assert.equal(messages[0][0], 7);
    assert.match(messages[0][3], /Change panel quantity/);
    assert.match(messages[0][3], new RegExp(status));
  });
}
