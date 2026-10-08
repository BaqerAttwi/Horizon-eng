CREATE TABLE IF NOT EXISTS project_review_history (
 id BIGINT AUTO_INCREMENT PRIMARY KEY, project_id INT NOT NULL, action VARCHAR(32) NOT NULL,
 status VARCHAR(32) NOT NULL, note TEXT NULL, performed_by INT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 legacy_activity_id INT NULL UNIQUE, INDEX idx_review_project(project_id,id)
);
CREATE TABLE IF NOT EXISTS email_deliveries (
 id BIGINT AUTO_INCREMENT PRIMARY KEY, user_id INT NULL, project_id INT NULL, recipient VARCHAR(255) NOT NULL,
 subject VARCHAR(255) NOT NULL, text_body TEXT NOT NULL, html_body MEDIUMTEXT NOT NULL,
 status ENUM('queued','sending','accepted','failed') NOT NULL DEFAULT 'queued', attempts INT NOT NULL DEFAULT 0,
 provider_id VARCHAR(255) NULL, last_error TEXT NULL, next_attempt_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, sent_at DATETIME NULL, INDEX idx_email_queue(status,next_attempt_at)
);

INSERT IGNORE INTO project_review_history(project_id,action,status,note,performed_by,created_at,legacy_activity_id)
 SELECT project_id,IF(action='ready_for_review','submitted','decision'),IF(action='ready_for_review','pending',SUBSTRING_INDEX(new_value,': ',1)),
 new_value,performed_by,created_at,id FROM activity_logs WHERE project_id IS NOT NULL AND action IN ('ready_for_review','admin_approval');
