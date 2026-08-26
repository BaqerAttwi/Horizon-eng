const test = require('node:test');
const assert = require('node:assert/strict');
const { calcItemPricing } = require('../utils/pricingCore');

test('calculates the complete CRM pricing chain without rounding intermediate values', () => {
  const result = calcItemPricing({
    base_price_usd: 100,
    qty: 2,
    discount_pct: 10,
    markupP_pct: 20,
    manpower_pct: 5,
    markupM_pct: 10,
  });

  assert.deepEqual(result, {
    discount_amt: 20,
    markupP_amt: 36,
    totalpriceT: 216,
    manpower_amt: 9,
    markupM_amt: 0.9,
    totalfinalProduct: 225.9,
  });
});

test('uses the configured 1.18 fallback when only a EUR base price exists', () => {
  const result = calcItemPricing({ base_price_euro: 100, qty: 1 });
  assert.equal(result.totalfinalProduct, 118);
});

test('uses an explicit project exchange rate instead of the fallback', () => {
  const result = calcItemPricing({ base_price_euro: 100, qty: 1 }, 1.25);
  assert.equal(result.totalfinalProduct, 125);
});
