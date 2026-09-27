# Editable staffing preview

**23 September policy update:** availability and workload warnings no longer open a separate override review. Add to proposal acts directly, without confirmation checkboxes or an override reason. The server still revalidates current commitments and records applicable exceptions; automatic matching and real conflict blocks are unchanged. The original implementation record below describes the earlier workflow.

## Audit

The matching review shows the saved automatic proposal but offers no proposal mutations.
Session links edit live drafts instead, invalidating the preview hash. Existing manual
assignment policy already supplies hard blocks, explicit day/week confirmations, and
commitment context. The preview JSON can hold reviewed manual choices without a migration.
The working tree contains substantial existing work; this change builds on it without resetting it.

## Implementation plan

1. Add a per-session staffing dialog, with drag-to-slot and equivalent add/remove buttons.
   Changes persist only to the private preview; final application remains separate.
2. Show effective availability for the session's Vancouver week on hover, focus, and tap.
   Include dated exceptions, commitments, and a compact week/run/lifetime legend.
   A run means the named workshop identity; the product has no separate workshop-type model.
3. Reuse assignment policy for all additions. Hard conflicts cannot be overridden.
   Day overrides require red confirmation; weekly overrides require amber confirmation
   and a reason, with both proposed and existing sessions and their time gap visible.
4. Serialize preview edits, check ownership/expiry/schedule hash, and reject stale preview
   revisions. Reassess the whole proposed schedule after each edit and at application.
   Retain protected rows; link to their existing reviewed editor.
5. Persist edited teams as manual and lock edited sessions, including intentionally empty
   teams, so reruns preserve admin decisions. Preserve dates and publication boundaries.
6. Test policy enforcement, preview-only edits, concurrency, overrides, aggregate counts,
   drag and keyboard flows, mobile layout, and apply/rerun behavior. Run all required checks
   plus database integration and focused browser tests.

## Acceptance

- Admins can edit an unprotected proposal without leaving the review or scheduling early.
- Hover/focus/tap reveals the selected session week's effective availability.
- Workload counts include preview deltas and exclude cancelled sessions; no run count is a cap.
- Stale, expired, foreign, protected, conflicting, or unconfirmed changes are rejected.
- Final application saves exactly the reviewed team and exception metadata atomically.
- Manual work survives subsequent automatic previews; partial staffing remains explicit.

## Implementation and verification

- Added an accessible native dialog to every editable preview row. Both drag/drop and
  buttons modify the private proposal, with search, team removal, and explicit override review.
- Effective week availability is available on hover, keyboard focus, and tap. Exact legacy
  minutes and dated exceptions are retained. Week/run/lifetime counts include proposal deltas;
  database aggregates retain history outside the loaded scheduling neighborhood.
- Preview edits and application share serialized schedule transactions. Ownership, expiry,
  schedule changes, and competing preview revisions are checked. Revision hashing normalizes
  optional metadata before hashing, preventing false stale errors after a database round trip.
- Edited teams save as manual assignments with override metadata and a session lock. An empty
  edited team also remains locked. Protected and published sessions use their existing editor.
- Regression coverage includes concurrent edits, unavailable/overlapping/consecutive-school
  blocks, stale application, empty teams, override confirmations and reasons, exact availability
  exceptions, aggregate deltas, and preservation on rerun.
- Browser checks cover dragging, keyboard buttons, hover availability, day/week overrides,
  partial staffing, application, and the previous matching/publishing workflow. All five matching
  browser tests passed. Axe found no dialog accessibility violations. Desktop and 390px mobile
  screenshots were inspected; the mobile dialog has no horizontal overflow.
- Final checks: 207 unit tests, 185 integration tests, five matching browser tests, lint,
  typecheck, format check, and diff whitespace check passed. `npm run build` passed in
  `work/staffing-build-check`, an isolated copy with its own dependencies. The root build's
  Prisma engine replacement encountered a Windows DLL lock from another active test task;
  the isolated build avoided interrupting that task. No database migration is required.
