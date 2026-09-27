# Workshop Scheduler audit — 20 September 2026

**Product clarification after the audit:** The user clarified that monthly/semi-monthly frequency was context, not a required recurrence rule. The intended workflow starts with a named workshop run and one shared delivery date window across all participating schools, then schedules each enrolled class inside that window. Automatic monthly obligations, half-month deadlines, and cadence enforcement are therefore not required. The missing-coverage finding remains relevant for explicitly enrolled classes that have no candidate or session. The [revised implementation plan](IMPLEMENTATION_PLAN.md) supersedes the cadence-based recommendations below. The original assessment and test evidence are retained as the record of what was audited.

Further confirmed planning decisions replace mandatory monthly PA quotas with soft fairness based on total assignments, allow explicit admin date-window and weekly-workload exceptions, use 15-minute scheduling increments, and retain published sessions with visible staffing deficits after PA withdrawal. Automatic scheduling still respects the shared window and daily/weekly limits. Combined classes use a representative class and admin note. These are target changes recorded in the plan, not changes to the implementation tested below.

**Assessment: the app has a substantial, carefully protected scheduling foundation, but it does not yet implement the recurring class-delivery workflow described in this audit request.** It can record dates, staff them, publish them, and handle several exceptions. It does not reliably answer the admin's central question: “Have all ten classes received the workshops they need this month?”

This audit examines the current working tree on `feature/dated-workshops`, based on commit `65b8b8a`, including the substantial changes and new files already present when the audit began. It is not an audit of only that commit, or verification of a deployed site. Application code and configured development/production data were not changed. Audit-only reproductions were created under ignored `work/audit-2026-09-20/` and run against separate disposable PostgreSQL databases.

For the examples below, “semi monthly” means twice per calendar month. Whether those visits must fall in separate halves of the month remains a product decision. Every two weeks would require a different recurrence rule. “Delivery window” means the date range in which a particular workshop should run; if it also means organization-wide hours on specific weekdays, that constraint is not currently modeled.

**The workflow the app should support**

1. Admin creates schools, teacher contacts, and specific classes.
2. Admin creates custom-named workshop content, such as “Building a Business,” with an intended duration and delivery window.
3. Admin assigns required workshops to the relevant classes, individually or in bulk, and specifies monthly or twice-monthly delivery expectations.
4. Admin enters each class's recurring weekly availability once, with effective dates and exceptions for holidays or changed school schedules.
5. The month view includes every required class visit, including those with no available time or no booking. It offers candidate sessions that fit class availability, delivery windows, duration, and class/teacher commitments.
6. Admin selects or adjusts the dates and times. Only then does **Assign PAs** staff those dated sessions using PA availability, quotas, and spacing.
7. Admin reviews coverage and staffing, publishes, and coordinates with participants.
8. Admin can change dates, staffing, venue, or delivery mode together when necessary, with a reviewed before/after record. Completed work remains history.

This keeps calendar months as the planning model, preserves admin control, and does not reintroduce cycles, PA acceptance, teacher self-service, or automatic movement of published work.

**Fit against the requested workflow**

| Capability                                  | Current behavior                                                                   | Assessment                                                  |
| ------------------------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Schools, classes, teacher contacts          | Implemented; teacher and school relationships validated                            | Useful foundation; navigation and lifecycle gaps            |
| Custom workshop titles                      | Supported, but a unique numeric workshop number is also mandatory                  | Partial fit                                                 |
| Shared workshop delivery date ranges        | Inclusive Vancouver dates, validated against sessions                              | Implemented                                                 |
| Weekly class availability drives planning   | Weekly times are reference-only; dated availability must be entered separately     | Missing for the requested workflow                          |
| Monthly/twice-monthly coverage              | Cadence is saved but does not drive requirements, selection, or coverage reporting | Missing                                                     |
| Assign the same workshop set to ten classes | One class/definition operation at a time                                           | Too much repetitive setup                                   |
| Select actual workshop times                | Class calendar, direct booking, and monthly candidate selection                    | Implemented with inconsistent duration behavior             |
| PA recurring availability                   | PA self-service, weekdays 8:30–15:00, half-hour increments                         | Implemented with a narrow time model                        |
| PA automatic matching                       | Dates fixed; availability, quotas, gap, and protected work respected               | Implemented heuristic; can miss feasible solutions          |
| Admin manual staffing                       | Available on drafts; protects manual work                                          | Implemented                                                 |
| Publication                                 | Validates staffing; bulk and individual publication                                | Implemented                                                 |
| Ad hoc changes                              | Reviewed replacement, reschedule, cancellation, completion                         | Partial: combined edits and several ordinary changes absent |
| Participant visibility                      | Published assignments; teacher view covers their school                            | Implemented as the current brief specifies                  |
| Change communication                        | In-app history and notices; no schedule-change email                               | External coordination required                              |

