# Workshop Scheduler — implementation plan

Historical domain implementation plan. The current workshop-flow contract is [WORKSHOP_WORKSPACE_PLAN.md](WORKSHOP_WORKSPACE_PLAN.md); it supersedes preview/apply and implicit whole-session protection behavior. Actual execution evidence is in [WORKSHOP_WORKSPACE_REVIEW.md](WORKSHOP_WORKSPACE_REVIEW.md).

Prepared 20 September 2026. **Status: implemented, independently reviewed, demo-reseeded, and deployed to the protected Vercel test project.** See [IMPLEMENTATION_REVIEW.md](IMPLEMENTATION_REVIEW.md) for verification, the test link, and the demo walkthrough.

This is the current execution plan for the [20 September audit](WORKSHOP_AUDIT_2026-09-20.md), reconciled with the earlier booking and usability reviews. The previous implementation record is preserved in [IMPLEMENTATION_HISTORY.md](IMPLEMENTATION_HISTORY.md). Its completion claims, test counts, and disposable-development-data assumptions describe earlier work; they are not instructions for these migrations.

The plan builds on the current working tree, including the class-workshop changes already present during the audit. **Revised after the user's clarification: monthly/semi-monthly delivery was operating context, not a request for automatic class quotas or half-month deadlines. The planning unit is a named workshop run with one shared delivery window across participating schools.** Coverage comes from the classes enrolled in that run.

Weekly class availability now generates candidates, workshop numbers are optional, and admins can review combined changes. The implementation builds on shared delivery windows and preserved scheduling history. [DESIGN_BRIEF.md](DESIGN_BRIEF.md), [AGENTS.md](../AGENTS.md), the schema, and the routes describe the confirmed behavior. The roadmap below records the implementation scope and decisions.

**Intended outcome**

An admin creates a named workshop run, sets its start/end dates once for all participating schools, and selects the classes that will receive it. The admin enters weekly class availability, chooses a separate session time for each class, normally inside the shared window, with explicit admin date exceptions, assigns PAs, publishes, and makes ordinary changes without rebuilding the schedule. Every enrolled class remains visible even when it has no availability, booking, or PA assignment.

For example, “Building a Business” may run from 5–23 October across ten classes at three schools. Those ten classes each need a session somewhere inside 5–23 October; they do not all meet at the same time. Another workshop can have an independently chosen window, including one that crosses calendar months. Creating a second run for the same ten classes creates twenty intended deliveries because the admin selected two runs, not because of a monthly cadence rule.

Keep the existing stack, admin authority, teacher view-only access, PA availability self-service, UTC storage with Vancouver display, publication protections, manual locks, reviewed history, and transactional validation. **Assign PAs continues to staff existing dated sessions only.** No cycles or PA acceptance workflow are introduced.

**Product decisions**

The shared workshop window and the confirmed decisions below are the product contract for this roadmap. The planning flow, warning hierarchy, and Monday–Friday weekly boundary are agreed. No outstanding product decision blocks starting implementation. Screen layout can be refined during development, and existing explicit duration/staffing defaults remain in place until deliberately edited.

**Decision record — confirmed rules and remaining discussion**

**23 September follow-up:** same-day and same-week manual workload exceptions are now warning-only too. Remove their override form, confirmation checkboxes and separate reason requirement on every manual staffing surface. Clicking Assign/Add after seeing the warning records the relevant exceptions. Red same-day/amber weekly warnings and commitment context remain; automatic limits, hard conflicts and class date-exception confirmation are unchanged. This supersedes the confirmation requirements in earlier decision records below.

**23 September update:** the admin's newer decision supersedes earlier references below to full PA availability as a manual hard constraint. Missing/partial availability is warning-only on all manual staffing screens; clicking Assign/Add records an assignment-specific override without another checkbox or reason. Automatic staffing and planner availability counts still require full coverage. Overlaps, inactive accounts, capacity and consecutive same-school conflicts remain blocked, and existing day/week override confirmations remain required. Saved availability overrides survive publication and reruns; moving a session re-evaluates them.

The latest user decisions below supersede the earlier recommendations and guided the implementation. The previous suggestion of one PA assignment per workshop type/run is superseded by total-assignment fairness: there is no per-run PA cap unless separately configured later.

| ID  | Status                        | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D1  | Confirmed                     | One delivered session per representative class per workshop run. If classes A and B attend together, an admin note on A identifies the combined audience; no grouped-class model is needed. A second visit is another workshop run, including a temporary one.                                                                                                                                                                                                                                                                 |
| D2  | Confirmed                     | Automatic date suggestions stay inside the shared run window. Admins can explicitly move an individual session outside it without changing the shared range. Preserve that exception and its history across reruns.                                                                                                                                                                                                                                                                                                            |
| D3  | Confirmed                     | Automatic assignment allows at most one session per PA per day and one per week. Same-day manual assignment needs a prominent red override confirmation; same-week manual assignment needs an amber override warning. Full PA availability and no overlap remain hard constraints. The earlier prohibition on consecutive classes at the same school remains separate; generic workload overrides do not silently remove it. The weekly capacity period is Monday–Friday in America/Vancouver, resetting the following Monday. |
| D4  | Confirmed                     | Remove monthly quotas as an assignment prerequisite. Prefer suitable PAs with fewer total assignments as a soft fairness signal. Any workload cap is a separately configured optional policy, not mandatory monthly setup.                                                                                                                                                                                                                                                                                                     |
| D5  | Flow agreed; layout to refine | Admin enters recurring teacher-provided blocks. Show a class-by-class planning board with dated choices, recommended PA counts, manual options with warnings, and a combined staffing preview. Detailed screen information hierarchy remains to be designed.                                                                                                                                                                                                                                                                   |
| D6  | Default proposal retained     | Set duration and minimum/maximum PAs on the run, with reviewed per-class changes. No new numeric staffing minimum has been agreed; preserve existing explicit values rather than inventing one.                                                                                                                                                                                                                                                                                                                                |
| D7  | Confirmed for scheduling      | Use 15-minute scheduling increments; admins enter the class's available time blocks. Recurring availability and dated exceptions remain in scope. Align PA input and storage with the chosen precision so the interface does not suggest unsupported times. Wider operating hours are not newly required.                                                                                                                                                                                                                      |
| D8  | Confirmed                     | Publish ready class sessions individually or in a reviewed batch. A published session may subsequently need replacement staff: admin can remove a PA and retain the event with a prominent staffing warning. Initial publication requires valid staffing. PA availability edits flag conflicts; admins change assignments.                                                                                                                                                                                                     |
| D9  | Confirmed for pilot           | Use in-app views/history and manual external coordination for now. Automatic schedule-change emails remain deferred; publishing must not imply that notification was sent.                                                                                                                                                                                                                                                                                                                                                     |
| D10 | Confirmed for pilot           | Retain school-wide, view-only teacher access. Teacher-facing enhancements are low priority; no scheduling controls or teacher self-service are needed.                                                                                                                                                                                                                                                                                                                                                                         |

