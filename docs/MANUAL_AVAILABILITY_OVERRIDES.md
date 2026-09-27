# Manual PA availability warnings

## Decision — 23 September 2026

Missing or incomplete PA availability must not disable manual Assign/Add buttons. The warning remains visible, and clicking the existing action is enough. No new availability checkbox, reason, confirmation modal or workflow step is required. Existing day/week workload override controls are unchanged.

## Scope and implementation

- Covers the calendar staffing drawer, session-detail staffing, editable matching preview, published team edits/replacements, and rescheduling with retained PAs.
- Assignment assessment separates availability warnings from hard errors. Automatic matching, automatic backup counts and workload-feasibility suggestions still require full availability.
- The server derives `Assignment.overrideAvailability` from the reviewed assessment. The additive migration defaults existing assignments to false; it does not retroactively approve availability changes or alter any PA availability.
- Preview JSON, saved assignments and audit snapshots retain the override. Publication accepts an explicitly overridden availability warning; matcher reruns preserve the manual assignment. Moving the session re-evaluates availability for its new time.
- Warnings remain visible before and after selection. Actual overlaps, inactive accounts, staffing capacity, invalid class hosting and consecutive same-school sessions remain blocking. Existing stale-review, role, version and transaction checks remain in place.

## Migration

`20260923070920_manual_availability_override` was generated with `npm run db:migrate -- --name manual_availability_override` against a disposable local PostgreSQL cluster. It adds one non-null boolean column with a false default and performs no backfill of approvals or destructive data change. Apply it before serving the new build.

The schema and generated migration are committed in `9a9ed89`. The dedicated demo database was backed up, then migrated with `prisma migrate deploy` using its verified direct connection. All existing domain rows compared equal before/after the migration, and no existing assignment received a retroactive override. There was no reset or reseed.

## Verification

- 218 unit tests and 196 integration tests pass. Cases cover missing and partial coverage, derived override flags, stale policy hashes, non-grandfathering of existing assignments, direct and preview publication, replacement/combined edits, rescheduling re-evaluation, automatic exclusion, workload confirmation coexistence and genuine hard conflicts.
- Eight new desktop browser cases pass: both coverage warnings in the calendar drawer and session detail, editable proposal add/remove/apply/publish/rerun, published edit/replacement review, and overlap blocking across the three staffing surfaces.
- All 76 distinct browser cases are verified across the full run and focused reruns: 72 initially passed, the one workload-tooltip cancellation regression passed after a narrow interaction fix, and three additional 390px staffing audits passed. Those mobile tests verify both warnings, enabled actions, successful persistence, zero axe violations and no horizontal overflow. Screenshots of all three surfaces were inspected.
- Cancelling a workload review now keeps its tooltip dismissed despite layout-generated mouse entry, while restoring keyboard focus. A subsequent deliberate hover/focus/tap can reveal it normally. The repaired regression asserts immediate compact state and restored focus, then checks deliberate hover and Escape; it does not hide the issue by moving the pointer away before asserting cancellation.
- Lint, TypeScript, formatting, diff checks, and production builds pass. The local production build used an identical source export with separate dependencies so it did not replace the Windows Prisma DLL used by active browser tests.
- Independent UI/core review found no blocking defects. All manual mutation paths were inventoried; date-planning PA counts intentionally remain fully-available-only suggestions, not manual assignment controls.
- The protected [demo deployment](https://workshop-scheduler-test-rc86dv3tm-bryanj1angs-projects.vercel.app/login) is Ready. Hosted HTTP verification checks ten availability-warning cards with enabled Assign buttons and no added confirmation/reason, calendar warning data, and unchanged on-demand creation. Verification followed React's streamed control fragments; no hosted assignments or workshops were changed.

Local release artifacts are under ignored `work/vercel-availability-20260923`, `work/availability-before-migration-*.json`, and `work/availability-migration-verification-*.json`. Credentials and these artifacts are excluded from uploads.
