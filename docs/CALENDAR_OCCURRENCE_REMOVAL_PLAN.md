# Teacher calendar: remove one occurrence

Audit and implementation plan, 27 September 2026. Implementation was subsequently authorized and completed locally; see [verification and release status](CALENDAR_OCCURRENCE_REMOVAL_REVIEW.md). The original design below records the accepted scope.

## Recommended behavior

Remove the **Date-specific changes and school closures** section and both of its creation forms. Keep weekly availability and the calendar. The selected-date pane becomes the place to manage availability for that day.

For the supplied example, the Tuesday, October 6, 2026 card should show:

> Weekly availability  
> 1:15–2:00 PM  
> **Remove for this date**  
> Other Tuesdays stay unchanged.

Clicking removes that weekly occurrence on October 6 only. October 13 and other Tuesdays remain available. No separate exception form, reason field, or confirmation dialog is needed for an unbooked occurrence.

Show immediate saved feedback with **Undo**. After reload, the selected date can show a quiet **Removed for this date · Restore** row. This provides a durable way to reverse the change without bringing back a separate exceptions section. The removed row does not count as available time.

Each removal affects the selected card. If a date contains two separate weekly blocks, removing one leaves the other. An independently recorded dated window also remains; the calendar must show which availability is still present. Do not introduce a whole-day deletion action in this first change.

Scope is the admin-managed teacher calendar shown in the screenshot. Its actions remain ADMIN-only; teachers remain view-only and PAs cannot edit teacher availability. The PA's own availability editor is a separate component and data model and is outside this plan.

## Audit findings

| Finding                                                              | Evidence                                                                                                                                          | Implication                                                                                                                                 |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Weekly cards have no removal control.                                | `EffectiveAvailabilityCard` and the `dayWindows` rendering in `src/components/class-calendar.tsx`.                                                | This is the interaction gap visible in the screenshot.                                                                                      |
| Dated cards already have a remove action and stale-edit protection.  | `RemoveAvailability`; `removeClassAvailability` and `editableSlot` in `src/app/admin/classes/availability-actions.ts`.                            | Reuse the visual pattern and existing restrictions, not the dated-row deletion operation for a weekly card.                                 |
| Weekly occurrences are calculated rather than stored as dated rows.  | `ClassMeeting` in `prisma/schema.prisma`; `resolveClassAvailabilityWindowsForDate` in `src/lib/scheduling/recurring-candidates.ts`.               | Deleting a `ClassMeeting` deletes its entire repeating pattern, including future weeks.                                                     |
| Existing CLOSED exceptions are broad date/time restrictions.         | The resolver subtracts each CLOSED interval from every positive source, including explicit dated windows.                                         | Reusing a CLOSED exception as a card deletion would also block overlapping dated availability and make adding a replacement time confusing. |
| Existing weekly deletion is a pattern-level operation.               | `removeRecurringClassAvailability` deletes the `ClassMeeting`; its UI is in the weekly settings.                                                  | Add a separate occurrence action; keep whole-pattern deletion in weekly settings and label its scope explicitly.                            |
| Booked dated windows cannot be removed.                              | `editableSlot` rejects windows supporting non-cancelled sessions. Weekly/exception removal currently lacks that equivalent occurrence guard.      | Add explicit booking protection to the new action instead of inheriting the weaker exception behavior.                                      |
| Availability is used beyond the calendar.                            | Shared candidate generator, `sessionAvailability` in `store.ts`, run planner, teacher profile, enrollment detail, and session editor.             | A UI-only hide would leave removed times bookable. All readers and save-time validation must use the same exclusions.                       |
| Hiding the old section would also hide its existing-record controls. | The section lists teacher exceptions and school closures; the selected-date pane currently displays unavailable rows without management controls. | Move management of existing records into the selected-date pane before removing the section.                                                |

A pure local probe using the actual resolver confirmed that the Tuesday rule produces availability on October 6 and October 13; deleting the rule removes the next week too; a CLOSED interval on October 6 removes both the weekly occurrence and an overlapping dated window. Evidence: ignored `work/calendar-removal-audit/probe.mts`. No database was involved.

## Data and scheduling design

Introduce an internal `ClassMeetingSkip` record (name can follow repository conventions):

- `id`, `classMeetingId`, Vancouver calendar `date` stored as `@db.Date`, and creation metadata.
- A foreign key to `ClassMeeting` with cascade deletion and a unique constraint on `(classMeetingId, date)`.
- Derive teacher ownership through the meeting. Do not create a second teacher/profile relationship or encode this state in notes.

This is a small additive migration. Do not delete or repurpose existing `ClassAvailabilityException` or `SchoolClosure` rows. Generate the migration using the project's normal migration command and commit the generated SQL with its schema change.

The shared resolver omits a weekly source when that source has a skip for the requested date. Existing general teacher restrictions and school closures retain their current precedence. Explicit dated availability and legacy ADDITIONAL windows are not suppressed by a weekly skip. Adding a dated replacement after skipping a weekly occurrence therefore works normally, unless an independently saved restriction also applies.

Keep the skip tied to the weekly rule and date if that rule's hours are subsequently edited. This preserves the user's intentional exception to that occurrence. If an edit moves the rule to another weekday or outside its effective date range, do not offer restoration of an occurrence that no longer exists. Deleting the entire weekly rule removes its skips; a newly created rule has a new identity.

Legacy restrictions can split one weekly occurrence into several visible ranges. Group ranges from the same weekly source into one selected-date card, showing every remaining range with one **Remove for this date** action. This avoids a button on one fragment unexpectedly hiding another separate-looking card. Separate weekly sources remain separate cards.

