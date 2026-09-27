# Workshop Scheduler — pilot brief

We are a UBC student club running workshops at schools around the Lower Mainland. PAs are student volunteers, teachers host us in their classes, and our admin team coordinates the whole schedule.

The app should make that coordination calmer. It is an admin planning tool, not a marketplace where teachers and PAs negotiate dates.

This brief describes the implemented behavior confirmed in the September 2026 planning discussion. See [IMPLEMENTATION_REVIEW.md](IMPLEMENTATION_REVIEW.md) for review and verification evidence. The [implementation plan](IMPLEMENTATION_PLAN.md) retains the agreed acceptance criteria.

## School and teacher identity — updated 27 September 2026

The administrator manages schools and teachers only. Each teacher implicitly represents their class and owns one scheduling profile with availability, exceptions, defaults, and workshop enrollment. There is no separate class creation or label and no teacher-transfer feature. A further delivery for the same teacher requires another run. The internal legacy table names remain for compatibility; see [TEACHER_SCHEDULING.md](TEACHER_SCHEDULING.md). References to a representative class below mean this teacher-owned profile.

## The flow

**Admin creates a named workshop run and shared window → selects participating classes → records teacher-provided weekly blocks → reviews dated options and PA availability → confirms session times → assigns PAs → reviews and publishes**

Teachers coordinate with admins outside the app. Admins enter each class's recurring weekly availability blocks, effective dates, and dated exceptions. Each custom-named workshop run has one shared, inclusive Vancouver delivery window across participating schools. Automatic date suggestions fit the class's recorded availability and that window. Admins can explicitly move a class session outside the shared window without changing it for everyone, with the exception recorded. A newly confirmed date outside a recurring class block is recorded as a specific confirmation. Previously recorded workshop-specific candidates remain scoped; they are not silently broadened. Teachers remain contacts and have no scheduling controls.

**Schedule a confirmed class session** remains available when the teacher has already confirmed a date. Select the named workshop, time, and host. Each named workshop is an independent delivery, not a reusable content template. New school and teacher details are saved atomically with the candidate and private session. Every booking reuses the teacher’s single scheduling profile. The summary shows the workshop, date, host, and staffing target before saving.

The planner should show dated choices in 15-minute scheduling increments, with separate counts for recommended PAs and available PAs needing workload overrides. Both require full-duration availability and no hard conflict; recommended PAs also meet automatic workload rules. Fairness orders candidates without changing eligibility. Admins select or adjust dates. A batch preview checks competition for the same PAs across selected times; individual counts do not guarantee whole-batch coverage. No session or PA assignment is created merely by entering weekly availability or viewing suggestions. Legacy weekly reference rows require explicit activation before they authorize new dates. Saved class cadence does not generate visits.

A class workshop has one non-cancelled session. Cancelled sessions remain history and may be replaced. Completing a session completes that class workshop. If classes A and B attend together, use A as the representative class and record an admin note; do not build grouped-class logic or create a second pending delivery for B. A further visit is a separate workshop run, including a temporary one. Assignments belong only to dated sessions, using one PA assignment type with no separate manager role.

Admins can delete an unused or draft-only workshop after a confirmation showing its title, window, and affected record counts. Deletion removes the workshop's enrollments, workshop-specific candidates, draft sessions, draft assignments, and private draft history. Shared schools, classes, people, availability, and other workshops remain. Published, completed, or cancelled session history prevents deletion; cancelling a session does not make its workshop deletable. If the workshop changes after the deletion review, the admin must review the updated confirmation before deleting it.

The workshop workspace has **Plan → Staff → Publish** views of the same saved sessions. Dates save explicitly; staffing edits save immediately to the private draft with Undo. **Auto-fill missing PAs** preserves all existing teams and dates, adding only enough automatically eligible PAs to reach the selected sessions' minimums. It never replaces teams or fills optional places to the maximum. A separate expiring staffing proposal is no longer part of the flow. Publication is the deliberate boundary that makes assignments official and participant-visible; there is no PA acceptance step.

After initial publication, opening a workshop defaults to its own calendar overview. It shows only that workshop’s sessions, with status, school, teacher, PA team, and links to reviewed edits. Published staffing issues stay visible across calendar months. Drafts and remaining teacher dates remain accessible through Continue scheduling and the existing Plan → Staff → Publish workflow. Workshop details can be edited from the overview. Calendar navigation does not change scheduling records.

If plans change, the admin can edit the date and PA set together, change details, cancel, or mark completion. Ready class sessions can be published individually or in a reviewed batch. Initial publication requires valid staffing; if a PA later withdraws, the admin may remove them while retaining the published session with a prominent staffing deficit. PA availability changes flag affected assignments; they never automatically cancel or remove them. Participant communication is external for the pilot, with an admin task recording what still needs to be communicated.

## Who can do what

The admin is in full control. Admins manage schools, people, classes, workshop slots, assignments, publishing, replacements, cancellations, and completion.

PAs provide recurring weekly availability using time blocks and a Monday–Friday checkbox selection. A read-only calendar shows their saved availability and published assignments. PAs communicate time off manually; they do not enter dated exceptions or edit individual slots. PAs maintain one current weekly schedule without effective-date or version controls. Admins can view and edit that same schedule from the PA directory or staffing view, with stale-save protection. Admins add or remove extra time for a single date in the calendar's selected-day panel. Saving weekly availability applies from today in Vancouver, supersedes future weekly plans, and preserves earlier availability history and dated admin changes. Availability edits do not accept, decline, or change assignments. See [PA weekly calendar verification](PA_WEEKLY_CALENDAR_REVIEW.md).

Teachers are view-only. They can see published workshops for their school but cannot request, schedule, or reschedule anything in the app.