**Priority findings**

Priority 1 means a direct obstacle to the requested day-to-day workflow. Priority 2 means a meaningful usability, lifecycle, reliability, or release issue. Some findings are deliberate choices in the checked-in brief; those are identified as requirements gaps rather than accidental implementation failures.

**1. P1 — Monthly cadence does not create or measure delivery obligations.**

`monthlyCadence` is stored and editable as “Workshops per month,” with copy saying it is used for new plans. The current planner never reads it. There is no check for under-delivery, over-delivery, one visit in each half-month, or missing curriculum enrollment. The schedule workspace lists sessions that already exist. The planner omits class workshops without candidate times.

An admin can have ten classes, successfully staff and publish the visible sessions, and still overlook classes that have no session or no candidate. “Needs staffing” concerns existing drafts; it is not a list of required workshops that have never been scheduled. The audit reproduction booked three sessions for a class configured for one workshop per month, without a cadence warning. Enforcing cadence as a hard maximum is not necessarily desirable, but surfacing the target and discrepancy is essential.

Recommendation: introduce an explicit class-delivery requirement for each intended monthly or half-month period, or an equivalent derived coverage model with clear due dates. Show required, booked, staffed, published, completed, and missing counts for every selected class. Keep intentional extra sessions possible through an explicit admin decision.

Evidence: [cadence input](<C:/Users/famil/Documents/ChatGPT/Workshop Scheduler/src/components/class-defaults.tsx:13>), [planner filters](<C:/Users/famil/Documents/ChatGPT/Workshop Scheduler/src/app/admin/workshops/plan/page.tsx:47>), [schedule construction](<C:/Users/famil/Documents/ChatGPT/Workshop Scheduler/src/app/admin/workshops/page.tsx:43>). Reproduced against PostgreSQL.

**2. P1 — Weekly class availability is disconnected from scheduling, and the UI promises otherwise.**

The class editor accepts recurring weekdays and times and says they are “used to suggest dates in monthly planning.” The current calendar and planner use explicit `AvailabilitySlot` dates instead. No application caller uses the existing `suggestedSlots` helper. The design brief deliberately classifies `ClassMeeting` rows as reference-only; the editor's wording has not caught up.

Saving “Monday 09:00–12:00” does not make any Monday bookable. The audit reproduction confirms that a Monday session fitting those weekly hours is rejected until a separate dated candidate is recorded. For ten classes, repeated date entry undermines the requested workflow and invites omissions.

Recommendation: use the weekly schedule to generate reviewable candidate dates within an effective date range, apply exceptions and workshop windows, and let the admin select concrete sessions. Keep **Assign PAs** separate: it must still never create or move sessions. At minimum, correct the misleading editor wording immediately.

Evidence: [class editor claim](<C:/Users/famil/Documents/ChatGPT/Workshop Scheduler/src/app/admin/classes/[id]/edit/page.tsx:189>), [candidate validation](<C:/Users/famil/Documents/ChatGPT/Workshop Scheduler/src/lib/scheduling/store.ts:120>), [unused date helper](<C:/Users/famil/Documents/ChatGPT/Workshop Scheduler/src/lib/scheduling/date-suggestions.ts:12>). Reproduced against PostgreSQL.