Combined-class notes do not create attendance or completion records for class B. For that run, enroll the representative A once rather than also creating an unexplained outstanding delivery for B. The review should make the selected list and combined-audience note clear; no automatic grouping/deduplication feature is required.

Proposed fairness accounting: count a PA's actual assignment records across dated drafts, published sessions, and completed sessions; exclude cancelled sessions and removed/replaced assignments. Include assignments selected in the current preview when scoring its next choice. Equal totals use stable tie-breaking. This is an all-time aggregate, not a monthly ratio or a promise that everyone receives the same number. Never prefer a lower total at the expense of full availability, fewer covered sessions, or an automatic daily/weekly rule.

Separate three kinds of rule in validation: constraints needed for a valid assignment (such as full PA availability and no overlapping sessions), automatic-only workload rules, and explicit admin exceptions. A daily or weekly workload override must not become a blanket override of PA availability, an overlapping assignment, or another distinct hard constraint. Admin exceptions need an explicit reviewed action and recorded actor/diff; do not introduce another approval role. Proposed optional caps remain off unless configured, and legacy monthly quota rows must not silently become new caps.

**Agreed flags and PA counts**

| Condition                                                                     | Automatic scheduling                                      | Manual interaction                                                                             |
| ----------------------------------------------------------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| PA unavailable for any part of the session, or overlapping another assignment | Hard block                                                | Hard block; an admin workload override cannot assert a PA is available.                        |
| Second or subsequent workshop on the same Vancouver date                      | Never assign automatically                                | Prominent red **Same-day workload override required** with an explicit confirmation.           |
| Another workshop inside the defined week                                      | Never assign automatically                                | Amber **Weekly workload override required**.                                                   |
| Higher total assignment count than another suitable PA                        | Prefer the less-loaded PA when other priorities are equal | Neutral fairness information; no block or mandatory override.                                  |
| Class session outside the shared run window or recorded class availability    | Do not propose automatically                              | Use the specific admin date-exception/confirmation workflow; it does not waive PA constraints. |

The pasted agreement confirms manual same-day exceptions, including at different schools. Retain the earlier separate rule against consecutive classes at the same school unless explicitly changed. A week means Monday–Friday in America/Vancouver for the automatic capacity limit. Friday and the following Monday belong to different capacity weeks; no rolling seven-day gap applies. Do not create an undefined “unusually heavy workload” warning from lifetime totals; additional caps need an explicit configured threshold and policy.

For each candidate interval, show the staffing requirement and two disjoint counts: **recommended** (available for the full interval, no hard conflict, meets all automatic rules) and **available with warnings** (meets hard constraints but needs a workload override). Fairness affects ordering within these pools; it does not remove a PA from the recommended count. A PA with both a daily and weekly warning counts once, with the stronger daily warning prominent and both reasons inspectable. Hard-blocked PAs do not contribute to either count. Counts are tied to the current preview and recomputed when dates, assignments, or availability change.

Expanding a candidate shows names, applicable warnings, existing commitment dates/times/schools, and total assignments. Same-day override confirmation shows the existing and proposed sessions together and records the actor and specific exception. Show the time between sessions and locations so the admin can assess travel; absence of a time overlap is not a travel guarantee. No PA acceptance workflow is added.

**Batch-label refinements from the review**

These details make the agreed warning hierarchy precise; they do not authorize automatic workload exceptions:

- **Ready:** a complete valid staffing preview exists for the selected batch, considering existing commitments and all automatic rules. Independent candidate counts are insufficient evidence.
- **Tight staffing:** the batch is staffable but has a demonstrated lack of backup candidates. It is a warning alongside Ready, not a claim that staffing is already invalid. Show the affected classes and the concrete backup limitation.
- **Weekly override option:** a concrete staffing preview becomes available when weekly workload exceptions are considered while daily and hard constraints are retained. Describe exactly which assignments need approval; do not merely say an override would be “tempting.”
- **Same-day override option:** a concrete preview includes same-day workload exceptions, shown with the stronger red warning and affected PAs. No exception is applied by viewing this option.
- **Insufficient availability:** a demonstrated shortage under the hard constraints, for example one genuinely available PA for two required places. Explain the shortage and count missing or unsubmitted availability separately from known availability.
- **No valid staffing plan found:** the search did not find a complete result, but has not proved impossibility. A heuristic timeout must not become “impossible” or “requires an override.” Likewise, finding a manual-override option does not prove that an ordinary alternative cannot exist.

Batch issues may coexist: one class may have a real shortage while another only needs a weekly exception. Keep the per-class breakdown, affected PAs, and next actions visible. Revalidate on apply, preserve each distinct hard/soft reason, and invalidate an override confirmation if the affected time, PA, or relevant commitments change. Use text/icons as well as color to distinguish **Blocked** from **Override required**.

**Agreed date-planning flow — screen details to refine**

