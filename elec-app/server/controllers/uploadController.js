const XLSX = require('xlsx');
const db   = require('../db/connection');

// ─── helpers ─────────────────────────────────────────────────────────────────

/**
 * readCell — reads one cell by col/row index (0-based).
 * Returns null for error cells (#N/A) and missing cells.
 * Prevents #N/A in Euro column from corrupting USD column.
 */
function readCell(ws, col, row) {
  const addr = XLSX.utils.encode_cell({ c: col, r: row });
  const cell = ws[addr];
  if (!cell || cell.t === 'e' || cell.t === 'z') return null;
  return cell.v !== undefined ? cell.v : null;
}

/**
 * parsePrice — converts any cell value to float or null.
 * Handles: 919.013, 20, '$269.28', '#N/A', null, '', objects
 */
function parsePrice(val) {
  if (val === null || val === undefined)  return null;
  if (typeof val === 'object')            return null;
  if (typeof val === 'number')            return isNaN(val) ? null : val;
  const str = String(val).replace(/[$,\s]/g, '').trim();
  if (!str || str.startsWith('#'))        return null;
  if (/^n\/a$/i.test(str))               return null;
  const num = parseFloat(str);
  return isNaN(num) ? null : num;
}

// ─── controller ──────────────────────────────────────────────────────────────

/**
 * POST /api/upload
 *
 * PERFORMANCE FIX: Instead of one DB query per row (11,000 queries!),
 * we now:
 *   1. Parse ALL rows into memory first
 *   2. Batch INSERT brands in one query
 *   3. Batch INSERT/UPDATE products in chunks of 500 rows
 *
 * This reduces 11,000+ queries down to ~25 queries total.
 * Import time: was 2-5 minutes → now 3-8 seconds.
 */
