-- Upgrade for the horizonlb schema exported on 2026-09-30.
-- Run against the chosen database with: mysql -u root horizonlb < this-file.sql
-- Back up and rehearse first. DDL implicitly commits; ROLLBACK cannot undo it.
-- Additive and rerunnable: no drops, deletes, truncation, seeds or existing-value updates.
-- Existing rows remain active (deleted_at=NULL). Their new updated_at starts at migration time.
SET SESSION lock_wait_timeout = 30;
SET @migration_db = DATABASE();

SET @migration_sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@migration_db AND TABLE_NAME='clients' AND COLUMN_NAME='updated_at')=0,
  'ALTER TABLE clients ADD COLUMN updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at',
  'SELECT ''clients.updated_at already exists'' AS migration_status');
PREPARE migration_stmt FROM @migration_sql;
EXECUTE migration_stmt;
DEALLOCATE PREPARE migration_stmt;

SET @migration_sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@migration_db AND TABLE_NAME='clients' AND COLUMN_NAME='deleted_at')=0,
  'ALTER TABLE clients ADD COLUMN deleted_at TIMESTAMP NULL DEFAULT NULL AFTER updated_at',
  'SELECT ''clients.deleted_at already exists'' AS migration_status');
PREPARE migration_stmt FROM @migration_sql;
EXECUTE migration_stmt;
DEALLOCATE PREPARE migration_stmt;

SET @migration_sql = IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@migration_db AND TABLE_NAME='clients' AND INDEX_NAME='idx_clients_deleted_at')=0,
  'ALTER TABLE clients ADD INDEX idx_clients_deleted_at (deleted_at)',
  'SELECT ''idx_clients_deleted_at already exists'' AS migration_status');
PREPARE migration_stmt FROM @migration_sql;
EXECUTE migration_stmt;
DEALLOCATE PREPARE migration_stmt;

SET @migration_sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@migration_db AND TABLE_NAME='product_discounts' AND COLUMN_NAME='updated_at')=0,
  'ALTER TABLE product_discounts ADD COLUMN updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at',
  'SELECT ''product_discounts.updated_at already exists'' AS migration_status');
PREPARE migration_stmt FROM @migration_sql;
EXECUTE migration_stmt;
DEALLOCATE PREPARE migration_stmt;

SET @migration_sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@migration_db AND TABLE_NAME='product_discounts' AND COLUMN_NAME='deleted_at')=0,
  'ALTER TABLE product_discounts ADD COLUMN deleted_at TIMESTAMP NULL DEFAULT NULL AFTER updated_at',
  'SELECT ''product_discounts.deleted_at already exists'' AS migration_status');
PREPARE migration_stmt FROM @migration_sql;
EXECUTE migration_stmt;
DEALLOCATE PREPARE migration_stmt;

SET @migration_sql = IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@migration_db AND TABLE_NAME='product_discounts' AND INDEX_NAME='idx_product_discounts_deleted_at')=0,
  'ALTER TABLE product_discounts ADD INDEX idx_product_discounts_deleted_at (deleted_at)',
  'SELECT ''idx_product_discounts_deleted_at already exists'' AS migration_status');
PREPARE migration_stmt FROM @migration_sql;
EXECUTE migration_stmt;
DEALLOCATE PREPARE migration_stmt;

SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, EXTRA
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA=@migration_db AND TABLE_NAME IN ('clients','product_discounts')
  AND COLUMN_NAME IN ('updated_at','deleted_at')
ORDER BY TABLE_NAME, COLUMN_NAME;
SELECT TABLE_NAME, INDEX_NAME, COLUMN_NAME
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA=@migration_db AND INDEX_NAME IN ('idx_clients_deleted_at','idx_product_discounts_deleted_at')
ORDER BY TABLE_NAME, INDEX_NAME;
