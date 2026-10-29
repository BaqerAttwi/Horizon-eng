# API and button audit — 22 October 2026

## Verification

- 161 registered server routes; 188 client API/download references matched by method and URL. No unresolved URLs or mismatches.
- 259 buttons inventoried. No buttons without click handlers or form submission/reset behavior. Static wiring alone does not establish runtime success.
- 132 automated tests passed; production client build passed.
- 27 HTTP/database workflow checks passed using a disposable schema with synthetic records. This included 434 read-endpoint checks across seven roles, expected access denials, writes, imports, exports, revisions, payments, procurement, password changes, and price refreshes.
- Browser spot checks used the isolated database. Accounting CRM controls were disabled and both import dialogs opened for Head of Engineering. The later engineer client-edit permission change is covered by automated permission and API checks.
- At 375px width, document width was 375px. The CRM table scrolled inside its 333px container instead of widening the page. The legacy import dialog and password form fit the mobile viewport. Browser checks reported no console errors on the inspected screens.

## Fixes

- Aligned client edit/delete buttons with API permissions. Engineers can add and edit clients; deletion is restricted to Owner and Head of Engineering.
- Removed project creation/editing controls for accounting; disabled locked panel, division, item, group, and note controls. Execution progress permissions remain separate from commercial edit permissions.
- Enabled Head of Engineering attachment actions and accounting CRM CSV export, consistent with their existing project access.
- Prevented engineer project edits from resubmitting hidden/null financial settings and resetting saved project values.
- Added error handling to notification and update actions and project form lookups.
- Added the missing self-service Change Password action to the account menu. A wrong current password returns a validation error without triggering the generic session-expired redirect. Successful changes clear the local session and require login again.
- Expanded audit scripts to include conditional URLs, concatenated URLs, downloads, and real legacy import/catalog refresh workflows. Removed the assumption that a disabled button is necessarily wired.

## Limits

The browser checks were representative checks, not manual clicks on all 259 buttons. Email delivery, OneDrive authorization, and third-party storage operations were not exercised against external accounts. Email was disabled during integration tests. Original project records were not modified; disposable schemas were removed after testing.
