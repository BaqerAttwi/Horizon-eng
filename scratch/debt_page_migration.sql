-- Debt page (payment deadline field) — safe to run on any database.

SET @exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='projects' AND COLUMN_NAME='payment_deadline');
SET @sql = IF(@exists=0, 'ALTER TABLE projects ADD COLUMN payment_deadline DATE DEFAULT NULL AFTER onedrive_folder_link', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
