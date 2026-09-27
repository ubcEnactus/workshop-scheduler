# Usability and cohesion — version 2

## Audit and direction

The admin should understand the next decision without needing to understand matching algorithms, operation receipts, scope hashes, or database records. Preserve the existing Plan → Staff → Publish workflow and scheduling contract. Keep consequential warnings visible; hide implementation detail and infrequent controls behind clearly named disclosures.

The review of current desktop/mobile screens and source found competing primary buttons (including Remove and auto-fill settings), repetitive headings and metadata, a missing obvious transition from successful staffing to publication, duplicated warning presentation and recovery code, and contradictory availability labels in secondary views. The existing shared palette, shell, focus treatment, and responsive layout provide a useful foundation.

## Implementation sequence

1. **Workflow hierarchy:** descriptive step navigation, concise stage guidance, a clear action area for staffing/publication, useful empty/success states, and secondary styling for destructive/settings controls. Keep session identity and date prominent. Retain exact selection and intentional partial publication.
2. **Shared staffing presentation:** one warning component and candidate presentation; consistent red same-day and amber weekly/availability warnings with icons/text; expandable commitment/history detail; search and separation of assignable versus blocked candidates. No new override confirmation.
3. **Structural consolidation:** extract session cards, workflow shell, and reusable command recovery from large components. Share server read data between run overview and embedded planner. Remove genuinely unused legacy UI/helpers, retain historical data and archive routes, and correct schema comments.
4. **Reliable outcomes:** align remaining class/teacher overlap callers with the current contract and make publication retries recognize a completed request. Validate the publication receipt schema with the repository migration command against a disposable local database. Concurrent work removed teacher transfers and adopted teacher-owned schedules during this implementation; preserve that work rather than extending the retired transfer lifecycle.
5. **Verification:** meaningful policy/retry integration tests, desktop/mobile hierarchy and keyboard tests, lost-response recovery, full unit/integration/browser suites, lint, typecheck, formatting, and production build. Inspect screenshots of the resulting key flows.

## Acceptance criteria

- Staff clearly directs admins to add missing PAs, then to review and publish. Routine success does not require discovering the next tab unaided.
- Session dates, names, team gaps, and primary actions are visually prioritized. History, technical explanations, and settings do not dominate the first view.
- Important PA warnings remain visible before Assign/Add and through publication; unavailable candidates cannot be assigned. No new approval step is introduced.
- Auto-fill remains additive and minimum-only. Manual edits retain Undo, exclusion behavior, exact retries, and protection against concurrent changes.
- Publication remains deliberate and atomic; an identical retry after a lost response reports the original result without duplicate events.
- All date suggestion entry points permit intentional teacher/class overlaps while retaining PA conflict checks. Teacher-directory lifecycle and migration changes belong to the concurrent teacher-owned scheduling work.
- Desktop and 390px layouts remain accessible, without horizontal overflow or focused controls hidden beneath action bars.

## Scope and delivery

Implement in the current working tree, preserving existing changes. Keep the existing product and brand; this is a usability and maintainability update. No shared database reset, reseed, or deployment is part of local implementation. Record verification and remaining limitations in a companion review.

Concurrent schema generation captured the new `PublicationReceipt` table in `20260927111434_remove_teacher_transfers`. Running `npm run db:migrate -- --name publication_receipts --skip-seed` against a freshly migrated disposable database confirmed that the schema was already synchronized. The existing migration was not rewritten because another task owns it and may have applied it.
