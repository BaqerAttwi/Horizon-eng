
-- Editable version advances after each rejection; saved revisions stay immutable.
SET @exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='projects' AND COLUMN_NAME='current_version');
SET @sql = IF(@exists=0, 'ALTER TABLE projects ADD COLUMN current_version INT NOT NULL DEFAULT 1', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
