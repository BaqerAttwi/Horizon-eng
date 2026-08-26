-- ============================================================
--  ELECTRIC ENG CO — DATABASE SCHEMA v2
-- ============================================================
-- Run this against whichever database you intend to target, e.g.:
--   mysql -u <user> -p <db_name> < schema.sql
-- Deliberately no CREATE DATABASE/USE here — hardcoding a database name
-- silently overrides whatever DB the caller pointed the import at.

-- ── Workers (employees + login) ──────────────────────────────
CREATE TABLE IF NOT EXISTS workers (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  name         VARCHAR(200) NOT NULL,
  email        VARCHAR(150),
  phone        VARCHAR(50),
  role         ENUM('owner','head_engineer','stock_manager','accounting','engineer','secretary','technician') NOT NULL,
  password_hash VARCHAR(255) NOT NULL DEFAULT '',
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ── Brands ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS brands (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(100) NOT NULL UNIQUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ── Products ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS products (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  brand_id     INT,
  reference    VARCHAR(150) NOT NULL,
  description  TEXT,
  price_cost   DECIMAL(14,4) DEFAULT NULL,
  price_euro   DECIMAL(14,4) DEFAULT NULL,
  price_usd    DECIMAL(14,4) DEFAULT NULL,
  smart_code   VARCHAR(100),
  stock_qty    INT DEFAULT 0,
  reserved_qty INT DEFAULT 0,
  min_stock_level INT NOT NULL DEFAULT 0,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE SET NULL,
  UNIQUE KEY uq_ref_brand (reference, brand_id)
);

-- ── Product Reservations (tracks WHO needs WHAT and HOW MUCH) ─
-- Every active project item creates a reservation row here.
-- Multiple projects can reserve same product — visible as conflicts.
CREATE TABLE IF NOT EXISTS product_reservations (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  product_id  INT NOT NULL,
  project_id  INT,                        -- NULL if from a regular order
  order_id    INT,                        -- NULL if from a project
  source_type ENUM('project','order') NOT NULL DEFAULT 'project',
  qty         INT NOT NULL DEFAULT 1,
  reserved_by_name VARCHAR(200),          -- engineer or client name
  status      ENUM('pending','confirmed','released') DEFAULT 'pending',
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

-- ── Clients ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clients (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  type         ENUM('individual','company') NOT NULL DEFAULT 'individual',
  name         VARCHAR(200) NOT NULL,
  tax_id       VARCHAR(100),
  credit_limit DECIMAL(12,2) DEFAULT 0,
  phone        VARCHAR(50),
  email        VARCHAR(150),
  address      TEXT,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ── Orders / Quotes ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orders (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  channel     ENUM('individual','b2b','project') NOT NULL,
  client_id   INT,
  status      ENUM('draft','pending_client','approved','in_progress','delivered','cancelled') DEFAULT 'draft',
  notes       TEXT,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  approved_at TIMESTAMP NULL,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL
);

-- ── Order Items ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS order_items (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  order_id         INT NOT NULL,
  product_id       INT NOT NULL,
  qty_requested    INT NOT NULL DEFAULT 1,
  qty_reserved     INT NOT NULL DEFAULT 0,
  reservation_type ENUM('soft','committed') DEFAULT 'soft',
  reserved_by_type ENUM('individual','company','engineer','other') DEFAULT 'other',
  reserved_by_name VARCHAR(200) DEFAULT '',
  price_snapshot   DECIMAL(14,4),
  price_currency   ENUM('EUR','USD') DEFAULT 'EUR',
  created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id)   REFERENCES orders(id)   ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT
);

-- ── Projects ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS projects (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  project_name    VARCHAR(250) NOT NULL,
  quote_number    VARCHAR(100) DEFAULT NULL,
  project_stage   ENUM('design','quotation','approval','procurement','assembly','testing','delivered') NOT NULL DEFAULT 'design',
  procurement_status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  procurement_note TEXT DEFAULT NULL,
  procurement_reviewed_by INT DEFAULT NULL,
  procurement_reviewed_at DATETIME DEFAULT NULL,
  margin_warning_pct DECIMAL(5,2) NOT NULL DEFAULT 10,
  engineer_id     INT,
  client_id       INT,
  exchange_rate_eur_usd DECIMAL(10,4) DEFAULT 1.1800,
  client_approval ENUM('pending','approved','rejected') DEFAULT 'pending',
  admin_approval  ENUM('pending','approved','rejected') DEFAULT 'pending',
  rejection_note  TEXT,
  client_rejection_note TEXT,
  deadline        DATE,
  total_cost      DECIMAL(14,2) DEFAULT 0,
  total_price     DECIMAL(14,2) DEFAULT 0,
  total_panels    INT DEFAULT 0,
  completed_panels INT DEFAULT 0,
  notes           TEXT,
  client_pdf_note TEXT DEFAULT NULL,
  status          ENUM('draft','active','completed','cancelled') DEFAULT 'draft',
  deleted_at      TIMESTAMP NULL DEFAULT NULL,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (engineer_id) REFERENCES workers(id) ON DELETE SET NULL,
  FOREIGN KEY (client_id)   REFERENCES clients(id) ON DELETE SET NULL,
  FOREIGN KEY (procurement_reviewed_by) REFERENCES workers(id) ON DELETE SET NULL,
  INDEX idx_deleted_at (deleted_at),
  UNIQUE KEY uq_projects_quote_number (quote_number)
);

-- ── Project Items (legacy — old projects) ─────────────────────
CREATE TABLE IF NOT EXISTS project_items (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  project_id     INT NOT NULL,
  product_id     INT NOT NULL,
  qty            INT NOT NULL DEFAULT 1,
  unit_cost      DECIMAL(14,4),
  unit_price     DECIMAL(14,4),
  price_currency ENUM('EUR','USD') DEFAULT 'EUR',
  notes          TEXT,
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT
);

-- ── Discount Lookup Table ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS product_discounts (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  product_id    INT NULL,
  brand_id      INT NULL,
  discount_pct  DECIMAL(5,2) NOT NULL DEFAULT 0,
  notes         TEXT,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  FOREIGN KEY (brand_id)    REFERENCES brands(id) ON DELETE CASCADE,
  CHECK (product_id IS NOT NULL OR brand_id IS NOT NULL)
);

-- ── CRM Panels ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS project_crm_panels (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  project_id     INT NOT NULL,
  panel_number   INT NOT NULL,
  panel_name     VARCHAR(250),
  quantity       INT NOT NULL DEFAULT 1,
  markupP        DECIMAL(5,2) DEFAULT 0,
  markupM        DECIMAL(5,2) DEFAULT 0,
  manpower_pct   DECIMAL(5,2) DEFAULT 0,
  total_price    DECIMAL(14,2) DEFAULT 0,
  is_completed   BOOLEAN DEFAULT FALSE,
  note           TEXT DEFAULT NULL,
  show_note_in_client_pdf BOOLEAN DEFAULT FALSE,
  updated_by     INT DEFAULT NULL,
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (updated_by) REFERENCES workers(id) ON DELETE SET NULL,
  UNIQUE KEY uq_panel_project_num (project_id, panel_number)
);

-- ── Panel Divisions ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS panel_divisions (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  panel_id      INT NOT NULL,
  division_type ENUM('INCOMING','OUTGOING','Enclosure','Accessories','Measurement') NOT NULL,
  markupP       DECIMAL(5,2) DEFAULT 0,
  markupM       DECIMAL(5,2) DEFAULT 0,
  manpower_pct  DECIMAL(5,2) DEFAULT 0,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (panel_id) REFERENCES project_crm_panels(id) ON DELETE CASCADE
);

-- ── Manual Products (project-scoped) ─────────────────────────
CREATE TABLE IF NOT EXISTS panel_manual_products (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  project_id   INT NOT NULL,
  name         VARCHAR(250) NOT NULL,
  description  TEXT,
  price_euro   DECIMAL(14,4),
  price_usd    DECIMAL(14,4),
  brand        VARCHAR(100),
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- ── CRM Items (products within divisions) ────────────────────
CREATE TABLE IF NOT EXISTS panel_crm_items (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  division_id       INT NOT NULL,
  product_id        INT NULL,
  manual_product_id INT NULL,
  is_manual         BOOLEAN DEFAULT FALSE,
  custom_name       VARCHAR(250),
  custom_desc       TEXT,
  custom_brand      VARCHAR(100),
  custom_price_euro DECIMAL(14,4),
  custom_price_usd  DECIMAL(14,4),
  qty               INT DEFAULT 1,
  base_price_usd    DECIMAL(14,4),
  base_price_euro   DECIMAL(14,4),
  markupP_pct       DECIMAL(5,2) DEFAULT 0,
  markupP_amt       DECIMAL(14,4) DEFAULT 0,
  discount_pct      DECIMAL(5,2) DEFAULT 0,
  discount_amt      DECIMAL(14,4) DEFAULT 0,
  totalpriceT       DECIMAL(14,4) DEFAULT 0,
  manpower_pct      DECIMAL(5,2) DEFAULT 0,
  manpower_amt      DECIMAL(14,4) DEFAULT 0,
  markupM_pct       DECIMAL(5,2) DEFAULT 0,
  markupM_amt       DECIMAL(14,4) DEFAULT 0,
  totalfinalProduct DECIMAL(14,4) DEFAULT 0,
  cost              DECIMAL(14,2) DEFAULT 0,
  cr_amount         DECIMAL(14,2) DEFAULT 0,
  override_markup   BOOLEAN DEFAULT FALSE,
  visible_in_client_pdf BOOLEAN DEFAULT TRUE,
  notes             TEXT,
  created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (division_id) REFERENCES panel_divisions(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL,
  FOREIGN KEY (manual_product_id) REFERENCES panel_manual_products(id) ON DELETE SET NULL
);

-- ── Engineer Collaboration Requests ──────────────────────────
CREATE TABLE IF NOT EXISTS project_engineer_requests (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  project_id        INT NOT NULL,
  requested_by      INT NOT NULL,
  target_engineer_id INT NOT NULL,
  status            ENUM('pending','accepted','rejected') DEFAULT 'pending',
  rejection_reason  TEXT,
  created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (requested_by) REFERENCES workers(id) ON DELETE CASCADE,
  FOREIGN KEY (target_engineer_id) REFERENCES workers(id) ON DELETE CASCADE,
  UNIQUE KEY uq_project_engineer (project_id, target_engineer_id)
);

-- ── CRM Price Change Requests (engineer → admin approval) ─────
CREATE TABLE IF NOT EXISTS crm_price_change_requests (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  item_id           INT NOT NULL,
  project_id        INT NOT NULL,
  panel_id          INT NOT NULL,
  division_id       INT NOT NULL,
  old_base_price_usd    DECIMAL(14,4),
  old_base_price_euro   DECIMAL(14,4),
  old_markupP_pct       DECIMAL(5,2),
  old_discount_pct      DECIMAL(5,2),
  old_manpower_pct      DECIMAL(5,2),
  old_markupM_pct       DECIMAL(5,2),
  old_qty               INT,
  new_base_price_usd    DECIMAL(14,4),
  new_base_price_euro   DECIMAL(14,4),
  new_markupP_pct       DECIMAL(5,2),
  new_discount_pct      DECIMAL(5,2),
  new_manpower_pct      DECIMAL(5,2),
  new_markupM_pct       DECIMAL(5,2),
  new_qty               INT,
  requested_by      INT NOT NULL,
  status            ENUM('pending','approved','rejected') DEFAULT 'pending',
  approved_by       INT DEFAULT NULL,
  rejection_reason  TEXT,
  created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (item_id) REFERENCES panel_crm_items(id) ON DELETE CASCADE,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (panel_id) REFERENCES project_crm_panels(id) ON DELETE CASCADE,
  FOREIGN KEY (division_id) REFERENCES panel_divisions(id) ON DELETE CASCADE,
  FOREIGN KEY (requested_by) REFERENCES workers(id) ON DELETE CASCADE,
  FOREIGN KEY (approved_by) REFERENCES workers(id) ON DELETE SET NULL,
  INDEX idx_status (status),
  INDEX idx_project (project_id)
);

-- ── Notifications (in-app alerts for all roles) ──────────────
CREATE TABLE IF NOT EXISTS notifications (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  user_id     INT NOT NULL,
  type        ENUM('deadline','approval','status','request','stock','general','info','manual_product','manual_product_approved','manual_product_rejected') NOT NULL DEFAULT 'general',
  title       VARCHAR(250) NOT NULL,
  message     TEXT,
  link        VARCHAR(250),
  is_read     BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES workers(id) ON DELETE CASCADE,
  INDEX idx_user_read (user_id, is_read),
  INDEX idx_created (created_at)
);

-- ── Item Groups (reusable product sets for quick CRM add) ────
CREATE TABLE IF NOT EXISTS item_groups (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(250) NOT NULL,
  description TEXT DEFAULT NULL,
  created_by  INT NOT NULL,
  is_public   BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES workers(id) ON DELETE CASCADE
);

SET @exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='item_groups' AND COLUMN_NAME='description');
SET @sql = IF(@exists=0, 'ALTER TABLE item_groups ADD COLUMN description TEXT DEFAULT NULL AFTER name', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── Migration: unique automatic/manual quotation number per project ──
SET @exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='projects' AND COLUMN_NAME='quote_number');
SET @sql = IF(@exists=0, 'ALTER TABLE projects ADD COLUMN quote_number VARCHAR(100) DEFAULT NULL AFTER project_name', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
UPDATE projects SET quote_number=CONCAT('Q-', LPAD(id, 6, '0')) WHERE quote_number IS NULL OR quote_number='';
SET @exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='projects' AND INDEX_NAME='uq_projects_quote_number');
SET @sql = IF(@exists=0, 'ALTER TABLE projects ADD UNIQUE KEY uq_projects_quote_number (quote_number)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS item_group_items (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  group_id    INT NOT NULL,
  product_id  INT,
  is_manual   BOOLEAN DEFAULT FALSE,
  custom_name VARCHAR(250),
  description TEXT,
  price_usd   DECIMAL(14,4) DEFAULT NULL,
  price_euro  DECIMAL(14,4) DEFAULT NULL,
  qty         INT DEFAULT 1,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (group_id) REFERENCES item_groups(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
);

-- ── Seed: default owner (password: admin123) ─────────────────
-- NOTE: client_rejection_note and cost are now in CREATE TABLE above.
-- ALTER TABLE panel_crm_items ADD COLUMN visible_in_client_pdf BOOLEAN DEFAULT TRUE AFTER override_markup;
-- Legacy migration ALTERs (already applied in existing DB):
-- ALTER TABLE project_crm_panels ADD COLUMN is_completed BOOLEAN DEFAULT FALSE;
-- ALTER TABLE panel_crm_items ADD COLUMN base_price_euro DECIMAL(14,4) AFTER base_price_usd;
-- ALTER TABLE projects ADD COLUMN client_rejection_note TEXT;
-- ALTER TABLE panel_crm_items ADD COLUMN cost DECIMAL(14,2) DEFAULT 0 AFTER totalfinalProduct;
-- ALTER TABLE panel_crm_items ADD COLUMN cr_amount DECIMAL(14,2) DEFAULT 0 AFTER cost;
-- ALTER TABLE project_crm_panels ADD COLUMN updated_by INT DEFAULT NULL AFTER is_completed;
-- ALTER TABLE project_crm_panels ADD FOREIGN KEY (updated_by) REFERENCES workers(id) ON DELETE SET NULL;
-- ALTER TABLE item_group_items ADD COLUMN description TEXT AFTER custom_name;
-- ALTER TABLE item_group_items ADD COLUMN price_usd DECIMAL(14,4) DEFAULT NULL AFTER description;
-- ALTER TABLE item_group_items ADD COLUMN price_euro DECIMAL(14,4) DEFAULT NULL AFTER price_usd;
-- CREATE TABLE IF NOT EXISTS manual_product_requests LIKE ... (run the full CREATE above);

-- ── View: Product Demand (always reflects latest CRM data) ────
-- DROP VIEW IF EXISTS product_demand_view;
-- CREATE VIEW product_demand_view AS
-- SELECT
--   pr.id AS product_id,
--   pr.reference,
--   pr.description,
--   b.name AS brand_name,
--   pr.stock_qty,
--   COALESCE(SUM(pci.qty), 0) AS total_demanded,
--   COUNT(DISTINCT p.id) AS project_count,
--   pr.stock_qty - COALESCE(SUM(pci.qty), 0) AS available_qty,
--   CASE WHEN COALESCE(SUM(pci.qty), 0) > pr.stock_qty THEN 1 ELSE 0 END AS has_shortage,
--   CASE WHEN COUNT(DISTINCT p.id) > 1 THEN 1 ELSE 0 END AS has_conflict
-- FROM products pr
-- LEFT JOIN brands b ON pr.brand_id = b.id
-- LEFT JOIN panel_crm_items pci ON pci.product_id = pr.id
-- LEFT JOIN panel_divisions pd ON pci.division_id = pd.id
-- LEFT JOIN project_crm_panels pcp ON pd.panel_id = pcp.id
-- LEFT JOIN projects p ON pcp.project_id = p.id AND p.status NOT IN ('completed','cancelled') AND p.deleted_at IS NULL
-- GROUP BY pr.id, pr.reference, pr.description, b.name, pr.stock_qty
-- ORDER BY has_shortage DESC, has_conflict DESC, pr.reference;

-- Owner account — password_hash is auto-set by server.js on first startup (env OWNER_PASSWORD or default 'admin123')
INSERT IGNORE INTO workers (id, name, email, role) VALUES (1, 'Admin', 'admin@company.com', 'owner');

-- ── Manual Product Requests (engineer adds → owner approves) ──
CREATE TABLE IF NOT EXISTS manual_product_requests (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  name            VARCHAR(250) NOT NULL,
  description     TEXT,
  price_usd       DECIMAL(14,4),
  price_euro      DECIMAL(14,4),
  brand           VARCHAR(100),
  reference       VARCHAR(100),
  created_by      INT NOT NULL,
  status          ENUM('pending','approved','rejected') DEFAULT 'pending',
  rejection_reason TEXT,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES workers(id) ON DELETE CASCADE
);

-- Messages / Announcements
CREATE TABLE IF NOT EXISTS messages (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  content     TEXT NOT NULL,
  created_by  INT NOT NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES workers(id) ON DELETE CASCADE
);

-- ── Activity Log / Audit Trail ─────────────────────────────────
CREATE TABLE IF NOT EXISTS activity_logs (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  project_id    INT NOT NULL,
  panel_id      INT DEFAULT NULL,
  division_id   INT DEFAULT NULL,
  item_id       INT DEFAULT NULL,
  action        VARCHAR(50) NOT NULL,
  field_name    VARCHAR(100) DEFAULT NULL,
  old_value     TEXT DEFAULT NULL,
  new_value     TEXT DEFAULT NULL,
  performed_by  INT NOT NULL,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (performed_by) REFERENCES workers(id) ON DELETE CASCADE
);

-- ── File Attachments ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS attachments (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  project_id    INT NOT NULL,
  panel_id      INT DEFAULT NULL,
  file_name     VARCHAR(255) NOT NULL,
  stored_name   VARCHAR(255) NOT NULL,
  file_size     INT NOT NULL DEFAULT 0,
  mime_type     VARCHAR(100) DEFAULT NULL,
  uploaded_by   INT NOT NULL,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (uploaded_by) REFERENCES workers(id) ON DELETE CASCADE
);

-- ── Migration: add columns to projects (safe re-run) ────────
SET @t = 'projects';
SET @db = DATABASE();

-- Keep existing databases aligned with the current application fallback.
-- This changes only the default for newly created projects; existing rows
-- and their saved exchange rates are not modified.
ALTER TABLE projects
  MODIFY COLUMN exchange_rate_eur_usd DECIMAL(10,4) DEFAULT 1.1800;

SET @exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME=@t AND COLUMN_NAME='ready_for_review');
SET @sql = IF(@exists=0, 'ALTER TABLE projects ADD COLUMN ready_for_review BOOLEAN DEFAULT FALSE AFTER deleted_at', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME=@t AND COLUMN_NAME='execution_deadline');
SET @sql = IF(@exists=0, 'ALTER TABLE projects ADD COLUMN execution_deadline DATE NULL AFTER deadline', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME=@t AND COLUMN_NAME='vat_pct');
SET @sql = IF(@exists=0, 'ALTER TABLE projects ADD COLUMN vat_pct DECIMAL(5,2) DEFAULT 0 AFTER total_price', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME=@t AND COLUMN_NAME='total_vat');
SET @sql = IF(@exists=0, 'ALTER TABLE projects ADD COLUMN total_vat DECIMAL(12,2) DEFAULT 0 AFTER vat_pct', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME=@t AND COLUMN_NAME='total_with_vat');
SET @sql = IF(@exists=0, 'ALTER TABLE projects ADD COLUMN total_with_vat DECIMAL(12,2) DEFAULT 0 AFTER total_vat', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME=@t AND COLUMN_NAME='project_discount_pct');
SET @sql = IF(@exists=0, 'ALTER TABLE projects ADD COLUMN project_discount_pct DECIMAL(5,2) DEFAULT 0 AFTER total_with_vat', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME=@t AND COLUMN_NAME='project_discount_amount');
SET @sql = IF(@exists=0, 'ALTER TABLE projects ADD COLUMN project_discount_amount DECIMAL(12,2) DEFAULT 0 AFTER project_discount_pct', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME=@t AND COLUMN_NAME='payment_terms');
SET @sql = IF(@exists=0, 'ALTER TABLE projects ADD COLUMN payment_terms TEXT AFTER project_discount_amount', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── Execution Phase: Panel Completion ──────────────────────────
CREATE TABLE IF NOT EXISTS panel_completion (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  project_id    INT NOT NULL,
  panel_id      INT NOT NULL,
  is_completed  BOOLEAN DEFAULT FALSE,
  description   TEXT,
  completed_by  INT DEFAULT NULL,
  completed_at  DATETIME DEFAULT NULL,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (panel_id) REFERENCES project_crm_panels(id) ON DELETE CASCADE,
  FOREIGN KEY (completed_by) REFERENCES workers(id) ON DELETE SET NULL,
  UNIQUE KEY uq_panel_project (project_id, panel_id)
);

-- ── Execution Phase: Item Completion ───────────────────────────
CREATE TABLE IF NOT EXISTS item_completion (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  project_id    INT NOT NULL,
  item_id       INT NOT NULL,
  is_completed  BOOLEAN DEFAULT FALSE,
  qty_done      INT DEFAULT 0,
  execution_notes TEXT DEFAULT NULL,
  completed_by  INT DEFAULT NULL,
  completed_at  DATETIME DEFAULT NULL,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (item_id) REFERENCES panel_crm_items(id) ON DELETE CASCADE,
  FOREIGN KEY (completed_by) REFERENCES workers(id) ON DELETE SET NULL,
  UNIQUE KEY uq_item_project (project_id, item_id)
);

-- ── Division Item Group Instances (template placement) ─────────
CREATE TABLE IF NOT EXISTS division_item_group_instances (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  division_id   INT NOT NULL,
  item_group_id INT NOT NULL,
  quantity      INT DEFAULT 1,
  description   TEXT DEFAULT NULL,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (division_id) REFERENCES panel_divisions(id) ON DELETE CASCADE,
  FOREIGN KEY (item_group_id) REFERENCES item_groups(id) ON DELETE CASCADE
);

SET @exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='division_item_group_instances' AND COLUMN_NAME='description');
SET @sql = IF(@exists=0, 'ALTER TABLE division_item_group_instances ADD COLUMN description TEXT DEFAULT NULL AFTER quantity', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── Migration: add source_group_instance_id ──────────────
SET @exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='panel_crm_items' AND COLUMN_NAME='source_group_instance_id');
SET @sql = IF(@exists=0, 'ALTER TABLE panel_crm_items ADD COLUMN source_group_instance_id INT DEFAULT NULL AFTER visible_in_client_pdf', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── Migration: add qty_done + execution_notes to item_completion ──
SET @exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='item_completion' AND COLUMN_NAME='qty_done');
SET @sql = IF(@exists=0, 'ALTER TABLE item_completion ADD COLUMN qty_done INT DEFAULT 0 AFTER is_completed, ADD COLUMN execution_notes TEXT DEFAULT NULL AFTER qty_done', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- NOTE: Run this in MySQL after importing schema to set real password:
-- UPDATE workers SET password_hash = '$2b$10$...' WHERE id=1;
-- Or use the /api/auth/register endpoint to create workers with proper hashed passwords.

-- ── Soft-delete migrations (run once) ─────────────────────────
-- ALTER TABLE workers ADD COLUMN deleted_at TIMESTAMP NULL DEFAULT NULL AFTER created_at;
-- ALTER TABLE clients ADD COLUMN deleted_at TIMESTAMP NULL DEFAULT NULL AFTER updated_at;
-- ALTER TABLE product_discounts ADD COLUMN deleted_at TIMESTAMP NULL DEFAULT NULL AFTER updated_at;

-- Add 'info' to notifications type enum
ALTER TABLE notifications MODIFY COLUMN type ENUM('deadline','approval','status','request','stock','general','info','manual_product','manual_product_approved','manual_product_rejected') NOT NULL DEFAULT 'general';

-- ── Technician role (field worker — execution only, no pricing access) ──
ALTER TABLE workers MODIFY COLUMN role ENUM('owner','head_engineer','stock_manager','accounting','engineer','secretary','technician') NOT NULL;

-- ── Project Technician Assignments (owner assigns technicians per project) ──
CREATE TABLE IF NOT EXISTS project_technicians (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  project_id   INT NOT NULL,
  worker_id    INT NOT NULL,
  assigned_by  INT NOT NULL,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id)  REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (worker_id)   REFERENCES workers(id)  ON DELETE CASCADE,
  FOREIGN KEY (assigned_by) REFERENCES workers(id)  ON DELETE CASCADE,
  UNIQUE KEY uq_project_technician (project_id, worker_id)
);

-- ── Migration: OneDrive-backed attachments (existing local files keep working) ──
SET @exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='attachments' AND COLUMN_NAME='storage');
SET @sql = IF(@exists=0, "ALTER TABLE attachments ADD COLUMN storage ENUM('local','onedrive') NOT NULL DEFAULT 'local' AFTER mime_type, ADD COLUMN onedrive_item_id VARCHAR(255) DEFAULT NULL AFTER storage, ADD COLUMN onedrive_web_url VARCHAR(500) DEFAULT NULL AFTER onedrive_item_id", 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── OneDrive OAuth tokens (personal Microsoft account — delegated auth) ──
-- Single-row-per-provider table: one connected OneDrive account for the whole app.
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

-- ── Migration: manual OneDrive links (optional, pasted by the user — not the automated upload) ──
SET @exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='project_crm_panels' AND COLUMN_NAME='onedrive_link');
SET @sql = IF(@exists=0, 'ALTER TABLE project_crm_panels ADD COLUMN onedrive_link VARCHAR(500) DEFAULT NULL AFTER show_note_in_client_pdf', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='projects' AND COLUMN_NAME='onedrive_folder_link');
SET @sql = IF(@exists=0, 'ALTER TABLE projects ADD COLUMN onedrive_folder_link VARCHAR(500) DEFAULT NULL AFTER client_pdf_note', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── Migration: attachments become link-based (paste a link instead of uploading a file) ──
SET @exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='attachments' AND COLUMN_NAME='link_url');
SET @sql = IF(@exists=0, 'ALTER TABLE attachments ADD COLUMN link_url VARCHAR(1000) DEFAULT NULL AFTER onedrive_web_url', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = "ALTER TABLE attachments MODIFY COLUMN storage ENUM('local','onedrive','link') NOT NULL DEFAULT 'link'";
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = 'ALTER TABLE attachments MODIFY COLUMN stored_name VARCHAR(255) NULL';
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── Project Payments (installments — a project's total may be paid across multiple partial payments) ──
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

-- ── Project workflow and audit trail ─────────────────────────
CREATE TABLE IF NOT EXISTS project_stage_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  project_id INT NOT NULL,
  from_stage VARCHAR(30) DEFAULT NULL,
  to_stage VARCHAR(30) NOT NULL,
  note TEXT DEFAULT NULL,
  changed_by INT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (changed_by) REFERENCES workers(id) ON DELETE SET NULL,
  INDEX idx_stage_history_project (project_id, created_at)
);

CREATE TABLE IF NOT EXISTS quotation_revisions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  project_id INT NOT NULL,
  revision_number INT NOT NULL,
  quote_number VARCHAR(100) NOT NULL,
  total_price DECIMAL(14,2) DEFAULT 0,
  total_with_vat DECIMAL(14,2) DEFAULT 0,
  notes TEXT DEFAULT NULL,
  snapshot_json LONGTEXT DEFAULT NULL,
  created_by INT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES workers(id) ON DELETE SET NULL,
  UNIQUE KEY uq_project_revision (project_id, revision_number)
);

SET @exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='quotation_revisions' AND COLUMN_NAME='snapshot_json');
SET @sql = IF(@exists=0, 'ALTER TABLE quotation_revisions ADD COLUMN snapshot_json LONGTEXT DEFAULT NULL AFTER notes', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS reservation_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  product_id INT NOT NULL,
  project_id INT DEFAULT NULL,
  panel_id INT DEFAULT NULL,
  old_qty INT NOT NULL DEFAULT 0,
  new_qty INT NOT NULL DEFAULT 0,
  change_qty INT NOT NULL DEFAULT 0,
  reason VARCHAR(100) NOT NULL,
  changed_by INT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL,
  FOREIGN KEY (panel_id) REFERENCES project_crm_panels(id) ON DELETE SET NULL,
  FOREIGN KEY (changed_by) REFERENCES workers(id) ON DELETE SET NULL,
  INDEX idx_reservation_history_product (product_id, created_at)
);

-- ── Migration: payment deadline (for the remaining balance, set once installments start) ──
SET @exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='projects' AND COLUMN_NAME='payment_deadline');
SET @sql = IF(@exists=0, 'ALTER TABLE projects ADD COLUMN payment_deadline DATE DEFAULT NULL AFTER onedrive_folder_link', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── Migration: workflow, margin warning, and stock threshold ──
SET @exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='projects' AND COLUMN_NAME='project_stage');
SET @sql = IF(@exists=0, "ALTER TABLE projects ADD COLUMN project_stage ENUM('design','quotation','approval','procurement','assembly','testing','delivered') NOT NULL DEFAULT 'design' AFTER quote_number", 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='projects' AND COLUMN_NAME='margin_warning_pct');
SET @sql = IF(@exists=0, 'ALTER TABLE projects ADD COLUMN margin_warning_pct DECIMAL(5,2) NOT NULL DEFAULT 10 AFTER project_stage', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='products' AND COLUMN_NAME='min_stock_level');
SET @sql = IF(@exists=0, 'ALTER TABLE products ADD COLUMN min_stock_level INT NOT NULL DEFAULT 0 AFTER reserved_qty', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── Migration: number of identical units represented by each CRM panel ──
SET @exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='project_crm_panels' AND COLUMN_NAME='quantity');
SET @sql = IF(@exists=0, 'ALTER TABLE project_crm_panels ADD COLUMN quantity INT NOT NULL DEFAULT 1 AFTER panel_name', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── Role-aware product update center ────────────────────────
CREATE TABLE IF NOT EXISTS app_updates (
  id INT AUTO_INCREMENT PRIMARY KEY,
  version VARCHAR(30) NOT NULL,
  title VARCHAR(200) NOT NULL,
  summary TEXT NOT NULL,
  features LONGTEXT NOT NULL,
  target_roles VARCHAR(255) NOT NULL DEFAULT 'all',
  is_published BOOLEAN NOT NULL DEFAULT TRUE,
  published_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by INT DEFAULT NULL,
  FOREIGN KEY (created_by) REFERENCES workers(id) ON DELETE SET NULL,
  UNIQUE KEY uq_app_update (version,title)
);

CREATE TABLE IF NOT EXISTS app_update_reads (
  update_id INT NOT NULL,
  worker_id INT NOT NULL,
  read_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (update_id,worker_id),
  FOREIGN KEY (update_id) REFERENCES app_updates(id) ON DELETE CASCADE,
  FOREIGN KEY (worker_id) REFERENCES workers(id) ON DELETE CASCADE
);

INSERT IGNORE INTO app_updates(version,title,summary,features,target_roles) VALUES
('0.1','Foundation','The first working version introduced secure access and the core electrical product database.','["Secure login and worker accounts","Product catalogue with brands and pricing","Client records","Initial project CRM"]','all'),
('0.5','Quotation CRM','Projects gained structured panels, divisions, products, calculations, and customer exports.','["Panels and electrical divisions","Item quantities, markups, discounts and manpower","Quotation totals with VAT","Owner and client PDF exports"]','owner,head_engineer,accounting,engineer'),
('0.8','Inventory and demand','Stock quantities became connected to live project demand and reservations.','["Stock, reserved and available quantities","Project demand tracker","Shortage and conflict warnings","Reservation history"]','owner,head_engineer,stock_manager,engineer'),
('1.0','Team collaboration','Engineering collaboration and workshop execution tracking were added.','["Engineer invitations and project collaboration","Technician assignments","Panel and item completion tracking","Activity and progress history"]','owner,head_engineer,engineer,technician'),
('1.4','Business operations','Financial, administrative, and communication tools were expanded.','["Partial payments and debt tracking","Calendar and deadlines","Announcements and notifications","Analytics by engineer and client"]','owner,head_engineer,accounting,secretary'),
('2.0','Managed project workflow','Projects now follow seven controlled stages with new management and inventory roles.','["Design, Quotation, Approval, Procurement, Assembly, Testing and Delivered stages","Head Engineer and Stock Manager roles","Unique automatic or manual quotation numbers","Engineer pricing privacy","Panel quantity multiplication across prices and stock demand"]','all'),
('2.1','Quotation version control','Client-approved quotations are protected and complete quotation versions can be reviewed or restored.','["Full quotation snapshots with panels, divisions and items","Owner-only version restore with automatic backup","Commercial lock after client approval","Compressed snapshots for very large projects","Visible revision history"]','owner,head_engineer,accounting,engineer'),
('2.2','Updates center','A role-aware What’s New center now keeps every worker informed about relevant improvements.','["Unread update badge","Updates filtered by worker role","Per-user read history","Owner publishing for future releases"]','all'),
('2.3','New quotation import','PDF imports now create projects using the complete managed quotation model.','["Automatic or imported unique quotation number","New commercial quotation and technical-offer parsing","Panel multiplier import and preview editing","VAT, discount, payment terms, margin threshold and client note","Imported projects start in the Design stage and support revision history"]','owner,head_engineer,accounting,engineer');

-- ── Owner/Head Engineer managed CRM division types ──────────
CREATE TABLE IF NOT EXISTS division_types (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  color VARCHAR(7) NOT NULL DEFAULT '#64748b',
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by INT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY(created_by) REFERENCES workers(id) ON DELETE SET NULL,
  UNIQUE KEY uq_division_type_name(name)
);
INSERT IGNORE INTO division_types(name,color,sort_order) VALUES
('INCOMING','#e11d48',1),('OUTGOING','#2563eb',2),('Enclosure','#7c3aed',3),('Accessories','#d97706',4),('Measurement','#059669',5);
SET @sql = 'ALTER TABLE panel_divisions MODIFY COLUMN division_type VARCHAR(100) NOT NULL';
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
INSERT IGNORE INTO app_updates(version,title,summary,features,target_roles) VALUES
('2.4','Managed division types','Owner and Head Engineer can now extend the CRM with custom electrical division types.','["Division Types management page","Add, rename, color, archive and reactivate types","Existing projects update safely when a type is renamed","Used types are archived instead of deleted","Custom types work in CRM panels and technical PDF import"]','owner,head_engineer,engineer');

SET @exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='projects' AND COLUMN_NAME='procurement_status');
SET @sql = IF(@exists=0, "ALTER TABLE projects ADD COLUMN procurement_status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending' AFTER project_stage, ADD COLUMN procurement_note TEXT DEFAULT NULL AFTER procurement_status, ADD COLUMN procurement_reviewed_by INT DEFAULT NULL AFTER procurement_note, ADD COLUMN procurement_reviewed_at DATETIME DEFAULT NULL AFTER procurement_reviewed_by, ADD CONSTRAINT fk_projects_procurement_reviewer FOREIGN KEY (procurement_reviewed_by) REFERENCES workers(id) ON DELETE SET NULL", 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
INSERT IGNORE INTO app_updates(version,title,summary,features,target_roles) VALUES
('2.5','Stock-controlled procurement','Stock Manager now owns the Procurement approval gate before Assembly.','["Price-free procurement queue","Required, available and shortage quantities","Approve or reject with notes","Assembly blocked until stock approval"]','owner,head_engineer,stock_manager,engineer');

CREATE TABLE IF NOT EXISTS project_procurement_allocations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  project_id INT NOT NULL,
  product_id INT NOT NULL,
  allocated_qty INT NOT NULL DEFAULT 0,
  updated_by INT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE,
  FOREIGN KEY(updated_by) REFERENCES workers(id) ON DELETE SET NULL,
  UNIQUE KEY uq_project_procurement_product(project_id,product_id)
);
