const fs = require('fs');
const path = require('path');
const parser = require('../../client/node_modules/@babel/parser');
const root = path.join(__dirname, '../../..');
const routes = [...fs.readFileSync(path.join(__dirname, '../routes/index.js'), 'utf8').matchAll(/router\.(get|post|patch|put|delete)\(['"]([^'"]+)['"]/g)].map(match => ({ method: match[1], route: match[2] }));
const checks = [];
function visit(node, file) {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'CallExpression' && node.callee?.type === 'MemberExpression' && node.callee.object?.name === 'api' && ['get', 'post', 'patch', 'put', 'delete'].includes(node.callee.property?.name)) {
    const argument = node.arguments[0];
    let url = argument?.type === 'StringLiteral' ? argument.value : argument?.type === 'TemplateLiteral' ? argument.quasis.map(q => q.value.cooked).join(':value') : null;
    if (url) {
      url = url.split('?')[0];
      const method = node.callee.property.name;
      const matched = routes.some(route => route.method === method && new RegExp('^' + route.route.replace(/:[^/]+/g, '[^/]+') + '$').test(url));
      checks.push({ file: path.relative(root, file), line: node.loc.start.line, method, url, matched });
    }
  }
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach(child => visit(child, file));
    else if (value && typeof value === 'object') visit(value, file);
  }
}
function scan(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) scan(file);
    else if (/\.(js|jsx)$/.test(file)) visit(parser.parse(fs.readFileSync(file, 'utf8'), { sourceType: 'module', plugins: ['jsx'] }), file);
  }
}
scan(path.join(__dirname, '../../client/src'));
const mismatches = checks.filter(check => !check.matched);
const result = { routes: routes.length, total: checks.length, mismatches, checks };
fs.writeFileSync(path.join(root, 'scratch/api-route-contracts.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify({ routes: routes.length, calls: checks.length, mismatches }, null, 2));
if (mismatches.length) process.exitCode = 1;