1. On each class, admin records the teacher's recurring weekly blocks, effective dates, and any known exceptions. For example: Monday 09:00–11:00, Wednesday 13:00–15:00, and Thursday 10:00–11:30. This is reusable class availability, independent of an individual run.
2. Admin opens a named run with its window, duration, staffing requirement, and participating classes. Show every class in a planning list, including classes with no suitable date.
3. For each class, offer a few good dated choices, with a calendar/timeline to inspect more. Fit the whole duration inside a teacher block; step suggested starts by 15 minutes. Show PAs available for the full interval and free of hard conflicts, how many also qualify under automatic daily/weekly rules, the number needed, and names/reasons on inspection. Fairness totals rank suitable candidates but do not exclude them.
4. Admin selects or adjusts a start/end, with live count refresh. Outside the run window, show an explicit admin exception instead of preventing the edit. If a date is newly confirmed outside the recorded class blocks, record that specific confirmation without broadening the recurring schedule. Missing PA coverage remains visible rather than silently moving the time.
5. The selected dates form a reviewable batch. Run a temporary staffing feasibility check across the entire batch and existing commitments: the same two PAs cannot count as available independently for several competing sessions. Show conflicts and alternatives; never call independent per-slot counts a guarantee. This preview creates no assignments and does not change existing sessions.
6. Admin confirms the dated drafts; unresolved/understaffed drafts may remain visible for further work. **Assign PAs** then reviews and staffs those fixed dates using full availability, automatic daily/weekly limits, and total-assignment fairness. It never moves dates. Revalidate inputs when confirming dates and when applying PA assignments.
7. Admin can change dates or staffing, review approved exceptions, publish ready sessions, and track those still needing staff. Published and manual decisions remain protected on reruns.

Start with candidate suggestions and a batch feasibility preview. A separate **Suggest dates for all classes** action can propose a complete draft for review, but a global optimizer that jointly changes dates and assigns PAs is not required by this proposal. If the batch has a staffing shortage, offer alternatives for the admin to choose rather than silently reshuffling dates.

Lower-risk proposed defaults remain: selecting all classes saves an explicit participant list, newly added classes are offered for enrollment without being silently included, workshop sequence gives warnings rather than prerequisites, cancelling a session leaves its representative class pending unless explicitly waived, and completion is recorded by the admin rather than assumed when the time passes.

**Rules for the phased plan**

| Topic              | Planned rule                                                                                                                                                                                                                                                                                                                                                            |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Workshop run       | One custom-named instance with a shared inclusive Vancouver start/end date range. All its participating schools use that same range; each class gets its own session.                                                                                                                                                                                                   |
| Participation      | Admin selects all participating schools/classes or a subset in one reviewed operation. “All” resolves to an explicit list of current active classes; later additions remain visible for explicit enrollment.                                                                                                                                                            |
| Coverage           | Track each selected class against this run: not scheduled, scheduled, needs PAs, published, completed, or explicitly waived. Missing availability must not hide a class.                                                                                                                                                                                                |
| Calendar months    | A calendar navigation and PA workload view. No automatic class visit quotas, half-month deadlines, or recurring run creation. Windows may cross months and overlap other runs.                                                                                                                                                                                          |
| Window changes     | Admin can review a change to the shared range, with effects on every enrolled class and existing session. Automatic date proposals must fit the range. Admins can move an individual session outside it through a recorded exception. Preserve history and do not silently move sessions.                                                                               |
| Workshop identity  | Custom title is primary. Display order/number is optional and independent of import-identification status.                                                                                                                                                                                                                                                              |
| Repeated content   | Create or duplicate another run with its own identity/window. The title may be reused. Do not edit an old completed run to represent a new delivery. A separate reusable content-template model is optional future work.                                                                                                                                                |
| Sequence           | Optional ordering within a class; show warnings for unusual order rather than inventing prerequisite rules.                                                                                                                                                                                                                                                             |
| Duration           | Prefer the workshop duration, then the class default. An availability window is space in which a session fits. Preserve explicit admin edits; shortening a session requires an explicit choice.                                                                                                                                                                         |
| Bookable hours     | Use 15-minute scheduling increments and full-duration coverage. Align PA input/storage without changing existing coverage; the current weekday 08:30–15:00 range remains the starting point. Preserve existing off-grid records.                                                                                                                                        |
| PA constraints     | Require full PA availability and no overlapping assignments. Automatic matching allows at most one assignment per day and one per week, preferring lower total assignment counts. Admins can override same-day workload with prominent red confirmation and same-week workload with an amber warning. Monthly quotas are not prerequisites; optional caps are separate. |
| Communication      | Record external coordination as a separate admin task. Automated schedule-change emails are a later enhancement; no PA acceptance is required.                                                                                                                                                                                                                          |
| Teacher visibility | Preserve the current school-wide, view-only teacher view unless the product contract changes explicitly.                                                                                                                                                                                                                                                                |

Remove the unused class-cadence control from the primary planning workflow and correct its misleading copy. Preserve existing stored values during compatibility migration; do not turn them into scheduling rules. The previous proposal for cadence policies, monthly requirement generation, target-period ordinals, and half-month carryover is superseded.

**What completion means**

- A run assigned to ten classes shows ten expected deliveries before any dates or PAs exist. A run spanning two months still has ten, with one shared window and no artificial month split.
- Six named runs, each with its own delivery window, can be assigned to ten selected classes in one reviewed operation, producing sixty class/run enrollments without sixty separate forms or duplicates on retry.
- Weekly availability, effective dates, closures, exceptions, duration, and shared delivery windows produce useful date choices. A 60-minute workshop inside 09:00–12:00 stays 60 minutes.
- An admin can move a published Monday session with PA A to Tuesday with PA B in one valid, reviewed change, preserving session identity and history.
- Cancellation, window changes, teacher changes, archived classes, and PA availability changes cannot silently erase enrolled classes' pending deliveries or alter completed history.
- The implementation passes the verification below, and hosted authentication/email and recovery checks are demonstrated before a production release.

**Target domain and migration approach**

Keep the existing relationship path: `School → ClassSection → ClassWorkshop → WorkshopSession → Assignment`. Preserve the `WorkshopSession` mapping to the existing `Workshop` table and existing IDs. Extend these concepts rather than replacing the application.

