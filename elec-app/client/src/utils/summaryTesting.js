export function calcMetrics(item, rate = 1.18) {
  const number = value => Number.parseFloat(value) || 0;
  const base = number(item.base_price_usd) || number(item.base_price_euro) * rate;
  const eur = number(item.base_price_euro) || base / rate;
  const qty = Math.max(1, Number.parseInt(item.qty, 10) || 1);
  const baseTotal = base * qty;
  const discountPct = number(item.discount_pct);
  const afterDisc = baseTotal * (1 - discountPct / 100);
  const markupP = number(item.markupP_pct);
  const mkP = afterDisc * markupP / 100;
  const totalT = afterDisc + mkP;
  const man = afterDisc * number(item.manpower_pct) / 100;
  const mkM = man * number(item.markupM_pct) / 100;
  const finalPrice = totalT + man + mkM;
  const cost = number(item.cost) * qty;
  const profit = finalPrice - cost;
  return { basePrice: base, priceEuro: eur, qty, baseTotal, discountPct, afterDisc, markupP, mkP, totalT, man, mkM, finalPrice, cost, profit, margin: finalPrice > 0 ? profit / finalPrice * 100 : 0 };
}

export function calcPanelMetrics(panel, rate = 1.18) {
  let total = 0, cost = 0;
  for (const division of panel.divisions || []) {
    for (const item of division.items || []) {
      const metrics = calcMetrics(item, rate);
      const stored = Number.parseFloat(item.totalfinalProduct);
      // Stored line totals already include the item's quantity.
      total += Number.isFinite(stored) ? stored : metrics.finalPrice;
      cost += metrics.cost;
    }
  }
  const quantity = Math.max(1, Number.parseInt(panel.quantity, 10) || 1);
  return { total: total * quantity, cost: cost * quantity };
}
