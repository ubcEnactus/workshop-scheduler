# Pilot rehearsal and release handoff

Updated 23 September 2026. The named-workshop workspace uses Plan → Staff → Publish. See [the workspace review](WORKSHOP_WORKSPACE_REVIEW.md) for current verification and [the preview handoff](VERCEL_PREVIEW.md) for the deployed URL. Real production email delivery and a hosted restore rehearsal remain release gates.

## Local workflow

1. Use Node 20.19+; local verification used Node 24.19.0. Run `npm ci`, keep `npm run db:local` running, then run `npm run db:migrate`, `npm run db:seed` and `npm run dev` in another terminal. Use `http://localhost:3000` consistently for magic-link login.
2. Sign in as the seeded admin. Open **Workshops → Create a workshop**, enter a custom title and shared delivery window, then **Add classes**. In **Schools & classes**, create any missing school, teacher contact, and class; setup returns to the same planning context. Open a class's **Availability** to record effective weekly blocks and dated exceptions. Imported reference blocks require explicit activation before they authorize date suggestions.
3. Inside the workshop, open **Plan**. Choices and session details remain in the same browser tab across week changes and availability detours. A read-only combined staffing check runs in the background; it does not assign PAs or prevent saving valid dates when staffing is unresolved. **Save dates & continue** saves private sessions and opens **Staff** focused on that batch across all months; **Save dates** stays in Plan. **Schedule a confirmed class session** remains available for a teacher-confirmed date.
4. PAs submit recurring availability and dated exceptions. Use **PAs → Availability & workload** to review effective periods and conflicts. Monthly quotas never block assignment. Automatic matching initially permits one session per day and one per Monday–Friday Vancouver week; lifetime assignment totals affect ranking only.
5. In **Staff**, select the dated drafts to work on. **Auto-fill missing PAs** immediately saves additions up to minimum staffing. It preserves all existing teams, assignment identities and dates, never fills optional maximum places, and respects full availability and automatic day/week limits. If only some gaps can be filled, the valid additions save together and remaining gaps are shown. There is no separate proposal, apply step or 15-minute expiry. The 15-minute date increments are unrelated and remain in the date picker.
6. Manual **Assign**, **Remove** and **Keep PA** save directly to the private draft, with persistent **Undo**. Removing a PA excludes that person from future auto-fill for that session; manual Add, Undo or Allow PA can restore eligibility. Existing locked drafts show neutral **Auto-fill off**; **Allow auto-fill** permits future additions without changing the team. New manual edits do not lock sessions. Missing/partial availability and same-day/same-week workload stay visible as warnings; Assign is enabled and records those exceptions without an override form, checkbox, separate reason or extra confirmation. Overlap, inactive-account, capacity and same-school consecutive-class blocks still apply. Published and historical sessions are outside draft auto-fill.
7. Open **Publish**, review current dates, PA names and warnings, and select ready drafts. **Publish N sessions** is the final action and revalidates that exact selection atomically; it does not silently publish a smaller subset. Other sessions stay private. Publication makes the selected sessions and PA teams visible to assigned PAs and school teachers. It sends no email. Use **Contact school and assigned PAs**, then **Record communication** for the relevant change.
8. For a change, review an edit of date, PA team, and details together, a replacement, cancellation, or completion from the class session. Current constraints are checked again when applying. Explicit admin date exceptions may move one session outside the shared workshop window. Completion is available after the session ends. A later PA removal may leave a published session with a visible staffing deficit.
9. Confirm the actor/time/before/after history. Cancelled published sessions and completed sessions stay in participant history; cancelling an unpublished draft stays private. Replaced PAs see an assignment-change notice. Availability edits flag commitments without removing them. Internal reasons and notes remain private. Communication and completion are separate states.

## Verification

The original 9 September rehearsal passed **46 unit, 62 PostgreSQL integration and 11 browser tests**. Subsequent coverage includes the [class-workshop refactor](CLASS_WORKSHOPS.md). These are local checks, not hosted staging or GitHub CI results.

Run the commands listed in `README.md`: unit tests, PostgreSQL integration tests, browser tests, lint, typecheck, format check and production build. Run the browser suite separately from dev/build because they share `.next`.

The integration and browser runners create independent local PostgreSQL clusters, apply all migrations, seed twice and enforce an exact test-URL guard before fixture resets. Coverage includes uneven PA availability, legacy quotas that must not block assignment, additive staffing with fixed teams, safe Undo and retries, cross-month batch planning and publication, explicit day/week exceptions, effective teacher transfers, and atomic reviewed edits.