**3. P1 — Monthly planning treats availability duration as workshop duration.**

The monthly batch action directly copies the selected availability's start and end into the session. A 60-minute definition with class availability 09:00–12:00 produces a 180-minute workshop. This is disclosed below the form, but conflicts with normal availability semantics and ignores both the definition's duration and the class's default duration. It can also make otherwise suitable PAs ineligible.

Duration behavior varies across entry points: the class calendar starts with the definition duration, capped at the available window; direct booking uses the class duration; monthly planning books the whole window. A short window can also silently shorten the class-calendar default below the usual duration.

Recommendation: share one candidate-to-session routine. Offer a start and a duration inside the available window; use the definition duration consistently. Show an explicit warning or choice when a shorter delivery is permitted. Availability should remain the containing window.

Evidence: [batch start/end](<C:/Users/famil/Documents/ChatGPT/Workshop Scheduler/src/app/admin/workshops/plan/actions.ts:61>), [calendar duration cap](<C:/Users/famil/Documents/ChatGPT/Workshop Scheduler/src/app/admin/classes/[id]/page.tsx:215>), [direct booking duration](<C:/Users/famil/Documents/ChatGPT/Workshop Scheduler/src/components/workshop-booking-form.tsx:158>). The 180-versus-60-minute case was reproduced.

**4. P1 — A valid published reschedule can be impossible through the available change actions.**

Rescheduling validates every currently assigned PA at the new time. Replacing a PA validates the replacement at the old time. These actions cannot be combined.

Reproduced example: a published Monday session has PA A, who is available only Monday. The teacher moves it to Tuesday; PA B is available only Tuesday. The class has valid availability on both dates, and B has quota. Moving first fails because A cannot attend Tuesday. Replacing first fails because B cannot attend Monday. The final Tuesday/B arrangement passes eligibility, but neither UI action can reach it. Cancellation and a new booking are possible, but turn a normal reschedule into a different session and history.

Published staffing also permits only one-for-one replacement. There is no reviewed way to add another PA, remove an extra PA, or reduce staffing after publication. There is no combined correction of dates, staff, and staffing targets.

Recommendation: review one proposed final session state, validate that complete state, and apply the date/staff changes atomically with one history event. Preserve the current session ID and publication history.

Evidence: [change validation](<C:/Users/famil/Documents/ChatGPT/Workshop Scheduler/src/lib/scheduling/changes.ts:43>), [permitted change types](<C:/Users/famil/Documents/ChatGPT/Workshop Scheduler/src/lib/schemas/changes.ts:8>), [draft-only staffing](<C:/Users/famil/Documents/ChatGPT/Workshop Scheduler/src/lib/scheduling/draft-mutations.ts:14>). Both failed orders and the valid final state were reproduced.

**5. P2 — Location, meeting link, delivery mode, and notes cannot be maintained after booking.**

Class-calendar booking accepts mode and location, and the session detail displays them. The ordinary draft update reads only class, definition, date, times, and staffing bounds. Reviewed changes do not cover delivery details. Direct booking and monthly planning do not collect these fields and default sessions to in-person with no location.

Consequently, an incorrect room or an online link change has no ordinary edit path. Audit reproduction confirms that even submitting mode/location/notes to the draft update leaves those fields unchanged. This is an absent capability, not a claim that the current UI displays editable fields and silently loses them.

Recommendation: add a delivery-details edit path for drafts and reviewed changes for published sessions. Use the same fields across booking entry points, and include changed details in history and participant views.

Evidence: [draft input whitelist](<C:/Users/famil/Documents/ChatGPT/Workshop Scheduler/src/app/admin/workshops/actions.ts:16>), [allowed changes](<C:/Users/famil/Documents/ChatGPT/Workshop Scheduler/src/lib/schemas/changes.ts:8>), [calendar booking](<C:/Users/famil/Documents/ChatGPT/Workshop Scheduler/src/components/candidate-booking.tsx:66>). Reproduced.

