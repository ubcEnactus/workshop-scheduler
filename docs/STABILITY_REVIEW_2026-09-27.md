# Concurrent-change stability review — 27 September 2026

The integrated working tree passes the checks below. No functional regression was found in the reviewed flows. Corrections in this pass are limited to browser regression tests and review documentation.

## Scope

This review checks the integrated working tree on `feature/dated-workshops`, based on `85bc8fc` (`Enforce one schedule per teacher and remove transfer records`). It includes the pending usability changes and the teacher-owned scheduling redesign. It is a local verification of that combined tree, not a claim about a deployed release.

Source, migration, test, script, and root configuration hashes are recorded under ignored `work/stability-20260927/`. The initial manifest covers 286 files. Application source and schema are compared with the initial manifest; the final validation manifest also includes the corrected regression tests. Existing pending changes are preserved.

## Corrections made during verification

- Updated browser expectations for teacher enrollment, date planning, booking, publication, and deletion to match the current interface.
- Replaced the retired class-creation browser flow with an assertion that creating a teacher creates exactly one scheduling profile, that renaming the teacher updates that profile, and that its availability survives reload.
- Updated empty-directory coverage to verify the legacy class URL leads to the teacher directory and guides setup through schools.
- Updated staffing summary and consecutive-session warning expectations while retaining one-click assignment, hard-blocking, persistence, keyboard, accessibility, and publication assertions.
- Preserved checks for pending-save feedback and fresh-document navigation during enrollment.
- Made teacher-name assertions target the page heading, since the name also appears in the contact summary. Accessibility scans now explicitly wait for the expected document title after client navigation; the title is asserted rather than the accessibility rule being suppressed.

No scheduling behavior, application source, schema, or migrations were changed in this verification pass.

## Validation

| Check                               | Result                                                                                                       |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Unit tests                          | 238 passed in 30 files                                                                                       |
| Integration tests                   | 235 passed in 18 files                                                                                       |
| Main browser scenarios              | All 85 verified: 81 passed in the complete run; its four failures passed after corrections in focused reruns |
| Preview authentication              | 5 passed over disposable local HTTPS                                                                         |
| Lint, strict TypeScript, formatting | Passed                                                                                                       |
| Production build                    | Passed                                                                                                       |
| Whitespace diff check               | Passed                                                                                                       |

The complete main browser command initially exited with four failures; it is not represented as a single green full-suite invocation. Three focused scenarios passed in `browser-followup.log`, and both deletion scenarios passed in `deletion.log` (one had already passed in the full run). The failures were outdated or ambiguous assertions and scanning before the document title settled. No application fix or weakened business-rule assertion was needed.

The disposable PostgreSQL migration verifier passed preservation of existing history and availability, missing-profile backfill, transactional rejection of ambiguous duplicate profiles, uniqueness enforcement, and transfer-table removal. The browser checks cover 36 admin desktop/mobile page states, participant dashboards, warnings, authorization, keyboard focus, availability, exact selected-session scope, Undo, stale reviews, and lost publication responses followed by reload. Desktop and mobile staffing screenshots were visually reviewed.

Integration and browser commands create isolated local PostgreSQL clusters, apply the checked-in migrations, and run the seed twice. They do not reset or migrate a shared database. The production build runs after browser testing because both use the same Next.js output directory.

The first browser attempt exposed outdated expectations and was stopped after confirming its process had cached the tests before the latest corrections. The new complete run and subsequent focused corrections are recorded separately. The initial attempt remains in `browser-1.log`; it is not counted as a successful full suite.

Evidence is under `work/stability-20260927/`: `unit.log`, `integration.log`, `migration.log`, `browser-final.log`, `browser-followup.log`, `deletion.log`, `preview.log`, `lint-final.log`, `types-final.log`, `format-final.log`, and `build.log`. The final manifest is `final.json`; its aggregate SHA-256 is `ff29d94b9ba1d831f170b033f389c82f17a843bb7f68a6bef39fab10a57aaf4d`. Compared with the initial manifest, only 14 browser-test files changed during verification. Application source, schema, migrations, scripts, and root configuration did not drift.

## Migration and release boundary

The teacher-profile migration and transfer removal are committed in `85bc8fc`. The transfer-removal migration also creates the additive publication receipt used for exact publication retries. This review independently exercised the migration on disposable data; the earlier demo release preflight and backups are documented in [TEACHER_SCHEDULING.md](TEACHER_SCHEDULING.md).

No deployment or shared database mutation is part of this review. A release should include the whole verified application and its required migrations. The working tree contains substantial pre-existing uncommitted and untracked implementation work; verifying this tree does not mean HEAD alone contains that implementation.

## Deployment follow-up

At the user’s subsequent request, the verified source was frozen and deployed to both existing public demos. Both Vercel builds reached Ready, all 21 database migration checksums matched in read-only preflight, and 39 hosted desktop/mobile checks passed. No schema migration or reset was needed. See [the current deployment record](VERCEL_PREVIEW.md#integrated-usability-release) for release identities and evidence.