Admins may intentionally schedule overlapping sessions for the same class or teacher. Date suggestions, batch planning, booking, and session edits do not reject or hide these times. The one non-cancelled session per class per run rule still applies, and overlapping PA assignments remain blocked.

## How matching should behave

Monthly PA quotas are not a prerequisite for assignment. Among otherwise suitable PAs, prefer those with fewer total assignments as a soft fairness signal. A workload cap, if needed, is an explicit separate configuration rather than required monthly setup. Do not infer a per-workshop-run or per-title cap. The proposed total includes dated draft, published, and completed assignments, excludes cancelled/removed assignments, and updates as the preview selects assignments.

Automatic matching requires PA availability for the full session, at most one assignment per day and, initially, one per week. Across all manual assignment screens, missing/partial availability and same-day/same-week workload remain visible warnings, but the admin can select the PA by clicking Assign/Add directly. No override form, checkbox, separate reason or extra confirmation step is required. Same-day workload warnings remain prominent red; same-week warnings remain amber, with the existing commitments available for review. Clicking the assignment action records the applicable assignment-specific exceptions, retained through publication and matcher reruns; it does not change PA availability or silently approve older assignments whose availability later changes. Overlapping assignments remain a hard block. The weekly capacity period is Monday–Friday in America/Vancouver, resetting the following Monday. Friday and the following Monday are in different capacity weeks; this is not a rolling seven-day gap. These automatic limits are not soft scores that the matcher may ignore to fill a vacancy.

PAs cannot teach consecutive classes at the same school under the earlier agreed rule; a generic same-day workload override does not silently remove that separate restriction. Manual same-day exceptions at different schools are now agreed. Draft, published, and completed commitments count when evaluating new assignments; cancelled workshops and removed/replaced assignments do not. Preserve approved manual exceptions on reruns and count them as real commitments. Exceptions to the shared date window or automatic daily/weekly limits must not bypass overlapping assignments; availability overrides are recorded separately when the admin selects a PA or reviews a moved session despite the visible warning.

Show existing and proposed sessions together for a workload override, including school, date, time, and the time between them. Counts and warnings must be revalidated when applying the change. A batch is Ready only with a valid staffing preview; distinguish limited backup coverage, concrete weekly/same-day override options, demonstrated hard shortages, and a search that found no solution without proving impossibility. Use explicit labels and icons in addition to color. Higher lifetime workload remains a neutral ranking signal, not an undefined heavy-workload warning.

Existing manual and automatic assignments always survive auto-fill. Existing locked drafts conservatively retain **Auto-fill off** until the admin allows additions; new manual edits do not automatically freeze a session. Manual removals are remembered as per-session automatic exclusions, not global PA unavailability. When automatic rules cannot be met, retain the valid partial draft with clear remaining gaps and manual options. Auto-fill may staff a valid admin-created out-of-window session; it retains the approved date exception and never moves that session. Undo reverses only its own draft operation, checks current commitments and cannot overwrite newer edits or published work.

For fixed dates and fixed existing teams, automatic full-minimum feasibility is computed exactly with PA capacity shared by Vancouver Monday–Friday week. A demonstrated shortage is scoped to filling remaining gaps without changing those teams and automatic rules; it does not rule out a different team arrangement or manual choice. When full coverage is impossible, the saved partial draft favors completed session minimums before remaining filled places and lifetime fairness. Date-planning manual-warning exploration is bounded and an unfinished search is shown as uncertainty.

For the pilot, automatic daily/weekly limits and total-assignment fairness guide workload. Live routing and map optimization can wait.

## Workshop runs and calendar views

The named workshop run and its shared date window organize delivery. Coverage starts from its explicitly enrolled representative classes, including those with no availability or booking. Calendar months are useful views of actual sessions; they do not generate required visits. Windows can cross months or overlap. There is no cycle or term workflow. A session appears in a calendar month according to its Vancouver-local date.

The core records should stay simple:

- A teacher belongs to a school and owns recurring availability, dated exceptions, admin notes, and saved defaults.
- The existing workshop definition initially represents a named run and its shared delivery range. Duplicate it with a new identity/window for another delivery; separate content templates can wait.
- A unique class workshop connects a class and definition and tracks delivery progress. New class calendar availability can serve any workshop within its delivery window; older workshop-specific candidates and direct confirmations remain scoped.
- A workshop session is one dated occurrence with staffing needs and a lifecycle such as draft, published, completed, or cancelled.
- An assignment connects a PA to that session and records whether the assignment is still a draft or has been published.
- Total assignment counts inform fairness. Legacy monthly quota records do not authorize or block new assignments and must not silently become optional caps.

## Pilot boundary

The target pilot includes invite-only accounts, PA management, teacher-provided class schedules entered by admins, workshop-window planning, dated sessions, PA availability, automatic daily/weekly limits, total-assignment fairness, reviewed admin date/weekly exceptions, manual edits, locking, publication, cancellation, replacement, and PA/teacher views. Teacher access remains school-wide and view-only; further teacher-facing enhancements are low priority.

It does not need teacher self-service, PA acceptance, calendar sync, live routing, advanced optimization, qualifications, or automatic rescheduling.

## Current implementation

The cycle model has been removed. Named runs use the existing WorkshopDefinition identity and shared date window. Unique class enrollments, effective availability, dated sessions, PA matching, publication, locks, explicit exceptions, and combined reviewed edits implement the flow above. Legacy quotas do not affect assignment. Migrations preserve existing session IDs, history, scoped candidates, and the full interval of prior PA availability. See [IMPLEMENTATION_REVIEW.md](IMPLEMENTATION_REVIEW.md) for the current workflow and validation evidence.
