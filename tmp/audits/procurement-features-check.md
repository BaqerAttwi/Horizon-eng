# Procurement progress, filters and unsaved-change checks

- Readiness shows complete item lines, percentage, and shortage count on collapsed project cards; partial arrivals do not count as fully ready.
- Filters: All, Has shortages, Ready for approval, Rejected, Approved. Counts follow search; empty projects are not ready for approval.
- Unsaved notes, C.R. and item/project edits are guarded during route/history navigation, CRM tab changes, project dialog closure and sign-out. Refresh/tab closure uses the browser beforeunload warning.
- The custom warning offers Keep editing, Discard changes, Save and continue. Failed saves keep the draft and destination blocked. Pending allocations, review decisions, bulk actions and markup actions are never submitted implicitly; users must finish those on the page or discard their entered values.
- Browser interactions tested with synthetic procurement data: filter correctness; note keep/save/discard; failed note save; forward-history blocking; search/filter draft protection; allocation guard with automatic save disabled.
- Mobile 390px layout: no document-wide horizontal overflow; no console errors in the fixture preview.
- Automated checks: all 113 tests passed, production build passed, whitespace check passed.
- No backend schema changes needed for these features. No hosted deployment performed.
