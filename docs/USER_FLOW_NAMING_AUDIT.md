# User flow and naming audit

20 September 2026. This records the pre-change audit. The accepted flow changes are implemented and verified; see [the implementation and validation record](FLOW_IMPLEMENTATION_REVIEW.md) for current status and the separately deferred automatic-date-selection feature.

## Assessment

The interface exposes the application's separate scheduling mechanisms instead of maintaining one clear workshop context. The admin moves among runs, a seven-day date selector, a monthly calendar, a monthly PA matcher, and a readiness report. Terminology changes along that journey. Some of the resulting confusion comes from actual lost state and incorrect handoffs, not just labels.

The earlier functional and accessibility checks did not establish that this complete journey was coherent. Renaming the direct-booking button improved one label but left the surrounding workflow fragmented.

Recommended product vocabulary:

- **Workshop:** the named instance with one shared date window and participating classes, such as **Build a business · 1–23 October**. The existing internal run/definition identity stays unchanged. A repeated delivery is another independent workshop, even if its title is the same. Always show the inclusive window; if title and window both match another workshop, show an additional stable reference or identifying context. Neither title nor title/window is currently unique.
- **Class session:** one class's actual date, time, PA team, and delivery status within that workshop.
- **Availability:** times that could work. These are not saved session dates or PA commitments.
- **Draft schedule:** saved dates and any saved draft PA assignments, still private to admins.
- **Published schedule:** official participant-visible sessions and assignments. Publication does not send email.

This does not introduce a reusable workshop-template entity or change the scheduling rules. Independent or duplicated workshops do not share later title, content, or default-setting edits.

## Method and scope

Reviewed the design brief, current route/component/action source, and two independent GPT-5.6 Sol audits of admin and staffing/participant flows. A third Sol reviewer checked the availability inconsistency. The primary agent walked the current application through its browser UI using a fresh isolated PostgreSQL database and rich demo seed.

The walkthrough covered dashboard, workshop list/detail, a class-specific planning link, two selected dates and their combined staffing check, changing the seven-day view, saving one disposable local draft, re-entering planning, opening automatic PA assignment, and comparing a class directory/calendar with its planner choices. One local-only session was created to verify the success redirect. Hosted test data was not changed. Participant/publication findings below are source-reviewed; they are not presented as new hosted walkthrough results.

The protected hosted preview required a fresh browser Vercel sign-in. The audit used local current source instead of changing deployment protection or asking for access solely to repeat the source-equivalent walkthrough.

## Findings to fix first

### F1 — Changing weeks loses the in-progress schedule

**High priority · reproduced in the browser.** In Build a business, selecting 2 October for Grade 10 Business B and 6 October for Grade 10 Careers C produced a complete staffing simulation. Changing the view to start on 8 October reset both classes to **Leave unscheduled** and removed the preview.

The week control performs a GET navigation with only the workshop identity and week. Choices exist only in component state, and only the visible seven days' candidates are supplied to the form. An admin cannot assemble and preview one batch across different week views. The sentence “dates outside this range are not discarded” is misleading for those unsaved selections. Existing saved sessions and underlying availability are not deleted.

**Recommendation:** preserve a workshop-wide selection list while browsing weeks and editing availability. Display selected dates outside the current view and check the entire selected schedule together. Until repaired, explicitly explain the limitation; changing the sentence alone does not fix the workflow.

Evidence: `src/components/planning-form.tsx:45`, `src/components/planning-form.tsx:123`, `src/app/admin/workshops/plan/page.tsx:121`, `src/app/admin/workshops/plan/page.tsx:276`.

### F2 — Saving a future session opens the wrong month with no confirmation

**High priority · reproduced in the browser.** Saving a 13 October draft from the planner redirected to the calendar displaying **September 2026**, **0 workshops**, and no creation-success message. The draft existed: its class directory subsequently displayed the 13 October session.

The action redirects with a `batch` query parameter, but the calendar does not consume that parameter. Without a month, it defaults to the current Vancouver month. The useful workshop and newly created session context are lost.

