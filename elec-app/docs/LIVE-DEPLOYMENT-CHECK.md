# Live deployment checks — 8 October 2026

## Verified locally

- `server/db/schema.sql` imported into an empty disposable database, then imported again successfully.
- 38 tables passed integrity checks; no columns from the current local database are missing from the fresh schema.
- Schema-applied disposable API audit: 691 requests, zero server errors.
- Targeted permissions/session integration: 34 requests passed.
- Final regression suite: 54 tests passed.
- Production frontend build passed.
- Mobile browser checks at 390 × 844: login, products, group search, group create modal, CRM, expanded item tables and Add Group picker. No document-wide horizontal overflow in checked pages. Expanded CRM also fits at 768px tablet width; wide tables scroll within their containers.
- Fixed mobile CRM text being forced to 10px, initial owner creation assuming ID 1 was free, unsafe sample secure-cookie settings, misleading sample HTTPS configuration, and a stray zero rendered for private groups.

## Upload and start

1. Use Node.js 22.12 or newer. Install server/client dependencies from their lockfiles with `npm ci`; run `npm run build` inside `client`.
2. Create the intended database and a dedicated database user. Import `server/db/schema.sql` into that selected database. The script deliberately does not choose a database or create one. For an existing database, back it up before importing schema changes. A fresh schema import contains table definitions and application defaults, not your local business records; use a separate database dump if moving existing records.
3. Configure environment variables from `server/.env.example`: production mode, database settings, strong random JWT secret, initial owner password, real HTTPS client/server origins, and secure cookies. Set `TRUST_PROXY` to the actual trusted proxy hop count only when using a reverse proxy.
4. Start `npm start` inside `server`. The initial owner uses `admin@company.com`; sign in with the configured initial owner password and update the account email in Workers. Existing owner credentials are preserved.
5. Terminate HTTPS at your host/reverse proxy. Keep local attachment storage persistent and backed up; upload existing attachments when moving hosts. Set up your actual email provider and verify approval/recheck and payment-reminder delivery with your own test project.
6. Verify login, logout, each role, approval submission/recheck/resubmission, group descriptions/search, PDF exports, payment deadlines, uploads, and mobile layouts at the real domain before allowing users in.

## Remaining limits

Local checks cannot confirm your hosting provider, TLS, SMTP delivery, proxy routing or storage permissions. Remaining architectural issues are detailed in `SECURITY-REVIEW-2026-10-08.md`: project recalculation overwrites manual stock holds; copied bearer tokens are not immediately revoked by logout; compressed imports need deployment resource limits. Do not rely on independent manual holds until their persistence rule is resolved.

Recheck schema locally with `node scripts/verify-deployment-schema.js` inside `server`. It only creates and removes a disposable local database; it does not change application data.