**6. P2 — Custom titles work, but numbering is an unnecessary required identity.**

The app is not limited to Workshop 1–6: it accepts arbitrary titles. However, creation requires a globally unique number from 1 to 10,000, and class cards and selectors continue to emphasize that number. A null number signifies an unidentified import, so simply making the field optional would currently hide or mislabel ordinary definitions in several screens.

“Workshop sequence” is primarily a list ordered by the definition's global number. There is no separate class-specific order or prerequisite validation. If teaching order matters, overlapping delivery windows do not prevent Workshop 3 being booked before Workshop 2.

Recommendation: make title the primary identity, separate an optional display order from import-identification status, and explicitly decide whether sequence is informational or enforced.

Evidence: [definition schema](<C:/Users/famil/Documents/ChatGPT/Workshop Scheduler/src/lib/schemas/class-workshops.ts:16>), [number input](<C:/Users/famil/Documents/ChatGPT/Workshop Scheduler/src/app/admin/workshop-definitions/page.tsx:75>), [class filtering and ordering](<C:/Users/famil/Documents/ChatGPT/Workshop Scheduler/src/app/admin/classes/[id]/page.tsx:54>). Title-without-number rejection was reproduced.

**7. P2 — Content, delivery windows, and completed class requirements are coupled for their lifetime.**

There is one `ClassWorkshop` per class/definition pair and at most one non-cancelled session for that pair, including completed sessions. This is appropriate for “teach each of six distinct modules once to this class.” It does not support teaching the same definition again to that same class in a later month or year.

The delivery date range also belongs directly to the reusable definition. Changing that range checks all existing non-cancelled sessions, including completed deliveries. Reusing last year's content with a new year's narrow date window can therefore be blocked by historical sessions.

Recommendation: retain the current uniqueness if these are deliberately one-time modules for a particular cohort. If content must recur, separate reusable content from a dated delivery requirement or offering. A repeat needs a new requirement identity; a cancelled replacement should continue to satisfy the original requirement. This can remain entirely calendar-based, without cycles or terms.

Evidence: [class/definition uniqueness](<C:/Users/famil/Documents/ChatGPT/Workshop Scheduler/prisma/schema.prisma:185>), [one delivery database constraint](<C:/Users/famil/Documents/ChatGPT/Workshop Scheduler/prisma/migrations/20260917101613_class_workshop_sessions/migration.sql:108>), [window update validation](<C:/Users/famil/Documents/ChatGPT/Workshop Scheduler/src/app/admin/class-workshops/actions.ts:72>). Conditional requirements gap; repeat delivery was not assumed to be mandatory.

**8. P2 — Workshop enrollment is repetitive and lacks an ordinary correction path.**

The class page adds one definition to one class per submission. Enrolling ten classes in six workshops requires sixty additions. Monthly planning can batch session creation, but cannot assign a workshop set to classes. There is no action to remove an accidentally added unscheduled class workshop, mark it not required, or change its definition; identity correction is restricted to unidentified imports.

Recommendation: add “Assign workshops to selected classes,” preview the resulting class/definition pairs, skip existing pairs, and support removal of unused requirements or an explicit not-required status while preserving historical deliveries.

Evidence: [single enrollment form](<C:/Users/famil/Documents/ChatGPT/Workshop Scheduler/src/app/admin/classes/[id]/page.tsx:245>), [enrollment and import-only correction actions](<C:/Users/famil/Documents/ChatGPT/Workshop Scheduler/src/app/admin/class-workshops/actions.ts:94>).

**9. P2 — “Ready to schedule” includes availability that is already occupied.**

The candidate helper filters by delivery date range, but not by existing class or teacher bookings, workshop duration, or whether the date is in the past. Server validation catches overlaps on submission, so this does not permit double-booking. It does make readiness and available-time counts unreliable.

Reproduction: two definitions share the class's only 10:00–11:00 availability. Book the first at that time. The second still has database status `READY_TO_SCHEDULE` and one offered candidate, but booking it is rejected for overlap. In a monthly batch, one conflicting selection rolls back the entire batch.

