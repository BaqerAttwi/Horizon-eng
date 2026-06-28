# Horizon LB — Electrical Engineering CRM

Full-stack project management and CRM application for electrical engineering contracting companies. Built for **Horizon LB** to manage the full lifecycle from product inventory and project estimation through to execution and analytics.

---

## Author & Credits

**Mohammad Albaqer Attwi**  
📞 +96181641596  
✉️ baqer.atwi@gmail.com  

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Vite 5, React Router v6, Framer Motion, Axios |
| Backend | Node.js + Express 4 |
| Database | MySQL 8 (mysql2, connection pooling) |
| Auth | JWT (HttpOnly cookies + localStorage fallback), bcryptjs |
| PDF | jsPDF + jspdf-autotable (export), pdf-parse (import) |
| Excel | xlsx (import/export), Multer (file upload) |
| Email | Resend API |
| Security | helmet, express-rate-limit, CORS, Zod validation |

---

## Worker Roles & Permissions

### 👑 Owner
Full access to all features. Can manage workers, approve price changes, view analytics, configure discounts, and access every module in the system.

### 💼 Accounting
Manages products, projects, clients, reservations, and reports. Can import Excel files and edit discounts.

### ⚙️ Engineer
Handles products, projects (CRUD), reservations, item groups, collaboration requests, price change requests, and file attachments. Can create clients.

### 📋 Secretary
Manages products, clients, reservations, and announcements. Can create/edit clients.

---

## Features

### Product Management
- Full catalog with brands, stock tracking, pricing (USD/EUR/cost)
- Provision new products with auto-generated reference codes
- Brand-level and product-level discount configuration
- Excel import for bulk product/brand uploads
- CSV export

### Project CRM & Estimation
- Hierarchical structure: Project → Panels → Divisions → Items
- Division types: INCOMING, OUTGOING, Enclosure, Accessories, Measurement
- Automatic pricing engine (markup %, discount %, manpower %, markup on manpower)
- Price cascades: item → division → panel → project totals
- VAT calculation and project-level discounts
- PDF import: parse supplier PDFs to auto-create project items
- PDF export: client quotation (3-page layout) and owner technical PDF
- Item group templates for快速populating divisions
- Copy panels between projects

### Demand Tracker & Reservations
- Real-time product demand across all projects
- Shortage and over-commitment detection
- Reserved quantity management

### Price Change Requests
- Engineers request price changes with full audit trail
- Owner approves or rejects with difference highlighting

### Engineer Collaboration
- Request other engineers to join a project
- Accept/reject collaboration requests

### Execution Phase
- Track panel and item completion status
- Mark panels/items as complete during project delivery

### File Attachments
- Upload, download, and delete files per project
- Supported: PDF, images, Word, Excel, text, CSV

### Activity Logs
- Full audit trail of all changes made in a project
- Timestamped with worker identity

### Analytics
- Summary dashboard with revenue, profit, and project counts
- Engineer performance metrics
- Client statistics
- CSV export

### Notifications & Announcements
- In-app notifications for deadlines, approvals, requests, stock alerts
- Periodic checks every 6 hours
- Broadcast announcements (owner/secretary)
- Email notifications via Resend API

### UI / UX
- Dark and light theme toggle (persisted)
- Mobile-responsive sidebar with hamburger menu
- Role-based navigation filtering
- Calendar view for project deadlines
- Framer Motion animations

---

## Database Overview

Core tables: `workers`, `products`, `brands`, `clients`, `projects`, `project_crm_panels`, `panel_divisions`, `panel_crm_items`, `panel_manual_products`, `item_groups`, `item_group_items`, `product_discounts`, `notifications`, `messages`, `activity_logs`, `attachments`, `crm_price_change_requests`, `project_engineer_requests`, `manual_product_requests`, `product_reservations`, `panel_completion`, `item_completion`, `division_item_group_instances`.

---

## Environment Variables

### Server (`server/.env`)

| Variable | Description |
|----------|-------------|
| `PORT` | Express server port |
| `CLIENT_URL` | CORS origin (e.g. `http://localhost:5173`) |
| `DB_HOST` / `DB_PORT` / `DB_USER` / `DB_PASSWORD` / `DB_NAME` | MySQL connection |
| `JWT_SECRET` | JWT signing secret |
| `OWNER_PASSWORD` | Initial owner account password (seeded on first start) |
| `COOKIE_SECURE` | Set `true` in production for HTTPS |
| `RESEND_API_KEY` | Resend.com API key for email |
| `EMAIL_FROM` | From address for sent emails |

### Client (`client/.env`)

| Variable | Description |
|----------|-------------|
| `VITE_API_URL` | Backend API base URL |

---

