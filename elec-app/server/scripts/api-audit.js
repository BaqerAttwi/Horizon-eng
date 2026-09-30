// Exercises routes only against a disposable local database copy.
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });
const mysql = require('mysql2/promise');
const source = process.env.DB_NAME || 'elec_app';
const target = 'elec_app_audit_' + Date.now();
const config = { host: process.env.DB_HOST || 'localhost', port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER || 'root', password: process.env.DB_PASSWORD || '', database: source };
const quote = name => '`' + name.replace(/`/g, '``') + '`';
let connection, server, pool;
const results = [];
async function main() {
  if (!['localhost', '127.0.0.1', '::1'].includes(config.host)) throw Error('The audit is restricted to a local database');
  connection = await mysql.createConnection(config);
  await connection.query('CREATE DATABASE ' + quote(target));
  await connection.query('SET FOREIGN_KEY_CHECKS=0');
  const [tables] = await connection.query('SHOW FULL TABLES WHERE Table_type="BASE TABLE"');
  for (const row of tables) {
    const table = Object.values(row)[0];
    const [[definition]] = await connection.query('SHOW CREATE TABLE ' + quote(source) + '.' + quote(table));
    const ddl = definition['Create Table'].replace('CREATE TABLE ' + quote(table), 'CREATE TABLE ' + quote(target) + '.' + quote(table));
    await connection.query(ddl);
    await connection.query('INSERT INTO ' + quote(target) + '.' + quote(table) + ' SELECT * FROM ' + quote(source) + '.' + quote(table));
  }
  await connection.query('SET FOREIGN_KEY_CHECKS=1');
  // Optional migration validation is confined to the disposable database.
  if (process.argv.includes('--migrate-copy')) {
    const migration = await mysql.createConnection({ ...config, database: target, multipleStatements: true });
    try { await migration.query(fs.readFileSync(path.join(__dirname, '../db/schema.sql'), 'utf8')); }
    finally { await migration.end(); }
  }
  process.env.DB_NAME = target;
  const emailPath = require.resolve('../utils/emailService');
  require.cache[emailPath] = { id: emailPath, filename: emailPath, loaded: true, exports: { initMailer() {}, async sendEmail() {}, async notifyByEmail() {} } };
  const express = require('express');
  const jwt = require('jsonwebtoken');
  const routes = require('../routes');
  pool = require('../db/connection');
  const app = express();
  app.use(express.json());
  app.use('/api', routes);
  app.use(express.static(path.join(__dirname, '../../client/dist')));
  app.get('*', (req, res) => res.sendFile(path.join(__dirname, '../../client/dist/index.html')));
  app.use(require('../middleware/errorHandler').errorHandler);
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const root = 'http://127.0.0.1:' + server.address().port + '/api';
  const [[owner]] = await pool.query("SELECT id FROM workers WHERE role='owner' LIMIT 1");
  if (!owner) throw Error('Audit requires an existing local owner account');
  const token = jwt.sign({ id: owner.id }, require('../controllers/authController').JWT_SECRET, { expiresIn: '15m' });
  async function request(method, url, body, label = url, authToken = token) {
    const response = await fetch(root + url, { method, headers: { ...(authToken ? { Authorization: 'Bearer ' + authToken } : {}), 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), redirect: 'manual', signal: AbortSignal.timeout(20000) });
    const raw = await response.text();
    let data; try { data = JSON.parse(raw); } catch { data = {}; }
    results.push({ method, route: label, status: response.status, ...(response.status >= 400 ? { error: data.error || 'Non-JSON error', code: data.code } : {}) });
    return data;
  }
  const [[project]] = await pool.query('SELECT id FROM projects WHERE deleted_at IS NULL ORDER BY id DESC LIMIT 1');
  const [[panel]] = await pool.query('SELECT id FROM project_crm_panels WHERE project_id=? LIMIT 1', [project.id]);
  const [[division]] = panel ? await pool.query('SELECT id FROM panel_divisions WHERE panel_id=? LIMIT 1', [panel.id]) : [[]];
  const [[product]] = await pool.query('SELECT id FROM products LIMIT 1');
  const [[client]] = await pool.query('SELECT id FROM clients LIMIT 1');
  const [[group]] = await pool.query('SELECT id FROM item_groups LIMIT 1');
  const ids = { projectId: project.id, panelId: panel?.id || 999999999, divisionId: division?.id || 999999999, productId: product?.id || 999999999, workerId: owner.id, engineerId: owner.id, clientId: client?.id || 999999999, groupId: group?.id || 999999999 };
  const resolveRoute = route => {
    const first = route.split('/')[1];
    return route.replace(/:(\w+)/g, (_, key) => ids[key] || (key === 'id' ? ({ products: product?.id, projects: project.id, clients: client?.id, workers: owner.id, 'item-groups': group?.id }[first] || 999999999) : 999999999));
  };
  for (const layer of routes.stack.filter(l => l.route)) {
    const route = layer.route;
    if (!route.methods.get || route.path.startsWith('/onedrive/') && route.path !== '/onedrive/status' || route.path.includes('/download')) continue;
    const first = route.path.split('/')[1];
    const url = route.path.replace(/:(\w+)/g, (_, key) => ids[key] || (key === 'id' ? ({ products: product?.id, projects: project.id, clients: client?.id, workers: owner.id, 'item-groups': group?.id }[first] || 999999999) : 999999999));
    await request('GET', url, undefined, route.path);
  }
  for (const role of ['head_engineer', 'engineer', 'accounting', 'stock_manager', 'secretary', 'technician']) {
    const [inserted] = await pool.execute('INSERT INTO workers(name,role,email,password_hash) SELECT ?,?,?,password_hash FROM workers WHERE id=?', ['Audit ' + role, role, role + '@audit.example.invalid', owner.id]);
    const roleToken = jwt.sign({ id: inserted.insertId }, require('../controllers/authController').JWT_SECRET, { expiresIn: '15m' });
    for (const layer of routes.stack.filter(l => l.route?.methods.get)) {
      const route = layer.route.path;
      if (route.startsWith('/onedrive/') && route !== '/onedrive/status' || route.includes('/download')) continue;
      await request('GET', resolveRoute(route), undefined, route + ' [role: ' + role + ']', roleToken);
    }
  }
  for (const layer of routes.stack.filter(l => l.route)) {
    const route = layer.route;
    if (route.path === '/health' || route.path === '/auth/login') continue;
    const method = Object.keys(route.methods)[0].toUpperCase();
    await request(method, resolveRoute(route.path), method === 'GET' ? undefined : {}, route.path + ' [unauthenticated]', null);
    if (results.at(-1).status !== 401) throw Error('Unauthenticated access was not denied: ' + route.path);
  }
  // Missing records should produce a readable client error, never a server crash.
  for (const layer of routes.stack.filter(l => l.route)) {
    const route = layer.route;
    const method = Object.keys(route.methods)[0].toUpperCase();
    if (method === 'GET' || /auth|onedrive|attachments/.test(route.path)) continue;
    await request(method, route.path.replace(/:\w+/g, '999999999'), {}, route.path + ' [invalid request]');
  }
  // Core button workflows: create, edit, panel/division/item, replacement, deletion.
  const created = await request('POST', '/projects', { project_name: 'API Audit Project', total_panels: 0, vat_pct: 11, project_discount_pct: 5, margin_warning_pct: 0, client_pdf_note: 'Audit PDF note', payment_terms: 'Audit terms' });
  if (created.id && (Number(created.vat_pct) !== 11 || Number(created.project_discount_pct) !== 5 || Number(created.margin_warning_pct) !== 0 || created.client_pdf_note !== 'Audit PDF note' || created.payment_terms !== 'Audit terms')) throw Error('Project creation lost supplied settings');
  if (created.id) {
    await request('PATCH', '/projects/' + created.id, { notes: 'Audit edit', quote_number: '' });
    await request('PATCH', '/projects/' + created.id + '/admin-approval', { admin_approval: 'approved' });
    await request('PATCH', '/projects/' + created.id + '/ready-for-review', {});
    await request('PATCH', '/projects/' + created.id + '/stage', { stage: 'quotation' });
    await request('POST', '/projects/' + created.id + '/quotation-revisions', { notes: 'Audit revision' });
    const revisionList = await request('GET', '/projects/' + created.id + '/quotation-revisions');
    if (revisionList[0]?.id) {
      await request('GET', '/projects/' + created.id + '/quotation-revisions/' + revisionList[0].id + '/snapshot');
      await request('POST', '/projects/' + created.id + '/quotation-revisions/' + revisionList[0].id + '/restore', {});
    }
    const payment = await request('POST', '/projects/' + created.id + '/payments', { amount: 5, payment_date: '2026-09-17', method: 'cash' });
    if (payment.id) await request('DELETE', '/projects/' + created.id + '/payments/' + payment.id);
    const manual = await request('POST', '/projects/' + created.id + '/manual-products', { name: 'Audit manual item', price_usd: 10 });
    if (manual.id) await request('DELETE', '/projects/' + created.id + '/manual-products/' + manual.id);
    const p = await request('POST', '/projects/' + created.id + '/panels', { panel_number: 1, panel_name: 'Audit panel' });
    if (p.id) {
      const prefix = '/projects/' + created.id + '/panels/' + p.id;
      await request('PATCH', prefix, { panel_name: 'Edited panel' });
      const d = await request('POST', prefix + '/divisions', { division_type: 'INCOMING' });
      if (d.id && product) {
        const ip = prefix + '/divisions/' + d.id + '/items';
        const i = await request('POST', ip, { product_id: product.id, qty: 2, base_price_usd: 10, discount_pct: 0, markupP_pct: 10, manpower_pct: 5, markupM_pct: 0 });
        if (i.id) {
          const updatedItem = await request('PATCH', ip + '/' + i.id, { qty: 3, product_id: product.id, is_manual: 0 });
          const [[catalogProduct]] = await pool.execute('SELECT reference FROM products WHERE id=?', [product.id]);
          if (updatedItem.reference !== catalogProduct.reference) throw Error('Updated item response lost its catalog reference');
          await request('POST', '/projects/' + created.id + '/items/bulk-update', { item_ids: [i.id], changes: { discount_pct: 5 } });
          await request('POST', '/projects/' + created.id + '/items/bulk-replace', { item_ids: [i.id], product_id: product.id, base_price_usd: 20, base_price_euro: 0 });
          await request('PATCH', '/projects/' + created.id + '/execution/items/' + i.id, { is_completed: 1 });
          await request('PATCH', '/projects/' + created.id + '/execution/panels/' + p.id, { is_completed: 1 });
          await request('DELETE', ip + '/' + i.id);
        }
        await request('DELETE', prefix + '/divisions/' + d.id);
      }
      await request('DELETE', prefix);
    }
    await request('DELETE', '/projects/' + created.id);
  }
  const c = await request('POST', '/clients', { name: 'Audit client', type: 'company', credit_limit: 100, phone: '123' });
  if (c.id) {
    const edited = await request('PATCH', '/clients/' + c.id, { name: 'Edited audit client', type: 'company', credit_limit: 0, phone: '' });
    if (Number(edited.credit_limit) !== 0 || edited.phone !== null) throw Error('Client edit failed to clear values');
    await request('DELETE', '/clients/' + c.id);
  }
  const g = await request('POST', '/item-groups', { name: 'Audit group', is_public: true });
  if (g.id) {
    await request('PATCH', '/item-groups/' + g.id, { name: 'Edited audit group' });
    const gi = await request('POST', '/item-groups/' + g.id + '/items', { product_id: product.id, qty: 2 });
    if (gi.id) await request('DELETE', '/item-groups/' + g.id + '/items/' + gi.id);
    await request('DELETE', '/item-groups/' + g.id);
  }
  const discount = await request('POST', '/discounts', { product_id: product.id, discount_pct: 5 });
  if (discount.id) { await request('PATCH', '/discounts/' + discount.id, { discount_pct: 10 }); await request('DELETE', '/discounts/' + discount.id); }
  const imported = await request('POST', '/projects/import-pdf/create', {
    project_name: 'Audit PDF import', matched_items: [], unmatched_items: [],
    panels: [{ panel_number: 1, quantity: 2, divisions: [{ division_type: 'INCOMING', items: [{ name: 'Audit imported product', product_id: product.id, qty: 2, base_price_usd: 10 }] }] }],
  });
  if (imported.project_id) await request('DELETE', '/projects/' + imported.project_id);
  // In-memory Excel fixtures exercise uploads without writing user files.
  const XLSX = require('xlsx');
  for (const sheetName of ['PL', 'WrongSheet']) {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['Reference', 'Description', 'EUR', 'USD', 'Brand', 'Smart code', 'Cost'], ['AUDIT-ITEM-2026', 'Audit product', 10, 12, 'Audit brand', 'AUDIT-SMART', 5]]), sheetName);
    const form = new FormData();
    form.append('file', new Blob([XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'audit.xlsx');
    const response = await fetch(root + '/upload', { method: 'POST', headers: { Authorization: 'Bearer ' + token }, body: form });
    const data = await response.json();
    results.push({ method: 'POST', route: '/upload [' + sheetName + ' fixture]', status: response.status, ...(response.status >= 400 ? { error: data.error } : {}) });
    if (response.status !== (sheetName === 'PL' ? 200 : 400)) throw Error('Unexpected Excel upload result');
  }
  const report = { timestamp: new Date().toISOString(), total: results.length, serverFailures: results.filter(r => r.status >= 500), results };
  fs.writeFileSync(path.join(__dirname, '../../../scratch/api-audit-results.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ total: report.total, serverFailures: report.serverFailures }, null, 2));
  if (report.serverFailures.length) process.exitCode = 1;
  if (process.argv.includes('--serve')) {
    const passwordHash = await require('bcryptjs').hash('AuditOnly-2026!', 10);
    await pool.execute('INSERT INTO workers(name,role,email,password_hash) VALUES(?,?,?,?)', ['UI Audit', 'owner', 'ui@audit.example.invalid', passwordHash]);
    fs.writeFileSync(path.join(__dirname, '../../../scratch/audit-ui-port.json'), JSON.stringify({ url: 'http://127.0.0.1:' + server.address().port }));
    console.log('UI audit ready at http://127.0.0.1:' + server.address().port + ' (PID ' + process.pid + ')');
    await new Promise(resolve => { process.once('SIGINT', resolve); process.once('SIGTERM', resolve); process.stdin.once('data', resolve); });
  }
}
main().catch(error => { console.error('API audit failed:', error.message || error.code || error.name); process.exitCode = 1; }).finally(async () => {
  fs.writeFileSync(path.join(__dirname, '../../../scratch/api-audit-results.json'), JSON.stringify({ timestamp: new Date().toISOString(), migratedCopy: process.argv.includes('--migrate-copy'), completed: !process.exitCode, total: results.length, serverFailures: results.filter(r => r.status >= 500), results }, null, 2));
  if (server) await new Promise(resolve => server.close(resolve));
  if (pool) await pool.end();
  if (connection) {
    if (/^elec_app_audit_\d+$/.test(target) && target !== source) await connection.query('DROP DATABASE IF EXISTS ' + quote(target));
    await connection.end();
  }
});
