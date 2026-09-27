# Schools and teachers

Each teacher represents one class. Admins add a school and teacher, then open the teacher to record weekly availability, effective dates, exceptions, subject/grade, session defaults, and workshop enrollment. There is no separate class creation, label, picker, or teacher handover. A teacher receives at most one non-cancelled session per run; another visit requires another run.

The teacher page has two independent tabs: **Availability** (weekly times and calendar) and **Workshops** (enrollment and sessions). Contact editing, scheduling settings, and deactivation are compact header actions. Adding a weekly time uses one Monday–Friday selection; saving creates a time for every selected day and enables date suggestions automatically. Editing an existing time selects one weekday and retains its removed calendar dates. Imported inactive reference rows remain marked **Needs review** until an admin reviews and saves them. The default-only migration does not activate those records.

Workshop forms use in-person delivery implicitly and show **Location** without a delivery-mode selector. Historical delivery values remain readable. Admins can open **PAs → Availability** to view or edit the same effective weekly schedules and dated exceptions that the PA sees. These edits preserve earlier schedule versions and existing assignments; stale weekly saves from either actor are rejected. See [simplified scheduling verification](SIMPLIFIED_SCHEDULES_REVIEW.md).

## Calendar occurrence removal

Admins manage one-day changes directly on the teacher calendar. **Remove for this date** removes only that weekly block on the selected Vancouver date. Other weeks and independent dated availability remain. **Undo** follows a successful removal; **Restore** remains available after reopening the calendar. Removing the whole weekly pattern stays in weekly settings as **Remove weekly time**.

The standalone date-specific change and school-closure creation sections are retired, including their unused actions and schemas. Existing restrictions remain effective and visible on affected dates. A legacy school closure can only be reopened through the explicitly school-wide control. New dated additions use **Add a time**.

`ClassMeetingSkip` stores the weekly source and date. All date-generation readers and save-time validation respect skips. The occurrence action shares the scheduling transaction lock, checks current ownership/revision, and protects overlapping non-cancelled sessions. Restore identifies the exact skip; a delayed Undo cannot reverse a later removal. Hours edits retain skips, while deleting the weekly rule cascades its skips. See [implementation verification](CALENDAR_OCCURRENCE_REMOVAL_REVIEW.md).

## Implementation plan and compatibility

1. Replace the class directory and add flow with the teacher directory. Keep old URLs working for saved links and planning returns.
2. Create a scheduling profile atomically with each teacher, and reuse it in confirmed booking. Reject attempts to create a second profile, including concurrent writes, with a database uniqueness constraint.
3. Keep the existing `ClassSection`, `ClassWorkshop`, and availability tables as internal storage. `ClassSection.teacherId` is unique; it is the teacher's implicit scheduling profile, not another user-managed entity. This preserves IDs and existing enrollment, availability, staffing, and history relationships.
4. Backfill missing profiles for active teachers and mirror teacher display names. Capture existing session host labels before changing display names. Do not delete or reseed existing data.
5. Verify migration preservation and ambiguity rejection, teacher creation, availability, enrollment, booking reuse, authorization, desktop/mobile flows, and the existing quality gates. Back up both demo databases, deploy verified builds, apply the migration, verify preservation, and update the stable aliases.

Migration `20260927110636_one_schedule_per_teacher` aborts transactionally if a teacher has multiple legacy profiles. Those records require explicit reconciliation, not an arbitrary merge that might lose availability or combine two deliveries. Release preflight found no duplicate profiles in the Ennovate or Enspire databases. The final backups contained one teacher and one profile in Ennovate; Enspire had none. Both transfer tables were empty.

Teacher transfer UI, Server Actions, schemas, resolver, and model are removed. Migration `20260927111434_remove_teacher_transfers` drops the obsolete table. Its generated SQL also includes the additive publication receipt required by the concurrent usability update.

Renaming a teacher updates the profile's display name; stored session host snapshots remain unchanged. An unused teacher can change school. Recorded availability or workshop history blocks moving that schedule to another school. Deactivation/reactivation uses the existing scheduling lifecycle checks and preserves history. Teacher login permissions remain school-wide and view-only.

## Release verification

The isolated release snapshot passed 238 unit tests, 235 integration tests, and 10 focused browser tests covering teacher setup, availability, enrollment, direct booking, validation, repeat submission, mobile accessibility, and publication recovery. Lint, TypeScript, and formatting passed. A separate migration verifier checked preserved IDs/history/availability, missing-profile backfill, transactional rejection of duplicate legacy profiles, uniqueness enforcement, and removal of the transfer table.

Schema and generated migrations are committed as `85bc8fc`. Release source hashes and verification logs are under ignored `work/teacher-scheduling-release-20260927/`. This release uses its frozen, tested export; later edits from the concurrent usability task remain outside this snapshot.

The production build passed. Both public demos are deployed: [Ennovate](https://ennovate-workshop-demo.vercel.app/login) and [Enspire](https://enspire-workshop-demo.vercel.app/login). Both backed-up databases have all 21 migrations applied, with retained-table comparisons confirming preservation and transfer-table removal. Hosted verification passed on 25 desktop/mobile page states, including the teacher directory/profile, class-free booking, admin/PA sign-in and sign-out, role restrictions, secure two-hour sessions, and cross-demo isolation. No accessibility violations, horizontal overflow, browser errors, or application 5xx responses were observed. The live teacher and booking screenshots were visually inspected; hosted checks created no scheduling records.
