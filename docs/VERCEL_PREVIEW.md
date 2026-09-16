# Protected Vercel test preview

The dedicated `workshop-scheduler-test` project uses a free Neon database containing disposable seed data. This is a test environment, separate from a production release. Vercel Authentication remains enabled for preview deployments.

## Current preview — verified 16 September 2026

[Open the protected demo](https://workshop-scheduler-test-kfbixhbdn-bryanj1angs-projects.vercel.app/login). Sign in to Vercel if prompted, then choose a demo role. The sample workshops are in October 2026.

Final deployment: `dpl_4c4jcQ8Kp7s1YoMZjUef3WGyDvQa` (Ready, Preview). It uses the normal `npm run build` command; initialization and QA helpers are excluded from its source. The dedicated database has all nine migrations. The September 16 additive day-gap migration preserved existing data. The subsequent usability deployment required no migration and did not rerun the seed.

Validation passed:

- 116 unit, 92 integration, and 25 browser tests, including the complete existing regression suite, seven new UX workflow cases and the separate HTTPS preview-session test. All 233 tests pass.
- Lint, TypeScript, formatting, diff checks, and the Vercel production build.
- Live HTTPS sign-in and sign-out for all three configured accounts; correct roles, secure HTTP-only SameSite Lax cookies, and sessions expiring within two hours.
- Both other-role routes denied for every account. The teacher and PA see their shared published workshop; only the admin sees the separate draft.
- Vercel SSO protection for anonymous visitors, zero captured application 5xx responses, zero axe violations in the hosted checks, and a contained mobile login layout.
- The deployed gap uses days, retains the selected quota month on save, and the class editor says “Add availability.”
- The compact monthly workspace, staffing panel/focus return, mobile bulk quota table and mobile availability editor pass hosted accessibility and overflow checks. The availability Save button remains visible in the mobile viewport. Local browser audits cover 51 desktop/mobile states without axe violations or document overflow.
- The September 10 baseline had independent approval from all three GPT-5.6 reviewers. They reached their usage limit during the September 16 follow-up, so the new work was completed and reviewed locally without claiming renewed agent signoff.

The Codex task retains twelve current hosted screenshots and `outputs/vercel-preview-ux/verification.json`, plus the earlier workflow-review captures in `outputs/ux-review-sep16/`. See `UX_IMPLEMENTATION_REVIEW.md` for the implemented usability changes and review record. Tailwind source detection is scoped to `src` and TypeScript excludes generated `work/` copies. The isolated preview test uses an HTTPS browser origin and reloads the role page after the action redirect; the separate hosted check verifies the full click-to-dashboard transition over real HTTPS.

The deployment includes source changes from `feature/dated-workshops` on top of `4c93efd`. Release documentation was finalized after hosted verification.

## Demo sign-in

On `/login`, choose the admin, teacher, or PA demo button. The email addresses are configured on the server for these three roles. Demo access does not send email or verify ownership of those addresses; anyone admitted through the Vercel preview protection can choose a demo role.

Demo sign-in requires all of the following:

- Vercel's system `VERCEL_ENV` is `preview`.
- `AUTH_PREVIEW_DEMO_ENABLED` is exactly `true`.
- The system `VERCEL_PROJECT_ID` matches the nonempty `AUTH_PREVIEW_DEMO_PROJECT_ID`.
- `AUTH_PREVIEW_ADMIN_EMAIL`, `AUTH_PREVIEW_TEACHER_EMAIL`, and `AUTH_PREVIEW_PA_EMAIL` contain distinct, valid addresses.
- The selected address belongs to an active database user with the corresponding role.

Sessions use secure, HTTP-only Auth.js database cookies and expire within two hours. The normal role checks still apply to every protected page and mutation. Keep the preview behind Vercel Deployment Protection and never connect it to production data. Production continues to use invite-only email sign-in with a verified Resend sender.

## Database and release setup

Set `DATABASE_URL` to the new database's pooled URL and `DIRECT_URL` to its unpooled URL. Set a unique `AUTH_SECRET` and `AUTH_TRUST_HOST=true` for Preview. The dedicated project exposes Vercel system environment variables. Do not copy local credentials, test logs, or generated auth files into the deployment source.

Apply all committed migrations with `prisma migrate deploy`. For the initial disposable database only, enable `SEED_PREVIEW_DEMO_ACCOUNTS=true` along with the demo configuration and run `tsx prisma/seed.ts`. This opt-in seed gives the demo teacher and PA a shared published workshop, plus a separate draft for the admin. Workshops are in the next Vancouver calendar month. The default local seed remains unchanged.

The seed resets sample availability, quotas, assignments, and workshop state. Do not run it as part of routine builds after people start testing. Seed-mode guards run before database writes; an incomplete or mismatched preview configuration is rejected.

For the initial September 10 deployment, Windows Prisma encountered a Schannel TLS credential error before connecting to Neon, so initialization ran in Vercel's Linux build environment. On September 16, the additive migration succeeded from the local CLI outside the restricted Windows test sandbox. Routine builds still use the normal build command and migrations remain a separate coordinated step.

## Remaining pilot rehearsal

This demo does not complete the real-email, backup/restore, or hosted incident-recovery gates in `PILOT_RUNBOOK.md`. Those remain required before a live pilot release.
