const fs = require('fs');
const path = require('path');
const db = require('../db/connection');

const CSV_PATH = process.argv[2] || 'C:\\Users\\BaQer.-.AtTwi\\Downloads\\products_2026-06-03.csv';
const DEFAULT_QTY = 10;

function parseCsv(text) {
  const lines = [];
  let current = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else { inQuotes = false; }
      } else { field += ch; }
    } else if (ch === '"') { inQuotes = true; }
    else if (ch === ',') { current.push(field); field = ''; }
    else if (ch === '\n') { current.push(field); field = ''; if (current.length) { lines.push(current); } current = []; }
    else if (ch === '\r') { /* skip */ }
    else { field += ch; }
  }
  if (field || current.length) { current.push(field); lines.push(current); }
  return lines;
}

async function main() {
  console.log(`[Import] Reading: ${CSV_PATH}`);
  const raw = fs.readFileSync(CSV_PATH, 'utf8');
  const rows = parseCsv(raw);
  const header = rows[0];
  const data = rows.slice(1).filter(r => r.length >= 2 && r[1]?.trim());

  console.log(`[Import] ${data.length} product rows to process`);

  const idx = {};
  header.forEach((h, i) => {
    const key = h.trim().toLowerCase().replace(/\s+/g, '_');
    idx[key] = i;
  });

  const refCol = idx['reference'];
  const descCol = idx['description'];
  const smartCodeCol = idx['smart_code'];
  const brandCol = idx['brand'];
  const stockQtyCol = idx['stock_qty'] ?? idx['stock_qty'];

  let updated = 0, inserted = 0, skipped = 0, errors = 0;

  // Batch: process in chunks to avoid overwhelming the DB
  const BATCH = 500;
  for (let start = 0; start < data.length; start += BATCH) {
    const batch = data.slice(start, start + BATCH);
    for (const row of batch) {
      try {
        const ref = (row[refCol] || '').trim();
        if (!ref) { skipped++; continue; }

        const description = (row[descCol] || '').trim();
        const smartCode = (row[smartCodeCol] || '').trim();
        const brandName = (row[brandCol] || '').trim();
        const csvStockQty = parseInt(row[stockQtyCol]) || 0;

        // Check if product exists by reference
        const [existing] = await db.execute('SELECT id, smart_code, stock_qty FROM products WHERE reference = ?', [ref]);

        if (existing.length) {
          const prod = existing[0];
          const updates = [];
          const params = [];

          // Set Smart Code to Reference if empty
          if (!prod.smart_code && ref) {
            updates.push('smart_code = ?');
            params.push(ref);
          }

          // Set stock qty if currently 0
          if (prod.stock_qty === 0 && DEFAULT_QTY > 0) {
            updates.push('stock_qty = ?');
            params.push(DEFAULT_QTY);
          }

          if (updates.length) {
            params.push(prod.id);
            await db.execute(`UPDATE products SET ${updates.join(', ')} WHERE id = ?`, params);
            updated++;
          } else {
            skipped++;
          }
        } else {
          // Insert new product
          let brandId = null;
          if (brandName) {
            const [brands] = await db.execute('SELECT id FROM brands WHERE name = ?', [brandName]);
            if (brands.length) brandId = brands[0].id;
          }

          await db.execute(
            `INSERT INTO products (reference, description, smart_code, stock_qty, reserved_qty, brand_id)
             VALUES (?, ?, ?, ?, 0, ?)`,
            [ref, description, smartCode || ref, csvStockQty || DEFAULT_QTY, brandId]
          );
          inserted++;
        }
      } catch (err) {
        console.error(`[Import] ❌ Error on row: ${row[refCol] || '??'} — ${err.message}`);
        errors++;
      }
    }
    console.log(`[Import] Progress: ${Math.min(start + BATCH, data.length)}/${data.length} (updated:${updated} inserted:${inserted} skipped:${skipped} errors:${errors})`);
  }

  console.log(`\n[Import] ✅ Complete!
    Total rows: ${data.length}
    Updated:    ${updated}
    Inserted:   ${inserted}
    Skipped:    ${skipped}
    Errors:     ${errors}`);
  process.exit(0);
}

main().catch(err => {
  console.error('[Import] 💥 Fatal:', err.message);
  process.exit(1);
});
