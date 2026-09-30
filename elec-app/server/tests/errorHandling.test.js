const test = require('node:test');
const assert = require('node:assert/strict');
const { describeError, errorHandler } = require('../middleware/errorHandler');
const { schemas } = require('../middleware/validate');

test('database failures give useful messages without revealing SQL or credentials', () => {
  for (const [code, status] of [['ER_DUP_ENTRY', 409], ['ER_NO_REFERENCED_ROW_2', 400], ['ER_ROW_IS_REFERENCED_2', 409], ['ER_DATA_TOO_LONG', 400], ['ECONNREFUSED', 503], ['ER_NO_SUCH_TABLE', 503], ['ER_LOCK_DEADLOCK', 409]]) {
    const result = describeError({ code, message: 'secret database password and SQL' });
    assert.equal(result.status, status);
    assert.ok(result.message.length > 30);
    assert.ok(!result.message.includes('secret'));
  }
});

test('unknown server errors identify the action and provide an error reference', () => {
  const original = console.error;
  console.error = () => {};
  try {
    let status, body;
    errorHandler(new Error('SQL should stay private'), { method: 'GET', path: '/projects' }, { status(s) { status = s; return this; }, json(value) { body = value; } });
    assert.equal(status, 500);
    assert.match(body.error, /load this information/);
    assert.match(body.reference, /^[a-f0-9-]{36}$/);
    assert.ok(!body.error.includes('SQL'));
  } finally { console.error = original; }
});

test('upload and malformed JSON errors are client errors with instructions', () => {
  assert.equal(describeError({ code: 'LIMIT_FILE_SIZE' }).status, 413);
  assert.equal(describeError({ type: 'entity.parse.failed' }).status, 400);
  assert.equal(describeError({ type: 'entity.too.large' }).status, 413);
});

test('project form accepts zero panels and preserves quotation settings', () => {
  const result = schemas.createProject.safeParse({ project_name: ' New project ', total_panels: 0, vat_pct: 11, project_discount_pct: 5, payment_terms: 'Terms', notes: 'Notes' });
  assert.equal(result.success, true);
  assert.equal(result.data.project_name, 'New project');
  assert.equal(result.data.total_panels, 0);
  assert.equal(result.data.vat_pct, 11);
  assert.equal(result.data.project_discount_pct, 5);
  assert.equal(result.data.payment_terms, 'Terms');
  assert.equal(result.data.notes, 'Notes');
  assert.equal(schemas.createProject.safeParse({ project_name: '   ' }).success, false);
  assert.equal(schemas.createProject.safeParse({ project_name: 'Project', total_panels: -1 }).success, false);
});

test('client errors explain HTTP statuses, timeouts, non-JSON responses and error references', async () => {
  const { getErrorMessage } = await import('../../client/src/api/errorMessage.js');
  for (const status of [400, 401, 403, 404, 409, 413, 423, 429, 500, 502, 503, 504]) {
    const message = getErrorMessage({ response: { status, data: '<html>Error</html>' }, message: `Request failed with status code ${status}` });
    assert.ok(message.length > 30);
    assert.ok(!message.includes('status code'));
    assert.ok(!message.includes('<html>'));
  }
  assert.match(getErrorMessage({ code: 'ECONNABORTED' }), /Check whether your change was saved/);
  assert.match(getErrorMessage({}), /Check your connection/);
  assert.match(getErrorMessage({ response: { status: 500, data: { error: 'Internal server error', reference: 'abc-123' } } }), /Error reference: abc-123/);
  assert.equal(getErrorMessage({ response: { status: 400, data: { error: 'Quantity must be positive' } } }), 'Quantity must be positive');
});

