const nonnegative = new Set([
  'stock_qty','min_stock_level','base_price_usd','base_price_euro','price_usd','price_euro','price_cost',
  'custom_price_usd','custom_price_euro','unit_price','unit_cost','cost','cr_amount',
  'markupP','markupM','markupP_pct','markupM_pct','manpower_pct',
  'vat_pct','discount_pct','discount','project_discount_pct','margin_warning_pct',
  'new_base_price_usd','new_base_price_euro','new_markupP_pct','new_markupM_pct','new_manpower_pct','new_discount_pct',
]);
const percentages = new Set(['vat_pct','discount_pct','discount','project_discount_pct','margin_warning_pct','new_discount_pct']);
const positiveIntegers = new Set(['qty','quantity','new_qty']);

function numericValidation(req, res, next) {
  const pending = [req.body];
  let visited = 0;
  while (pending.length) {
    const object = pending.pop();
    if (!object || typeof object !== 'object') continue;
    if (++visited > 50000) return res.status(400).json({ error: 'Request contains too many records' });
    for (const [key, value] of Object.entries(object)) {
      const numeric = nonnegative.has(key) || positiveIntegers.has(key) || key === 'exchange_rate_eur_usd' || key === 'amount';
      if (numeric && value !== undefined && value !== null && value !== '') {
        const number = Number(value);
        if (!['number','string'].includes(typeof value) || !Number.isFinite(number) ||
          (nonnegative.has(key) && number < 0) || (percentages.has(key) && number > 100) ||
          (positiveIntegers.has(key) && (!Number.isSafeInteger(number) || number < 1)) ||
          (['exchange_rate_eur_usd','amount'].includes(key) && number <= 0)) {
          return res.status(400).json({ error: `${key} contains an invalid number or is outside its allowed range` });
        }
      }
      if (value && typeof value === 'object') pending.push(value);
    }
  }
  next();
}

module.exports = { numericValidation };
