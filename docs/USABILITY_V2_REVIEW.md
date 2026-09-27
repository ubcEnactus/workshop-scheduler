# Usability and cohesion — version 2 review

Follow-up: [Concurrent-change stability review](STABILITY_REVIEW_2026-09-27.md) records verification of the integrated teacher and usability changes, updated browser tests, and the now-committed migration. The findings below describe the original usability pass; the follow-up supersedes its outstanding browser-test and migration-review status.

## What changed

The main admin flow now points to the next decision: choose dates, build the PA team, then review and publish. The active workflow step is distinct, each desktop step explains its purpose, and Staff offers a prominent **Review & publish** action as teams become ready. Exact selected-session scope is retained.

Routine screens show decisions before supporting detail. Remove PA is secondary; session settings, assignment history, blocked candidates, and draft activity use disclosures. The session page replaces three repeated statistic cards with a compact staffing summary, collapses draft editing, and keeps history closed unless participant communication is outstanding. Record identifiers are inside Workshop options. Important availability, daily, and weekly warnings remain visible before assignment, with text and icons as well as color. Assignment still takes one click.

## Structural changes

- `workshop-workspace.tsx` delegates workflow navigation to `workshop-workspace-shell.tsx` and session editing to `draft-session-card.tsx`.
- `workspace-schedule.tsx` delegates browsing and selection rendering to `schedule-table.tsx`, keeping drawer state and mutation handling in the parent. The run workspace decreased from 736 to 425 lines; the calendar workspace decreased from 832 to 668 lines despite adding publication recovery.
- `pa-warnings.tsx` supplies warning text, severity, commitment disclosures, and neutral assignment-history detail across the run workspace, calendar drawer, session detail, and existing override candidate wrapper.
- `use-saved-command.ts` owns request persistence, double-submit protection, uncertain-result recovery, and navigation blocking. Both the run workspace and calendar drawer use it. Publication recovery also survives a reload.
- The embedded planner receives the run and schedule snapshot already loaded by its parent, using the shared typed `runWorkspaceInclude` shape. It no longer repeats those database reads.
- Removed unreferenced `preview-staffing-editor.tsx`, `quota-table.tsx`, and the unused 30-minute date suggestion helper and its isolated tests. Historical records and archived proposal routes remain intact.
- Corrected schema comments for active recurring availability and named delivery runs.

## Reliability

Publication saves a durable receipt in the same transaction as the session and event changes. An exact retry by the same admin acknowledges the original success, even after a later edit; it does not publish twice. Reusing a key with different data or a different admin is rejected. Failed validation creates no receipt. Single-session publication uses the reviewed version as part of its retry identity.

Date suggestions in the run overview, teacher schedule, enrollment detail, and unstaffed-session editor no longer hide times because the teacher already has a session. The obsolete busy-interval parameter was removed from the class-date generator. Availability, closures, run windows, one-session-per-run constraints, and PA overlap rules remain responsible for their respective checks.

## Verification

| Check                              | Result                                                                                                                                                           |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit tests                         | 238 passed in 30 files                                                                                                                                           |
| Integration tests                  | 235 passed in 18 files; disposable PostgreSQL, migrations and repeatable seed verified                                                                           |
| Focused browser checks             | 24 distinct scenarios passed across completed runs: 8 matching, 4 workload-warning, 8 availability-warning, 2 navigation, and 2 new usability/recovery scenarios |
| Lint, strict typecheck, formatting | Passed                                                                                                                                                           |
| Production build                   | Passed                                                                                                                                                           |
| Whitespace diff check              | Passed                                                                                                                                                           |

Browser checks cover one-click assignment, visible availability/day/week warnings, blocked overlapping PAs, preserved automatic minimums, Undo, lost staffing responses, exact selection, archived proposals, delayed navigation, keyboard activation, and lost publication responses followed by reload. The new desktop/390px flow passed axe accessibility checks and horizontal-overflow assertions. Desktop and mobile screenshots were inspected visually.

The complete browser suite was attempted but stopped after four failures in `admin-runs-lifecycle.spec.ts`, whose expected class-based labels and controls were renamed by the concurrent teacher redesign. Examples include “Add the classes” versus “Add the teachers,” “Choose a date and time for each class,” and “Manage included classes.” The full suite is therefore **not green**; this review does not claim full release certification. Focused-test failures caused by the intentional disclosures were corrected by opening the disclosure and verifying blocked PAs have no Assign control; the affected scenarios then passed.

Local evidence is retained in `work/usability-v2/`: `unit.log`, `integration-final.log`, `browser-focused.log`, `browser-final.log`, `browser-full.log`, `lint-final.log`, `types-final.log`, `format-final.log`, and `build.log`. The latest successful browser rerun is `browser-final.log` (12 passed); the other 12 focused scenarios passed earlier in `browser-focused.log`. Screenshots: `staff-desktop.png`, `staff-mobile.png`, `publish-desktop.png`, and `detail-mobile.png`. These are ignored generated artifacts.

## Concurrent work and release boundary

Teacher-owned scheduling, removal of teacher transfers, school schema changes, and terminology changes were being edited by another task during this pass. They were preserved. The initial audit's transfer-lifecycle finding is superseded by that redesign, not independently fixed here.

Concurrent schema generation included `PublicationReceipt` in `20260927111434_remove_teacher_transfers`. The repository migration command against a disposable database reported the resulting schema in sync. That migration also contains another task's table removal; it must be reviewed together with that task's migration preflight before deployment. This pass did not deploy or modify a shared database and did not rewrite the concurrent migration.

The working tree remains available for review. The mixed migration was left with its owning task rather than committing that task's pending schema changes as part of this usability pass.