**Recommendation:** return to the selected workshop's schedule or a real batch view. Show **1 class session saved as a draft. No PAs assigned yet**, the saved session, and **Assign PAs to these sessions**. Cross-month workshops must show every created session, not only the first month.

Evidence: `src/app/admin/workshops/plan/actions.ts:395`, `src/app/admin/workshops/plan/actions.ts:409`, `src/app/admin/workshops/page.tsx:44`, `src/lib/scheduling/navigation.ts:15`.

### F3 — The date-planning and PA-assignment scopes do not match

**High priority · source-reviewed and entry screen reproduced.** Dates are planned for one named workshop, but **Assign PAs automatically** asks for a calendar month and another class selection. There is no workshop or saved-session-batch selector. A workshop spanning October and November must be reconstructed in separate monthly passes. The same month/class selection can also include sessions from other workshops.

**Recommendation:** open PA assignment from the selected workshop or an explicit set of saved class sessions. Show the title, full window, number of sessions, and dates before preview/apply. Retain monthly staffing as an explicitly scoped optional bulk tool, if useful. **Assign PAs must continue to staff existing dates without creating or moving them.**

Evidence: `src/app/admin/workshops/match/page.tsx:76`, `src/app/admin/workshops/match/actions.ts:28`, `src/lib/scheduling/navigation.ts:15`.

### F4 — Availability has contradictory meanings across screens

**High priority · reproduced in the browser.** Grade 10 Business B has active Tuesday afternoon and Friday morning recurring blocks. The planner offers valid 2 October times with recommended PAs. Yet its directory labels those blocks **REFERENCE ONLY · ENTER DATED AVAILABILITY IN THE CALENDAR**, and the October calendar reports **0 available times** for that Friday and **No availability or sessions recorded** after it is selected.

The calendar's counts and selected-day list use explicit dated availability, excluding active recurring coverage. The nearby active-block controls therefore disagree with the calendar itself. This encourages duplicate data entry and makes saved availability look ineffective.

**Recommendation:** render effective recurring availability, date-specific additions, and closures consistently on the class calendar. Distinguish **Weekly availability**, **Extra availability**, and **Unavailable**. Reserve **Reference only** for inactive imported blocks. Show availability windows here; exact 15-minute session choices and PA counts depend on the selected workshop's duration. Share the date-window resolver with the planner so these views cannot drift. A calendar display change must preserve effective dates, closures, existing scoped candidates, and conflict rules.

Evidence: `src/app/admin/classes/page.tsx:201`, `src/components/class-calendar.tsx:432`, `src/components/class-calendar.tsx:593`, `src/components/class-calendar.tsx:624`, `src/components/class-calendar.tsx:687`.

### F5 — Navigation drops the workshop or class the admin was working on

**High priority · reproduced in the browser.** A class-specific **Choose a session time** link passes the class ID but shows the entire run without focusing or identifying the requested class. **Back to workshops** opens the monthly calendar, not the selected workshop. Re-entering **Plan run dates** from that calendar selected the oldest ended demo run, because the current workshop was not carried through and the fallback is the earliest window.

The empty-date message also says there are no choices **inside the shared window**, even though the planner generated choices for only the displayed seven days. A class with valid later availability can receive an overly broad negative message.

**Recommendation:** preserve workshop, class, selected dates, and the relevant view across every detour. Use **Back to Build a business**, focus the requested class, and say **No suitable times in this week** when only one week was searched. Choose a workshop explicitly when entering from global navigation rather than silently opening an old one.

Evidence: `src/app/admin/workshop-definitions/[id]/page.tsx:274`, `src/app/admin/workshops/plan/page.tsx:46`, `src/app/admin/workshops/plan/page.tsx:240`, `src/components/planning-form.tsx:163`, `src/components/shell/role-shell.tsx:223`.

## Naming and flow hierarchy

### F6 — The primary dashboard action starts the secondary workflow

