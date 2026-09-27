# Direct booking and combined directory — 17 September 2026

The primary workflow is now **Book workshop**. An admin can start with no schools, teachers or classes, enter the booking details on one page, and save a private draft. Selecting a saved class fills its school and teacher automatically. Newly added records are available for future bookings; teacher email is required for the existing account model, but saving a booking sends no email.

The dashboard's monthly task links were removed. The sidebar now has one **Classes & teachers** destination with class/contact details, teacher editing, and **Book again** links. Separate setup is optional; the legacy management routes remain compatible. Monthly batch planning remains available for recurring schedules.

## Scheduling behavior

- A direct booking explicitly confirms its occurrence's date and time. `Workshop.hostingConfirmed` records that confirmation. No recurring class availability is silently created.
- The confirmation remains valid when the admin edits or reschedules that same class's occurrence. Changing the class does not carry the previous class's confirmation. Existing workshops and monthly batch planning continue to require a hosting block.
- Weekday/date validity, active school/teacher/class consistency, class and teacher overlaps, PA availability, quotas, day spacing, locking, publication review, and role privacy remain enforced.
- School, teacher, class, booking batch and workshop writes share the scheduling transaction lock. Validation failure rolls back every new record. Request keys make repeated submissions idempotent and reject changed payloads or a different actor.
- Normalized names reuse active schools and classes for the same teacher/school. Canonical teacher email can reuse an active teacher at that school; collisions with other roles, inactive accounts or another school are rejected.
- The assignment gap defaults to **7 Vancouver calendar days**. The additive migration initializes NULL settings and increments their revision, preserving deliberately configured values and all existing workshops. The protected test app is explicitly set to 7 days through its settings action.

## Review iterations

Two fresh GPT-5.6-sol agents implemented the booking UI and backend, then cross-reviewed the contract, combined directory, navigation, scheduling and migration changes. Both gave scoped signoff with no outstanding implementation findings. The primary agent implemented the dashboard/directory/default updates and performed combined tests and hosted verification.

Review corrections included preserving return context from teacher editing/deletion, preventing a filtered return view from hiding a new draft, using the workshop's current month on an idempotent replay, retaining confirmation only for the same class, retaining edited end times, and opening advanced staffing when its validation fields need focus. Browser review also corrected field labels that changed when error descriptions appeared.

## Validation

All 264 tests pass: 128 unit, 103 integration, 32 normal browser cases and one HTTPS preview-login case. The affected 11 browser cases were rerun successfully after the full run identified obsolete selectors and the accessible error-label issue. Lint, TypeScript, formatting, diff checks and local/hosted production builds pass. Tests include empty-start booking, reuse, duplicate requests, invalid/foreign/deleted relationships, email collisions, atomic rollback, overlapping teachers/classes, legacy versus direct hosting validation, and direct booking through staffing, publication and staged rescheduling with apply-time PA availability rechecks.

The protected deployment is `dpl_HpHwExSLP1Sup227DcF6fdpJsur3`, [open the preview](https://workshop-scheduler-test-74mb243ea-bryanj1angs-projects.vercel.app/login). All three demo roles pass live sign-in/out, session and cross-role checks. The current gap is verified as 7 days. The combined directory and booking controls pass live reuse, duration-prefill, accessibility and overflow checks. The hosted verification creates no additional QA bookings; mutation paths are exercised in isolated tests. Sixteen hosted captures and `verification.json` are retained at `outputs/vercel-preview-booking/` in the Codex task workspace.

Direct-booking form captures are retained under `work/direct-booking-desktop.png` and `work/direct-booking-mobile.png`. The existing desktop/mobile role and accessibility audit remains part of the regression suite. Coverage is broad but does not claim every possible human interaction is tested.

## Limits

Dates are confirmed by the admin; the app does not infer school holidays or obtain teacher consent. Weekly availability is still needed for recurring monthly suggestions. The demo retains preview-only sign-in and does not establish production email delivery or the backup/recovery gates for a live pilot. No test database reseed is required for deployment.
