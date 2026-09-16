# End-to-end implementation plan

Reviewed 9 September 2026 against `main` at `07e17a0` and `origin/ENCT-Frontend` at `3aa1dd5`. This is the execution checklist; `DESIGN_BRIEF.md` remains the product brief.

Current status: **iterations 0–5 complete; iteration 6 local rehearsal complete, hosted staging pending; requested ENCT visual adaptation complete**. Work remains on `feature/dated-workshops`. Final UI verification on 10 September passed 46 unit tests, 62 PostgreSQL integration tests, all 16 browser tests, 51 desktop/mobile accessibility and geometry audits, lint, typecheck, formatting, and production build. All three GPT-5.6 implementation/review agents explicitly signed off. See `UI_REVIEW.md`. No merge or deployment has been performed.

Previous phase verification on 9 September: **46 unit tests, 62 PostgreSQL integration tests and all 11 browser tests passed**, along with lint, typecheck, formatting, production build and `git diff --check`. Integration/browser runs each applied all eight migrations to fresh isolated databases and seeded twice. Production email guards, a workshop error boundary and a CI database/browser job were added for the rehearsal. See `PILOT_RUNBOOK.md` for recovery steps, dependency review, and the remaining hosted email/backup/restore/log checks.

Build one demonstrable slice per iteration. Reach a manually scheduled, published workshop first, then make planning and staffing faster. Keep forms, tables, links, and status messages accessible throughout. The user's 10 September request supersedes the initial generic-placeholder visual constraint.

Existing development data is disposable seed/demo data. Recreate and reseed the isolated development database for the redesign; no legacy-data audit, archival workflow, reconciliation list, or backfill is required. Keep committed migration history and add a new migration for the schema changes.

## Completed implementation — 9 September 2026

Iterations **0 and 1 are complete** on `feature/dated-workshops`, based on `main` at `07e17a0`. Implementation commit: **`dc357b4`** (`Implement dated draft workshops and verified scheduling foundation`). No frontend branch was merged; the new interface uses generic forms, links, a scrollable table, pending buttons and status messages.

- Verified with Node **24.19.0**. Installed the original lockfile with `npm ci` and ran its 13 existing tests before adding test infrastructure. Existing application dependency versions were retained; Playwright and embedded PostgreSQL were added as pinned development dependencies.
- Added `npm run db:local`, which creates a persistent isolated PostgreSQL cluster under ignored `work/dev-db` and an environment file with random credentials. The development database was created from the committed migration chain and seeded. Integration and browser runners create separate clusters, ignore caller database URLs, and guard all fixture resets.
- Generated `20260909201329_dated_workshops` through `npm run db:migrate -- --name dated_workshops --create-only`, then applied it through `db:migrate`. The migration clears disposable scheduling rows, removes `Cycle` and obsolete enums, requires UTC workshop dates, and adds duration/staffing/version checks. All earlier migrations remain unchanged. Both test runners apply the full chain to an empty database and run the updated seed twice; integration assertions verify two demo workshops, one published assignment, and the absence of `Cycle`.
- Added monthly workshop navigation and school/class filters, draft creation, and a detail/edit page. Writes validate an active and consistent class/teacher/school, a real weekday date, positive same-day duration, full containment in one hosting block, staffing bounds, and class/teacher overlaps. Serializable transactions reject concurrent conflicts; a version check prevents stale draft edits. Hosting-block and PA-availability edits leave existing instants unchanged.
- Blocked teacher school changes while dependent classes remain. A class with any workshop history cannot change teacher or school; create a new class instead. Classes without workshops may be reassigned. Integration tests cover competing teacher/class edits.
- Updated both role dashboards and PA removal checks for the new statuses. Drafts remain private, even if an inconsistent fixture marks an assignment published. Browser tests verify school and PA visibility. Login now displays invite failures and redirects directly to the app's confirmation page; tests use real one-time console magic links without adding an authentication bypass.

Final verification against the implementation:

