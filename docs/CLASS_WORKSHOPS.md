# Class workshop refactor

The hierarchy is `School → ClassSection → ClassWorkshop → WorkshopSession → Assignment`. Each `ClassWorkshop` refers to a reusable `WorkshopDefinition`. New `AvailabilitySlot` rows belong to a class calendar and may serve any of its workshops within the definition's shared delivery date range. Existing workshop-specific candidates and confirmed direct bookings retain their narrower scope. Each availability row has exactly one owner. Teachers remain class contacts. PA weekly availability remains separate.

## Admin workflow

1. Add numbered workshop definitions in **Workshop catalog** and set each shared delivery window (inclusive Vancouver dates). Leave both dates blank when undecided. Existing sessions must remain within a changed window.
2. Open **Classes & teachers → Class calendar**. Select a weekday, enter an available time, and save. Add, edit, or remove windows directly beside the calendar. Availability supporting a booked session is protected.
3. Add definitions in the workshop sequence below the calendar. Each class/definition pair is unique. Workshop cards show the intersection of class availability and that workshop's delivery window. Use the calendar's delivery-window selector to highlight the range.
4. Choose an available time on a workshop card and create a private draft with delivery mode and location. The initial duration uses the definition's usual duration, capped at the available window; the admin can adjust it. **Plan a month** can book selected full candidate windows across classes; unselected workshops remain unscheduled.
5. Assign PAs and publish using the existing controls. Matching never creates or moves dates. Quotas, gaps, locks, manual work, and publication protections remain.

**Book workshop** remains a shortcut: select a definition, date, and host, then save the confirmed candidate and session atomically. New school/teacher/class details remain reusable. A second booking of the same definition for the same class is rejected while a scheduled or completed delivery exists; a cancelled delivery can be replaced.

Rescheduling uses another recorded class window or workshop-specific candidate within the shared delivery window. Add the teacher's new availability before reviewing a reschedule. Availability edits never move a session. Windows supporting scheduled/completed sessions cannot be edited or removed through the UI; other candidates remain editable. Direct bookings and monthly batches enforce the same shared date range on the server.

Recurring class meetings remain optional reference information. They no longer authorize sessions or generate monthly dates. Saved cadence/defaults do not invent curriculum requirements or candidate dates.

## Migration

`20260917101613_class_workshop_sessions` was generated with `npm run db:migrate -- --name class_workshop_sessions --create-only`, then given a transactional backfill.

- `WorkshopSession` maps to the existing `Workshop` table. Assignment and history relation fields use `workshopSessionId`, mapped to existing database columns. These mappings preserve keys; there is only one scheduled-event model.
- Existing records have no curriculum identity. Each receives an explicitly unidentified imported definition and class workshop. No sequence is inferred from dates. Its booked time becomes an explicit window, noting that other candidates were not recorded.
- Dates, staffing bounds, batches, assignments, locks, versions, publication metadata, statuses, and audit history are preserved.
- Admins can identify imported workshops with a catalog definition while preserving session/assignment IDs. Existing class/definition pairs cannot be duplicated.
- Pending matching previews expire. Stored session-ID keys are migrated, including applied previews, and durable history remains.
- Database constraints prevent duplicate pairs, duplicate identical windows, invalid durations, and multiple non-cancelled deliveries. Triggers derive class-workshop status from sessions and candidates for every writer.

The earlier committed cycle-removal migration is unchanged. This migration upgrades the current dated-workshop schema; it does not recover records already deleted by historical migrations.

## Verification

`20260920080340_class_calendar_delivery_windows` adds nullable calendar-date columns to definitions and an alternative class owner on availability. It does not alter existing candidates, session IDs, dates, assignments, or history. A check constraint enforces exactly one availability owner and a valid paired delivery range; status triggers include shared availability and delivery-window edits. Existing definition ranges start unset. The populated migration verifier checks both migrations.

`node scripts/verify-class-workshop-migration.mjs` creates an isolated PostgreSQL cluster, applies prior migrations, inserts populated records in all four lifecycles, and verifies preservation after migration. It never uses a configured database.

The integration suite verifies cardinality, isolation, stale edits, concurrent scheduling, constraints, session assignments, matching/publication/change regressions, and monthly candidate selection. The new browser scenarios cover candidate editing, mobile accessibility, scheduling, assignment, publication, and teacher visibility.
