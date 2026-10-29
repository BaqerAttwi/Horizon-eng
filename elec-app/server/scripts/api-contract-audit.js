// Static API contract coverage, including conditional/concatenated URLs and downloads.
// This detects wiring mistakes; runtime behavior is checked separately.
const fs = require('fs');
const path = require('path');
const parser = require('../../client/node_modules/@babel/parser');
const root = path.join(__dirname, '../../..');
const routes = [...fs.readFileSync(path.join(__dirname, '../routes/index.js'), 'utf8').matchAll(/router\.(get|post|patch|put|delete)\(['"]([^'"]+)['"]/g)].map(match => ({ method: match[1], route: match[2] }));
const checks = [], unresolved = [];
const combine = (a,b) => a.flatMap(x=>b.map(y=>x+y)).slice(0,100);
function urls(node, bindings, seen = new Set()) {
  if (!node) return [];
  if (node.type === 'StringLiteral') return [node.value];
  if (node.type === 'JSXExpressionContainer') return urls(node.expression,bindings,seen);
  if (node.type === 'ConditionalExpression') return [...urls(node.consequent,bindings,seen),...urls(node.alternate,bindings,seen)];
  if (node.type === 'BinaryExpression' && node.operator === '+') return combine(urls(node.left,bindings,seen),urls(node.right,bindings,seen).length?urls(node.right,bindings,seen):[':value']);
  if (node.type === 'TemplateLiteral') {
    let values=[node.quasis[0].value.cooked];
    node.expressions.forEach((expression,i)=>{
      const options=urls(expression,bindings,seen);
      values=combine(values,options.length?options:[':value']).map(v=>v+node.quasis[i+1].value.cooked);
    });
    return values;
  }
  if (node.type === 'Identifier' && bindings.has(node.name) && !seen.has(node.name)) {
    const next=new Set(seen);next.add(node.name);
    return bindings.get(node.name).flatMap(value=>urls(value,bindings,next));
  }
  return [];
}
function walk(node,fn) {
  if(!node || typeof node!=='object')return;
  fn(node);
  for(const value of Object.values(node)) {
    if(Array.isArray(value))value.forEach(child=>walk(child,fn));
    else if(value && typeof value==='object')walk(value,fn);
  }
}
function record(node,argument,method,file,bindings,download=false) {
  const options=[...new Set(urls(argument,bindings))];
  if(!options.length) { if(!download)unresolved.push({file:path.relative(root,file),line:node.loc.start.line,method});return; }
  for(let url of options) {
    if(download && !url.startsWith('/api/'))continue;
    if(url.startsWith('/api/'))url=url.slice(4);
    url=url.split('?')[0];
    const matching=routes.filter(route=>route.method===method && new RegExp('^'+route.route.split('/').map(part=>part.startsWith(':')?'[^/]+':part.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('/')+'$').test(url));
    checks.push({file:path.relative(root,file),line:node.loc.start.line,method,url,matched:!!matching.length,download});
  }
}
function scan(directory) {
  for(const entry of fs.readdirSync(directory,{withFileTypes:true})) {
    const file=path.join(directory,entry.name);
    if(entry.isDirectory())scan(file);
    else if(/\.(js|jsx)$/.test(file)) {
      const ast=parser.parse(fs.readFileSync(file,'utf8'),{sourceType:'module',plugins:['jsx']});
      const bindings=new Map();
      walk(ast,node=>{ if(node.type==='VariableDeclarator' && node.id.type==='Identifier' && node.init){if(!bindings.has(node.id.name))bindings.set(node.id.name,[]);bindings.get(node.id.name).push(node.init);} });
      walk(ast,node=>{
        if(node.type==='CallExpression' && node.callee?.type==='MemberExpression' && node.callee.object?.name==='api' && ['get','post','patch','put','delete'].includes(node.callee.property?.name))record(node,node.arguments[0],node.callee.property.name,file,bindings);
        if(node.type==='JSXAttribute' && node.name?.name==='href')record(node,node.value,'get',file,bindings,true);
        if(node.type==='AssignmentExpression' && node.left?.property?.name==='href')record(node,node.right,'get',file,bindings,true);
      });
    }
  }
}
scan(path.join(__dirname,'../../client/src'));
const mismatches=checks.filter(c=>!c.matched);
const report={routes:routes.length,total:checks.length,mismatches,unresolved,checks};
fs.writeFileSync(path.join(root,'scratch/api-route-contracts.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({routes:routes.length,calls:checks.length,mismatches,unresolved},null,2));
if(mismatches.length || unresolved.length)process.exitCode=1;