| Check                      | Result                                                                                                                                                                                    |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm test`                 | Passed: 33 unit tests, including Vancouver calendar/month/DST cases                                                                                                                       |
| `npm run test:integration` | Passed: 31 tests against migrated PostgreSQL; seed repeatability and concurrent writes included                                                                                           |
| `npm run test:e2e`         | Passed: 7 Chromium tests covering all roles, login failures/expiry/replay, stale sessions, availability, existing admin forms, draft creation/editing/month navigation, and draft privacy |
| `npm run lint`             | Passed, including tests and infrastructure scripts                                                                                                                                        |
| `npm run typecheck`        | Passed                                                                                                                                                                                    |
| `npm run format:check`     | Passed                                                                                                                                                                                    |
| `npm run build`            | Passed; workshop list and detail routes included                                                                                                                                          |
| `git diff --check`         | Passed                                                                                                                                                                                    |

Desktop and 390px-wide workshop screenshots were inspected; the table scrolls within the page and forms remain usable. `README.md` documents setup and repeatable checks. The initial dependency installation reported three existing high-severity advisories; dependency remediation remains part of the pre-launch review in iteration 6.

Iteration 2 completed in commit `5219eeb`: explicit monthly quotas and a configurable positive assignment gap, shared eligibility checking, protected manual assignment/removal, draft locking, and atomic publication. Scheduling transactions serialize workshop/PA/availability/quota changes; stale workshop versions are rejected. Verified with 37 unit tests, 42 PostgreSQL tests, 8 browser tests, lint, typecheck, format check and build. The browser suite covers the complete real-login staffing/publication flow and draft privacy. Iteration 3 completed in commit `455b3b4`: per-class cadence and defaults, selected-class monthly planning, explicit date/time entry, prospective target changes and transactional batch retries. Verified with 37 unit, 46 PostgreSQL and 9 browser tests, lint, typecheck, format check and build.

Iteration 4 completed in commit `9d9dfae`: deterministic quota-aware staffing, full schedule eligibility, protected work, 15-minute previews, stale-input detection and serialized atomic apply. Verified with 42 unit and 51 PostgreSQL tests, the new browser matching/adjustment/rerun/publication flow, lint, typecheck, formatting and build.

Iteration 5 completed in commit `7cf8c2c`: separately reviewed published changes, atomic replacement, rescheduling with all retained PAs rechecked, cancellation reasons, completion, audit history, role history and availability-review flags. Verified with 42 unit and 60 PostgreSQL tests, all 11 browser scenarios (8 in the initial regression plus 3 rerun after fixing an ambiguous test locator), lint, typecheck, formatting and build. The narrow change-review screenshot was inspected.

## Flow and interface

Teachers share weekly blocks when each class can host a workshop; admins record them. PAs submit recurring availability separately. The admin selects a month and all or some classes, creates dated workshops within the class blocks, assigns PAs, reviews, and publishes.

The initial admin workspace needs a month selector, school/class filters, select-all checkboxes, a workshop table, and a workshop detail page. Each row shows class, school, Vancouver date/time, staffing count, status, and lock state. Put edits and PA selection on the detail page. A calendar grid, drag-and-drop, and modal-heavy navigation can wait.

Teachers see their school's published workshops; PAs see their own. Draft work never appears in either view. Availability submission can happen before or during admin planning; it is not a mandatory sequential wizard step.

## 0. Establish a verified starting point — complete

- [x] Use a feature branch from the current `main`. Selectively port presentation components from `ENCT-Frontend` as needed; do not merge its scheduling implementation wholesale.
- [x] Establish Node 20.19+ and an isolated development/test database. Verified with Node 24.19.0 and a generated local development environment.
- [x] Run the existing checks against the exact committed dependencies. Add database integration and browser-test infrastructure using isolated fixtures; never add a production authentication bypass for testing.
- [x] Exercise invited, unknown, and deleted-user login, stale sessions, role authorization, PA availability saving, and the existing admin forms.
- [x] Fix the teacher-school integrity gap: block school changes while dependent classes remain, and prevent reassignment from silently moving historical workshops between schools.

**Done when:** all three roles can sign in with fixtures, access restrictions are tested, and the existing foundation passes tests, lint, typecheck, formatting, and build.

## 1. Replace cycles and create a real workshop — complete

- [x] Replace the cycle schema with dated workshops and remove the obsolete scheduling statuses. Existing seed/demo scheduling records may be cleared; preserving their IDs or mapping their old statuses is unnecessary.
- [x] Generate and commit the first scheduling migration with `npm run db:migrate -- --name dated_workshops`. Remove `Cycle` and its application references. No replacement term model. Recreate only the isolated development/test database and seed it with examples for the new model.
- [x] Give workshops required start/end instants and an explicit lifecycle: draft, published, completed, cancelled. Define assignment draft/published semantics with no accept/decline states.
- [x] Add `/admin/workshops?month=YYYY-MM`, a create form, and a detail/edit page. Keep existing PA/teacher queries and seed data compatible with the migration in the same change.
- [x] Validate active class/teacher/school, valid Vancouver date, positive duration, full containment within a class availability block, staffing bounds, and no overlapping workshops for the same class or teacher. Blocks are hosting availability, not necessarily the class's entire timetable. Meetings and PA availability changes must never move existing workshops implicitly.

**Done when:** the committed migration chain and updated seed build a working database from scratch. An admin creates and edits a dated draft, reloads it from the database, and navigates months correctly. Test date validation and Vancouver month/DST boundaries; legacy-data upgrade fixtures are unnecessary.

## 2. Complete the first manual end-to-end flow — complete

- [x] Add monthly PA quotas keyed by PA and `YYYY-MM`, plus an admin-configured minimum assignment gap. Show assigned-versus-quota counts. Missing quota means ineligible until configured; do not silently assume four workshops.
- [x] Build one shared eligibility checker for full PA availability, active PA role, staffing capacity, overlap, gap, and quota. Count work across all classes and schools in the month, including completed work; exclude cancelled and replaced assignments. Check neighboring assignments outside the selected month when testing the gap.
- [x] Add manual assign/remove, workshop locking, and explicit publish actions. Manual changes are protected by default. Use a workshop-level lock initially; published workshops are always protected from matching.
- [x] Publish only eligible, sufficiently staffed workshops. Recheck state and constraints inside the write transaction. Add a version check and concurrency protection so simultaneous admin actions cannot create conflicting assignments.
- [x] Update the PA and teacher views to expose published work only. The workshop lifecycle should be authoritative, with assignment visibility kept consistent transactionally.

**Done when:** admin creates a slot, manually staffs and publishes it; the assigned PA and correct school's teachers see it; everyone else cannot. A browser test covers this complete path and verifies draft privacy.

## 3. Plan a month for selected classes — complete

- [x] Add per-class monthly cadence and default workshop duration/staffing requirements. Keep values admin-editable rather than adopting the frontend branch's changed staffing defaults.
- [x] Provide select-all and selected-class creation. Preview the missing occurrences against that month's existing workshops; the admin explicitly chooses each date/time inside a hosting block before saving. Show PA availability counts as guidance if useful.
- [x] Support ad hoc workshops and preserve previously created slots. Repeated submissions must not duplicate workshops; use a batch request key and transactional validation. Explain classes without blocks or with incomplete dates instead of silently skipping them.
- [x] Keep cadence changes prospective: editing a class's target must not rewrite existing months. Show cancellations separately from planned/delivered totals so the admin can choose a replacement.

**Done when:** the admin plans two months for all or selected classes, mixes one- and two-workshop cadences, adds an ad hoc occurrence, and can safely retry a submission.

## 4. Assign PAs automatically — complete

- [x] Implement a pure matcher whose inputs are existing dated workshops, active PAs, availability, quotas, the required gap, and existing assignments. Its output contains proposed PA assignments and explanations; it cannot contain workshop date edits.
- [x] Reuse the manual eligibility rules. Prioritize workshops with fewer eligible PAs, fill minimum staffing before adding optional staff, and balance toward monthly quotas with deterministic tie-breaking. A greedy first version is acceptable; report that it may leave feasible combinations undiscovered.
- [x] Scope runs to the selected month/classes while loading all relevant PA commitments for quota and conflict checks. Preserve locked, manually adjusted, published, completed, and cancelled work.
- [x] Preview changes before applying. Replace only eligible machine-generated drafts in a transaction, with stale-preview detection and concurrency protection. A repeat run must not inflate workload counts or duplicate assignments.
- [x] Show actionable reasons for understaffing: missing availability/quota, insufficient full-duration availability, quota reached, conflicting assignment, or insufficient gap.

**Done when:** the admin can generate, adjust, lock, rerun, and publish a month without moving dates or disturbing protected work. Tests cover partial staffing, same-school gaps, competing runs, month boundaries, and quota fairness.

## 5. Handle changes after publication — complete

- [x] Add admin replacement, rescheduling, cancellation with a reason, and completion. Record actor, timestamp, and before/after details for these changes.
- [x] A replacement is atomic: if the new PA is invalid, the old assignment remains. A reschedule must revalidate every retained PA and both months' counts if the date crosses a month boundary.
- [x] Stage edits to published workshops separately until the admin applies them; preserve the currently published information during review. Applying an exception updates only the affected workshop and refreshes both role views.
- [x] Keep cancellations and completions visible in history. The pilot can use external admin communication for changes; do not claim email notifications exist unless implemented.
- [x] Flag existing commitments affected by later PA availability edits. Never silently unassign or republish them.

**Done when:** an admin replaces an unavailable PA, moves a workshop, cancels another, and records completion; history and role views remain accurate, including failed edits.

## 6. Run a realistic pilot rehearsal — local work complete; staging pending

Local rehearsal implementation and release notes: commit `4f6a785`. Hosted staging remains unchecked below.

- [x] Exercise multiple schools, classes with different cadences, uneven availability, insufficient PAs, quota zero, full quotas, locked rows, and adjacent-month conflicts. Run the complete workflow against a migrated test database.
- [x] Add browser coverage for bulk creation, matching/reruns, publishing, and exceptions. Add direct Server Action authorization and concurrency tests; UI restrictions alone are insufficient.
- [x] Check keyboard access, labels, pending/error/empty states, narrow screens, and reload/back navigation. The initial generic design is followed by the requested ENCT visual adaptation below.
- [x] Review repository deployment configuration, migration order and remaining dependency advisories. Add production email configuration guards, an error boundary, and CI database/browser rehearsal.
- [ ] Verify the complete hosted staging configuration, actual backup/restore, real invite-only email delivery and hosted server error visibility. The protected Vercel test preview is deployed and its demo sign-in verified; real-email and recovery checks remain separate. See `PILOT_RUNBOOK.md` and `VERCEL_PREVIEW.md`.

**Done when:** the entire monthly workflow and an ad hoc replacement succeed in staging with real email delivery, and the team can explain and recover failed operations. Deployment is a separate release action after this rehearsal.

## ENCT-Frontend reuse decisions

Initial planning review: the branch was fetched and inspected, not merged or runtime-tested. It has 14 commits absent from `main` and lacks the cleanup commit. Paths below refer to that branch. The 10 September follow-up implements its visual language against the dated-workshop backend; see the follow-up checklist and `UI_REVIEW.md` for the resulting verification.

| Component                                                                              | Decision                                                                                                                                                                                                                 |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/components/shell/role-shell.tsx`, `role-sidebar.tsx`                              | Reuse early with neutral styling and narrow-screen navigation. Update links to the new monthly workspace; retain current `requireRole` checks in pages/actions. Avoid nested `main` elements when introducing the shell. |
| `src/components/ui/status-badge.tsx`, `src/components/admin/stat-card.tsx`             | Reuse small presentational pieces. Type badges against the new lifecycle, including published/completed. Replace `cn` with simple class composition; icons are optional, so the old UI dependency stack is unnecessary.  |
| `src/components/availability-grid.tsx`                                                 | Adapt for PA input. Its “Clear all” is `type="reset"`, which restores saved checks, and the selected count is static. Correct both or omit these controls. Do not restore teacher self-service.                          |
| `src/components/admin/schedule-review.tsx`                                             | Reuse table/card markup when needed. Rebuild the state/actions: it currently revolves around a cycle, nullable dates, running the old scheduler, and confirming everything.                                              |
| `src/components/admin/assignment-modal.tsx`                                            | Borrow the assigned/eligible PA list layout for a detail page. Replace its direct coupling to legacy actions; fetch candidates on the server and revalidate on write.                                                    |
| `src/app/pa/schedule/page.tsx`, `src/app/teacher/schedule/page.tsx`                    | Optional later presentation reference. Current queries expose proposals/scheduled drafts, and `src/lib/week-grid.ts` groups dates in the server timezone. Rebuild queries and Vancouver grouping before reuse.           |
| `src/app/admin/heatmap/HeatmapClient.tsx`                                              | Optional planning aid after the manual flow works. Weekly cell counts do not prove eligibility for a dated, full-duration workshop with quota/gap constraints. Remove the speculative commute filtering.                 |
| Cycle screens, `cycle-grid.tsx`, `admin/modals.tsx`, teacher availability, PA check-in | Exclude from the pilot port. Cycle and teacher flows conflict with the design; check-in contains placeholder controls/data. The generic modal also needs keyboard/focus handling before reuse.                           |

