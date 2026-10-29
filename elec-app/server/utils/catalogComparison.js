const roundPrice = value => Math.round(Number(value) * 10000) / 10000;
function compareCatalogItem(item, rate) {
  let usd = item.catalog_usd == null ? null : Number(item.catalog_usd);
  let eur = item.catalog_euro == null ? null : Number(item.catalog_euro);
  if (!usd && eur > 0) usd = eur * rate;
  if (!eur && usd > 0) eur = usd / rate;
  usd = usd == null ? null : roundPrice(usd);
  eur = eur == null ? null : roundPrice(eur);
  const available = [usd, eur].every(v => v != null && Number.isFinite(v) && v >= 0);
  const status = !item.catalog_id ? 'Unavailable in database' : !available ? 'No database price' :
    roundPrice(item.base_price_usd) !== usd || roundPrice(item.base_price_euro) !== eur ? 'Changed' : 'Unchanged';
  return { id: item.id, panel_id: item.panel_id, division_id: item.division_id,
    reference: item.reference || item.custom_name, panel_name: item.panel_name,
    saved_usd: item.base_price_usd, saved_euro: item.base_price_euro,
    current_usd: usd, current_euro: eur, status };
}
function validatePriceSelection(selected, rows) {
  if (!Array.isArray(selected) || !selected.length || selected.length > 5000) return { status: 400, error: 'Choose between 1 and 5000 item prices' };
  const ids = new Set(), result = [];
  for (const selection of selected) {
    if (!selection || !Number.isSafeInteger(Number(selection.id)) || Number(selection.id) < 1 || ids.has(String(selection.id))) return { status: 400, error: 'Item IDs must be unique positive integers' };
    ids.add(String(selection.id));
    const row = rows.find(r => String(r.id) === String(selection.id));
    if (!row || !['Changed', 'Unchanged'].includes(row.status)) return { status: 409, error: 'Database item or price is unavailable. Check prices again.' };
    for (const [expected, actual] of [['expected_usd','current_usd'],['expected_euro','current_euro'],['saved_usd','saved_usd'],['saved_euro','saved_euro']]) {
      const value = selection[expected];
      if (value == null || value === '' || !['number','string'].includes(typeof value) || !Number.isFinite(Number(value)) || Number(value) !== Number(row[actual])) return { status: 409, error: 'Project or database prices changed. Check prices again.' };
    }
    result.push(row);
  }
  return { rows: result };
}
module.exports = { compareCatalogItem, validatePriceSelection };