| Concept                                | Planned responsibility                                                                                                                                                                                                                                                      |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Existing `WorkshopDefinition`          | Initially represents the named workshop run in the UI: title, description, duration, optional order, shared delivery dates, revision, and explicit identification state for legacy/imported records. Its existing date fields already support the shared-window foundation. |
| `ClassWorkshop`                        | Enrollment of one class in one run, with optional sequence, revision, and required/waived state and reason. Keep the existing unique class/definition pair. No content-free monthly placeholders are needed.                                                                |
| `ClassMeeting` / recurring class rules | Vancouver weekday/minute availability with effective dates and an explicit activation/confirmation state. Existing reference-only rows are not automatically activated.                                                                                                     |
| Availability exceptions                | School closures, class exclusions, and additional dated windows, with scope and provenance. Preserve the distinction between class-wide availability and legacy workshop-specific candidates.                                                                               |
| `WorkshopSession`                      | Concrete UTC interval for one representative class, staffing bounds, mode/location/link, lifecycle, revision, availability basis, and recorded admin date exceptions. Separate participant instructions from internal admin notes.                                          |
| PA availability                        | Effective recurring availability and dated exceptions, submitted by the PA. Existing assignments remain intact when availability changes; conflicts become visible.                                                                                                         |
| History and changes                    | Versioned before/after changes and historical host context, with compatible readers for existing history records.                                                                                                                                                           |

Use “Workshop” or “Workshop run” for the shared instance and “Class session” for an individual school's dated occurrence. A new `WorkshopOffering` table is not required for this clarification: retaining existing run IDs and date fields is a smaller change. Add reusable content templates only when a concrete requirement justifies them.

The exact field names belong in the phase 1 schema design. The required invariants are already clear:

- Keep unique class/run enrollment. Repeating content uses a new run ID, even if its title is the same. Creating a run alone does not enroll every class without a reviewed participant selection.
- Retain at most one non-cancelled session per class/run enrollment. A completed session satisfies that enrollment; cancellation reopens it unless the admin explicitly waives it. A cancelled replacement stays attached to the same enrollment.
- Readiness is derived from feasible intervals and current constraints, not merely the existence of an availability row.
- The shared window governs automatic suggestions for all schools; a recorded admin exception may place one session outside it. A cross-month run stays one run and each representative class is counted once. Distinguish an unscheduled overdue class from a class with an explicit out-of-window makeup booked.

Use additive migrations, backfill, switch compatible readers/writers, then remove obsolete columns in a later release. Create and commit migrations with `npm run db:migrate -- --name <descriptive_name>`; do not use `db push` or reset/reseed a shared database.

Retain each current definition and its existing shared window as the run. Preserve all class-workshop, session, assignment, publication, lock, and history IDs. New runs need an explicit window before scheduling; place legacy records without a complete window in a visible review queue. Do not invent dates, retroactively invalidate completed sessions, generate monthly requirements, or enroll previously unrelated classes during migration.

Retain legacy monthly quota rows for compatibility/history until their readers are retired, but remove them from assignment eligibility and fairness scoring. Do not silently convert them into optional caps. If PA availability moves from 30-minute cells to 15-minute cells, migrate each old interval without shrinking coverage: for example, an old 09:00–09:30 cell must still cover both new quarter-hour cells. Verify covered intervals, not just row counts. Preserve off-grid historical sessions and explicitly stored class times.

Do not broaden the scope of legacy workshop-specific availability, silently activate old weekly reference rows, or reinterpret historical notes as participant-facing instructions. Invalidate unapplied previews when their input contract changes, while keeping applied history readable. Extend the populated migration verifier with independently dated runs sharing a title, cross-month windows, legacy missing windows, cancellations, completed work, manual locks, publication, scoped availability, and history fixtures.

The audit identified an older destructive cycle-removal migration. Check the actual target database's migration state and data before release. If it still contains meaningful pre-removal records, provide a reviewed preservation path before advancing it. Do not edit an already-applied shared migration or assume an empty database because an earlier local rehearsal used one.

**Delivery order**

Sizes describe relative complexity, not promised calendar durations. Re-estimate after the first populated migration rehearsal and the availability generator prototype. Ship reviewable slices within each phase, with tests and documentation in the same change.

| Phase | Deliverable                                           | Dependencies                  | Size         |
| ----- | ----------------------------------------------------- | ----------------------------- | ------------ |
| 0     | Agreed behavior and immediate regressions             | None                          | Small        |
| 1     | Named workshop runs and shared-window lifecycle       | 0                             | Medium       |
| 2     | Workshop-run coverage and bulk class enrollment       | 1                             | Large        |
| 3     | Recurring availability and consistent session booking | 1; integrate with 2           | Large        |
| 4     | Atomic date, staffing, and detail changes             | 1; 3 for full date validation | Large        |
| 5     | School/class navigation, lifecycle, and PA readiness  | 2, 3, 4                       | Medium–large |
| 6     | Matcher quality and bounded data loading              | 3, 4, 5                       | Medium–large |
| 7     | Coordination tasks and operational polish             | 4, 5                          | Medium       |
| 8     | End-to-end rehearsal and release readiness            | 0–7                           | Medium       |

The critical path is named run/window → participating classes and coverage → feasible dates → safe changes → rehearsal. Phase 4's change-contract work can start once phase 1 is stable; it does not have to wait for directory polish or matcher optimization.

**Phase 0 — establish the baseline and fix misleading behavior**

Audit findings: 2, 3, 10, 16.

1. Preserve and identify the existing working-tree changes as the implementation baseline. Separate already completed work from new roadmap tasks; do not reset the branch to its older commit.
2. Align the design brief and working agreement with the clarified run/window model, recurring class availability, repeated runs, and combined edits. Remove automatic class cadence, half-month targeting, and monthly PA quota prerequisites. Align automatic daily/weekly rules, manual weekly/date exceptions, and total-assignment fairness with the confirmed decisions.
3. Fix the teacher-edit return path so the changed contact is visible, the relevant directory group is expanded, and focus/status feedback identify the result. Keep the browser test checking an actually visible result.
4. Correct the current weekly-availability wording while recurrence remains disconnected, and retire misleading class-cadence controls from planning. Fix batch booking to choose an explicit interval using the intended duration rather than copying a whole availability window; validate the duration fits.
5. Move the eight audit reproductions into maintained tests as their defects are addressed. Convert assertions of current failures into expected-behavior regressions; passing a reproduction of wrong behavior is not a fix.
6. Review the dependency advisory recorded in the audit. Determine whether a compatible fix exists and test it, or record the actual exposure and a dated decision. Do not apply an unreviewed major downgrade solely to clear an audit counter.

