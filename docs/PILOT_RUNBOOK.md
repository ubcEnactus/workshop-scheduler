# Pilot rehearsal and release handoff

Status on 9 September 2026: iterations 0–5 are implemented on `feature/dated-workshops`. The isolated local rehearsal is implemented. The hosted staging rehearsal, real email delivery and hosted recovery exercise remain pending. No site has been deployed and no real emails have been sent by this task.

## Local workflow

1. Use Node 20.19+; local verification used Node 24.19.0. Run `npm ci`, keep `npm run db:local` running, then run `npm run db:migrate`, `npm run db:seed` and `npm run dev` in another terminal. Use `http://localhost:3000` consistently for magic-link login.
2. Sign in as the seeded admin. In **Classes**, enter hosting blocks, monthly cadence and default duration/staffing. Existing workshops retain their dates and requirements when these defaults change.
3. Open **Workshops → Plan monthly workshops**. Select a month and classes; review missing occurrences and explicitly enter each date/time. Classes without blocks explain what is missing. Repeating the same submitted batch is safe. Use **Create workshop** for an ad hoc occurrence.
4. PAs submit recurring availability. Under **PA quotas and assignment gap**, enter a positive gap and explicit quotas for the month. Quota zero means no new assignments; a missing quota also makes that PA ineligible.
5. Staff manually on workshop details, or use **Assign PAs automatically**. Review the preview before applying. It expires after 15 minutes and becomes stale when relevant schedule inputs change. The greedy matcher may miss feasible combinations. It never changes dates.
6. Manual staffing locks a workshop. Manual assignments remain protected even if the workshop is unlocked. To return a manually staffed draft to automatic staffing, remove its manual assignments and unlock it. Published, completed and cancelled work stays protected.
7. Publish each sufficiently staffed, eligible workshop from its detail page. Check the assigned PA and correct school's teacher view. Drafts stay private.
8. For an exception, review a replacement, reschedule, cancellation or completion from workshop details. A reason is required. Published information stays in place until apply; current constraints are checked again. Replacement validates the new PA and preserves unrelated existing review warnings. Rescheduling checks all retained PAs in the destination month. Completion is available after the workshop ends.
9. Confirm the actor/time/before/after history. Cancelled published workshops and completed workshops stay in role history; cancelling an unpublished draft stays private. Replaced PAs see an assignment-change notice. Later availability edits flag existing commitments without removing them. Coordinate changes outside the app; schedule-change emails are not implemented.

## Verification

Final local results: **46 unit, 62 PostgreSQL integration and 11 browser tests passed**. Lint, typecheck, formatting, production build and `git diff --check` passed. These are local results, not hosted staging or GitHub CI results.

Run the commands listed in `README.md`: unit tests, PostgreSQL integration tests, browser tests, lint, typecheck, format check and production build. Run the browser suite separately from dev/build because they share `.next`.

The integration and browser runners create independent local PostgreSQL clusters, apply all eight migrations, seed twice and enforce an exact test-URL guard before fixture resets. The pilot integration scenario plans different class cadences across two schools, uses uneven availability and quotas (including zero), protects manual staffing, publishes and performs a quota-checked replacement. A separate scenario checks an adjacent-month gap conflict.

The browser suite uses real one-time Auth.js links from private local logs, covers all three roles, bulk planning, matching/manual adjustment/reruns, publication, failed login, availability warnings, replacements, rescheduling and lifecycle history. The 390px change-review screenshot was inspected; controls stay within the page, text wraps and the cancellation disclosure works with the keyboard.

Pull requests now include a migrated database/browser job in addition to the existing quality checks. This workflow has been configured but has not run on GitHub in this task. Failed browser traces, screenshots and database logs remain in ignored `work/`; they may contain local login tokens and should not be published as artifacts.

## Recovering an interrupted operation

- **Batch save:** retry the original form submission. Its request key returns the existing batch. A newly generated form must satisfy the remaining cadence and overlap checks.
- **Matching:** reopen the existing preview and retry apply. Applied previews are idempotent. Expired or stale previews require a new preview; review it again.
- **Published change:** reopen its review URL and retry. If already applied, the same workshop is returned. A competing workshop edit makes the old review stale; create a new review. Eligibility changes can reject an apply while preserving the current schedule.
- **Uncertain browser result:** reload the workshop and inspect its version, assignments and history before making another change. Writes and their audit entries commit together.
- **Unexpected server failure:** the workshop error boundary provides a retry and error reference when Next.js supplies a digest. Correlate that reference and timestamp with the server logs. No credentials or full magic-link URLs should be copied into incident tickets.
- **Migration failure:** stop the release, retain the database and migration logs, and inspect migration status. Do not use `db:reset` or `db push` on shared data. Resolve the migration against an isolated restored copy before resuming.

The initial dated-workshop migration clears disposable legacy scheduling rows. The full chain has been tested against empty local databases. A hosted backup/restore has not been exercised here: the bundled PostgreSQL runtime lacks dump/restore executables, and no staging database is configured for this task.

## Hosted staging gate — still to run

Use an isolated staging database and the same committed code/migrations as the intended release. Before opening the app, install the lockfile dependencies, apply committed migrations with `prisma migrate deploy`, generate the client and build. Verify `DATABASE_URL` (runtime), `DIRECT_URL` (migrations), `AUTH_SECRET`, canonical `AUTH_URL`/trusted host configuration, `AUTH_RESEND_KEY` and `AUTH_RESEND_FROM`. The sender must be verified with Resend. The application rejects missing production keys or missing/example-domain senders at send time; this does not itself verify the domain.

The existing `migrate_deploy.yml` applies migrations when code reaches `main`. Hosting release order must be coordinated so the new application sees the new schema. This task has neither merged to `main` nor triggered that workflow.

Record evidence for all of these before calling iteration 6 complete:

- [ ] Real email login for invited admin, PA and teacher; uninvited and deleted accounts rejected; expired and replayed links rejected.
- [ ] Complete monthly planning, staffing, publication and exception workflow at the staging URL.
- [ ] Hosted database backup restored to a separate database/branch, with workshop dates, assignments, quotas, history and migration state verified.
- [ ] Server error reference located in hosted logs, failed-operation retry rehearsed, and responsible operator recorded.
- [ ] Dependency remediation or a documented release decision for the advisory below.

Deployment to the live pilot is a separate release action after these checks.

## Dependency review

`npm audit --json` on 9 September 2026 reports three high-severity package findings, all from one advisory: `deepmerge-ts` through `@prisma/config` and `prisma`. The issue is stack exhaustion when merging cyclic object graphs; the advisory identifies 8.0.0 as patched. [Upstream advisory](https://github.com/advisories/GHSA-ggr8-5vv4-36mx).

Local source inspection found Prisma using this dependency to load the repository's `prisma.config.ts`; the app does not pass form data to this configuration merge. This limits the identified exposure in this code path but does not remove the vulnerable dependency. The repository configuration is a static, acyclic object. npm proposes downgrading Prisma to 6.12.0, outside the current declared range. No automatic downgrade or unverified major dependency override was applied. Review a compatible upstream fix or explicitly record the release decision before launch.
