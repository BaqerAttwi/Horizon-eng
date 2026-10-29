function normalizeImportPanels(panels, flatItems = []) {
  const fail = message => { const error = new Error(message); error.status = 400; throw error; };
  const text = (value, limit, label) => { if (value != null && (typeof value !== 'string' || value.length > limit)) fail(`${label} must be text up to ${limit} characters`); };
  const integer = (value, label) => { if (!['number','string'].includes(typeof value) || !Number.isSafeInteger(Number(value)) || Number(value) < 1 || Number(value) > 2147483647) fail(`${label} must be a positive whole number`); };
  if (!Array.isArray(panels) || !panels.length || panels.length > 1000 || !Array.isArray(flatItems)) fail('Provide between 1 and 1000 panels');
  const seen = new Set();
  let count = 0;
  return panels.map((panel, index) => {
    if (!panel || typeof panel !== 'object' || Array.isArray(panel)) fail('Invalid panel');
    const number = panel.panel_number ?? index + 1;
    integer(number, 'Panel number');
    if (seen.has(Number(number))) fail('Panel numbers must be unique');
    seen.add(Number(number));
    if (panel.quantity != null) integer(panel.quantity, 'Panel quantity');
    text(panel.panel_name, 250, 'Panel name');
    let divisions = panel.divisions;
    if (divisions === undefined) {
      const ownItems = flatItems.filter(item => Number(item?.panel_number) === Number(number) || (panels.length === 1 && item?.panel_number == null));
      const grouped = new Map();
      for (const item of ownItems) {
        const name = item.division_type || 'INCOMING';
        if (!grouped.has(name)) grouped.set(name, { division_type: name, items: [] });
        grouped.get(name).items.push(item);
      }
      divisions = [...grouped.values()];
    }
    if (!Array.isArray(divisions) || divisions.length > 500) fail('Invalid panel divisions');
    return { ...panel, panel_number: Number(number), divisions: divisions.map(div => {
      if (!div || typeof div !== 'object' || !Array.isArray(div.items)) fail('Each division must contain an items array');
      text(div.division_type, 100, 'Division');
      for (const item of div.items) {
        if (++count > 5000) fail('Import is limited to 5000 items');
        if (!item || typeof item !== 'object' || Array.isArray(item)) fail('Invalid item');
        for (const field of ['product_id','item_group_id','qty']) if (item[field] != null) integer(item[field], field);
        text(item.name, 250, 'Item reference');
        text(item.description, 10000, 'Item description');
        text(item.brand, 100, 'Item brand');
        if (item.base_price_usd >= 1e10 || item.base_price_euro >= 1e10) fail('Item price exceeds supported range');
      }
      return { ...div };
    }) };
  });
}
module.exports = { normalizeImportPanels };