Primary areas: `src/app/admin/teachers/actions.ts`, `src/app/admin/classes/page.tsx`, `src/app/admin/workshops/plan/actions.ts`, the class editor, and product documentation.

Exit: the teacher-edit browser regression and the 60-minute-in-three-hours booking case pass; UI claims match the currently enabled features; the revised product contract is recorded.

**Phase 1 — make named runs and their shared windows explicit**

Audit findings: 6, 7; foundations for 1, 8, 11.

1. Present the existing definition as a named workshop run with start/end dates shared across schools. Make titles primary and numbering optional. Replace the current null-number identification convention with explicit state so a custom title without a number is valid.
2. Support creating or duplicating an independent run with its own window. Copy selected descriptive defaults only; do not copy sessions, assignments, publication, completion, or enrollment without an explicit participant-selection step. Keep the existing class/run uniqueness.
3. Add revision fields, waiver support, and lifecycle/history fields needed by later phases. Update seeds, import/reconciliation, Zod schemas, planning queries, participant views, and window-validation paths together. No cadence policies, monthly ordinals, empty monthly requirements, or separate offering layer are needed.
4. Backfill historical host information from what is known. Label inferred legacy context and preserve unresolved cases; do not fabricate past teacher ownership.
5. Rehearse the migration against populated fixtures before switching readers. Keep compatibility code narrowly scoped and record when it can be removed.

6. Introduce the shared policy distinction needed by booking, staffing counts, and changes: hard assignment validity, automatic daily/weekly rules, explicit admin exceptions, and soft total-assignment fairness. Remove the monthly-quota prerequisite from all manual, automatic, publication, and reviewed-change paths together. Preserve existing assignments and implement the basic deterministic fairness preference before later matcher optimization. Use Monday–Friday school weeks in America/Vancouver for automatic weekly capacity; same-day manual override requires prominent red confirmation and same-week override uses an amber warning.

Primary areas: `prisma/schema.prisma`, `prisma/migrations/`, `src/app/admin/class-workshops/actions.ts`, `src/lib/schemas/class-workshops.ts`, `src/lib/scheduling/store.ts`, and `scripts/verify-class-workshop-migration.mjs`.

Exit: a named run needs no number, its window is shared by all participating schools, and another run can use the same title with independent dates. Existing IDs and history survive. Legacy missing windows are visible for review rather than silently filled.

**Phase 2 — make each workshop run account for every participating class**

Audit findings: 1, 8, 10.

1. Make the run overview the starting point: title, shared window, participating schools/classes, scheduled count, staffing readiness, completion, and outstanding deliveries. Build coverage from explicit class/run enrollment, including classes with no availability or session. Reading a page must not mutate data.
2. Add a school/class participant picker with **Select all active classes**, school-level selection, and individual exceptions. Preview the exact class list; applying it creates enrollment only. Show newly added classes as not enrolled until an admin adds them, rather than silently changing an existing run's scope.
3. Show actionable states: needs availability, ready to schedule, draft booked, needs PAs, ready to publish, published, completed, waived, and window ended with delivery outstanding. Keep zero-candidate classes visible. Derive session/staffing/publication states from linked records.
4. Add school/class filters, teacher context, per-class progress across runs, and links to the exact missing step. Preserve the selected run, calendar position, and filters when returning from edits. Month filtering must not hide unscheduled classes in a run spanning multiple months.
5. Add bulk run-to-class assignment for one or several runs, showing each shared window, selected classes, new/existing pairs, and conflicts. Apply with revisions and an idempotency key; skip existing pairs. Warn about poor availability fit without silently omitting the class.
6. Allow removal of unused enrollment mistakes and a reasoned waiver where a class no longer needs that run. Retain history for enrollment with sessions, publication, or changes. Cancelling a session keeps its class pending unless explicitly waived.
7. Have direct booking select or explicitly create enrollment in the chosen run. Keep the month calendar as a secondary view of actual sessions and PA workload. Do not implement **Prepare month**, automatic visit generation, or target-period carryover.

Primary areas: the admin overview, `src/app/admin/workshops/page.tsx`, `src/app/admin/workshops/plan/`, `src/components/workspace-schedule.tsx`, class selection, and scheduling navigation/query modules.

Exit: one run assigned to ten classes shows ten expected deliveries before any booking, including zero-candidate classes. Six runs can be assigned to ten classes in one reviewed operation, producing sixty unique pairs. A cross-month run stays one set of ten, retries are duplicate-free, and cancellation/completion/waiver update coverage correctly.

**Phase 3 — turn weekly availability into useful date choices**

Audit findings: 2, 3, 9; operating-hours portion of 12.

1. Add recurring class availability with effective date ranges and copy-day controls. Retain explicit dated entry. Ask admins to activate legacy weekly reference rows before using them for booking.
2. Add school closures, class exclusions, and additional dated windows. Record their scope and source; do not infer holidays from a locale without an admin-maintained calendar.
3. Implement a pure candidate generator: expand Vancouver wall-clock rules within the selected run's shared window; combine correctly scoped explicit availability; apply exceptions and any supported operating-hour constraints; subtract class/teacher commitments; return intervals long enough for the intended session.
4. Keep workshop-specific windows scoped. Coalesce only compatible windows with the same scope. Extra availability must not silently defeat a closure. Automatic suggestions stay inside the shared window. An explicit admin booking/reschedule can store a per-session exception without changing that shared window. A newly confirmed time outside recurring class availability is recorded as a dated confirmation, not a silent expansion of the recurring rule. Crossing a calendar month introduces no class-cadence rule.
5. Bound candidate generation to the planning horizon. Offer deterministic suggested starts in 15-minute increments and an admin-adjustable start/end option. Use one duration policy across the class calendar, monthly planner, new-session form, and direct booking. Preserve explicit end-time edits and collect mode, location/link, and notes consistently.
6. Make batch preview validate both existing commitments and conflicts among the selected sessions. Validate again at apply time within the scheduling transaction, preserving selections and explaining stale/conflicting rows.
7. Store which availability rule/exception authorized a session. If availability changes, retain the booking and flag its conflict. A generated candidate must not become a permanent explicit exception that accidentally bypasses future closure validation.

