# Project bug and security review — 8 October 2026

## Scope and outcome

Reviewed authentication, role permissions, project approval locks, CRM pricing, imports, exports, uploads, inventory, frontend navigation and dependencies. Confirmed issues below were corrected. This is a code and local integration review, not a guarantee that every possible defect or deployment vulnerability has been eliminated.

All write-based integration checks used disposable database copies. Outbound email delivery was stubbed; no audit emails were sent.

## Corrections

- **High: owner privilege escalation.** Head engineers could create/promote owner accounts or change an owner's credentials. Server authorization now protects owner accounts; the UI follows the same rules. Owner updates also protect the last remaining owner using database locks.
- **High: cross-project approval-lock bypass.** Nested panel/division/item identifiers could refer to a different project from the project being checked. Resource ownership is now checked before review locks or writes.
- **High: confidential price disclosure.** Legacy notification messages and bulk activity values could disclose prices to operational roles. Redaction covers these responses. Unknown roles receive no financial visibility; engineers cannot supply confidential prices during item creation or import.
- **High: session and credential weaknesses.** Browser tokens are no longer persisted in localStorage. Cookie authentication is used; production cookies default to Secure. Password changes invalidate existing tokens; current database roles determine access. JWT verification restricts algorithms. Known fallback secrets and default owner passwords were removed, and startup no longer overwrites existing owner credentials. Password validation prevents bcrypt truncation.
- **High: private group access.** Private group contents and group expansion now enforce visibility and ownership checks.
- **Security: cross-origin writes and exports.** Browser mutation requests reject unexpected origins. CSV exports neutralize formula injection while preserving numeric negatives. Attachment downloads reject stored path traversal.
- **Correctness: CRM updates and totals.** Partial panel edits preserve existing markup and item overrides. Panel and brand summaries apply panel quantities consistently; EUR-only markup previews use the project exchange rate. Engineer imports resolve catalogue prices on the server.
- **Correctness: input and import handling.** Invalid, negative, nonfinite or fractional quantities/prices are rejected where applicable before approval mutation. Empty or excessive spreadsheet ranges receive controlled errors. Import errors do not expose internal details; product updates return 404 for missing records. User-controlled map keys no longer inherit object prototypes.
- **Correctness: manual inventory adjustments.** Reservation changes lock the product row and commit stock plus history together, preventing lost simultaneous updates or stock changes without history.
- **Dependencies:** resolved 26 reported findings across server and client, including vulnerable upload, mail, spreadsheet, routing and build dependencies. Both final npm audits report zero known vulnerabilities. Node.js 22.12 or newer is required. SheetJS uses its [official installation distribution](https://docs.sheetjs.com/docs/getting-started/installation/nodejs/).

## Verification

| Check | Result |
| --- | --- |
| Automated regression suite | 52 passed, 0 failed |
| Server JavaScript syntax | 72 files passed |
| Broad API integration audit | 691 requests, 0 server errors |
| Approval workflow integration | 26 requests passed |
| Targeted security integration | 34 requests passed |
| API/frontend contract review | 151 routes checked; no unmatched frontend routes |
| UI wiring review | 122 files / 233 buttons; no unhandled buttons found |
| Frontend production build | Passed with Vite 7.3.7 |
| Server/client dependency audit | 0 known vulnerabilities in each |
| Browser smoke checks | Cookie login, products, projects, CRM and per-panel markup preview verified |

The broad integration runs preceded the final manual-reservation transaction correction; that correction is covered by the final regression suite, including rollback when reservation history fails.

## Remaining findings and practical limits

1. **Medium — manual reservation persistence:** project recalculation replaces `products.reserved_qty` with calculated project demand, including at CRM startup. Consequently manual reserve/release changes can be overwritten later. The simultaneous-update problem is fixed, but persistence needs a business-rule decision: represent manual holds separately from project demand, or restrict reservations to project-derived demand. A separate ledger/column and migration are needed for independent manual holds.
2. **Medium — logout token replay:** logout clears the browser cookie, but an already copied bearer token remains valid until expiry unless the password changes. Immediate logout revocation would need server-side session records or a token denylist. Browser token exposure was reduced by removing localStorage storage.
3. **Deployment checks:** HTTPS, a strong production JWT secret, restricted database credentials, backups, SMTP delivery, proxy configuration and internet-facing rate limits require validation in the actual deployed environment. Local disposable checks do not establish these properties. Email queue behavior was tested, not real provider delivery.
4. **Import resource limits:** upload and worksheet limits are enforced, but unusually compressed documents can still consume substantial parser memory. Public deployments should isolate parsing and enforce resource limits.

## Applying the changes

Restart the backend and refresh the frontend after installing updated lockfiles. Existing sessions will require a fresh login because tokens issued before credential fingerprinting are intentionally rejected. No existing owner password was changed. Preserve the current database and backups; these fixes do not require resetting user data.