The branch contains backend work too, but it is not a ready replacement: `quota.ts` counts by cycle and stores a single quota on the user; `commute.ts` uses approximate home-community distances instead of gaps between assignments; `assignments.ts` creates confirmed assignments directly and its swap uses delete/recreate compensation rather than a database transaction. Keep these as reference material and implement the shared rules above.

## Requested UI follow-up — complete, 10 September 2026

- [x] Fetch and inspect `ENCT-Frontend` at `3aa1dd5`; adapt its navy/amber visual language, panels, tables, badges, icons, and existing landing image to the dated-workshop backend.
- [x] Implement shared role shells and responsive navigation; restyle public/auth, admin management, scheduling/review, PA availability, and teacher views with real data and existing actions.
- [x] Use three GPT-5.6 agents during implementation and independent cross-review. Iterate on source, screenshot, workflow, accessibility, and geometry feedback until all three explicitly sign off.
- [x] Resolve availability interaction/overflow, ambiguous controls, pending/prerequisite feedback, contrast, mobile focus trapping, hidden-heading overflow, and table-scroll discoverability.
- [x] Pass 46 unit, 62 integration, and 16 browser tests; inspect 51 desktop/mobile screen states with zero axe violations and zero document overflow. Pass lint, typecheck, formatting, production build, clean-install lockfile validation, and diff checks.
- [x] Record implementation choices, review iterations, final signoffs, and remaining hosted-staging limits in `UI_REVIEW.md`.