8. Add full-interval available-PA counts and separate automatic-eligibility counts beside candidate dates, with names, exclusion reasons, the staffing target, and fairness totals on inspection. Recompute when time/duration changes. Count a manually created out-of-window session as valid for staffing when its explicit date exception is intact; the matcher must not reject it merely because automatic date generation would not have proposed it.
9. Run a temporary staffing preview over the selected batch, including existing commitments and proposed assignments' daily/weekly effects. Surface competition for the same PAs and offer alternative dates without changing selections silently. Keep this separate from persisted PA assignment and do not describe a heuristic failure as proof that no feasible schedule exists. Understaffed dated drafts remain allowed and visible.

Primary areas: `src/components/class-calendar.tsx`, `src/app/admin/classes/availability-actions.ts`, `src/components/planning-form.tsx`, `src/components/workshop-booking-form.tsx`, and shared availability, date, delivery-window, and scheduling validation modules.

Exit: entering Monday/Wednesday 09:00–12:00 once yields valid 60-minute choices at 15-minute starts, with full-interval PA counts and a batch check that catches shared PA competition. Closures, exceptions, scoped candidates, occupied times, Vancouver DST, and concurrent booking are covered; no session exists until the admin confirms a date.

**Phase 4 — make ad hoc changes one safe operation**

Audit findings: 4, 5.

1. Define a versioned proposed final state containing interval, complete PA set, staffing bounds, mode/location/link, internal notes, and participant instructions. Cancellation and completion remain explicit lifecycle operations.
2. Use one editor and review for combined changes. Evaluate the final proposed session after removing only that session's current commitments from conflict calculations; continue checking other commitments and full PA availability, while distinguishing permitted admin date/daily/weekly exceptions from hard conflicts. An override must be explicit, actor-scoped, recorded, and limited to the selected rule.
3. Support PA additions/removals as well as replacements, alongside date/time and detail edits. Initial publication must meet staffing requirements. A later PA removal may leave a published session needing replacement staff; retain its date/publication and show a prominent unresolved staffing warning instead of forcing cancellation. Drafts may also remain unstaffed.
4. Apply the reviewed diff atomically. Preserve the session ID, unchanged assignment IDs, publication context, requirement link, actor/reason, and affected-party history. Revalidate current revisions at apply time and make retries idempotent.
5. Route existing replacement and reschedule shortcuts through the shared operation. Preserve manual locks and matcher protection. Read existing change-history payloads with backward-compatible version handling.
6. Review shared-window changes against every enrolled class and session across schools. Widening a window can preserve all dates; narrowing must not silently move sessions or turn an ordinary booking into an exception. Show out-of-range sessions and require explicit admin resolution or recorded exceptions before applying; preserve already approved exceptions and completed history. Use a new run for a new delivery rather than repurposing an old completed run.
7. Verify that internal notes never reach PA/teacher payloads. Show participant instructions and changed venue/link information in their permitted views.

Primary areas: `src/lib/schemas/changes.ts`, `src/lib/scheduling/changes.ts`, `src/app/admin/workshops/changes/actions.ts`, `src/components/workshop-changes.tsx`, and draft workshop mutation paths.

Exit: Monday/PA A → Tuesday/PA B succeeds when the final combination is valid. Explicit admin window/daily/weekly exceptions are recorded and survive reruns while availability and overlap checks still apply. A published PA removal can leave a visible staffing deficit without cancelling the event. Invalid unrelated conflicts write nothing; stale and repeated application cannot produce partial changes or duplicate history events.

**Phase 5 — complete admin navigation and people lifecycle**

Audit findings: 10, 11, 12.

1. Add a school detail view with its classes and teacher contacts. Add searchable/filterable class lists and linked teacher context. Class detail should present delivery progress, requirements, availability, upcoming sessions, and history with clear next actions.
2. Implement a reviewed, effective-date teacher transfer. Check school consistency and future teacher overlaps; show affected sessions. Keep historical host information unchanged. Moving a class between schools must be a separate explicit operation, not a side effect of editing a contact.
3. Add class archive/reactivate behavior. Before archiving, explicitly resolve future sessions and remaining obligations by cancellation, transfer, or waiver. Preserve access to completed history and historical names even when a related user or school is soft-deleted; continue filtering deleted entities out of active selection.
4. Build one PA readiness view with availability status/last update, exceptions, total assignment count, current daily/weekly commitments, optional explicitly configured cap, and conflicts. Retain in-place staffing. Remove required monthly quota entry and its missing-quota warnings.
5. Let PAs enter future-effective recurring changes and one-off exceptions within supported hours. Show affected published assignments as conflicts for admin review; do not cancel or unassign them automatically. Keep the PA interface limited to their own availability and published work.
6. Show eligible replacement candidates first, with reasons for excluded candidates, daily/weekly-limit manual options, fairness counts, and a direct route to resolve missing availability. Preserve the workshop context on return.

Primary areas: admin school/class/teacher/PA pages and actions, `src/app/pa/availability/actions.ts`, `src/lib/scheduling/eligibility.ts`, and historical display projections.

Exit: an admin can navigate school → class → teacher/requirements and back without losing context; teacher transfer preserves history; archiving cannot hide unresolved deliveries; a PA exception flags impacted work without changing its assignment.

**Phase 6 — improve matching quality and scale reads safely**

> Superseded for automatic feasibility by [EXACT_STAFFING_IMPLEMENTATION_PLAN.md](EXACT_STAFFING_IMPLEMENTATION_PLAN.md). Automatic full-minimum feasibility now uses exact capacity-constrained flow without a state budget. Completion-first partial selection remains deterministic heuristic optimization, and manual override searches remain bounded.

Audit findings: 14, 15.

