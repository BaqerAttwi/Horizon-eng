// Run only against the disposable API audit server, never the live application.
const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');
const { url } = JSON.parse(fs.readFileSync(path.join(__dirname, '../../../scratch/audit-ui-port.json'), 'utf8'));
const base = new URL(url);
if (base.hostname !== '127.0.0.1') throw Error('Security runtime checks require the local disposable audit server');
const root = url + '/api';
let total = 0;
async function request(method, route, body, expected, token, extra = {}) {
  const res = await fetch(root + route, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...extra }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(15000) });
  const data = await res.json();
  assert.equal(res.status, expected, `${method} ${route}: ${JSON.stringify(data)}`);
  total++;
  return { data, cookie: res.headers.get('set-cookie')?.split(';')[0] };
}
async function main() {
  await request('POST', '/auth/login', { email: 'ui@audit.example.invalid', password: 'AuditOnly-2026!' }, 403, null, { Origin: 'https://foreign.example' });
  const login = await request('POST', '/auth/login', { email: 'ui@audit.example.invalid', password: 'AuditOnly-2026!' }, 200);
  assert.ok(login.cookie?.startsWith('token='));
  const ownerToken = login.data.token;
  await request('GET', '/auth/me', undefined, 200, null, { Cookie: login.cookie });
  const suffix = Date.now();
  const accounts = {};
  for (const role of ['head_engineer', 'engineer']) {
    const email = `security-${role}-${suffix}@audit.example.invalid`;
    const created = await request('POST', '/workers', { name: `Security ${role}`, role, email, password: 'AuditOnly-2026!' }, 201, ownerToken);
    const signed = await request('POST', '/auth/login', { email, password: 'AuditOnly-2026!' }, 200);
    accounts[role] = { ...created.data, token: signed.data.token };
  }
  const head = accounts.head_engineer.token;
  await request('POST', '/workers', { name: 'Escalation', email: `escalation-${suffix}@audit.example.invalid`, role: 'owner', password: 'AuditOnly-2026!' }, 403, head);
  await request('POST', '/auth/register', { name: 'Escalation', email: `register-${suffix}@audit.example.invalid`, role: 'owner', password: 'AuditOnly-2026!' }, 403, head);
  await request('PATCH', '/workers/' + login.data.worker.id, { name: 'Unauthorized rename' }, 403, head);
  await request('PATCH', '/workers/' + accounts.engineer.id, { role: 'owner' }, 403, head);
  await request('POST', '/auth/set-password', { worker_id: login.data.worker.id, new_password: 'ShouldNotApply!' }, 403, head);
  const engineer = accounts.engineer.token;
  const group = (await request('POST', '/item-groups', { name: 'Private security group', is_public: false }, 201, ownerToken)).data;
  await request('GET', '/item-groups/' + group.id + '/items', undefined, 404, engineer);
  const a = (await request('POST', '/projects', { project_name: 'Security project A' }, 201, engineer)).data;
  const b = (await request('POST', '/projects', { project_name: 'Security project B' }, 201, engineer)).data;
  const panelA = (await request('POST', `/projects/${a.id}/panels`, { panel_number: 1, markupP: 15, markupM: 10, manpower_pct: 5 }, 201, engineer)).data;
  const panelB = (await request('POST', `/projects/${b.id}/panels`, { panel_number: 1, markupP: 15 }, 201, engineer)).data;
  const types = (await request('GET', '/division-types', undefined, 200, engineer)).data;
  const division_type = types.find(row => row.is_active)?.name;
  assert.ok(division_type);
  const divisionB = (await request('POST', `/projects/${b.id}/panels/${panelB.id}/divisions`, { division_type }, 201, engineer)).data;
  const link = (await request('POST', `/projects/${b.id}/attachments`, { link_url: 'https://example.com/security-test', name: 'Audit link' }, 201, engineer)).data;
  await request('PATCH', `/projects/${a.id}/panels/${panelA.id}`, { quantity: 2 }, 200, engineer);
  const panels = (await request('GET', `/projects/${a.id}/panels`, undefined, 200, ownerToken)).data;
  assert.equal(Number(panels[0].markupP), 15);
  assert.equal(Number(panels[0].markupM), 10);
  await request('PATCH', `/projects/${b.id}/ready-for-review`, {}, 200, engineer);
  await request('POST', `/projects/${a.id}/panels/${panelB.id}/divisions`, { division_type }, 404, engineer);
  await request('PATCH', `/projects/${a.id}/panels/${panelA.id}/divisions/${divisionB.id}`, { division_type }, 404, engineer);
  await request('DELETE', `/projects/${a.id}/attachments/${link.id}`, {}, 404, engineer);
  await request('GET', `/analytics/projects/${b.id}/team`, undefined, 200, engineer);
  await request('GET', '/auth/me', undefined, 401, engineer.replace(/.$/, 'x'));
  await request('POST', `/projects/${b.id}/items/bulk-update`, { item_ids: [1], changes: { discount_pct: 101 } }, 400, ownerToken);
  assert.equal((await request('GET', '/projects/' + b.id, undefined, 200, ownerToken)).data.ready_for_review, 1);
  await request('POST', '/auth/set-password', { worker_id: accounts.engineer.id, new_password: 'NewAuditOnly-2026!' }, 200, ownerToken);
  await request('GET', '/auth/me', undefined, 401, engineer);
  await request('POST', '/auth/login', { email: accounts.engineer.email, password: 'NewAuditOnly-2026!' }, 200);
  console.log(`Security runtime checks: ${total} requests passed. Cookie login, owner boundaries, nested project locks, private groups, markup preservation, numeric validation and password revocation verified.`);
  fs.writeFileSync(path.join(__dirname, '../../../scratch/security-runtime-check.json'), JSON.stringify({ passed: true, requests: total, timestamp: new Date().toISOString() }, null, 2));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
