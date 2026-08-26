function calcItemPricing(item, rate) {
  rate = rate || 1.18;
  const base = parseFloat(item.base_price_usd) || (parseFloat(item.base_price_euro) * rate) || 0;
  const markupP_pct = parseFloat(item.markupP_pct) || 0;
  const discount_pct = parseFloat(item.discount_pct) || 0;
  const manpower_pct = parseFloat(item.manpower_pct) || 0;
  const markupM_pct = parseFloat(item.markupM_pct) || 0;
  const qty = parseInt(item.qty) || 1;

  const baseTotal = base * qty;
  const discount_amt = baseTotal * (discount_pct / 100);
  const afterDiscount = baseTotal - discount_amt;
  const markupP_amt = afterDiscount * (markupP_pct / 100);
  const totalpriceT = afterDiscount + markupP_amt;
  const manpower_amt = afterDiscount * (manpower_pct / 100);
  const markupM_amt = manpower_amt * (markupM_pct / 100);
  const totalfinalProduct = totalpriceT + manpower_amt + markupM_amt;

  return {
    markupP_amt,
    discount_amt,
    totalpriceT,
    manpower_amt,
    markupM_amt,
    totalfinalProduct,
  };
}

module.exports = { calcItemPricing };
