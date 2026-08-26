export const DIVISION_TYPES = ['INCOMING', 'OUTGOING', 'Enclosure', 'Accessories', 'Measurement'];
export const DIVISION_COLORS = { INCOMING: '#e11d48', OUTGOING: '#2563eb', Enclosure: '#7c3aed', Accessories: '#d97706', Measurement: '#059669' };

export const calcItemFinal = (item, discPct) => {
  const base = parseFloat(item.base_price_usd) || 0;
  const qty = parseFloat(item.qty) || 1;
  const baseTotal = base * qty;
  const discAmt = baseTotal * (discPct / 100);
  const afterDisc = baseTotal - discAmt;
  const mkPPct = parseFloat(item.markupP_pct) || 0;
  const mkPAmt = afterDisc * (mkPPct / 100);
  const tPrice = afterDisc + mkPAmt;
  const manPct = parseFloat(item.manpower_pct) || 0;
  const manAmt = afterDisc * (manPct / 100);
  const mkMPct = parseFloat(item.markupM_pct) || 0;
  const mkMAmt = manAmt * (mkMPct / 100);
  return tPrice + manAmt + mkMAmt;
};

export const calcItemCurrentPrice = (item) => {
  const discPct = parseFloat(item.discount_pct) || 0;
  return calcItemFinal(item, discPct);
};

export const recalcPanelTotal = (panel) => {
  let total = 0;
  for (const div of panel.divisions || []) {
    // The CRM API keeps every database item in division.items. Group-instance
    // items are references to those same objects, not an additional charge.
    for (const item of div.items || []) {
      total += calcItemCurrentPrice(item);
    }
  }
  const quantity = Math.max(1, parseInt(panel.quantity, 10) || 1);
  return { ...panel, quantity, total_price: total * quantity };
};