async function handleUpload(req, res, next) {
  try {
    if (!req.file) {
      console.log('[Upload] ❌ No file in request');
      return res.status(400).json({ error: 'No file uploaded' });
    }

    console.log('[Upload] 📂 File received:', req.file.originalname, '—', req.file.size, 'bytes');
    const startTime = Date.now();

    // ── 1. Parse workbook ────────────────────────────────────────────────────
    const workbook = XLSX.read(req.file.buffer, {
      type:        'buffer',
      cellFormula: false,
      cellNF:      false,
      cellDates:   false,
      sheetStubs:  true,
    });

    console.log('[Excel] Sheet names:', workbook.SheetNames);

    const sheetName = workbook.SheetNames.find(s => s.trim().toUpperCase() === 'PL');
    if (!sheetName) {
      return res.status(400).json({
        error: `Sheet "PL" not found. File has: ${workbook.SheetNames.join(', ')}`,
      });
    }

    const ws      = workbook.Sheets[sheetName];
    const range   = XLSX.utils.decode_range(ws['!ref']);
    const lastRow = range.e.r;

    console.log('[Excel] ✅ Sheet:', sheetName, '| Rows:', lastRow);
    console.log('[Excel] Headers:', {
      A: readCell(ws,0,0), B: readCell(ws,1,0), C: readCell(ws,2,0),
      D: readCell(ws,3,0), E: readCell(ws,4,0), F: readCell(ws,5,0),
      G: readCell(ws,6,0),
    });

    // ── 2. Parse ALL rows into memory ────────────────────────────────────────
    console.log('[Import] Parsing all rows into memory...');
    const validRows = [];
    const brandNames = new Set();
    let skipped = 0;

    for (let rowIdx = 1; rowIdx <= lastRow; rowIdx++) {
      const rawRef   = readCell(ws, 0, rowIdx);
      const reference = rawRef != null ? String(rawRef).trim() : '';

      // Skip blank rows
      if (!reference) { skipped++; continue; }

      const rawDesc  = readCell(ws, 1, rowIdx);
      const rawEuro  = readCell(ws, 2, rowIdx);
      const rawUsd   = readCell(ws, 3, rowIdx);
      const rawBrand = readCell(ws, 4, rowIdx);
      const rawSmart = readCell(ws, 5, rowIdx);
      const rawCost  = readCell(ws, 6, rowIdx);

      const brandName = rawBrand != null ? String(rawBrand).trim() : '';
      if (brandName) brandNames.add(brandName);

      validRows.push({
        reference,
        description: rawDesc  != null ? String(rawDesc).trim()  : null,
        brandName:   brandName || null,
        priceEuro:   parsePrice(rawEuro),
        priceUsd:    parsePrice(rawUsd),
        smartCode:   rawSmart != null ? String(rawSmart).trim() : null,
        priceCost:   parsePrice(rawCost),
      });
    }

    console.log(`[Import] Parsed ${validRows.length} valid rows, ${skipped} skipped, ${brandNames.size} unique brands`);
    // Sample log — first 3 valid rows
    validRows.slice(0, 3).forEach((r, i) =>
      console.log(`[Import] Sample row ${i+1}: ref="${r.reference}" euro=${r.priceEuro} usd=${r.priceUsd} brand="${r.brandName}" cost=${r.priceCost}`)
    );

    // ── 3. Batch upsert brands ────────────────────────────────────────────────
    // One query to get existing brands, one INSERT IGNORE for new ones
    console.log('[Brands] Upserting', brandNames.size, 'brands...');

    if (brandNames.size > 0) {
      const brandArr = [...brandNames];
      // INSERT IGNORE — skips if brand already exists (no error)
      const brandPlaceholders = brandArr.map(() => '(?)').join(',');
      await db.execute(
        `INSERT IGNORE INTO brands(name) VALUES ${brandPlaceholders}`,
        brandArr
      );
    }

    // Load all brands into a map: { 'SCHNEIDER NW': 1, 'EATON': 3, ... }
    const [allBrands] = await db.execute('SELECT id, name FROM brands');
    const brandMap = {};
    allBrands.forEach(b => { brandMap[b.name] = b.id; });
    console.log('[Brands] ✅ Brand map loaded:', Object.keys(brandMap).length, 'brands');

    // ── 4. Batch upsert products in chunks of 500 ────────────────────────────
    // MySQL has a limit on how many rows you can INSERT at once
    const CHUNK_SIZE = 500;
    let inserted = 0, updated = 0;
    const errors = [];

    for (let i = 0; i < validRows.length; i += CHUNK_SIZE) {
      const chunk = validRows.slice(i, i + CHUNK_SIZE);
      const chunkNum = Math.floor(i / CHUNK_SIZE) + 1;
      const totalChunks = Math.ceil(validRows.length / CHUNK_SIZE);

      console.log(`[Import] Chunk ${chunkNum}/${totalChunks} — rows ${i+1} to ${i+chunk.length}`);

      // Build multi-row INSERT
      const placeholders = chunk.map(() => '(?,?,?,?,?,?,?)').join(',');
      const values = [];
      chunk.forEach(row => {
        const brandId = row.brandName ? (brandMap[row.brandName] ?? null) : null;
        values.push(
          brandId,
          row.reference,
          row.description || null,
          row.priceEuro,
          row.priceUsd,
          row.smartCode || null,
          row.priceCost,
        );
      });

      try {
        const [result] = await db.execute(
          `INSERT INTO products (brand_id, reference, description, price_euro, price_usd, smart_code, price_cost)
           VALUES ${placeholders}
           ON DUPLICATE KEY UPDATE
             description  = VALUES(description),
             price_euro   = VALUES(price_euro),
             price_usd    = VALUES(price_usd),
             smart_code   = VALUES(smart_code),
             brand_id     = VALUES(brand_id),
             price_cost   = VALUES(price_cost),
             updated_at   = CURRENT_TIMESTAMP`,
          values
        );

        // affectedRows: 1 per insert, 2 per update, 0 if unchanged
        // inserted = rows where affectedRows counted as 1
        // MySQL returns: affectedRows = inserts + (2 × updates)
        const chunkInserted = result.affectedRows - (result.affectedRows - chunk.length > 0
          ? result.affectedRows - chunk.length : 0);

        // Simpler: count via changedRows
        const chunkUpdated  = result.changedRows || 0;
        const chunkInserted2 = (result.affectedRows - chunkUpdated * 2);

        inserted += Math.max(0, chunkInserted2);
        updated  += chunkUpdated;

        console.log(`[Import] Chunk ${chunkNum} done — affectedRows:${result.affectedRows} changedRows:${result.changedRows}`);

      } catch (dbErr) {
        console.error(`[Import] ❌ Chunk ${chunkNum} failed:`, dbErr.message);
        // Fall back to row-by-row for this chunk to find which rows error
        for (const row of chunk) {
          const brandId = row.brandName ? (brandMap[row.brandName] ?? null) : null;
            try {
              const [r] = await db.execute(
                `INSERT INTO products (brand_id,reference,description,price_euro,price_usd,smart_code,price_cost)
                 VALUES (?,?,?,?,?,?,?)
                 ON DUPLICATE KEY UPDATE
                   description=VALUES(description), price_euro=VALUES(price_euro),
                   price_usd=VALUES(price_usd), smart_code=VALUES(smart_code),
                   brand_id=VALUES(brand_id), price_cost=VALUES(price_cost),
                   updated_at=CURRENT_TIMESTAMP`,
                [brandId, row.reference, row.description||null, row.priceEuro, row.priceUsd, row.smartCode||null, row.priceCost]
              );
            if (r.affectedRows === 1) inserted++; else updated++;
          } catch (rowErr) {
            console.error(`[Import] ❌ Row ref="${row.reference}":`, rowErr.message);
            errors.push({ reference: row.reference, error: rowErr.message });
          }
        }
      }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(
      `[Import] ✅ Done in ${elapsed}s` +
      ` | inserted:${inserted} updated:${updated}` +
      ` | skipped:${skipped} errors:${errors.length}` +
      ` | total rows:${lastRow}`
    );

    return res.json({ inserted, updated, skipped, errors, total: lastRow, elapsed });

  } catch (err) {
    console.error('[Upload] 💥 Fatal:', err.message, err.stack);
    next(err);
  }
}

module.exports = { handleUpload };
