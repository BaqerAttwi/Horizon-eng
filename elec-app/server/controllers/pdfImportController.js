const { PDFParse } = require('pdf-parse');
const db = require('../db/connection');
const { recalcReservedQty } = require('./projectController');
const { calcItemPricing, recalcDivisionTotals, recalcPanelTotals } = require('../utils/pricing');

// ── Parse PDF text into structured data ──

const DEFAULT_DIVISION_TYPES=['INCOMING','OUTGOING','Enclosure','Accessories','Measurement'];
const divisionPattern=names=>(names||DEFAULT_DIVISION_TYPES).map(name=>String(name).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).sort((a,b)=>b.length-a.length).join('|');
function getDivType(line,names) {
  const m = line.match(new RegExp(`\\b(${divisionPattern(names)})\\b`,'i'));
  return m ? m[1] : null;
}

function parsePdfText(text,divisionNames=DEFAULT_DIVISION_TYPES) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const panels = [];
  let currentPanel = null;
  const divPattern=divisionPattern(divisionNames);
  const getTechnicalPanel = name => {
    const cleanName = String(name || '').trim() || 'Imported Panel';
    let panel = panels.find(p => p.panel_name?.toLowerCase() === cleanName.toLowerCase());
    if (!panel) { panel = { panel_number: panels.length + 1, panel_name: cleanName, quantity: 1, divisions: [], _items: [], _groups: [] }; panels.push(panel); }
    // Panels first discovered from a header do not yet have parser-only arrays.
    // A later technical table row can resolve to that same panel by name.
    if (!panel._items) panel._items = [];
    if (!panel._groups) panel._groups = [];
    return panel;
  };

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex];
    // Skip header/footer/noise lines
    if (/^(HORIZON Engineering|Generated on|-- \d+ of \d+ --|Page \d+ of \d+|Dear Sirs|Total Amount|Payment|Validity|Attached|GRAND TOTAL|Grand Total|Discount|VAT|TOTAL WITH|Note:|Panel Name)/.test(line)) continue;
    if (/^(Project Name|Engineer|Client|Date)/.test(line)) continue;
    if (/^Panel Summary|^Technical Details|^# Item Description|^#\s*Panel name\s*Division\s*Part number/i.test(line)) continue;

    // Panel header (only from Technical Details section with PANEL: prefix)
    const commercialPanelMatch = line.match(/^\d+\s+Panel\s*#(\d+)\s*[—–\-]\s*(.+?)\s+(\d+)\s+Nos\.?/i);
    const panelMatch = line.match(/^(?:PANEL:\s*)?Panel\s*#(\d+)\s*[—–\-]?\s*(.*)/i);
    if (commercialPanelMatch) {
      currentPanel = panels.find(p => p.panel_number === parseInt(commercialPanelMatch[1]));
      if (!currentPanel) {
        currentPanel = { panel_number: parseInt(commercialPanelMatch[1]), panel_name: commercialPanelMatch[2].trim() || null, quantity: Math.max(1,parseInt(commercialPanelMatch[3])||1), divisions: [], _items: [], _groups: [] };
        panels.push(currentPanel);
      } else currentPanel.quantity = Math.max(1,parseInt(commercialPanelMatch[3])||1);
      continue;
    }
    if (panelMatch) {
      currentPanel = panels.find(p => p.panel_number === parseInt(panelMatch[1]));
      if (!currentPanel) { currentPanel = { panel_number: parseInt(panelMatch[1]), panel_name: panelMatch[2].trim() || null, quantity: 1, divisions: [], _items: [], _groups: [] }; panels.push(currentPanel); }
      continue;
    }

    // New technical quotation: one complete table row per extracted line:
    // "1 Main Panel OUTGOING LC1D25 Contactor 25A 6"
    const newTechnicalRow = line.match(new RegExp(`^\\d+\\s+(.+?)\\s+(${divPattern})\\s+(\\S+)\\s+(.+?)\\s+(\\d+)$`,'i'));
    if (newTechnicalRow) {
      const panel = getTechnicalPanel(newTechnicalRow[1]);
      panel._items.push({ name: newTechnicalRow[3], description: newTechnicalRow[4], divType: newTechnicalRow[2], qty: parseInt(newTechnicalRow[5]) });
      currentPanel = panel;
      continue;
    }

    // Some PDF readers extract each table cell as a separate line. Detect a
    // division cell and rebuild: row number, panel name, division, part,
    // description, quantity. This is the common jsPDF/autotable layout.
    if (new RegExp(`^(${divPattern})$`,'i').test(line)) {
      const previous = lines[lineIndex - 1] || '';
      const beforePrevious = lines[lineIndex - 2] || '';
      const partNumber = lines[lineIndex + 1] || '';
      const description = lines[lineIndex + 2] || '';
      const quantityLine = lines[lineIndex + 3] || '';
      const panelName = /^\d+$/.test(beforePrevious) ? previous : (/^\d+$/.test(previous) ? lines[lineIndex - 2] : previous);
      if (panelName && partNumber && /^\d+$/.test(quantityLine) && !/^\d+$/.test(partNumber)) {
        const panel = getTechnicalPanel(panelName);
        panel._items.push({ name: partNumber, description, divType: line, qty: parseInt(quantityLine) });
        currentPanel = panel;
        lineIndex += 3;
        continue;
      }
    }

    if (!currentPanel) continue;

    // Collect all items per panel (divisions will be inferred from div type in each line)
    // Build a flat list; we'll group by division type at the end
    if (!currentPanel._items) currentPanel._items = [];
    if (!currentPanel._groups) currentPanel._groups = [];

    // Group row: "Group: grp1 INCOMING 12"
    const grpMatch = line.match(new RegExp(`^Group:\\s*(.+?)\\s+(${divPattern})\\s+(\\d+)$`,'i'));
    if (grpMatch) {
      currentPanel._groups.push({ name: 'Group: ' + grpMatch[1].trim(), divType: grpMatch[2], qty: parseInt(grpMatch[3]) });
      continue;
    }

    // Item row: "1 A9MEM3100 Triphase Kwh Meter 63A INCOMING 1"
    // Starts with a number, then name, then division type, then qty
    const technicalItemMatch = line.match(new RegExp(`^\\d+\\s+.+?\\s+(${divPattern})\\s+(\\S+)\\s+.+\\s+(\\d+)$`,'i'));
    if (technicalItemMatch) {
      currentPanel._items.push({ name: technicalItemMatch[2].trim(), divType: technicalItemMatch[1], qty: parseInt(technicalItemMatch[3]) });
      continue;
    }
    const itemMatch = line.match(new RegExp(`^\\d+\\s+(.+)\\s+(${divPattern})\\s+(\\d+)$`,'i'));
    if (itemMatch) {
      currentPanel._items.push({ name: itemMatch[1].trim(), divType: itemMatch[2], qty: parseInt(itemMatch[3]) });
      continue;
    }

    // Fallback: any non-empty line ending with a number (potential item)
    const fallMatch = line.match(/^(.+?)\s+(\d{1,4})$/);
    if (fallMatch && fallMatch[1].trim().length > 3 && !/^(Panel|HORIZON|project\d)/i.test(fallMatch[1])) {
      const divType = getDivType(fallMatch[1],divisionNames);
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
      divMap[dt].items.push({ name: item.name, description: item.description || null, qty: item.qty, discount: 0, is_group: isGroup || false });
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

async function matchItems(items, user) {
  const matched = [];
  const unmatched = [];

  for (const item of items) {
    // For group items, search item_groups by name
    if (item.is_group) {
      const groupName = item.name.replace(/^Group:\s*/i, '');
      let [groups] = await db.execute(
        `SELECT id, name, description FROM item_groups
         WHERE LOWER(TRIM(name)) = LOWER(TRIM(?))
           AND (?='owner' OR is_public=TRUE OR created_by=?) LIMIT 1`,
        [groupName, user.role, user.id]
      );
      // PDFs often contain a prefix/suffix around the saved group name. Use a
      // deterministic closest-name fallback so the preview can still match a
      // group stored in the database instead of importing it as a manual item.
      if (!groups.length && groupName.trim()) {
        [groups] = await db.execute(
          `SELECT id, name, description FROM item_groups
           WHERE (LOWER(name) LIKE LOWER(?) OR LOWER(?) LIKE CONCAT('%', LOWER(name), '%'))
             AND (?='owner' OR is_public=TRUE OR created_by=?)
           ORDER BY ABS(CHAR_LENGTH(name) - CHAR_LENGTH(?)), name LIMIT 1`,
          [`%${groupName.trim()}%`, groupName.trim(), user.role, user.id, groupName.trim()]
        );
      }
      if (groups.length) {
        matched.push({ ...item, item_group_id: groups[0].id, group_name: groups[0].name, group_description: groups[0].description || null });
        continue;
      }
      // fall through to regular product search
    }

    const searchName = item.is_group ? item.name.replace(/^Group:\s*/i, '') : item.name;

    let [products] = await db.execute(
      'SELECT id, reference, price_usd, price_euro FROM products WHERE reference = ? LIMIT 1',
      [searchName]
    );

    if (!products.length && searchName) {
      const firstWord = searchName.split(/\s+/)[0];
      if (firstWord) {
        [products] = await db.execute(
          'SELECT id, reference, price_usd, price_euro FROM products WHERE reference LIKE ? LIMIT 1',
          [firstWord + '%']
        );
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
    let result;
    try {
      // getText() loads the document itself in pdf-parse v2. Calling load()
      // first can initialize the same document twice and fail with some PDFs.
      result = await parser.getText();
    } catch (parseError) {
      console.error('[PDF Import] Could not parse technical PDF:', parseError.message);
      return res.status(422).json({
        error: 'Could not read this technical PDF. Please export it again or upload a valid, non-password-protected PDF.',
        details: parseError.message,
      });
    } finally {
      try { await parser.destroy(); } catch (_) { /* parser may not have fully initialized */ }
    }
    let divisionNames = DEFAULT_DIVISION_TYPES;
    const warnings = [];
    try {
      const [activeDivisionTypes] = await db.execute(
        'SELECT name FROM division_types WHERE is_active=1 ORDER BY sort_order,name'
      );
      if (activeDivisionTypes.length) divisionNames = activeDivisionTypes.map(row => row.name);
    } catch (divisionError) {
      console.error('[PDF Import] Division lookup failed; using defaults:', divisionError.message);
      warnings.push('Custom division types could not be loaded; default divisions were used.');
    }
    const panels = parsePdfText(result.text || '', divisionNames);
    const quoteMatch = result.text.match(/Quote\s*#\s*:?\s*([A-Za-z0-9._\-/]+)/i);
    const projectMatch = result.text.match(/Project\s*:?\s*([^\n\r]+)/i);
    const paymentMatch = result.text.match(/Payment\s*:?\s*([^\n\r]+)/i);

    // Collect all items across all panels/divisions
    const allItems = [];
    for (const panel of panels) {
      for (const div of panel.divisions || []) {
        for (const item of div.items || []) {
          // Preserve ownership before matching. The old flat response lost both
          // panel and division, so the client duplicated every item into every
          // panel and defaulted most imports to INCOMING.
          allItems.push({ ...item, panel_number: panel.panel_number, division_type: div.division_type });
        }
      }
    }

    // Match items to DB products
    let matched = [];
    let unmatched = [];
    try {
      ({ matched, unmatched } = await matchItems(allItems, req.worker));
    } catch (matchError) {
      // A product/group lookup should never discard a successfully parsed PDF.
      // Let the user review those rows as manual/unmatched items instead.
      console.error('[PDF Import] Product matching failed; returning unmatched items:', matchError.message);
      unmatched = allItems;
      warnings.push('Automatic product matching was unavailable. Review the imported items before creating the project.');
    }

    res.json({
      panels: panels.map(p => ({ panel_number: p.panel_number, panel_name: p.panel_name, quantity: p.quantity || 1 })),
      metadata: { quote_number: quoteMatch?.[1]?.trim() || '', project_name: projectMatch?.[1]?.trim() || '', payment_terms: paymentMatch?.[1]?.trim() || '' },
      matched,
      unmatched,
      total_items: allItems.length,
      warnings,
    });
  } catch (err) {
    console.error('[PDF Import] Preview failed:', err.message, err.stack);
    // This endpoint is used locally by authenticated staff. Returning the
    // stage error makes malformed vendor PDFs diagnosable instead of hiding it
    // behind the application's generic 500 response.
    res.status(500).json({ error: `PDF preview failed: ${err.message}` });
  }
}

// ── Step 2: Confirm and create project ──

async function createFromImport(req, res, next) {
  let conn;
  let committed = false;
  try {
    const { project_name, quote_number, engineer_id, client_id, exchange_rate_eur_usd, deadline, panels, matched_items, unmatched_items, total_panels,
      vat_pct, project_discount_pct, margin_warning_pct, payment_terms, client_pdf_note } = req.body;

    if (!project_name) return res.status(400).json({ error: 'project_name required' });
    if (!panels?.length) return res.status(400).json({ error: 'No panel data provided' });

    // Auto-assign engineer to themselves
    const assignedEngineer = req.worker.role === 'engineer' ? req.worker.id : (engineer_id || null);

    conn = await db.getConnection();
    await conn.beginTransaction();

    // 1. Create the project
    const [projResult] = await conn.execute(
      `INSERT INTO projects(project_name,engineer_id,client_id,exchange_rate_eur_usd,deadline,total_panels,vat_pct,project_discount_pct,margin_warning_pct,payment_terms,client_pdf_note,project_stage)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,'design')`,
      [project_name, assignedEngineer, client_id||null, exchange_rate_eur_usd||1.18, deadline||null, total_panels||panels.length,
       parseFloat(vat_pct)||0,parseFloat(project_discount_pct)||0,parseFloat(margin_warning_pct)||10,payment_terms||null,client_pdf_note||null]
    );
    const projectId = projResult.insertId;
    const finalQuoteNumber = quote_number?.trim() || `Q-${String(projectId).padStart(6,'0')}`;
    await conn.execute('UPDATE projects SET quote_number=? WHERE id=?',[finalQuoteNumber,projectId]);

    // Collect all items from matched + unmatched to use as fallback
    const allFlatItems = [...(matched_items || []), ...(unmatched_items || [])];

    // 2. Create panel rows, divisions, items
    for (let pi = 0; pi < panels.length; pi++) {
      const p = panels[pi];
      const [panelResult] = await conn.execute(
        'INSERT INTO project_crm_panels(project_id,panel_number,panel_name,quantity) VALUES(?,?,?,?)',
        [projectId, p.panel_number || (pi + 1), p.panel_name||null, Math.max(1,parseInt(p.quantity)||1)]
      );
      const panelId = panelResult.insertId;

      // Get divisions for this panel
      let panelDivs = p.divisions || [];
      // If no divisions from parsing, create one default division
      if (!panelDivs.length) {
        panelDivs = [{ division_type: 'INCOMING', items: allFlatItems }];
      }

      for (const div of panelDivs) {
        const [divResult] = await conn.execute(
          'INSERT INTO panel_divisions(panel_id,division_type) VALUES(?,?)',
          [panelId, div.division_type || 'INCOMING']
        );
        const divisionId = divResult.insertId;

        // If this division has no items, use flat items as fallback (only for first panel)
        let divItems = div.items || [];
        if (!divItems.length && pi === 0) {
          divItems = allFlatItems;
        }

        for (const item of divItems) {
          if (item._skip) continue;

          // Expand a matched reusable group into a placed instance plus all of
          // its template items. A group template is not itself billable; its
          // panel_crm_items are what drive pricing, exports, and reservations.
          if (item.item_group_id) {
            const groupQty = Math.max(1, parseInt(item.qty) || 1);
            const [instanceResult] = await conn.execute(
              'INSERT INTO division_item_group_instances(division_id,item_group_id,quantity,description) VALUES(?,?,?,?)',
              [divisionId, item.item_group_id, groupQty, item.group_description || null]
            );
            const instanceId = instanceResult.insertId;
            const [templateItems] = await conn.execute(
              `SELECT gi.*, COALESCE(gi.price_usd,p.price_usd,0) AS effective_usd,
                      COALESCE(gi.price_euro,p.price_euro,0) AS effective_euro,
                      COALESCE((
                        SELECT pd.discount_pct FROM product_discounts pd
                        WHERE pd.product_id=gi.product_id
                           OR (pd.product_id IS NULL AND pd.brand_id=p.brand_id)
                        ORDER BY (pd.product_id IS NOT NULL) DESC LIMIT 1
                      ),0) AS discount_pct
               FROM item_group_items gi
               LEFT JOIN products p ON p.id=gi.product_id
               WHERE gi.group_id=? ORDER BY gi.id`,
              [item.item_group_id]
            );
            const rate = parseFloat(exchange_rate_eur_usd) || 1.18;
            for (const template of templateItems) {
              let usd = parseFloat(template.effective_usd) || 0;
              let eur = parseFloat(template.effective_euro) || 0;
              if (!usd && eur) usd = eur * rate;
              if (!eur && usd) eur = usd / rate;
              const itemQty = Math.max(1, parseInt(template.qty) || 1) * groupQty;
              const markupP = parseFloat(item.markupP_pct) || 0;
              const manpower = parseFloat(item.manpower_pct) || 0;
              const markupM = parseFloat(item.markupM_pct) || 0;
              const discount = parseFloat(template.discount_pct) || 0;
              const pricing = calcItemPricing({ base_price_usd: usd, qty: itemQty, markupP_pct: markupP, discount_pct: discount, manpower_pct: manpower, markupM_pct: markupM });
              await conn.execute(
                `INSERT INTO panel_crm_items(
                  division_id,product_id,is_manual,custom_name,custom_desc,
                  base_price_usd,base_price_euro,qty,markupP_pct,discount_pct,manpower_pct,markupM_pct,
                  markupP_amt,discount_amt,totalpriceT,manpower_amt,markupM_amt,totalfinalProduct,
                  cost,cr_amount,override_markup,visible_in_client_pdf,source_group_instance_id
                ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,1,?)`,
                [divisionId, template.product_id || null, template.is_manual ? 1 : 0,
                 template.custom_name || null, template.description || null,
                 usd, eur, itemQty, markupP, discount, manpower, markupM,
                 pricing.markupP_amt, pricing.discount_amt, pricing.totalpriceT,
                 pricing.manpower_amt, pricing.markupM_amt, pricing.totalfinalProduct,
                 0, 0, instanceId]
              );
            }
            continue;
          }

          let basePriceUsd = parseFloat(item.base_price_usd) || 0;
          let basePriceEur = parseFloat(item.base_price_euro) || 0;
          const rate = parseFloat(exchange_rate_eur_usd) || 1.18;
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
            const [mp] = await conn.execute(
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

          await conn.execute(
            `INSERT INTO panel_crm_items(division_id,product_id,manual_product_id,is_manual,
              custom_name,custom_desc,custom_price_usd,custom_price_euro,
              qty,base_price_usd,base_price_euro,markupP_pct,discount_pct,manpower_pct,markupM_pct,
              markupP_amt,discount_amt,totalpriceT,manpower_amt,markupM_amt,totalfinalProduct,cost,cr_amount,override_markup)
             VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0)`,
            [divisionId, productId, manualProductId, isManual,
             isManual ? item.name : null, isManual ? `Imported from PDF` : null,
             isManual ? basePriceUsd : null, isManual ? basePriceEur : null,
             qty, basePriceUsd, basePriceEur,
             markupP_pct, discount, manpower_pct, markupM_pct,
             pricing.markupP_amt, pricing.discount_amt, pricing.totalpriceT,
             pricing.manpower_amt, pricing.markupM_amt, pricing.totalfinalProduct, 0, 0]
          );
        }

      }
    }

    await conn.commit();
    committed = true;

    // Recalculate after commit so the pool-based helpers can see all rows.
    const [createdPanels] = await db.execute('SELECT id FROM project_crm_panels WHERE project_id=?', [projectId]);
    for (const panel of createdPanels) await recalcPanelTotals(panel.id);

    // 3. Recalc reserved quantities
    await recalcReservedQty();

    res.status(201).json({ message: 'Project created from PDF', project_id: projectId, quote_number: finalQuoteNumber, project_stage: 'design' });
  } catch (err) {
    if (conn && !committed) await conn.rollback();
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Quotation number already belongs to another project' });
    next(err);
  } finally {
    if (conn) conn.release();
  }
}

module.exports = { previewImport, createFromImport, parsePdfText };
