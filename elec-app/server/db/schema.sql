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

-- ── Seed: default owner (password: admin123) ─────────────────
-- NOTE: client_rejection_note and cost are now in CREATE TABLE above.
-- Legacy migration ALTERs (already applied in existing DB):
-- ALTER TABLE project_crm_panels ADD COLUMN is_completed BOOLEAN DEFAULT FALSE;
-- ALTER TABLE panel_crm_items ADD COLUMN base_price_euro DECIMAL(14,4) AFTER base_price_usd;
-- ALTER TABLE projects ADD COLUMN client_rejection_note TEXT;
-- ALTER TABLE panel_crm_items ADD COLUMN cost DECIMAL(14,2) DEFAULT 0 AFTER totalfinalProduct;
-- ALTER TABLE project_crm_panels ADD COLUMN updated_by INT DEFAULT NULL AFTER is_completed;
-- ALTER TABLE project_crm_panels ADD FOREIGN KEY (updated_by) REFERENCES workers(id) ON DELETE SET NULL;

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

-- password_hash below = bcrypt of 'admin123'
INSERT IGNORE INTO workers (id, name, email, role, password_hash)
VALUES (1, 'Admin Owner', 'admin@company.com', 'owner',
        '$2b$10$rOzHwG5k5h1Z5k5h1Z5k5uK5h1Z5k5h1Z5k5h1Z5k5h1Z5k5h1Z5');

-- NOTE: Run this in MySQL after importing schema to set real password:
-- UPDATE workers SET password_hash = '$2b$10$...' WHERE id=1;
-- Or use the /api/auth/register endpoint to create workers with proper hashed passwords.
