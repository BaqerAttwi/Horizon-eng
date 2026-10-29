// Snapshot catalog labels for every writer, including imports and item groups.
// Prices already live on panel_crm_items and must never follow catalog edits.
async function ensureProjectItemSnapshots(db) {
  const [sourceColumns] = await db.execute("SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='projects' AND COLUMN_NAME='import_source'");
  if (!sourceColumns.length) await db.query("ALTER TABLE projects ADD COLUMN import_source VARCHAR(30) NOT NULL DEFAULT 'current'");
  const [columns] = await db.execute("SELECT COLUMN_NAME,NUMERIC_SCALE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='panel_crm_items' AND COLUMN_NAME IN ('markupP_pct','markupM_pct','manpower_pct')");
  for (const column of columns) {
    if (Number(column.NUMERIC_SCALE) < 10) await db.query(`ALTER TABLE panel_crm_items MODIFY COLUMN \`${column.COLUMN_NAME}\` DECIMAL(15,10) DEFAULT 0`);
  }
  await db.execute(`UPDATE panel_crm_items i JOIN products p ON p.id=i.product_id
    LEFT JOIN brands b ON b.id=p.brand_id
    SET i.custom_name=COALESCE(i.custom_name,p.reference),
        i.custom_desc=COALESCE(i.custom_desc,p.description),
        i.custom_brand=COALESCE(i.custom_brand,b.name)`);
  const [triggers] = await db.execute('SELECT TRIGGER_NAME FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE()');
  const names = new Set(triggers.map(t=>t.TRIGGER_NAME));
  for (const [name,event,condition] of [
    ['crm_snapshot_insert','INSERT','NEW.product_id IS NOT NULL'],
    ['crm_snapshot_replace','UPDATE','NEW.product_id IS NOT NULL AND NOT (NEW.product_id <=> OLD.product_id)'],
  ]) {
    if (names.has(name)) continue;
    await db.query(`CREATE TRIGGER ${name} BEFORE ${event} ON panel_crm_items FOR EACH ROW
      BEGIN
        IF ${condition} THEN
          SET NEW.custom_name=(SELECT reference FROM products WHERE id=NEW.product_id);
          SET NEW.custom_desc=(SELECT description FROM products WHERE id=NEW.product_id);
          SET NEW.custom_brand=(SELECT b.name FROM products p LEFT JOIN brands b ON b.id=p.brand_id WHERE p.id=NEW.product_id);
        END IF;
      END`);
  }
}
module.exports = { ensureProjectItemSnapshots };
