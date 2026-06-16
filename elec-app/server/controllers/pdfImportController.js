const { PDFParse } = require('pdf-parse');
const db = require('../db/connection');
const { recalcReservedQty } = require('./projectController');
const { calcItemPricing, recalcDivisionTotals, recalcPanelTotals } = require('../utils/pricing');

// ── Parse PDF text into structured data ──

function getDivType(line) {
  const m = line.match(/\b(INCOMING|OUTGOING|Enclosure|Accessories|Measurement)\b/);
  return m ? m[1] : null;
}

function parsePdfText(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const panels = [];
  let currentPanel = null;

  for (const line of lines) {
    // Skip header/footer/noise lines
    if (/^(HORIZON Engineering|Generated on|-- \d+ of \d+ --|Page \d+ of \d+|Dear Sirs|Total Amount|Payment|Validity|Attached|GRAND TOTAL|Grand Total|Discount|VAT|TOTAL WITH|Note:|Panel Name)/.test(line)) continue;
    if (/^(Project Name|Engineer|Client|Date)/.test(line)) continue;
    if (/^Panel Summary|^Technical Details|^# Item Description/.test(line)) continue;

    // Panel header (only from Technical Details section with PANEL: prefix)
    const panelMatch = line.match(/^PANEL:\s*Panel\s*#(\d+)\s*[—–\-]?\s*(.*)/i);
    if (panelMatch) {
      currentPanel = { panel_number: parseInt(panelMatch[1]), panel_name: panelMatch[2].trim() || null, divisions: [] };
      panels.push(currentPanel);
      continue;
    }

    if (!currentPanel) continue;

    // Collect all items per panel (divisions will be inferred from div type in each line)
    // Build a flat list; we'll group by division type at the end
    if (!currentPanel._items) currentPanel._items = [];
    if (!currentPanel._groups) currentPanel._groups = [];

    // Group row: "Group: grp1 INCOMING 12"
    const grpMatch = line.match(/^Group:\s*(.+?)\s+(INCOMING|OUTGOING|Enclosure|Accessories|Measurement)\s+(\d+)$/);
    if (grpMatch) {
      currentPanel._groups.push({ name: 'Group: ' + grpMatch[1].trim(), divType: grpMatch[2], qty: parseInt(grpMatch[3]) });
      continue;
    }

    // Item row: "1 A9MEM3100 Triphase Kwh Meter 63A INCOMING 1"
    // Starts with a number, then name, then division type, then qty
    const itemMatch = line.match(/^\d+\s+(.+)\s+(INCOMING|OUTGOING|Enclosure|Accessories|Measurement)\s+(\d+)$/);
    if (itemMatch) {
      currentPanel._items.push({ name: itemMatch[1].trim(), divType: itemMatch[2], qty: parseInt(itemMatch[3]) });
      continue;
    }

    // Fallback: any non-empty line ending with a number (potential item)
    const fallMatch = line.match(/^(.+?)\s+(\d{1,4})$/);
    if (fallMatch && fallMatch[1].trim().length > 3 && !/^(Panel|HORIZON|project\d)/i.test(fallMatch[1])) {
      const divType = getDivType(fallMatch[1]);
      const name = divType ? fallMatch[1].replace(divType, '').trim() : fallMatch[1].trim();
      currentPanel._items.push({ name, divType: divType || 'INCOMING', qty: parseInt(fallMatch[2]) });
      continue;
    }
  }

  // Convert flat items into divisions per panel
  for (const panel of panels) {
    const divMap = {};
    const addItem = (item, isGroup) => {
      const dt = item.divType || 'INCOMING';
      if (!divMap[dt]) divMap[dt] = { division_type: dt, items: [] };
      divMap[dt].items.push({ name: item.name, qty: item.qty, discount: 0, is_group: isGroup || false });
    };
    for (const item of (panel._items || [])) addItem(item, false);
    for (const grp of (panel._groups || [])) addItem(grp, true);
    panel.divisions = Object.values(divMap);
    delete panel._items;
    delete panel._groups;
  }

  return panels;
}

// ── Match items to database products ──

async function matchItems(items) {
  const matched = [];
  const unmatched = [];

  for (const item of items) {
    // Try exact match first (full name as reference)
    let [products] = await db.execute(
      'SELECT id, reference, price_usd, price_euro FROM products WHERE reference = ? LIMIT 1',
      [item.name]
    );

    // If no match, try prefix match using first word (reference code)
    if (!products.length && item.name) {
      const firstWord = item.name.split(/\s+/)[0];
      if (firstWord) {
        [products] = await db.execute(
          'SELECT id, reference, price_usd, price_euro FROM products WHERE reference LIKE ? LIMIT 1',
          [firstWord + '%']
        );
        // If multiple matches, prefer exact reference match
        if (products.length > 1) {
          const exact = products.find(p => p.reference === firstWord);
          if (exact) products = [exact];
        }
      }
    }

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

    // Auto-assign engineer to themselves
    const assignedEngineer = req.worker.role === 'engineer' ? req.worker.id : (engineer_id || null);

    // 1. Create the project
    const [projResult] = await db.execute(
      `INSERT INTO projects(project_name,engineer_id,client_id,exchange_rate_eur_usd,deadline,total_panels)
       VALUES(?,?,?,?,?,?)`,
      [project_name, assignedEngineer, client_id||null, exchange_rate_eur_usd||1.08, deadline||null, total_panels||panels.length]
    );
    const projectId = projResult.insertId;

    // Collect all items from matched + unmatched to use as fallback
    const allFlatItems = [...(matched_items || []), ...(unmatched_items || [])];

    // 2. Create panel rows, divisions, items
    for (let pi = 0; pi < panels.length; pi++) {
      const p = panels[pi];
      const [panelResult] = await db.execute(
        'INSERT INTO project_crm_panels(project_id,panel_number,panel_name) VALUES(?,?,?)',
        [projectId, p.panel_number, p.panel_name||null]
      );
      const panelId = panelResult.insertId;

      // Get divisions for this panel
      let panelDivs = p.divisions || [];
      // If no divisions from parsing, create one default division
      if (!panelDivs.length) {
        panelDivs = [{ division_type: 'INCOMING', items: allFlatItems }];
      }

      for (const div of panelDivs) {
        const [divResult] = await db.execute(
          'INSERT INTO panel_divisions(panel_id,division_type) VALUES(?,?)',
          [panelId, div.division_type]
        );
        const divisionId = divResult.insertId;

        // If this division has no items, use flat items as fallback (only for first panel)
        let divItems = div.items || [];
        if (!divItems.length && pi === 0) {
          divItems = allFlatItems;
        }

        for (const item of divItems) {
          if (item._skip) continue;

          let basePriceUsd = parseFloat(item.base_price_usd) || 0;
          let basePriceEur = parseFloat(item.base_price_euro) || 0;
          const rate = parseFloat(exchange_rate_eur_usd) || 1.08;
          if (basePriceUsd && !basePriceEur) {
            basePriceEur = (basePriceUsd / rate);
          } else if (basePriceEur && !basePriceUsd) {
            basePriceUsd = (basePriceEur * rate);
          }
          const qty = item.qty ?? 1;
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

        await recalcDivisionTotals(divisionId);
      }

      await recalcPanelTotals(panelId);
    }

    // 3. Recalc reserved quantities
    await recalcReservedQty();

    res.status(201).json({ message: 'Project created from PDF', project_id: projectId });
  } catch (err) { next(err); }
}

module.exports = { previewImport, createFromImport };
