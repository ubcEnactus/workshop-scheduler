# Admin demo readiness review

Application reviewed 23 September 2026, with public sign-in updates verified 27 September. **Suitable for an admin/PA demo.** Production pilot gates in [PILOT_RUNBOOK.md](PILOT_RUNBOOK.md) remain separate. The nontechnical handoff is [ADMIN_RUNBOOK.md](ADMIN_RUNBOOK.md).

**Current links:** [Ennovate](https://ennovate-workshop-demo.vercel.app/login) and [Enspire](https://enspire-workshop-demo.vercel.app/login). Both offer **Continue as demo admin** and **Continue as demo PA**. Their saved data and identities are separate. Existing records were preserved when a demo PA and the owner's requested personal admin were added to each. Sessions expire after two hours; saved information persists. No seed or reset ran.

**Personal email sign-in is enabled.** The owner's saved email variables now cover Preview as well as Production. Both demos were redeployed from the verified sign-in export and their stable links updated. The unavailable message is gone and the email button works on each site. One authorized test sign-in email from each site was accepted by Resend for the owner's personal admin; inbox receipt and opening the delivered links were not independently observed. Fresh hosted desktop/mobile, demo admin/PA login, role and session-isolation checks passed. This environment-only release did not include subsequent workspace changes to school setup and booking, and changed no scheduling data.

This update passed 244 unit tests, five actual-HTTPS preview-auth browser tests, three standard email-auth regressions, all required static checks, an isolated production build and both Vercel builds. Both public demos passed ten desktop/mobile accessibility and overflow checks in total, admin/PA login and logout, role restrictions and cross-demo session rejection. See [the current deployment record](VERCEL_PREVIEW.md). The remaining sections record the original release's scope and evidence; their admin-only access descriptions are historical.

**Two-demo follow-up:** Ennovate and Enspire have separate Ready deployments, databases created blank, admin identities and sign-in secrets. Enspire passed its production build and 13 hosted desktop/mobile checks. The 23 September database verification confirmed both were blank and Ennovate's domain records were unchanged. On 27 September, public exceptions were added to just these two deployment URLs. Both plain links now pass fresh-browser admin sign-in/out, role, desktop/mobile accessibility and session-separation checks. A session from either demo is rejected by the other. Other previews remain protected. No app redeployment or domain-data changes were made for public access. See [the current deployment record](VERCEL_PREVIEW.md).

## Fresh deployment and blank data

Vercel deployment `dpl_C5WX3w5yKtCv3mWVGwjEY85mS8ft` is Ready in the existing `workshop-scheduler-test` project's Preview environment, with functions in Oregon. Its canonical URL is [the clean admin demo](https://workshop-scheduler-test-k5ssjmpzl-bryanj1angs-projects.vercel.app/login). The initial release used Vercel Authentication and a shareable link; the canonical URL is now public under the 27 September exception. Visitors can choose **Continue as admin**.

The user requested no seed data. A new database, `workshop_admin_demo_20260924`, was created on the existing demo Neon endpoint. All 18 existing migrations were applied; no seed script ran. It has one active admin account and no schools, teacher or PA accounts, classes, workshops, sessions, availability, assignments or communication records. Migration-owned settings are retained. Final read-only verification confirmed this after hosted checks, and every domain-table fingerprint in the old demo matched its pre-release value. No old database was reset.

Database URLs, the fresh sign-in secret and the admin-only configuration are **deployment overrides**, not changed project defaults. Future deployments must deliberately retain this database configuration if they are meant to continue the blank admin demo. The older seeded previews still use their original database. The private deployment configuration and verification evidence are under ignored `work/admin-demo-release/`; do not publish them.

## Review and narrow fixes

The review covered the current brief/workflow, sign-in and role enforcement, class/people setup, planning, staffing, publication, recovery, participant visibility, deployment isolation and handoff instructions.

- Preview login now shows only configured accounts that exist, have the expected role and are not deleted. An empty demo therefore offers one working admin button without fake teacher or PA records. The server-side authorization gates remain unchanged.
- Calendar **Reload schedule** now tracks the refresh as a pending transition. Admins cannot reopen publication or staffing against the previous eligibility snapshot while fresh data is loading. The regression deliberately holds that response and verifies both actions stay disabled before recovery.

## Verification

- **243 unit tests** and **233 PostgreSQL integration tests** passed. Integration setup applied all 18 migrations and verified seed repeatability in isolated local databases only.
- Full browser run: **85 passed, 2 failed**. Both failing cases passed on an isolated rerun. The planning failure was not reproduced; the calendar recovery case identified the refresh timing gap addressed above. After that change, **all 14 affected browser cases passed**, including the stronger delayed-refresh regression and planning save/navigation checks. Together, all **87 browser cases** have passing coverage; this is not a claim of one clean 87-test run after the final change.
- **2 preview-auth browser tests** passed, covering absent/deleted/wrong-role button filtering and secure two-hour sessions for all three roles when their accounts exist.
- Required lint, TypeScript, formatting, whitespace checks and the final isolated production build passed. Vercel's build completed successfully.
- Hosted checks passed on **13 desktop/mobile states** with zero captured application errors, accessibility violations or document overflow. A fresh browser verified the actual share link, sole admin button, HTTPS sign-in/out, secure HTTP-only SameSite Lax session, participant-route rejection, empty screens and Create/Cancel. Representative desktop/mobile screenshots were visually inspected.
- The PDF was rendered and all four pages visually inspected; the private link is an active PDF hyperlink. Hosted checks did not create demo domain records.

## Remaining boundary

This admin-only preview does not send login invitations or publication/change notifications. Adding teachers/PAs does not give them demo access. The guide explains manual staffing while no PA has submitted availability and separates that rehearsal from the later participant workflow.

Real invited-user email sign-in, a hosted backup/restore rehearsal, hosted incident recovery and the existing dependency release decision remain prerequisites for a live pilot. The refreshed production dependency audit reports the same three high-severity package entries for the single `deepmerge-ts` recursive-merge advisory through Prisma configuration tooling, with no critical findings. No forced dependency downgrade was applied. This scoped demo review does not constitute production signoff.
