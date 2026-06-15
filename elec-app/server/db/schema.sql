-- ============================================================
--  ELECTRIC ENG CO — DATABASE SCHEMA v2
--  Added: password to workers, product_reservations table
-- ============================================================
CREATE DATABASE IF NOT EXISTS elec_app CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE elec_app;

-- ── Workers (employees + login) ──────────────────────────────
CREATE TABLE IF NOT EXISTS workers (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  name         VARCHAR(200) NOT NULL,
  email        VARCHAR(150),
  phone        VARCHAR(50),
  role         ENUM('owner','accounting','engineer','secretary') NOT NULL,
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
  engineer_id     INT,
  client_id       INT,
  exchange_rate_eur_usd DECIMAL(10,4) DEFAULT 1.0800,
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
  INDEX idx_deleted_at (deleted_at)
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
  type        ENUM('deadline','approval','status','request','stock','general','manual_product','manual_product_approved','manual_product_rejected') NOT NULL DEFAULT 'general',
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
  created_by  INT NOT NULL,
  is_public   BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES workers(id) ON DELETE CASCADE
);

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

ALTER TABLE projects ADD COLUMN ready_for_review BOOLEAN DEFAULT FALSE AFTER deleted_at;
ALTER TABLE projects ADD COLUMN execution_deadline DATE NULL AFTER deadline;
ALTER TABLE projects ADD COLUMN vat_pct DECIMAL(5,2) DEFAULT 0 AFTER total_price;
ALTER TABLE projects ADD COLUMN total_vat DECIMAL(12,2) DEFAULT 0 AFTER vat_pct;
ALTER TABLE projects ADD COLUMN total_with_vat DECIMAL(12,2) DEFAULT 0 AFTER total_vat;
ALTER TABLE projects ADD COLUMN project_discount_pct DECIMAL(5,2) DEFAULT 0 AFTER total_with_vat;
ALTER TABLE projects ADD COLUMN project_discount_amount DECIMAL(12,2) DEFAULT 0 AFTER project_discount_pct;
ALTER TABLE projects ADD COLUMN payment_terms TEXT AFTER project_discount_amount;

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
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (division_id) REFERENCES panel_divisions(id) ON DELETE CASCADE,
  FOREIGN KEY (item_group_id) REFERENCES item_groups(id) ON DELETE CASCADE
);

ALTER TABLE panel_crm_items ADD COLUMN source_group_instance_id INT DEFAULT NULL AFTER visible_in_client_pdf;

-- NOTE: Run this in MySQL after importing schema to set real password:
-- UPDATE workers SET password_hash = '$2b$10$...' WHERE id=1;
-- Or use the /api/auth/register endpoint to create workers with proper hashed passwords.

-- ── Soft-delete migrations (run once) ─────────────────────────
-- ALTER TABLE workers ADD COLUMN deleted_at TIMESTAMP NULL DEFAULT NULL AFTER created_at;
-- ALTER TABLE clients ADD COLUMN deleted_at TIMESTAMP NULL DEFAULT NULL AFTER updated_at;
-- ALTER TABLE product_discounts ADD COLUMN deleted_at TIMESTAMP NULL DEFAULT NULL AFTER updated_at;