The browser suite uses real one-time Auth.js links from private local logs, covers all three roles, bulk planning, matching/manual adjustment/reruns, publication, failed login, availability warnings, replacements, rescheduling and lifecycle history. The 390px change-review screenshot was inspected; controls stay within the page, text wraps and the cancellation disclosure works with the keyboard.

Pull requests now include a migrated database/browser job in addition to the existing quality checks. This workflow has been configured but has not run on GitHub in this task. Failed browser traces, screenshots and database logs remain in ignored `work/`; they may contain local login tokens and should not be published as artifacts.

## Recovering an interrupted operation

- **Batch save:** retry the original form submission. Its request key returns the existing batch. A newly generated form must satisfy candidate ownership, one delivery per class workshop and overlap checks.
- **Draft staffing/auto-fill/Undo:** use **Retry** on the unresolved command. The browser retains the exact payload and request key across reloads; the server returns its existing receipt if it already committed. Other edits and publication stay blocked until that result is reconciled. Recent draft activity also provides Undo after reload. Undo refuses to overwrite newer work or silently accept new warnings. Old matching previews are read-only archives, not resumable staffing transactions.
- **Published change:** reopen its review URL and retry. If already applied, the same workshop is returned. A competing workshop edit makes the old review stale; create a new review. Eligibility changes can reject an apply while preserving the current schedule.
- **Uncertain browser result:** do not issue a new command to compensate for an unknown result. Reconcile the saved request using Retry, then inspect the current team and activity. Writes and their audit entries commit together.
- **Unexpected server failure:** the workshop error boundary provides a retry and error reference when Next.js supplies a digest. Correlate that reference and timestamp with the server logs. No credentials or full magic-link URLs should be copied into incident tickets.
- **Migration failure:** stop the release, retain the database and migration logs, and inspect migration status. Do not use `db:reset` or `db push` on shared data. Resolve the migration against an isolated restored copy before resuming.

The initial dated-workshop migration clears disposable legacy scheduling rows. The full chain has been tested against empty local databases. The later class-workshop migration preserves populated dated sessions, assignments and history; `node scripts/verify-class-workshop-migration.mjs` verifies that upgrade on an isolated database. The dedicated test database was backed up before its earlier authorized demo reseed. A hosted restore rehearsal remains pending.

## Hosted staging gate — still to run

Use an isolated staging database and the same committed code/migrations as the intended release. Before opening the app, install the lockfile dependencies, apply committed migrations with `prisma migrate deploy`, generate the client and build. Verify `DATABASE_URL` (runtime), `DIRECT_URL` (migrations), `AUTH_SECRET`, canonical `AUTH_URL`/trusted host configuration, `AUTH_RESEND_KEY` and `AUTH_RESEND_FROM`. The sender must be verified with Resend. The application rejects missing production keys or missing/example-domain senders at send time; this does not itself verify the domain.

The existing `migrate_deploy.yml` applies migrations when code reaches `main`. Hosting release order must be coordinated so the new application sees the new schema. This task has neither merged to `main` nor triggered that workflow.

Record evidence for all of these before calling iteration 6 complete:

- [ ] Real email login for invited admin, PA and teacher; uninvited and deleted accounts rejected; expired and replayed links rejected.
- [ ] Complete named-workshop planning, staffing, publication and exception workflow in the intended production staging environment; isolated local and protected test-preview verification is recorded separately.
- [ ] Hosted database backup restored to a separate database/branch, with workshop windows, dates, assignments, availability, history and migration state verified.
- [ ] Server error reference located in hosted logs, failed-operation retry rehearsed, and responsible operator recorded.
- [ ] Dependency remediation or a documented release decision for the advisory below.

Deployment to the live pilot is a separate release action after these checks.

## Dependency review

`npm audit --json` on 9 September 2026 reports three high-severity package findings, all from one advisory: `deepmerge-ts` through `@prisma/config` and `prisma`. The issue is stack exhaustion when merging cyclic object graphs; the advisory identifies 8.0.0 as patched. [Upstream advisory](https://github.com/advisories/GHSA-ggr8-5vv4-36mx).

Local source inspection found Prisma using this dependency to load the repository's `prisma.config.ts`; the app does not pass form data to this configuration merge. This limits the identified exposure in this code path but does not remove the vulnerable dependency. The repository configuration is a static, acyclic object. npm proposes downgrading Prisma to 6.12.0, outside the current declared range. No automatic downgrade or unverified major dependency override was applied. Review a compatible upstream fix or explicitly record the release decision before launch.