Recommendation: distinguish recorded availability from feasible session options; subtract occupied times, check duration, and annotate conflicts before submission. Keep the server checks as the final safeguard. Treat historical entry separately from planning future work.

Evidence: [candidate helper](<C:/Users/famil/Documents/ChatGPT/Workshop Scheduler/src/lib/scheduling/delivery-windows.ts:33>), [readiness trigger](<C:/Users/famil/Documents/ChatGPT/Workshop Scheduler/prisma/migrations/20260920080340_class_calendar_delivery_windows/migration.sql:24>), [overlap safeguard](<C:/Users/famil/Documents/ChatGPT/Workshop Scheduler/src/lib/scheduling/store.ts:129>). Reproduced.

**10. P2 — Admin navigation is organized around records and bookings rather than class coverage.**

The school directory offers edit/delete, with no school-to-classes drilldown. The combined class directory lists every class, with no school filter or search despite carrying scheduling context in its URLs. Each card shows only the next booked workshop, not its outstanding requirements. Teacher contacts sit in a collapsed section; there is also a separate teacher directory reachable by direct route but absent from the primary navigation. The dashboard prioritizes “Book workshop” over preparing and checking all classes.

A browser regression demonstrates the fragmented route: editing a teacher always posts `directory=combined` and returns to the class directory. The updated teacher is hidden in the collapsed contacts section, so the foundation browser test times out waiting for it to be visible. The record is present; this is navigation/feedback and test-expectation drift, not evidence of a failed database save.

Recommendation: organize the admin landing view around a selected month and school/class coverage. Make school names lead to their classes, preserve month context into class calendars, and open/highlight the edited contact with a success notice. Keep quick direct booking available as a shortcut.

Evidence: [school directory](<C:/Users/famil/Documents/ChatGPT/Workshop Scheduler/src/app/admin/schools/page.tsx:15>), [class directory](<C:/Users/famil/Documents/ChatGPT/Workshop Scheduler/src/app/admin/classes/page.tsx:22>), [collapsed contacts](<C:/Users/famil/Documents/ChatGPT/Workshop Scheduler/src/app/admin/classes/page.tsx:194>), [teacher edit destination](<C:/Users/famil/Documents/ChatGPT/Workshop Scheduler/src/app/admin/teachers/[id]/edit/page.tsx:57>), [failing browser scenario](<C:/Users/famil/Documents/ChatGPT/Workshop Scheduler/tests/e2e/foundation.spec.ts:128>).

**11. P2 — Teacher turnover and class retirement are blocked once workshop enrollment exists.**

Changing a class's teacher or school is rejected whenever it has any class workshops, even when none has a session. The message calls that “workshop history.” A class with workshop relations cannot be deleted. Teachers with classes cannot be removed, and schools with classes cannot be removed. There is no class archive or active/inactive lifecycle.

These rules protect relationships, but leave no normal route for a replacement teacher or retired class. Creating a new class loses continuity in the active class view and requires rebuilding its workshop sequence. Removing PAs preserves database history, but displays that resolve only active PA names may show “Inactive PA” for historical assignments.

Recommendation: provide a class lifecycle and a reviewed teacher-transfer operation. Snapshot historical host details or otherwise preserve their meaning instead of preventing all future contact changes. Keep historical participant identities readable without restoring account access.

Evidence: [class update guard](<C:/Users/famil/Documents/ChatGPT/Workshop Scheduler/src/app/admin/classes/actions.ts:114>), [class deletion guard](<C:/Users/famil/Documents/ChatGPT/Workshop Scheduler/src/app/admin/classes/actions.ts:147>), [teacher removal guard](<C:/Users/famil/Documents/ChatGPT/Workshop Scheduler/src/app/admin/teachers/actions.ts:121>).

**12. P2 — PA input is simple, but admin readiness and one-off exceptions are missing.**

