const XLSX = require('xlsx');

function parseCrmExcel(buffer) {
  const names = XLSX.read(buffer, { type: 'buffer', bookSheets: true }).SheetNames;
  const name = names.find(n => n.trim().toUpperCase() === 'CRM');
  if (!name) throw new Error('Excel workbook must contain a CRM sheet');
  const book = XLSX.read(buffer, { type: 'buffer', sheets: [name], sheetRows: 5002 });
  const sheet = book.Sheets[name];
  const bounds = XLSX.utils.decode_range(sheet['!fullref'] || sheet['!ref'] || 'A1');
  if (bounds.e.r > 5000 || bounds.e.c > 99) throw new Error('CRM sheet is limited to 5000 items and 100 columns');
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
  const header = rows.findIndex(r => r.includes('Panel#') && r.includes('Part number'));
  if (header < 0) throw new Error('CRM headers Panel# and Part number are required');
  const h = rows[header];
  for (const required of ['Project','Panel name','Division','Description','Brand','QTY','UNIT PRICE EUR','DISCOUNT','MAN POWER','MARKUP']) {
    if (!h.includes(required)) throw new Error(`Missing CRM column: ${required}`);
  }
  if (!h.includes('UNIT PRICE USD2') && !h.includes('UNIT PRICE USD')) throw new Error('Missing CRM USD price column');
  const get = (r, name) => r[h.indexOf(name)];
  const num = (r, name) => {
    const v = get(r, name);
    if (v == null || v === '') return 0;
    if (!['string','number'].includes(typeof v) || !Number.isFinite(Number(v)) || Number(v) < 0) throw new Error(`Invalid ${name} in CRM sheet`);
    return Number(v);
  };
  const panels = new Map(), items = [];
  let projectName = '', rate;
  rows.slice(header + 1).forEach((r, index) => {
    if (get(r, 'Part number') == null || get(r, 'Panel#') == null) return;
    const panel = num(r, 'Panel#'), qty = num(r, 'QTY');
    if (!Number.isSafeInteger(panel) || panel < 1 || !Number.isSafeInteger(qty) || qty < 1) throw new Error(`Invalid panel or quantity at CRM row ${header + index + 2}`);
    const eur = num(r, 'UNIT PRICE EUR');
    const usd = num(r, 'UNIT PRICE USD2') || num(r, 'UNIT PRICE USD');
    if (eur >= 1e10 || usd >= 1e10 || num(r, 'DISCOUNT') > 100) throw new Error(`Invalid price or discount at CRM row ${header + index + 2}`);
    if (!rate && eur && usd) rate = usd / eur;
    const manpower = num(r, 'MAN POWER') * 100, markup = num(r, 'MARKUP') * 100;
    const item = { name: String(get(r, 'Part number')), description: String(get(r, 'Description') || ''), brand: String(get(r, 'Brand') || ''),
      panel_number: panel, division_type: String(get(r, 'Division') || 'INCOMING'), qty,
      base_price_usd: usd, base_price_euro: eur, discount: num(r, 'DISCOUNT'),
      manpower_pct: manpower, markupP_pct: markup, markupM_pct: markup,
      cost: num(r, 'TOTAL COST') / qty,
      source_row: header + index + 2 };
    items.push(item);
    panels.set(panel, { panel_number: panel, panel_name: String(get(r, 'Panel name') || ''), quantity: 1 });
    const rowProject = String(get(r, 'Project') || '');
    if (projectName && rowProject && projectName !== rowProject) throw new Error('CRM sheet contains more than one project');
    projectName ||= rowProject;
  });
  if (!items.length) throw new Error('No CRM item rows found');
  return { panels: [...panels.values()], metadata: { project_name: projectName, exchange_rate: rate }, unmatched: items, matched: [], total_items: items.length, warnings: ['Historical CRM prices are preserved. Use Check prices after import to compare catalog prices.'] };
}
module.exports = { parseCrmExcel };
