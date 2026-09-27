# Weekly PA availability and calendar

## Single current schedule and admin calendar additions

September 27 follow-up: PAs and admins maintain one current weekly schedule. The effective-date input and version navigation are removed. Each save uses today in Vancouver, replaces today and future weekly rows, and removes superseded future versions. Earlier records remain available for historical calendar coverage. Dated admin changes and published assignments are preserved, including when the weekly schedule is cleared. Existing future versions remain untouched until that PA's next weekly save; this release does not rewrite scheduling data on deployment.

Admin one-off additions now live in the selected calendar day, with start/end time and optional notes. Added time appears on that day with a Remove control. Existing restrictions remain visible to admins and removable for current/future dates. The standalone exceptions section is removed. PAs retain their read-only calendar and receive neither dated editing controls nor private admin notes.

Implementation plan completed: simplify the shared weekly editor, use a server-selected current date with the existing transaction and revision guards, put admin dated actions in the calendar sidebar, and verify history, permissions, stale edits, and responsive layouts. No schema migration is required.

Validation: 242 unit and 256 PostgreSQL integration tests pass, including future-plan replacement, forged-date handling, empty current schedules, historical preservation, and unchanged published assignments. All 14 selected browser journeys pass, covering the new calendar interactions, PA/admin stale saves, staffing, publication, and teacher scheduling. Desktop/mobile accessibility and overflow checks pass; screenshots were visually inspected. Lint, TypeScript, formatting, diff checks, and the production build pass.

## Earlier weekly-calendar release

Deployed to Ennovate and Enspire on September 27, 2026, from commit `d6f31f90c59b97761b93520e8b2e457507bb2ab5` on `feature/dated-workshops`.

PAs enter a time range and select Monday–Friday checkboxes beneath it. One action adds the range to every selected weekday; overlapping times merge, and the weekly list shows every day together. Remove, clear, and undo operate on the unsaved weekly schedule, with an explicit save and the existing concurrent-edit protection.

The calendar below uses the teacher calendar's month grid, green availability, blue workshops, and selected-day sidebar. It renders saved availability according to effective dates and existing admin restrictions, using the matcher's coverage rules. Unsaved changes do not alter the calendar. Only the selected PA's published assignments appear; draft sessions and admin exception notes are not sent to the PA calendar. Calendar navigation and date selection do not change scheduling records.

PA time-off and date-specific availability forms and Server Actions are removed. The individual-slot grid is admin-only. Admins retain their existing detailed editing controls and share the weekly block input and read-only calendar. Earlier records, effective versions, and assignments are preserved. Time off is communicated manually.

No schema migration is required. Unit and integration suites passed (242 and 255 tests). All 20 selected browser journeys passed, including the weekly-only PA flow, published-assignment privacy, effective-date calendar navigation, admin editing, stale saves, staffing, and publication. The calendar test passed again after the final mobile layout adjustment. Desktop/mobile accessibility checks found no WCAG A/AA violations or horizontal overflow; screenshots were visually reviewed. Formatting, lint, TypeScript, production build, and `git diff --check` passed. Evidence is retained in ignored `work/pa-calendar-*.log` and `work/pa-weekly-calendar-*.png`.

## Deployment verification

The release was exported directly from the pushed Git commit into a frozen 343-file snapshot. Both remote builds reached READY before the existing public aliases were updated; project access and email settings were preserved.

- [Ennovate](https://ennovate-workshop-demo.vercel.app/login): `dpl_E9nHe7oNsmrQ36426HawLrLR9iC1`.
- [Enspire](https://enspire-workshop-demo.vercel.app/login): `dpl_6pd466qiu8tj1fjfdiZjCQGnMWxR`.

Both databases already had all 23 required migrations. Database-side fingerprints matched across all 26 application tables before and after deployment; no schema or scheduling-data changes were needed.

Hosted verification passed 47 desktop/mobile page states. It checked the five weekday checkboxes, read-only PA calendar navigation, absence of PA time-off and individual-slot controls, retained admin controls, teacher tabs, booking, sign-in/out, role restrictions, and cross-demo session isolation. No accessibility violations, horizontal overflow, browser errors, or application 5xx responses were detected. The final run waits for the PA editor's controls to become enabled before testing calendar navigation, after the first run timed out on an early Enspire navigation click. No scheduling records were edited during verification. The deployed PA mobile layout was visually inspected.

The commit manifest, deployment and alias records, database comparisons, screenshots, and hosted results are retained in ignored `work/pa-calendar-release-20260927/`.