Calendar counts should use the same effective-card grouping as the selected-date pane. After a removal, immediately refresh the selected card, day badge, run date options, and derived readiness. A run with no remaining valid candidate must not continue displaying ready-to-schedule solely because an older persisted status or cached count says so.

## Server actions and consistency

Add dedicated remove/restore occurrence actions with Zod schemas in `src/lib/schemas/`. Each starts with `requireRole('ADMIN')` and runs within the existing `scheduleTransaction` lock.

Before creating a skip, validate:

1. The teacher/profile and school are active, and the meeting belongs to that profile.
2. The selected Vancouver date matches the meeting's weekday and effective range, and the meeting is active for scheduling.
3. The last-seen meeting revision and occurrence state still match. Derive hours on the server; do not trust a submitted time range as authority.
4. No non-cancelled session overlaps the occurrence's effective ranges on that date. For an affected draft, published, or completed session, keep the availability and link to the session with **Manage session first**. Cancelled sessions do not block removal.

This conservative booking rule avoids silently invalidating or altering an existing session. It does not cancel, reschedule, unpublish, remove PAs, or rewrite historical host information. Whole-pattern editing is not being redesigned in this change.

The unique key prevents duplicate skips. Pending controls prevent repeated clicks, and repeated removal of the same current occurrence should return its existing saved state. Restore/Undo must identify the exact skip record, re-read the current meeting and occurrence state, and refuse to reverse a later replacement removal. Define and test stale-click/retry behavior across remove → restore → remove; use a revision or mutation identity so a delayed request cannot overwrite a newer intent.

Revalidation must include the teacher route and compatibility class route, run workspace, calendar, and affected scheduling views. Planning and booking actions must re-evaluate current availability when saving: an already-open planner cannot save a time supported only by the skipped occurrence. Explicit admin-confirmed booking remains its existing separate path; it must not silently undo the skip.

## Existing dated additions and restrictions

- Keep normal dated availability removal. Match the new action's placement and scope wording with that control.
- Existing ADDITIONAL records should be manageable from their date cards, using the same ownership, stale-state, and booked-session protections. New additions use the ordinary calendar **Add a time** form.
- Keep existing teacher CLOSED restrictions effective and visible as a selected-date **Unavailable** row, with removal/restoration controls there. A weekly skip must never automatically clear one of these independent restrictions.
- Inventory existing school closures before implementation/release. Do not silently delete them when removing their creation form. If any remain, display them only on affected dates. Any legacy removal control must explicitly say that it reopens the time for **all teachers at that school**; the local weekly-card action must never do that. No new school-closure creation interface is planned.

Remove the old creation forms, unused imports, and dead Server Action exports only after checking their callers. Retain compatibility readers and the management actions needed for existing saved data. Avoid dropping the old tables in this release.

## Implementation sequence

1. **Storage and shared resolution:** add the skip model/migration and source-specific resolver behavior. Extend the common server read shapes, including `run-workspace.ts` and the `store.ts` host include, and all direct teacher/enrollment/session readers.
2. **Mutations:** implement remove/restore with booking protection, ownership checks, stale-state handling, and consistent revalidation. Keep these separate from whole-pattern deletion.
3. **Calendar UI:** extract a focused selected-date availability card component from the large calendar; add scoped removal and restoration; group split ranges; move legacy-record management to date cards; remove the standalone section and creation forms. Keep calendar navigation and selected date stable after saves. Return keyboard focus to the feedback/next card after removal.
4. **Verification and handoff:** test the cases below, inspect desktop/mobile screens, update workflow documentation, and report implementation results. Deployment is a separate step after implementation verification.

## Acceptance criteria

- Removing October 6, 1:15–2:00 PM from the supplied example hides that weekly occurrence and updates its badge, while October 13 and the weekly settings stay unchanged.
- The removal survives reload; Restore returns the current occurrence without changing another date, teacher, weekly source, or dated window.
- A dated replacement can be added after a weekly skip. Independent existing school/teacher restrictions still apply and remain understandable.
- Removing one of several blocks affects only that source. Split legacy ranges are grouped and their button's scope is clear.
- The teacher calendar, run overview, planner, enrollment detail, and session editor agree about the remaining availability. Stale planning submissions are rejected.
- Booked occurrences show a session link and cannot be removed through this shortcut. Existing sessions, assignments, publication state, and history remain intact.
- Wrong-role calls, wrong-teacher IDs, archived teachers, deleted schools, inactive/out-of-range weekly rules, stale revisions, duplicate clicks, and late Undo/retry requests are covered.
- Vancouver dates remain correct across month boundaries and daylight-saving changes. Legacy exact times are retained; the removal action derives existing times rather than forcing them through new-entry rounding.
- The old **Date-specific changes and school closures** and **Add a school-wide closure** controls are absent. Existing data has no invisible, unmanageable blocker.
- Keyboard/screen-reader feedback, pending/error states, 390px and desktop layouts, no page overflow, and accessibility checks pass.

Run focused resolver/schema tests, PostgreSQL action and stale-planning integration tests, calendar browser flows, and the relevant existing planning/teacher regressions. Complete the required unit, lint, typecheck, formatting, and production-build gates before implementation handoff. Rehearse the additive migration against populated disposable data and verify preserved existing records.

## Assessment

Feasible as one contained calendar feature, with a small additive schema change and several shared scheduling readers to update. The UI portion is straightforward; the substantive work is keeping occurrence removal precise, reversible, and consistent with planning and booked sessions. A CSS-only removal or reuse of the current broad CLOSED exception would not meet the requested behavior.