1. Keep the current deterministic greedy matcher as a seed and add bounded reassignment/repair among mutable automatic drafts. Recompute candidate scarcity during repair.
2. Use an explicit objective: maximize sessions meeting minimum staffing, then reduce remaining minimum deficits, then prefer suitable PAs with fewer total assignments, then improve optional capacity. Do not trade away full availability, automatic daily/weekly rules, explicit optional caps, or protected work to improve a score.
3. Preserve manual, published, completed, locked, and otherwise protected assignments exactly. Keep dates fixed. Any behavior that tops up a manually protected session must be an explicit supported policy with tests.
4. Cap deterministic search work. Report “no assignment found under current constraints” and whether the search budget was reached; do not claim mathematical infeasibility for a heuristic result.
5. Split broad schedule loading into bounded reads for run coverage, calendar sessions, candidate generation, matching, and paginated history. Coverage includes all enrolled classes in the selected run even when its window spans months. Include all relevant Monday–Friday capacity-week and same-day commitments across run boundaries, and aggregated total assignment counts for fairness. Aggregate historical counts in the database without hydrating all historical sessions. Include both source and destination neighborhoods for changes. Participant queries should return only permitted data.
6. Scope preview hashes to relevant settings, automatic/manual policies, optional caps, fairness aggregates, requirements, exceptions, and commitments. Still detect newly inserted nearby commitments and changed PA exceptions, not merely edits to records loaded in the original preview.
7. Keep the global scheduling lock until measurements justify a safe change. Measure query count, rows/bytes, and latency on multi-year fixtures; add measured targets before optimizing. Consolidate duplicate helpers after callers use the shared policies.

Manual exceptions still count as real commitments when considering new automatic assignments. Do not remove an approved manual assignment to recover a daily/weekly target, and do not use one exception as permission for further automatic exceptions. Where protected work already exceeds an automatic limit, report it and leave that work intact.

Primary areas: `src/lib/scheduling/matcher.ts`, `src/lib/scheduling/store.ts`, matching previews/hashes, `src/app/admin/workshops/match/actions.ts`, and participant page queries.

Exit: the audit's four-session counterexample staffs all four; protected work and all dates remain unchanged; a capped search gives a valid partial result; distant history does not require full hydration, while adjacent commitments and concurrent inserts still invalidate stale previews.

**Phase 7 — make coordination and follow-through visible**

Audit findings: 13; operational portions of 1, 10, 12.

1. Create a communication-needed task after publication and participant-affecting changes, tied to the exact change version and appropriate old/new participants. Let admins record who was contacted, when, and an optional note. A later change creates a new task; marking an old task done must not acknowledge the newer version.
2. Add operational queues for missing deliveries, missing PA availability, availability conflicts, ready-to-publish sessions, past sessions awaiting completion, and communication tasks. Link each item to its resolution.
3. Make replacement/cancellation history understandable to affected participants without exposing internal notes or other participants' private information.
4. Verify narrow-screen layouts, keyboard access, focus after edits, pending/error feedback, and filter persistence across the complete workflow.

Automated schedule-change email is deferred from the initial release scope. If subsequently enabled, use a durable outbox written with the change, send after commit, deduplicate retries, validate current recipients, expose failures, and configure the verified sender. Do not send external email inside a scheduling transaction or imply delivery merely because a change was saved.

Exit: admins can distinguish published, communicated, and completed work; affected people see the correct current details; no acceptance/decline workflow is introduced.

**Phase 8 — rehearse the real admin workload and release safely**

Audit finding: 16; final validation of all phases.

1. Build a representative fixture: ten classes, six named runs with independently chosen shared windows, multiple schools, overlapping and cross-month windows, a shared teacher, closures, uneven PA availability, PAs with no legacy quota rows, unequal total assignment counts, manual daily/weekly and date exceptions, insufficient staffing, protected assignments, and an ended window with outstanding delivery.
2. Exercise the complete journey below with two admins, including a PA availability change between preview and apply. Verify readable recovery messages and absence of partial writes.
3. Run empty and populated migration rehearsals. Compare IDs, assignments, publication, availability scope, history, and counts before/after. Run the populated verifier in CI for scheduling migrations.
4. Rehearse the exact build/migration pair in an isolated hosted environment. Coordinate schema compatibility and application rollout so incompatible older writers cannot create invalid records during the transition. Remove obsolete columns only after the compatible cutover is established.
5. Test real invite/sign-in email for admin, teacher, and PA accounts; verify role access and participant privacy, cookies, logs, and recovery behavior. Protected demo access does not establish real-email readiness.
6. Restore a hosted backup into a separate database and verify representative records and migration state. Record the forward-repair plan and the point after which rolling back application code alone is unsafe.
7. Resolve the dependency decision and update README, the class-workshop guide, pilot runbook, and deployment record with actual evidence. Reconfirm the target database's migration history, including the older destructive migration identified in the audit.

Exit: all blocking acceptance cases pass and hosted email/recovery evidence is recorded. Production deployment remains a separate release action after review of this tested result; creating this plan does not perform a deployment.

**End-to-end acceptance scenario**

Additional acceptance checks for the confirmed decisions:

- A combined audience represented by class A with an admin note creates one enrolled class/session; there is no synthetic class B delivery or grouped-class bookkeeping.
- An available PA with no monthly quota row can be assigned. Between otherwise equally suitable candidates with two and eight total assignments, the lower-total PA is preferred; cancellation/removal and preview-selected work update the totals correctly.
- Automatic matching respects the chosen daily/weekly boundaries. A deliberately confirmed admin daily/weekly exception survives reruns, still counts as a real commitment, and cannot authorize overlapping assignments or further automatic exceptions.
- An admin can move one class session outside the shared window, preserve the unchanged global range, and staff that valid exception. Ordinary automatic date suggestions still stay inside the window.
- Two selected times showing the same PA candidates independently must receive a combined staffing check before the UI claims both can be staffed. Candidate counts cover the full session, use the chosen 15-minute precision, and distinguish automatic eligibility from manual daily/weekly options.
- Removing a withdrawn PA from a published session preserves that session and shows its staffing deficit. Initial publication of an unstaffed draft still fails.

