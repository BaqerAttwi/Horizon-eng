const test = require('node:test');
const assert = require('node:assert/strict');

test('panel comparison counts item quantity once and applies the panel multiplier once', async () => {
  const { calcPanelMetrics } = await import('../../client/src/utils/summaryTesting.js');
  const panel = { quantity: 3, divisions: [{ items: [{ qty: 10, base_price_usd: 20, totalfinalProduct: 200, cost: 5 }] }] };
  assert.deepEqual(calcPanelMetrics(panel), { total: 600, cost: 150 });
});

test('comparison handles zero totals, missing percentages and EUR-only products', async () => {
  const { calcMetrics, calcPanelMetrics } = await import('../../client/src/utils/summaryTesting.js');
  assert.equal(calcMetrics({ qty: 2, base_price_euro: 10 }, 1.2).finalPrice, 24);
  assert.equal(calcPanelMetrics({ divisions: [{ items: [{ qty: 2, base_price_usd: 10, totalfinalProduct: 0 }] }] }).total, 0);
  assert.equal(calcPanelMetrics({ divisions: [{ items: [{ qty: 2, base_price_euro: 10 }] }] }, 1.2).total, 24);
});
