CREATE TABLE IF NOT EXISTS project_manual_procurement_receipts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  project_id INT NOT NULL,
  item_id INT NOT NULL,
  received_qty INT NOT NULL DEFAULT 0,
  updated_by INT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY(item_id) REFERENCES panel_crm_items(id) ON DELETE CASCADE,
  FOREIGN KEY(updated_by) REFERENCES workers(id) ON DELETE SET NULL,
  UNIQUE KEY uq_manual_procurement_item(project_id,item_id)
);
