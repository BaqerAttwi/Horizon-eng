# Application flow audit — 13 October 2026

## Checks

- 83 server regression tests passed.
- Production client build passed.
- 24 integration scenario groups passed in a disposable database containing test records only.
- 420 read requests exercised 60 routes across all seven test roles without unexpected status codes or server errors.
- Separate local-data audit: 240 read requests across the four roles with existing local accounts; no server errors.
- Browser smoke checks: 20 owner-facing pages at desktop (1280×800) and phone (390×844) sizes; no console errors or page-wide horizontal overflow found.
- Technician list and execution screen rendered. Non-owner profile email is read-only; owner email is editable.
- Account editor, sign-out, 32px sidebar assistant and assistant panel checked in the browser.
- Invoice export requires a delivery date. Technical quotation PDF downloaded successfully.

## Fixed bugs

1. Discount-note edits reset the percentage. Partial updates now preserve omitted fields and reject missing/deleted discounts.
2. Explicit 0% division markup incorrectly inherited panel markup when adding groups. Zero is now preserved.
3. Execution-note edits cleared completion. Notes preserve status, quantity and completion metadata. Checkbox changes now synchronize completed quantities.
4. Quotation snapshots and restoration dropped group structure. New snapshots capture group instances and restoration remaps their items. Deleted reusable groups cause a clear error before restoration changes data.
5. Panel copying flattened groups and discarded overrides. Copies now preserve group structure and item markup overrides.
6. Brand discounts failed for Unbranded items. API and CRM page now use the same fallback.
7. Negative stock was accepted by product editing. Stock values now require nonnegative whole numbers.
8. Out-of-range new/bulk discounts were accepted. Percentages are validated before writes.

## Areas covered

Authentication/profile/accounts; clients; inventory/discounts; project/panel/division/item creation; manual items and visibility; collaboration; reusable groups; quotation revisions; full design-to-delivery workflow; manual arrivals; technician assignment/execution; payments/debt; attachments; announcements/updates/notifications; dashboard/calendar data/analytics; exports; division types; panel copying; bulk edits/replacement/brand discounts; price-change requests; manual product requests; reservations/history; Excel import; PDF preview/import confirmation; assistant; deletion; session invalidation; seven-role read matrix.

## Limits and deployment

- Broad scenario coverage is not proof that every input combination or concurrent request is bug-free.
- Live email delivery and Microsoft OneDrive OAuth/download were not exercised. Email retry behavior remains covered by regression tests. No isolated-test email was processed or sent.
- Older quotation snapshots that never stored group instances cannot recover that missing historical data.
- No production deployment was performed. Deploy the changed backend and restart it for these fixes.
- These fixes need no schema migration. The disposable test database was removed. Fixture writes did not touch the configured application database.

## Repeating the checks

Run `npm test` in the server directory and `npm run build` in the client directory.
Run `node scripts/audit-write-flows.js` in the server directory for isolated integration tests. It requires a current local schema and permission to create/drop its own disposable database.
Raw results are in `write-flows.json` and `read-flows.json` beside this report.