| Admin/PA action                                    | Required observable result                                                                                                                            |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Create a named run with a shared window            | One inclusive start/end range applies across every participating school.                                                                              |
| Add/find ten classes                               | School, teacher, enrollment, and delivery progress are clear and searchable.                                                                          |
| Enroll ten classes in one run                      | Ten expected deliveries appear before bookings; a retry creates zero duplicates.                                                                      |
| Assign six runs, each with its own window          | One bulk preview identifies new, existing, and conflicting pairs; all intended class deliveries remain visible.                                       |
| Enter weekly class availability and a closure      | Only feasible dated choices appear; nothing is scheduled automatically.                                                                               |
| Book a 60-minute session in a three-hour window    | The actual session is 60 minutes; adjacent time remains available.                                                                                    |
| Leave one class with no availability               | Its missing delivery stays in coverage with a direct next action.                                                                                     |
| Assign PAs                                         | Dates do not move; full availability and automatic daily/weekly rules hold, total-count fairness guides selection, and approved manual work survives. |
| Publish                                            | Only valid sessions publish; role-specific views show the permitted details.                                                                          |
| Change Monday/A to Tuesday/B and a new room        | One reviewed atomic change preserves session identity and records the full diff.                                                                      |
| PA changes availability after an admin preview     | Applying the stale preview fails safely and explains what needs refreshing.                                                                           |
| Cancel and rebook                                  | The obligation remains owed and is fulfilled by its replacement without duplicate counting.                                                           |
| Schedule a run across two calendar months          | One shared window and ten class enrollments remain intact; no extra monthly obligations appear.                                                       |
| Edit the shared window                             | Every school's affected sessions are reviewed; no session moves or becomes invalid silently.                                                          |
| Create another run using the same title            | Its identity/window and coverage are independent; completed history stays unchanged.                                                                  |
| Transfer a teacher, then archive a completed class | Future conflicts are reviewed, unresolved work is addressed, and historical records remain intelligible.                                              |
| Record coordination and rehearse recovery          | Communication tracks the exact change; restored data is demonstrably usable.                                                                          |

**Verification and engineering guardrails**

The 20 September audit baseline was 130 passing unit tests, 122 passing integration tests, and 37/38 passing browser tests. The remaining browser failure concerns the teacher-edit return view. Eight audit reproductions passed by confirming reported behaviors; these are evidence, not eight repaired defects. Lint, typecheck, formatting, production build, recent populated migrations, and sampled accessibility checks passed during that audit. These figures are dated baseline evidence, not results for the planned implementation or a deployed environment.

Follow the working agreement throughout: `requireRole(...)` first on protected pages/actions; Zod validation before using mutation input; server-side Prisma through the singleton; no `any`; active user/school soft-delete filters; UTC instants and Vancouver recurring wall-clock values. New write paths need meaningful authorization, stale-preview, idempotency, and atomicity coverage.

For each implementation slice, run the required handoff checks:

```bash
npm test
npm run lint
npm run typecheck
npm run format:check
npm run build
```

Run relevant PostgreSQL integration tests for scheduling changes and the complete integration suite at phase gates. Run affected browser journeys while developing and `npm run test:e2e` at integrated phase gates and before release. Run `node scripts/verify-class-workshop-migration.mjs` for each scheduling migration after extending its fixtures. Use preview-auth checks when that mode is involved. Avoid simultaneous browser builds and production builds that contend for the same `.next` directory.

Regression coverage must include shared-window edits across schools, duplicate enrollment, same-title independent runs, cross-month and overlapping windows, cancellation/waiver, unenrolled classes, legacy missing windows and candidate scope, recurrence exceptions, DST, duration, simultaneous booking, atomic published edits, effective teacher/PA changes, protected matcher reruns, bounded-search failure, privacy, and concurrent inserts after previews. Assert that class cadence never generates visits, missing monthly quotas never block assignment, total-count fairness stays secondary to validity/coverage, and daily/weekly/date exceptions do not disable unrelated constraints. Keep validation functions shared across manual booking, batch booking, changes, and matching where their constraints overlap.

For the main admin and PA journeys, inspect 390-pixel layouts, 200% zoom, keyboard focus, readable errors, and empty/loading states. Combine automated accessibility checks with visual and keyboard inspection; a passing scan alone does not establish a usable workflow.

**Audit-to-plan traceability**

| Finding                                                          | Primary phase | Supporting work                                                 |
| ---------------------------------------------------------------- | ------------- | --------------------------------------------------------------- |
| 1. Missing enrolled-class coverage (cadence proposal superseded) | 2             | Shared run window and explicit enrollment; 7 operational queues |
| 2. Weekly schedules disconnected                                 | 3             | 0 honest copy and revised contract                              |
| 3. Availability length used as duration                          | 0, 3          | Shared validation in 4                                          |
| 4. Published reschedule/staffing deadlock                        | 4             | 8 combined-change rehearsal                                     |
| 5. Missing detail-edit paths                                     | 4             | 3 consistent creation forms                                     |
| 6. Mandatory workshop numbering                                  | 1             | 2 title-first selection                                         |
| 7. Repeated content and historical windows                       | 1             | Independent run IDs; 2 enrollment; 4 window changes             |
| 8. Repetitive enrollment and no waiver                           | 2             | 1 lifecycle/schema support                                      |
| 9. Misleading readiness                                          | 3             | 2 coverage states                                               |
| 10. Fragmented navigation                                        | 5             | 0 teacher regression; 2 context; 7 usability                    |
| 11. Class/teacher lifecycle blocked                              | 5             | 1 historical host support                                       |
| 12. PA readiness and availability limits                         | 5             | 3 operating hours; 7 conflict queues                            |
| 13. Change communication                                         | 7             | 4 versioned change events                                       |
| 14. Greedy matching misses valid staffing                        | 6             | 8 representative workload                                       |
| 15. Broad reads and duplicated policies                          | 6             | Shared services in 2–4                                          |
| 16. Migration, dependency, hosted-release risk                   | 0, 8          | Preservation rehearsals in 1                                    |

Preserve useful capabilities from earlier reviews: in-place manual staffing, mobile availability input, filtered navigation, publication controls, and protected reruns. Retire required monthly quota setup under the confirmed fairness policy. Do not rebuild them merely to match a new route structure.

The audit's observation that saved cadence is unused remains factually valid, but automatic cadence enforcement is not a product requirement after the user's clarification. Resolve its misleading UI and the real coverage gap through explicit workshop-run enrollment.

Deferred beyond this roadmap: reusable content templates separate from runs, automated participant email delivery, teacher schedule self-service, PA acceptance/decline, external calendar synchronization, travel optimization, qualification matching, multi-class session/group models, and unrestricted overrides of PA availability or overlapping assignments. None is required to complete the admin-controlled workshop-window workflow above. Automatic monthly/semi-monthly class obligations are removed from scope.