**High priority · reproduced and source-reviewed.** The dashboard describes creating a workshop and selecting its classes, but its prominent action starts **Schedule class session**, the direct entry form for one date and host. The empty state still says **Book your first workshop**. Direct scheduling is useful when a date is already confirmed, but this hierarchy teaches new admins to begin class by class.

Creating a workshop itself returns to the workshop list, rather than taking the admin into the new workshop's **Add classes** step. The list also places a full create form before existing workshops. Routine reopening and first-time setup compete for attention.

**Recommendation:** make **Create workshop** or **Continue planning** primary. After creation, open that workshop and offer **Add classes**. Keep **Schedule a confirmed class session** as a secondary shortcut, preselected to the relevant workshop whenever possible. Existing workshops should be easy to scan before opening a creation form.

Evidence: `src/app/admin/page.tsx:128`, `src/app/admin/page.tsx:265`, `src/app/admin/workshop-definitions/page.tsx:47`, `src/app/admin/class-workshops/actions.ts:133`.

### F7 — Preview wording looks like saved staffing

**High priority · reproduced.** The combined check explains that it saves nothing, but its result then says **Ready**, names PAs, and displays **2/1 assigned** immediately above **Create selected dated drafts**. That button saves dates, not those PA assignments. During the check, the generic submit component says **Saving…** for both buttons.

**Recommendation:** use **Staffing looks feasible — preview only**, **2 proposed PAs · minimum 1, maximum 2**, and **Check staffing**. Label the pending state **Checking…**. The save action should read **Save 2 draft class sessions**, with **Dates only; PAs are assigned in the next step** beside it. The actual matcher apply action should say **Save draft PA assignments**, followed by confirmation and a publishing next step.

Keep the distinction between a complete feasible preview and a search that did not find one. Simpler language must not turn a bounded search failure into a claim of impossibility.

Evidence: `src/components/planning-form.tsx:174`, `src/components/planning-form.tsx:189`, `src/components/planning-form.tsx:305`, `src/components/submit-button.tsx:29`, `src/app/admin/workshops/match/[id]/page.tsx:207`.

### F8 — The same objects and destinations have too many names

**Medium priority · reproduced and source-reviewed.** Examples include **Session calendar → Workshops → Workshop schedule**, **Classes → Classes & teachers**, **Plan run dates → Choose workshop dates**, and **Workshop sequence** for independent workshop participations. Residual **Book a date**, **Booking summary**, **definition**, **pairs**, and **legacy quota rows** expose older workflows or internal terminology.

**Recommendation:** adopt the vocabulary at the top of this report and use the same name in navigation, page headings, buttons, confirmation messages, empty states, and accessibility labels. The scope of a change belongs in its label; implementation mechanics generally do not.

| Current wording                                                            | Recommended wording                                                                           |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Workshop runs / Open run                                                   | Workshops / Open workshop                                                                     |
| Session calendar / Workshop schedule / Workshops on the dated-session page | Calendar                                                                                      |
| Plan run dates                                                             | Choose class dates, inside a workshop                                                         |
| Enroll classes / Enrollment / Pairs                                        | Add classes / Included classes / Review grouped by workshop, e.g. Build a business: 8 classes |
| Create selected dated drafts                                               | Save draft class sessions, with the count                                                     |
| Apply PA assignments                                                       | Save draft PA assignments                                                                     |
| PA readiness and assignment policy                                         | Availability & workload, under PAs                                                            |
| Workshop sequence                                                          | Workshops for this class                                                                      |
| Waived / Waive delivery                                                    | Not required / Mark delivery not required                                                     |
| No workshop number                                                         | Omit; show a reference number only when present                                               |
| Book a date                                                                | Schedule a confirmed class session                                                            |

Evidence: `src/components/shell/role-shell.tsx:31`, `src/app/admin/page.tsx:16`, `src/app/admin/workshops/page.tsx:118`, `src/app/admin/classes/[id]/page.tsx:321`, `src/app/admin/workshop-definitions/enroll/page.tsx:197`.