PAs can submit recurring availability and cannot change assignments, as requested. Saving new availability preserves assignments and surfaces eligibility warnings. However, availability has no effective dates, one-date absence, or holiday exception. One missed Monday requires external coordination or a recurring edit that affects every Monday. The PA directory shows identity/access, while quotas are on another page and availability is mostly inferred through per-session eligibility messages.

PA input is limited to Monday–Friday, 08:30–15:00, in half-hour blocks. Session validation allows other weekday hours. An admin can therefore book a 15:00–16:00 session that no PA can cover using the supported availability form. This is a consistency gap even if school-hour-only operation is intentional.

Recommendation: show availability submitted/updated, readable weekly blocks, quota, assigned count, remaining capacity, and review warnings in an admin PA view. Add effective dates and one-off exceptions if real volunteers need them. Align bookable hours with supported availability or make the unsupported period explicit.

Evidence: [PA availability bounds](<C:/Users/famil/Documents/ChatGPT/Workshop Scheduler/src/lib/schemas/availability.ts:11>), [session time validation](<C:/Users/famil/Documents/ChatGPT/Workshop Scheduler/src/lib/schemas/workshops.ts:20>), [PA directory query](<C:/Users/famil/Documents/ChatGPT/Workshop Scheduler/src/app/admin/pas/page.tsx:22>), [PA save behavior](<C:/Users/famil/Documents/ChatGPT/Workshop Scheduler/src/app/pa/availability/actions.ts:10>).

**13. P2 — Publication and schedule changes do not notify participants outside the app.**

The only implemented email is authentication. Published assignments and changes appear when participants open their dashboards. A cancellation or replacement is not emailed. This is explicitly documented as a pilot limitation, so it is not a broken email feature.

For day-to-day operation, an admin must still coordinate externally. Recommendation: either retain that process with a clear “communication pending” checklist, or add an admin-reviewed notification workflow after changes. Notification delivery must not become PA acceptance or negotiation.

Evidence: [publication action](<C:/Users/famil/Documents/ChatGPT/Workshop Scheduler/src/lib/scheduling/draft-mutations.ts:35>), [change application](<C:/Users/famil/Documents/ChatGPT/Workshop Scheduler/src/app/admin/workshops/changes/actions.ts:59>), [pilot operating procedure](<C:/Users/famil/Documents/ChatGPT/Workshop Scheduler/docs/PILOT_RUNBOOK.md:15>).

**14. P2 — The matcher respects constraints but cannot establish that an unstaffed session is unavoidable.**

The implementation is greedy: sort workshops once by eligible-PA count, then choose PAs by current workload/quota ratio and ID. It fills minimum staffing before optional capacity, which is useful, but performs no backtracking or reassignment search.

The audit reproduced four sessions and four PAs, each with quota one. Eligible choices were W1={A,B}, W2={A,C}, W3={B,D}, W4={A,C}. The matcher assigned A, C, B, then nobody. The complete assignment B, A, D, C satisfies every eligibility rule. The existing runbook already acknowledges this limitation.

Recommendation: retain the constraints and protection behavior. Add a bounded reassignment/improvement pass if coverage matters, and describe unsuccessful results as “no assignment found by this run,” not proof that no solution exists. Show whether blockers come from immutable commitments or tentative choices made during the run.

Evidence: [matcher ordering and selection](<C:/Users/famil/Documents/ChatGPT/Workshop Scheduler/src/lib/scheduling/matcher.ts:39>). Reproduced and compared with an independently validated feasible arrangement.

**15. P2 — The scheduling data path will become expensive and overly sensitive as history grows.**

`loadSchedule` reads all sessions, assignments, PA availability, and quotas across all dates. The admin month workspace then filters in memory and computes eligibility for every PA/session pair, repeatedly scanning that snapshot. The PA dashboard also loads the full scheduling snapshot server-side. This is unnecessary work, not evidence that the whole snapshot is exposed to PAs in browser output.

