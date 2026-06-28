const db = require('../db/connection');

function calcItemPricing(item) {
  const rate = 1.08;
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

async function recalcDivisionTotals(divisionId) {
  const [items] = await db.execute(
    'SELECT id, base_price_usd, markupP_pct, discount_pct, manpower_pct, markupM_pct, qty FROM panel_crm_items WHERE division_id=?',
    [divisionId]
  );
  let divTotal = 0;
  for (const item of items) {
    const calc = calcItemPricing(item);
    await db.execute(
      `UPDATE panel_crm_items SET markupP_amt=?,discount_amt=?,totalpriceT=?,manpower_amt=?,markupM_amt=?,totalfinalProduct=? WHERE id=?`,
      [calc.markupP_amt, calc.discount_amt, calc.totalpriceT, calc.manpower_amt, calc.markupM_amt, calc.totalfinalProduct, item.id]
    );
    divTotal += calc.totalfinalProduct;
  }
  return divTotal;
}

async function recalcPanelTotals(panelId) {
  const [divisions] = await db.execute('SELECT id FROM panel_divisions WHERE panel_id=?', [panelId]);
  let panelTotal = 0;
  for (const div of divisions) {
    panelTotal += await recalcDivisionTotals(div.id);
  }
  await db.execute('UPDATE project_crm_panels SET total_price=? WHERE id=?', [panelTotal, panelId]);

  const [projectRow] = await db.execute('SELECT project_id FROM project_crm_panels WHERE id=?', [panelId]);
  if (projectRow.length) {
    const [panels] = await db.execute('SELECT id, total_price, is_completed FROM project_crm_panels WHERE project_id=?', [projectRow[0].project_id]);
    let projectTotal = panels.reduce((s, p) => s + (parseFloat(p.total_price) || 0), 0);
    const completedCount = panels.filter(p => p.is_completed).length;

    // Get vat_pct / discount_pct and calculate
    const [[proj]] = await db.execute('SELECT vat_pct, project_discount_pct FROM projects WHERE id=?', [projectRow[0].project_id]);
    const vatPct = parseFloat(proj?.vat_pct) || 0;
    const discPct = parseFloat(proj?.project_discount_pct) || 0;
    const discountAmount = projectTotal * (discPct / 100);
    const netAfterDiscount = projectTotal - discountAmount;
    const totalVat = netAfterDiscount * (vatPct / 100);
    const totalWithVat = netAfterDiscount + totalVat;

    await db.execute('UPDATE projects SET total_price=?, project_discount_amount=?, total_vat=?, total_with_vat=?, completed_panels=? WHERE id=?',
      [projectTotal, discountAmount, totalVat, totalWithVat, completedCount, projectRow[0].project_id]);
  }
}

module.exports = { calcItemPricing, recalcDivisionTotals, recalcPanelTotals };