## Requested Vercel test preview — 10 September 2026

- [x] Create the dedicated `workshop-scheduler-test` Vercel project and free Neon database, with Preview-only environment variables and Vercel Authentication enabled.
- [x] Add the approved admin, teacher, and PA demo sign-in choices behind exact preview/project/configuration gates. Use active role-checked accounts, same-origin requests, secure database sessions, and a two-hour expiry; preserve normal production email authentication.
- [x] Add opt-in disposable preview seeding with a shared published teacher/PA workshop and an admin draft. Keep the default local seed unchanged.
- [x] Use three GPT-5.6 agents for implementation and independent review; fix the session lifetime extension and canonical-email configuration findings.
- [x] Pass 68 unit tests, lint, typecheck, formatting, production build, and diff checks locally.
- [x] Pass all 69 integration and 16 existing browser tests in Linux, including desktop/mobile accessibility and overflow audits. Restrict Tailwind scanning to `src` so exported QA workspaces do not watch their own logs.
- [x] Pass the dedicated preview-login browser test using an HTTPS browser origin, verifying real database sessions, secure cookies, role identity, and the hard two-hour expiry. All 154 automated tests pass: 68 unit, 69 integration, and 17 browser tests.
- [x] Apply all eight migrations to the dedicated Neon database and run the guarded preview seed twice successfully. Publish the final protected Preview using only the normal build command, with initialization helpers excluded.
- [x] Verify all three roles on the final hosted URL: real HTTPS button-to-dashboard navigation, exact account roles, published/draft privacy, both cross-role denials, sign-out, secure two-hour sessions, zero captured server errors, and zero accessibility violations. Inspect the desktop/mobile login and three role dashboard captures.
- [x] Obtain explicit final signoff from all three GPT-5.6 reviewers after source, test, and hosted screenshot review. Record the URL, validation, and remaining pilot limits in `VERCEL_PREVIEW.md`.