Scheduling mutations use one global settings-row lock; this provides useful correctness for the pilot but serializes unrelated operations. Matching/publication hashes cover the full snapshot, so unrelated changes can invalidate a review. Several unused planning helpers and old creation actions remain, while duration behavior is duplicated across entry points.

Recommendation: first consolidate candidate/session creation and remove unused paths. Then bound reads to the target month plus the configured spacing horizon, relevant PA commitments and history needed for the operation. Preserve cross-month gap validation and quota correctness. Profile before replacing the serialization strategy; ten classes alone do not justify a complex distributed scheduler.

Evidence: [schedule load and serialization](<C:/Users/famil/Documents/ChatGPT/Workshop Scheduler/src/lib/scheduling/store.ts:12>), [workspace candidate expansion](<C:/Users/famil/Documents/ChatGPT/Workshop Scheduler/src/app/admin/workshops/page.tsx:78>), [PA full snapshot read](<C:/Users/famil/Documents/ChatGPT/Workshop Scheduler/src/app/pa/page.tsx:40>), [snapshot hashing](<C:/Users/famil/Documents/ChatGPT/Workshop Scheduler/src/lib/scheduling/matching-preview.ts:3>). Static risk assessment; no load benchmark was run.

**16. P2 / conditional release gate — Data preservation and dependency status need explicit release treatment.**

The two recent class-workshop/calendar migrations preserve populated sessions, assignments, IDs, and history in the repository's isolated verifier; that check passed during this audit. However, the older cycle-removal migration explicitly deletes all `Assignment` and `Workshop` rows before conversion. That is safe only for the disposable data assumed by its comments. If an environment with meaningful cycle-era data has not applied it, deploying the migration chain would destroy those rows. A later preservation migration cannot recover them. No evidence was gathered that any real deployment is still in that state.

