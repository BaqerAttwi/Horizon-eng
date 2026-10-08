const { canViewPrices } = require('./rolePolicy');
const financialFields = new Set([
  'total_cost','total_price','total_with_vat','total_vat','total_paid','outstanding_balance',
  'price_cost','price_snapshot','effective_price_usd','effective_price_euro','product_price_usd','product_price_euro','credit_limit',
  'unit_cost','unit_price','price_usd','price_euro','base_price_usd','base_price_euro',
  'custom_price_usd','custom_price_euro','cost','cr_amount','markupP_amt','markupM_amt',
  'discount_amt','manpower_amt','totalpriceT','totalfinalProduct','total_final','total_product','total_manpower',
  'project_discount_amount','project_discount_pct','vat_pct','exchange_rate_eur_usd','margin_warning_pct',
  'old_base_price_usd','old_base_price_euro','new_base_price_usd','new_base_price_euro',
]);
function redactFinancials(value) {
  if (Array.isArray(value)) return value.map(redactFinancials);
  if (!value || typeof value !== 'object' || value instanceof Date || Buffer.isBuffer(value)) return value;
  const safe = {};
  for (const [key, item] of Object.entries(value)) safe[key] = financialFields.has(key) ? null : redactFinancials(item);
  if ((financialFields.has(value.field_name) || ['multiple','bulk_changes','payment'].includes(value.field_name))) { safe.old_value = null; safe.new_value = null; }
  if (/^Price Change (Approved|Rejected)$/i.test(value.title || '')) safe.message = 'Item changes were ' + (/Approved$/i.test(value.title) ? 'approved.' : 'rejected.');
  return safe;
}
function financialPrivacy(req, res, next) {
  const json = res.json.bind(res);
  res.json = body => json(req.worker && !canViewPrices(req.worker.role) ? redactFinancials(body) : body);
  next();
}
module.exports = { financialPrivacy, redactFinancials };
