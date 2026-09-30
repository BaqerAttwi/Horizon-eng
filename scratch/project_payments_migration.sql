-- Project payments (installments) — safe to run on any database.

CREATE TABLE IF NOT EXISTS project_payments (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  project_id    INT NOT NULL,
  amount        DECIMAL(14,2) NOT NULL,
  payment_date  DATE NOT NULL,
  method        VARCHAR(100) DEFAULT NULL,
  notes         TEXT DEFAULT NULL,
  recorded_by   INT DEFAULT NULL,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (recorded_by) REFERENCES workers(id) ON DELETE SET NULL
);
