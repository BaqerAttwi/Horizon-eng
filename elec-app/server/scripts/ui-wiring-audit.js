// Static coverage only: a handler's presence does not prove its runtime behavior.
const fs = require('node:fs');
const path = require('node:path');
const parser = require('../../client/node_modules/@babel/parser');
const root = path.resolve(__dirname, '../../..');
const buttons = [];
let files = 0;
function visit(node, file, form = false) {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'JSXElement') {
    const opening = node.openingElement;
    const name = opening.name.name || opening.name.property?.name;
    const attrs = opening.attributes;
    const has = key => attrs.some(a => a.name?.name === key);
    if (name === 'form') form = has('onSubmit');
    if (name === 'button') {
      const type = attrs.find(a => a.name?.name === 'type')?.value?.value;
      const handled = has('onClick') || has('disabled') || (form && type !== 'button' && type !== 'reset');
      buttons.push({ file: path.relative(root, file), line: opening.loc.start.line, handled });
    }
  }
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach(child => visit(child, file, form));
    else if (value && typeof value === 'object') visit(value, file, form);
  }
}
function scan(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) scan(file);
    else if (/\.(js|jsx)$/.test(file)) {
      const ast = parser.parse(fs.readFileSync(file, 'utf8'), { sourceType: 'unambiguous', plugins: ['jsx'] });
      files++;
      if (file.includes(path.join('client', 'src'))) visit(ast, file);
    }
  }
}
scan(path.join(root, 'elec-app/client/src'));
scan(path.join(root, 'elec-app/server'));
const unhandled = buttons.filter(button => !button.handled);
const report = { timestamp: new Date().toISOString(), files, buttons: buttons.length, unhandled, inventory: buttons };
fs.mkdirSync(path.join(root, 'scratch'), { recursive: true });
fs.writeFileSync(path.join(root, 'scratch/ui-wiring-audit.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ files, buttons: buttons.length, unhandled }, null, 2));
if (unhandled.length) process.exitCode = 1;
