-- Attachments become link-based — safe to run on any database.

SET @exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='attachments' AND COLUMN_NAME='link_url');
SET @sql = IF(@exists=0, 'ALTER TABLE attachments ADD COLUMN link_url VARCHAR(1000) DEFAULT NULL AFTER onedrive_web_url', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

ALTER TABLE attachments MODIFY COLUMN storage ENUM('local','onedrive','link') NOT NULL DEFAULT 'link';
ALTER TABLE attachments MODIFY COLUMN stored_name VARCHAR(255) NULL;