### F9 — Progress labels do not tell the admin what to do next

**Medium priority · reproduced.** Build a business shows **10 Outstanding** even though three sessions are published and others already have dates. The count means not completed/not waived, but can be read as ten missing bookings. The dashboard's global outstanding total combines future workshops with current work. In the run table, the **Next action** for a class needing PAs is simply a date link.

**Recommendation:** show actionable counts for **Need availability**, **Need dates**, **Need PAs**, **Staffed draft**, **Published**, and **Completed**, with relevant issue flags. Link **Needs PAs** to assignment and **Staffed draft** to publication review. Reserve **Ready to publish** for a view that actually performs the current publication checks; meeting the minimum PA count alone does not establish readiness. Use **Not completed** only where that aggregate is actually useful.

Evidence: `src/app/admin/workshop-definitions/[id]/page.tsx:155`, `src/app/admin/workshop-definitions/[id]/page.tsx:189`, `src/app/admin/workshop-definitions/[id]/page.tsx:259`, `src/app/admin/page.tsx:177`, `src/lib/scheduling/class-workshops.ts:27`.

### F10 — Two availability editors save different kinds of records

**High priority · source-confirmed; entry links observed in the browser.** The directory's **Weekly availability** action opens the older class edit form, whose explanation says its times are used for date suggestions. However, its `addMeeting` action writes only weekday/start/end; the schema defaults the new row to `activeForScheduling: false`. It therefore silently saves reference-only information. The class calendar's recurring editor separately exposes activation and effective dates. Admins can follow the obvious availability link, save a valid-looking weekly block, and still get no suggested dates from it.

The older path also accepts newly entered non-15-minute times and validates the original teacher relationship instead of resolving an effective teacher transfer. These are additional reasons to retire or consolidate that route rather than merely change its label. Historical exact times should still be preserved.

Class setup has a related hierarchy problem: **Add a class without booking** is collapsed near the bottom, and successful creation has no explicit next step into availability. Teacher contacts appear inside Classes while Teachers also has its own top-level destination.

**Recommendation:** provide one canonical availability editor and preserve the originating workshop when opening it. Organize schools, classes, and teacher contacts together, with a clear **Add class** action that opens availability after successful creation. A class opens to **Availability**, **Workshops**, and **Details**. Keep teacher contact/lifecycle operations distinct from session scheduling, and describe soft deletion as deactivation with retained history; do not imply a restore feature that is not available.

Evidence: `src/app/admin/classes/page.tsx:253`, `src/app/admin/classes/[id]/edit/page.tsx:169`, `src/app/admin/classes/actions.ts:563`, `src/app/admin/classes/actions.ts:607`, `prisma/schema.prisma:158`, `src/app/admin/classes/page.tsx:365`, `src/app/admin/classes/actions.ts:74`.

### F11 — The PA overview raises issues without a resolution path

**Medium priority · source-reviewed.** **PA readiness** mixes policy explanations, saved 15-minute slot counts, lifetime workload, selected-month commitments, and a conflict count. The count is not a link to the affected sessions; clicking the PA goes to their profile edit. Having many saved slots does not establish suitability for a given session.

**Recommendation:** put **Availability & workload** inside PAs, show the relevant effective availability period, and link every conflict to the affected session with its reason and admin action. Keep global policy help secondary. Session-specific eligibility belongs alongside the dates and PA assignment choices.

Evidence: `src/app/admin/staffing/page.tsx:75`, `src/app/admin/staffing/page.tsx:117`, `src/app/admin/staffing/page.tsx:146`.

### F12 — Publish, communicate, and complete need clearer consequences

**Medium priority · source-reviewed.** Batch publication describes visibility; individual publication asks **Ready for the official schedule?** The full consequence is not stated together at either action: the session/team becomes official and visible, no email is sent, and communication remains an admin task. Dashboard communication items are event names/timestamps linking into history, rather than a clear task with a completion action.