Final preview: [Open the protected demo](https://workshop-scheduler-test-22wsj71ua-bryanj1angs-projects.vercel.app/login). Deployment `dpl_Ad5C9Crwiyi4Dj3hpKQeJ5Zw5Lbp` is Ready. Source is saved on `feature/dated-workshops`, based on `1c18674`; preview changes remain uncommitted because this session cannot write Git metadata.

## Day spacing and usability follow-up — 16 September 2026

- [x] Replace minute spacing with 1–365 whole Vancouver calendar days across all PA assignments. One day permits adjacent dates. Explicitly reject another assignment for the same PA at the same school on the same date, including different classes.
- [x] Add an additive migration that rounds legacy minutes up to days, retains unconfigured NULL values and existing assignments, and invalidates stale previews. Keep the old column ignored for compatibility with the previous preview during deployment.
- [x] Apply the shared eligibility rule to manual assignment, matching, publication, replacement and rescheduling. Retain existing conflicting commitments and surface review warnings.
- [x] Rename the class editor's meeting-time action to “Add availability” and align its heading, directory labels and validation wording.
- [x] Preserve the selected quota month after saving the global gap, eliminating repeated month entry and an extra “Show quotas” submission.
- [x] Pass 101 unit, 79 integration and 18 browser tests. Cover exact day thresholds, date symmetry, DST, month/year/leap boundaries, UTC versus Vancouver dates, different classes at one school, lifecycle exclusions, concurrency, stale previews and legacy migration conversion. Pass lint, typecheck, formatting, diff checks and local/hosted production builds. Exclude generated test workspace copies from TypeScript compilation.
- [x] Migrate the existing Neon test database without reseeding. Deploy and verify all three demo roles, access isolation, secure two-hour sessions, day settings, selected-month persistence and availability wording on the protected preview. Hosted checks captured no application 5xx responses or axe violations.
- [x] Inspect eight live workflow states and record prioritized, testable usability improvements in `UX_IMPROVEMENTS.md`. The broad redesign remains proposed; the day-gap, copy and month-preservation fixes above are implemented.
- [x] Implement navigation context, the compact monthly workspace, in-place staffing, reviewed bulk publication, availability ranges/day copy/undo, bulk quotas, explicit class-based date suggestions and the monthly task list. See `UX_IMPLEMENTATION_REVIEW.md` for review findings and validation.

Current preview: [Open the protected demo](https://workshop-scheduler-test-kfbixhbdn-bryanj1angs-projects.vercel.app/login), deployment `dpl_4c4jcQ8Kp7s1YoMZjUef3WGyDvQa` (Ready). The usability follow-up passes 116 unit, 92 integration and 25 browser tests, the 51-screen accessibility/overflow audit, required code checks and local/hosted builds. All three demo roles and the new workspace/mobile surfaces passed hosted verification. No database reset was performed. The three GPT-5.6 agents reached their usage limit during this follow-up; current validation was completed locally and does not imply renewed independent signoff. Automated coverage is broad, not a claim that every possible edge case or future UX flow is tested.

## Working assumptions for the first implementation

- PAs provide availability for workshop time; the minimum gap is 1 to 365 whole Vancouver calendar days between assignment dates across all schools. A gap of 1 permits adjacent dates. The same PA cannot visit one school twice on the same date, even for different classes. Existing assignments remain intact and conflicts are flagged.
- Normal publishing enforces the constraints. If real operations require exceptions, add a deliberate admin override with a reason and visible warning; never let the matcher override them automatically.
- Blocked school dates are a useful later addition from the frontend branch, but the first pilot handles holidays through explicit admin date selection. Live routing, PA check-in, calendar sync, and extra dashboards remain deferred.

Each iteration should include its own migration, validation, authorization, and relevant tests, and pass the checks in `AGENTS.md`. Keep this checklist updated with completed commits; keep implementation detail out of the short product brief.
