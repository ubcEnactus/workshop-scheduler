# Warning-only manual staffing

## Decision — 23 September 2026

The admin no longer needs a workload-override form. Same-day and same-week workload are warnings, just like missing or partial availability. Keep the warnings visible and let Assign/Add act directly on every manual staffing screen.

## Contract

- No workload confirmation checkbox, separate override reason, Review override panel, or Confirm and add step.
- Same-day warnings remain prominent red; same-week warnings remain amber. Existing commitments retain their date, school and time-gap context.
- Applies to the calendar drawer, session detail, editable staffing preview, published replacement/team edits and rescheduling. Published changes retain their ordinary change review and general reason; class date exceptions retain their own confirmation.
- The server derives day/week/availability exception flags from the reviewed current assessment. Assignment flags and existing historical reasons remain stored, so publication and reruns preserve the admin's choice.
- Automatic matching still requires full availability and its day/week limits. Overlap, inactive accounts, capacity, invalid class hosting and consecutive same-school assignments remain hard blocks. Policy hashes, version checks, authorization and transactional validation are unchanged.
- Existing assignment fields remain. Migration `20260923074048_warning_only_manual_workload` removes only the obsolete SQL check that required a reason whenever a day/week flag was set. It leaves all assignments, flags, historical reasons and other constraints unchanged; no reseed is needed.

This decision supersedes the earlier workload-confirmation requirements in the availability-only implementation record.

## Verification

- 219 unit tests and 206 PostgreSQL integration tests passed. Coverage includes direct and preview assignments without workload confirmations or a separate reason, combined availability/day/week warnings, published team edits/replacements, persistence/publication, strict automatic matching, stale reviews and hard conflicts.
- All 23 affected browser cases passed across the initial run and focused reruns. A test-only race was corrected to await the refreshed workshop version before a second assignment; the stale-version protection itself behaved correctly. Drawer/detail and preview cards passed 390px accessibility and overflow checks and were visually inspected.
- Lint, TypeScript, formatting, diff checks and the isolated production build passed. Independent UI/core review found no blocking defects.
- Migration `20260923074048_warning_only_manual_workload` is committed in `9a342f0`. It was applied to the verified demo database after a domain-data backup; every existing domain row and every other Assignment constraint matched before/after. No reset or reseed ran.

See [the protected demo release record](VERCEL_PREVIEW.md) for deployment and hosted checks.
