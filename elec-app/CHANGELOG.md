# Changelog — Horizon LB

All changes tracked here for deployment reference.

---

## [Unreleased]

### Added
- **Item "Edit View" toggle** (`client/src/pages/CrmProjectPage.jsx`)
  - Toggle button next to "📋 Items" tab — appears only when Items tab is active
  - When ON (`◉ Edit View ON`): clicking anywhere on an item row enters edit mode directly (no pencil click needed)
  - When OFF (`○ Edit View`): original behavior (pencil icon required to edit)
  - Checkboxes, eye toggle, delete button, pencil button, and notes icon still work independently via `e.stopPropagation()`
- **Enter key auto-save on item edit** — pressing Enter on any input in the edit form saves the item (same as clicking Save)
- **Cancel button on Product Search** — proper Cancel button next to the search field to close without adding
- **Visual color hierarchy** — panels get `var(--panel2)` background, division headers get stronger type-color tint (`20%`), table content gets `var(--panel)` background for clear visual layers

### Fixed
- **Vite proxy port mismatch** (`client/vite.config.js`)
  - Proxy was forwarding `/api` to `http://localhost:5000` — server runs on port 3000
  - Changed to `http://localhost:3000` — login and all API calls now work

### Changed
- **DB schema** (`server/db/schema.sql`)
  - Database renamed from `elec_app` to `horizonlb` (matches `.env` `DB_NAME=horizonlb`)
  - All `PREPARE/EXECUTE/DEALLOCATE` migration blocks replaced with `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` (MySQL 8.0.16+) — fixes phpMyAdmin "Incorrect format parameter" error

### Previous edits (from earlier session)
- PDF export: logo source from inline SVG → `/LogoHorizonLB.png`, all autoTable calls got `margin: { top: 28 }`
- Login page: unified card (form + role info), animated alternating quotes, logo 280px with drop-shadow
- Sidebar logo: transparent background, SVG favicon (64×64)
- Server: SMTP → Resend API migration, `ensureOwner()` runs after app.listen
- Schema: all `ALTER TABLE ... ADD COLUMN` wrapped with `information_schema` existence checks; `'info'` added to notifications ENUM
- Products: `db.execute` → `db.query` for `LIMIT ? OFFSET ?` queries, NaN guarded with `Math.max`/`Math.min`
- PDF import parser: group instances created as references, `matchItems` uses prefix search fallback
- Tab title changed to `Horizon LB`, all debug `console.log` removed

---

## Deploy Checklist (when pushing to DigitalOcean)
1. `git pull` on server
2. `cd client && npm run build`
3. Import `server/db/schema.sql` into MySQL (re-run safe — uses `IF NOT EXISTS`)
4. Restart: `pm2 restart horizonlb-api`
5. Set `RESEND_API_KEY` in `.env` if email needed
6. Replace IP-based `CLIENT_URL` with domain when DNS is configured