**Recommendation:** state the publication outcome at the confirmation point. Then show **Contact school and assigned PAs** with the relevant change, intended recipients, and **Record communication**. Keep **Published**, **Communication recorded**, and **Completed** separate; none should imply the others. Continue to track communication against the specific change version.

Evidence: `src/components/workshop-staffing.tsx:339`, `src/components/workspace-schedule.tsx:556`, `src/app/admin/page.tsx:190`, `src/app/admin/workshops/[id]/page.tsx:331`.

### F13 — Participant views are simpler, but change information is vague

**Lower priority · source-reviewed.** Participant instructions are an unlabeled paragraph, while the public latest-change message usually says only that an admin updated the workshop. The existing PA conflict warning correctly says the assignment remains in place, which should be retained.

**Recommendation:** label **Instructions**, make workshop title/class/date easy to distinguish, and show a privacy-safe change summary such as **Time changed** or **Location updated** where public history supports it. Keep internal reasons and notes private. Teacher enhancements remain lower priority under the agreed scope.

Evidence: `src/components/published-workshops.tsx:145`, `src/app/pa/page.tsx:228`, `src/app/teacher/page.tsx:218`.

## Recommended admin journey

Top-level navigation: **Overview · Workshops · Calendar · Schools & classes · PAs**.

1. **Create/open a workshop.** Title, shared delivery dates, session duration, and PA requirements.
2. **Add classes.** Show school and teacher beside each class, including combined-class notes. Every included class stays visible throughout the workflow.
3. **Choose class dates.** Show teacher-provided availability and PA feasibility within the full workshop window. Keep all chosen dates while browsing weeks or fixing one class's availability.
4. **Assign PAs.** Work on the saved dated sessions in this workshop, with a reviewable proposal and explicit admin exceptions. Dates stay fixed.
5. **Review and publish.** Show each class/date/PA team and explain visibility and communication consequences.
6. **Manage changes and completion.** Move a session, replace a PA, cancel, communicate, or complete from the same workshop context.

These should be connected steps within a workshop workspace, with direct access for experienced admins and ad hoc changes. They should not force a rigid wizard that makes an admin repeat setup to edit one session. The calendar remains a view across workshops; PA availability and school/class administration remain reusable supporting information.

## Design decisions to discuss before implementing

- **Workshop versus run:** recommend **Workshop** in the product and **Class session** for each dated visit. Retain current internal identities. Always display the date window with repeated titles.
- **Whole-workshop date suggestions:** current behavior requires manual per-class selection. **Suggest dates for all classes** would be a new feature, not a rename or an existing capability. It should propose an editable dates-only schedule across the full window, use combined PA feasibility, preserve existing sessions, and require review before saving. The separate PA matcher must still never move dates.
- **Save semantics:** initially keep dates and PA assignment as distinct persisted steps, but place them together in one workspace with explicit next actions. A future combined commit would require its own design and validation; a staffing simulation must not silently become a commitment.

## Recommended order

1. Repair lost unsaved choices, wrong-month save redirects, missing workshop/class context, and the inconsistent availability display/editors.
2. Establish the vocabulary and workshop-centered navigation; correct action labels, pending/success messages, setup entry points, and status meanings together.
3. Scope PA assignment and publication to the selected workshop/session set, preserving all current scheduling and review safeguards.
4. Decide whether to add whole-workshop date suggestions; improve secondary PA/participant reporting afterward.

The first three groups improve the current agreed workflow. Automatic date selection is a separately identified extension. No scheduling-rule changes, new schema, reseed, or deployment are part of this audit.

## Handoff checks

The unchanged application passed all 162 unit tests, lint, TypeScript, formatting, diff checks, and a production build during this audit. All 233 non-document files in the latest deployment manifest still match the workspace. These checks do not cover all the user-flow failures reproduced above; an implementation pass should add regressions for those specific journeys. The local audit server/database was stopped after the walkthrough.
