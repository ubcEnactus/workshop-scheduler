# Workshop calendar overview

## Design and behavior

Once a workshop has published sessions, its default page becomes a calendar overview. The calendar is scoped to one workshop and opens at the next scheduled session, or the most recent session when delivery has finished. Explicit Plan, Staff, Publish, batch, and teacher links keep their existing destinations. The calendar is also available before publication through View workshop calendar.

The hierarchy is workshop title and delivery window, summary counts, published sessions needing attention, calendar and selected-day details, then workshop details. Dates show session counts on narrow screens and time/school previews on wider screens. The selected-day panel shows every session on the date, status, school, teacher, location, PA team, staffing warnings, and View & edit session. Cancelled history is available through the status filter. All dates are grouped in America/Vancouver; navigation is not limited to the delivery window.

Continue scheduling returns to the relevant draft workflow. Publication exposes Open workshop overview. Sessions use the existing reviewed mutation flow, with the originating calendar month preserved through review and apply. Master schedule return links retain their existing filters. Workshop details reuse the same form, validation, stale-edit guard, and delivery-window checks as the directory, with a return to this overview.

No schema migration or scheduling-data conversion is required. Earlier sessions, assignments, and recorded host names are preserved. No participant permissions change.

## Verification

245 unit tests and 256 PostgreSQL integration tests pass. Six affected browser journeys pass: the new overview with mixed states, cross-month navigation, host snapshots, isolation from other workshops, in-place workshop detail edits, both reviewed-edit return paths, publication refresh safety, and desktop/mobile planning. Calendar desktop/mobile accessibility checks report no WCAG A/AA violations or horizontal overflow. Screenshots were visually reviewed. An initial browser test exposed an ambiguous status-selector label; the explicit Session status label is now verified.

Lint, TypeScript, formatting, diff checks, and the production build pass. No database migration is required.

## Deployment

Released September 27, 2026 from pushed commit `4c5edeabe6886bccb1faeadccc02dc1acc4588aa` on `feature/dated-workshops`, using a frozen 349-file export.

- [Ennovate](https://ennovate-workshop-demo.vercel.app/login): `dpl_HQeVNke976UZ8pysz4DpnoLLL3ey`.
- [Enspire](https://enspire-workshop-demo.vercel.app/login): `dpl_8DKpi6LJyCACb5aGKWpWfgPtN1V2`.

Both builds reached READY before updating the existing public aliases. Hosted verification passed 49 desktop/mobile states, including workshop overview, session navigation and return, workflow tabs, PA availability, teacher screens, sign-in/out, role restrictions, and cross-demo session isolation. No accessibility violations, overflow, application 5xx responses, or browser exceptions were detected. The deployed mobile overview was visually inspected. Ennovate supplied the live workshop data for the overview checks; Enspire has no workshop sessions, so its identical build was verified through the available screens without creating test scheduling records.

All 23 migrations were already applied. Before/after fingerprints matched across all 26 application tables in each database. No scheduling data changed during deployment or hosted verification. Evidence is retained in ignored `work/workshop-overview-release-20260927/`.
