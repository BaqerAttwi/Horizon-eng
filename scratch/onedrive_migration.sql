-- OneDrive attachments migration — safe to run on any database, does
-- nothing if already applied.

SET @exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='attachments' AND COLUMN_NAME='storage');
SET @sql = IF(@exists=0, "ALTER TABLE attachments ADD COLUMN storage ENUM('local','onedrive') NOT NULL DEFAULT 'local' AFTER mime_type, ADD COLUMN onedrive_item_id VARCHAR(255) DEFAULT NULL AFTER storage, ADD COLUMN onedrive_web_url VARCHAR(500) DEFAULT NULL AFTER onedrive_item_id", 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS oauth_tokens (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  provider       VARCHAR(50) NOT NULL,
  account_email  VARCHAR(255) DEFAULT NULL,
  refresh_token  TEXT NOT NULL,
  access_token   TEXT DEFAULT NULL,
  expires_at     DATETIME DEFAULT NULL,
  connected_by   INT DEFAULT NULL,
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (connected_by) REFERENCES workers(id) ON DELETE SET NULL,
  UNIQUE KEY uq_provider (provider)
);