Fresh `npm audit` reports three high-severity package findings through one advisory, `deepmerge-ts → @prisma/config → prisma`. The upstream issue is stack exhaustion when merging recursive object graphs; ordinary JSON does not itself create that condition. Local source inspection finds its use in Prisma configuration loading, with a static repository config; this audit did not establish a remotely exploitable application path. The suggested npm fix is a Prisma downgrade outside the current declared range and should not be applied blindly. [Maintainer advisory](https://github.com/RebeccaStevens/deepmerge-ts/security/advisories/GHSA-ggr8-5vv4-36mx).

CI includes unit, integration, browser, lint, formatting, typecheck, and build jobs. This audit ran local checks, not GitHub jobs or hosted recovery. Real email delivery, deployed configuration, and backup restoration remain unverified here; older runbook claims are not proof of current hosting state.

Evidence: [legacy destructive migration](<C:/Users/famil/Documents/ChatGPT/Workshop Scheduler/prisma/migrations/20260909201329_dated_workshops/migration.sql:18>), [preservation verifier](<C:/Users/famil/Documents/ChatGPT/Workshop Scheduler/scripts/verify-class-workshop-migration.mjs>), [local dependency report](<C:/Users/famil/Documents/ChatGPT/Workshop Scheduler/work/audit-2026-09-20/npm-audit.json>), [CI](<C:/Users/famil/Documents/ChatGPT/Workshop Scheduler/.github/workflows/code_quality_check.yml>).

**What is worth preserving**

- Authorization is performed in protected pages and actions, and the auth helper rereads the current non-deleted user rather than trusting stale session roles. Existing role tests cover forbidden access and revoked users.
- Mutations use Zod validation, server-side relationship checks, shared eligibility rules, and database constraints. UTC storage and Vancouver date grouping are handled deliberately, including daylight-saving behavior.
- Scheduling transactions serialize conflicting decisions. Version checks, preview hashes, and revalidation at apply protect against stale edits. Batch booking and reviewed changes have retry/idempotency protection.
- Matching never changes dates. Published, locked, historical, and manually staffed work is protected. Manual staffing locks drafts.
- Publishing validates staffing and eligibility. Drafts stay private. PAs remain view-only for assignments; teachers remain view-only for their school's published schedule.
- Cancellation and completion preserve history. A cancelled delivery can be replaced, and a completed delivery cannot be accidentally duplicated for the same class requirement.
- The UI has consistent components, mobile layouts, keyboard navigation, and automated accessibility coverage. The calendar screenshots are readable; the main problems are workflow semantics and information organization, rather than a need for a wholesale visual rewrite.

**Policies to retain or deliberately reconsider**

The default seven-calendar-day PA gap, mandatory monthly quotas, and same-school/same-day prohibition are deliberate rules in the current brief. With the minimum gap restricted to at least one day, a PA also cannot staff two sessions on the same date at different schools. Manual assignment uses the same constraints; admin control does not currently include an override. These rules reduce available staffing capacity and should be reflected in planning expectations.

Teacher visibility is school-wide, not limited to the teacher's own classes. This matches the current brief. Decide whether that remains desirable for the actual program; it is not an authorization bug relative to the checked-in specification.

For ten classes at twice-monthly cadence, the month needs twenty delivered sessions before considering cancellations or makeups. At a minimum of two PAs each, that is forty PA commitments. The present app can count existing assignments, but cannot verify that the twenty required class deliveries all exist.

**Recommended implementation order**

| Order | Work                                                                                         | Acceptance check                                                                                                                                        |
| ----- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Monthly/half-month delivery requirements and coverage view                                   | All ten classes remain visible, including those with zero candidates; missing and completed obligations are explicit                                    |
| 2     | Recurring class availability, effective dates, exceptions, and feasible candidate generation | Enter weekly hours once; preview dates within workshop windows; no sessions created until admin confirmation                                            |
| 3     | Consistent duration and bulk workshop enrollment                                             | A 60-minute definition inside 09:00–12:00 yields a 60-minute proposal; assign six definitions to ten classes in one reviewed batch                      |
| 4     | One reviewed session-edit operation                                                          | Change Monday/A to Tuesday/B while preserving the session ID; update venue/mode and add/remove staff with a clear audit record                          |
| 5     | Admin directory/readiness improvements                                                       | School → classes → delivery coverage; visible teacher-save feedback; PA availability and workload readily inspectable                                   |
| 6     | Class lifecycle, communication, matcher improvement, and bounded queries                     | Teacher turnover and class retirement preserve history; communication responsibilities are explicit; matcher can repair the four-session counterexample |

Do not start by replacing the stack or rebuilding authentication. Most of the needed work belongs in the domain model, candidate generation, and admin workflow. The existing transaction, authorization, publication, and history mechanisms are a useful base.

**Verification evidence**

| Check                            | Result                                                                   |
| -------------------------------- | ------------------------------------------------------------------------ |
| Unit tests                       | 130 passed, 14 files                                                     |
| PostgreSQL integration tests     | 122 passed, 12 files                                                     |
| Audit-specific reproductions     | 8 passed, confirming the behaviors described above                       |
| Populated migration preservation | Passed for both recent migrations                                        |
| ESLint                           | Passed                                                                   |
| TypeScript                       | Passed                                                                   |
| Formatting                       | Passed, including the final audit report                                 |
| Browser suite                    | 37 passed; 1 failed: teacher edit returns to collapsed contacts          |
| Production build                 | Passed (Next.js 15.5.24 production build)                                |
| npm dependency audit             | 3 high package findings from one upstream advisory; no critical findings |

The audit reproductions assert the current undesired behavior, so their passing confirms the findings; it does not mean the findings have been fixed. They are retained outside the application suite at [reproductions.test.ts](<C:/Users/famil/Documents/ChatGPT/Workshop Scheduler/work/audit-2026-09-20/reproductions.test.ts>) with an [isolated runner](<C:/Users/famil/Documents/ChatGPT/Workshop Scheduler/work/audit-2026-09-20/run.mjs>). Run `node work/audit-2026-09-20/run.mjs` from this checkout to repeat them.

The audit's conclusion is bounded by local code, isolated databases, browser tests, and reviewed screenshots. It does not establish production data state, production performance, mail delivery, or a complete penetration-test result.
