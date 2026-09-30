-- OneDrive manual-link fields (panel + project) — safe to run on any
-- database, does nothing if already applied.

SET @exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='project_crm_panels' AND COLUMN_NAME='onedrive_link');
SET @sql = IF(@exists=0, 'ALTER TABLE project_crm_panels ADD COLUMN onedrive_link VARCHAR(500) DEFAULT NULL AFTER show_note_in_client_pdf', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='projects' AND COLUMN_NAME='onedrive_folder_link');
SET @sql = IF(@exists=0, 'ALTER TABLE projects ADD COLUMN onedrive_folder_link VARCHAR(500) DEFAULT NULL AFTER client_pdf_note', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
