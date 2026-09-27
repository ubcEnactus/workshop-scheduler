# Workshop workspace implementation review

Status: implemented, verified and deployed to the protected demo Preview, 23 September 2026. This document records the implementation of [the approved plan](WORKSHOP_WORKSPACE_PLAN.md). [Open the demo](https://workshop-scheduler-test-kwexe4syk-bryanj1angs-projects.vercel.app/login).

## Implemented contract

- Plan, Staff and Publish share the existing workshop identity and saved sessions across its whole delivery window. Workshop creation remains on demand.
- Date choices save explicitly. Combined feasibility runs as a revision-bound read-only background check, with retry; a stale PA-only estimate no longer vetoes valid date creation.
- Manual PA changes and min-only auto-fill save directly to private drafts. No proposal countdown, duplicate Current/Proposed teams or save-proposal stage remains in the normal flow.
- The new additive engine treats existing manual/automatic assignments as fixed commitments, respects exclusions and automatic availability/day/week rules, and never moves dates or fills optional maximum places.
- Manual removals create per-session auto-fill exclusions. Existing locked drafts retain Auto-fill off; new staffing and draft detail edits preserve, rather than introduce, that setting.
- Persistent operation receipts provide exact retries and conditional Undo. Undo checks both affected-session state and the original PA policy context against current global commitments. It cannot silently reuse old exception flags to approve a newly introduced workload warning.
- Accepted manual availability/workload warnings remain visible and actionable without extra override forms. Real conflicts remain blocked. Publication uses current full readiness, not just headcount, and official edits remain separately reviewed.
- Legacy preview writes are retired; old proposals remain read-only. Other staffing entry points use the same command services and recover uncertain saves with the original request key.

## Data and migration

Migration `20260923081728_persistent_draft_workspace` adds only DraftStaffingOperation and AutoFillExclusion tables and their relationships/indexes. It was generated through the repository migration command against disposable PostgreSQL and committed with its schema as `55d36b9`. After all test gates passed, it was applied to the verified dedicated demo database. A consistent domain-data backup preceded the migration; before/after comparison verified every existing row and Assignment constraint unchanged, including all 19 sessions and 21 assignments. Both new tables started empty. All 18 migrations are applied; no reset or reseed ran.

## Review findings addressed

- Kept operation-journal snapshots separate from the established WorkshopEvent audit schema, preventing saved draft operations from breaking session history rendering.
- Reserved no-op operation receipts and rejected request-key collisions between edits and Undo.
- Stored original PA policy hashes so Undo cannot grant new exceptions by restoring an old exception flag after commitments change.
- Kept assigned workload warnings visible in the calendar and added persistent uncertain-save recovery to secondary staffing/Undo entry points.
- Fixed navigation after saving the last undated class, and preserved exact legacy session/month scopes rather than widening invalid or deleted selections to the whole workshop.
- Removed cross-tab status-filter traps while preserving explicit selected IDs; retained same-day/week warnings in the calendar's final publication review.
- Restored whole-window class-date assessment, including effective teacher handovers, school closures and existing host commitments.
- Canonicalized unordered database aggregate totals before hashing, preventing unchanged published edits from being rejected as stale. A real-query integration regression reverses the grouped rows between staging and applying; actual data changes still invalidate review.
- Bounded optional completion-first repair work deterministically. The exact full-minimum proof still runs; a dense 200-session/150-PA shortage now takes about 0.97 seconds locally instead of 34.5 seconds, with the same 150 valid additions. Partial outcomes do not claim optimal completion.
- Isolated production build output from the browser test server to avoid shared .next/Prisma engine contention.

## Verification

- Unit tests: 243 passed, including 160 independently enumerated pinned-team oracle cases and new add-only/minimum/exclusion/fairness/partial-coverage and bounded large-shortage tests.
- PostgreSQL integration: 233 passed across 17 files, with all 18 migrations applied and the seed verified twice. Coverage includes atomic receipts/retries, policy-context Undo, preserved assignment identity/metadata, exclusions and lock preservation across draft edit types, advisory date feasibility, archived preview no-writes, exact publication scope and role privacy.
- Full lint, formatting, TypeScript and diff checks passed on the final files. The isolated production build passed including the final legacy navigation fix; all 219 runtime/source/configuration files match that build's export.
- Focused browser checks cover immediate saves, min-only auto-fill, persistent Undo, exclusion/manual restore, a real shortage, warning-only assignments, more than 15 minutes elapsed, uncertain response/reload/retry, and background-check error/late-response recovery. The primary agent inspected 390px Staff, Publish, warning and failed-check screenshots; content stayed contained and controls were readable. These do not replace the full browser gate.
- Full browser gate: 85/85 passed in one clean final run (12.5 minutes), after migrating obsolete disclosure/status/menu selectors and adding proper navigation waits. Existing preservation, privacy and conflict assertions were retained. This run includes final exact-scope navigation, date background-check recovery, calendar/workspace lost-response retries, detail duplicate-submit recovery, teacher transfers, publication, deletion, keyboard and desktop/mobile accessibility checks.
- Separate preview authentication: 1/1 passed, covering secure sessions and role isolation for admin, teacher and PA.
- The source-only upload contains 309 files and excludes environment files, local databases, dependencies and build output. Vercel's production build passed; deployment `dpl_B8YGcUYQQRv8a6nz11PvG6jYRK1B` is Ready in Preview, with functions in Oregon and anonymous visitors redirected to Vercel SSO protection.
- Authenticated read-only hosted checks passed for Plan/Staff/Publish, legacy staffing routing, exact empty selection, retained Auto-fill off state, final publication notice, explicit creation/Cancel, ten availability-warning and two workload-warning candidates with enabled Assign buttons and no override forms, and calendar warning data. Next.js streamed redirects were checked by exact destination rather than treated as normal curl-followable HTTP redirects.
- A final post-smoke database comparison confirmed every existing domain row still matches the pre-release backup and the two new tables remain empty. Hosted smoke checks did not change scheduling data; mutation/recovery journeys were exercised against isolated local databases.

Independent agents reviewed UI/state handling, solver/concurrency/data safety, and browser coverage; their concrete findings were fixed and included in the final clean gates. Ignored local evidence lives under `work/`, including the migration backup/verification, source export, browser screenshots and hosted-check helpers. These may contain private test data and are not deployment artifacts. Release documentation was finalized after the tested source export. No production promotion or reseed was performed; the existing real-email and hosted-restore pilot gates remain in [PILOT_RUNBOOK.md](PILOT_RUNBOOK.md).
