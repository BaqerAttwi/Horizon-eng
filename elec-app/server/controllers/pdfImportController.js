const { PDFParse } = require('pdf-parse');
const db = require('../db/connection');
const { recalcReservedQty } = require('./projectController');

// ── Parse PDF text into structured data ──

function parsePdfText(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const panels = [];
  let currentPanel = null;
  let currentDiv = null;
  const DIV_TYPES = ['INCOMING', 'OUTGOING', 'Enclosure', 'Accessories', 'Measurement'];

  for (const line of lines) {
    // Panel header
    const panelMatch = line.match(/^Panel\s*#(\d+)\s*[—–\-]?\s*(.*?)(?:\s+mkP:|$)/i);
    if (panelMatch) {
      currentPanel = { panel_number: parseInt(panelMatch[1]), panel_name: panelMatch[2].trim() || null, divisions: [] };
      panels.push(currentPanel);
      currentDiv = null;
      continue;
    }

    // Division header: "INCOMING (5 items)" or just "INCOMING"
    const divMatch = line.match(new RegExp(`^(${DIV_TYPES.join('|')})\\s*(?:\\((\\d+)\\s+items\\))?`));
    if (divMatch && currentPanel) {
      currentDiv = { division_type: divMatch[1], items: [] };
      currentPanel.divisions.push(currentDiv);
      continue;
    }

    // Item row — look for pattern: "name  x{qty}" or "name  x{qty}  $..."
    const itemMatch = line.match(/^(.+?)\s+x(\d+)(?:\s+\$([\d.]+))?/);
    if (itemMatch && currentDiv) {
      const name = itemMatch[1].trim();
      const qty = parseInt(itemMatch[2]);
      // Extract all percentages from the remainder of the line
      // Owner PDF columns: Item, Qty, Base$, mkP%, Disc%, Man%, mkM%, Total$, Cost$, Profit$
      const afterMatch = line.slice(itemMatch[0].length);
      const pcts = [...afterMatch.matchAll(/([\d.]+)%/g)].map(m => parseFloat(m[1]));
      const markupP_pct = pcts[0] ?? 0;
      const discount = pcts[1] ?? 0;
      const manpower_pct = pcts[2] ?? 0;
      const markupM_pct = pcts[3] ?? 0;
      currentDiv.items.push({ name, qty, markupP_pct, discount, manpower_pct, markupM_pct });
      continue;
    }

    // Also try to find items without a division context (client PDF page 2)
    const fallbackItem = line.match(/^(.+?)\s+x(\d+)$/);
    if (fallbackItem && currentPanel && !currentDiv) {
      const name = fallbackItem[1].trim();
      const qty = parseInt(fallbackItem[2]);
      // Create a default division if none exists
      currentDiv = { division_type: 'INCOMING', items: [] };
      currentPanel.divisions.push(currentDiv);
      currentDiv.items.push({ name, qty, discount: 0 });
      continue;
    }
  }

  return panels;
}

// ── Match items to database products ──

async function matchItems(items) {
  const matched = [];
  const unmatched = [];

  for (const item of items) {
    const [products] = await db.execute(
      'SELECT id, reference, price_usd, price_euro FROM products WHERE reference = ? LIMIT 1',
      [item.name]
    );
    if (products.length) {
      matched.push({
        ...item,
        product_id: products[0].id,
        base_price_usd: parseFloat(products[0].price_usd) || 0,
        base_price_euro: parseFloat(products[0].price_euro) || 0,
      });
    } else {
      unmatched.push({ ...item });
    }
  }

  return { matched, unmatched };
}

// ── Step 1: Parse PDF and preview ──

async function previewImport(req, res, next) {
  try {
    if (!req.file) return res.status(400).json({ error: 'PDF file required' });

    const parser = new PDFParse({ data: req.file.buffer, verbosity: 0 });
    await parser.load();
    const result = await parser.getText();
    const panels = parsePdfText(result.text);

    // Collect all items across all panels/divisions
    const allItems = [];
    for (const panel of panels) {
      for (const div of panel.divisions || []) {
        for (const item of div.items || []) {
          allItems.push(item);
        }
      }
    }

    // Match items to DB products
    const { matched, unmatched } = await matchItems(allItems);

    res.json({
      panels: panels.map(p => ({ panel_number: p.panel_number, panel_name: p.panel_name })),
      matched,
      unmatched,
      total_items: allItems.length,
    });
  } catch (err) { next(err); }
}

// ── Step 2: Confirm and create project ──

async function createFromImport(req, res, next) {
  try {
    const { project_name, engineer_id, client_id, exchange_rate_eur_usd, deadline, panels, matched_items, unmatched_items, total_panels } = req.body;

    if (!project_name) return res.status(400).json({ error: 'project_name required' });
    if (!panels?.length) return res.status(400).json({ error: 'No panel data provided' });

    // 1. Create the project
    const [projResult] = await db.execute(
      `INSERT INTO projects(project_name,engineer_id,client_id,exchange_rate_eur_usd,deadline,total_panels)
       VALUES(?,?,?,?,?,?)`,
      [project_name, engineer_id||null, client_id||null, exchange_rate_eur_usd||1.08, deadline||null, total_panels||panels.length]
    );
    const projectId = projResult.insertId;

    // 2. Create panel rows, divisions, items
    for (const p of panels) {
      const [panelResult] = await db.execute(
        'INSERT INTO project_crm_panels(project_id,panel_number,panel_name) VALUES(?,?,?)',
        [projectId, p.panel_number, p.panel_name||null]
      );
      const panelId = panelResult.insertId;

      // Get divisions for this panel from the parsed data
      const panelDivs = p.divisions || [{ division_type: 'INCOMING', items: [] }];

      for (const div of panelDivs) {
        const [divResult] = await db.execute(
          'INSERT INTO panel_divisions(panel_id,division_type) VALUES(?,?)',
          [panelId, div.division_type]
        );
        const divisionId = divResult.insertId;

        for (const item of div.items || []) {
          // Skip items marked for skipping
          if (item._skip) continue;

          let basePriceUsd = parseFloat(item.base_price_usd) || 0;
          let basePriceEur = parseFloat(item.base_price_euro) || 0;
          const rate = parseFloat(exchange_rate_eur_usd) || 1.08;
          if (basePriceUsd && !basePriceEur) {
            basePriceEur = (basePriceUsd / rate);
          } else if (basePriceEur && !basePriceUsd) {
            basePriceUsd = (basePriceEur * rate);
          }
          const qty = item.qty || 1;
          const discount = parseFloat(item.discount) || 0;
          const markupP_pct = parseFloat(item.markupP_pct) || 0;
          const manpower_pct = parseFloat(item.manpower_pct) || 0;
          const markupM_pct = parseFloat(item.markupM_pct) || 0;
          const productId = item.product_id || null;
          const isManual = !productId;

          let manualProductId = null;
          if (isManual && item.name) {
            const [mp] = await db.execute(
              'INSERT INTO panel_manual_products(project_id,name,description,price_usd,price_euro) VALUES(?,?,?,?,?)',
              [projectId, item.name, `Imported from PDF`, basePriceUsd, basePriceEur]
            );
            manualProductId = mp.insertId;
          }

          // Calculate pricing
          const pricing = calcItemPricing({
            base_price_usd: basePriceUsd,
            markupP_pct: markupP_pct, discount_pct: discount,
            manpower_pct: manpower_pct, markupM_pct: markupM_pct, qty
          });

          await db.execute(
            `INSERT INTO panel_crm_items(division_id,product_id,manual_product_id,is_manual,
              custom_name,custom_desc,custom_price_usd,custom_price_euro,
              qty,base_price_usd,base_price_euro,markupP_pct,discount_pct,manpower_pct,markupM_pct,
              markupP_amt,discount_amt,totalpriceT,manpower_amt,markupM_amt,totalfinalProduct,cost,override_markup)
             VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0)`,
            [divisionId, productId, manualProductId, isManual,
             isManual ? item.name : null, isManual ? `Imported from PDF` : null,
             isManual ? basePriceUsd : null, isManual ? basePriceEur : null,
             qty, basePriceUsd, basePriceEur,
             markupP_pct, discount, manpower_pct, markupM_pct,
             pricing.markupP_amt, pricing.discount_amt, pricing.totalpriceT,
             pricing.manpower_amt, pricing.markupM_amt, pricing.totalfinalProduct, 0]
          );
        }

        // Recalc division totals
        await recalcDivisionTotals(divisionId);
      }

      // Recalc panel totals
      await recalcPanelTotals(panelId);
    }

    // 3. Recalc project totals
    await recalcProjectTotals(projectId);
    await recalcReservedQty();

    res.status(201).json({ message: 'Project created from PDF', project_id: projectId });
  } catch (err) { next(err); }
}

// ── Helper functions (adapted from crmController) ──

function calcItemPricing(item) {
  const base = parseFloat(item.base_price_usd) || 0;
  const qty = parseInt(item.qty) || 1;
  const baseTotal = base * qty;
  const disc = baseTotal * (parseFloat(item.discount_pct) / 100);
  const afterDisc = baseTotal - disc;
  const mkP = afterDisc * (parseFloat(item.markupP_pct) / 100);
  const totalT = afterDisc + mkP;
  const man = afterDisc * (parseFloat(item.manpower_pct) / 100);
  const mkM = man * (parseFloat(item.markupM_pct) / 100);
  const final = totalT + man + mkM;
  return {
    markupP_amt: mkP, discount_amt: disc, totalpriceT: totalT,
    manpower_amt: man, markupM_amt: mkM, totalfinalProduct: final,
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
}

async function recalcProjectTotals(projectId) {
  const [panels] = await db.execute('SELECT id, total_price FROM project_crm_panels WHERE project_id=?', [projectId]);
  const total = panels.reduce((s, p) => s + (parseFloat(p.total_price) || 0), 0);
  await db.execute('UPDATE projects SET total_price=? WHERE id=?', [total, projectId]);
}

module.exports = { previewImport, createFromImport };
