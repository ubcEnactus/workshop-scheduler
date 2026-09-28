# Vercel demo deployments

The dedicated `workshop-scheduler-test` project has two separate admin demos, Ennovate and Enspire, created with blank datasets. Older previews retain their original disposable sample database. This is a test environment, separate from a production release. The two named demo URLs are public; project-level Vercel Authentication remains enabled for other preview URLs.

## Current public demos and sign-in — 28 September 2026

| Demo     | Stable public sign-in                                            | Deployment                         | Database                         |
| -------- | ---------------------------------------------------------------- | ---------------------------------- | -------------------------------- |
| Ennovate | [Open Ennovate](https://ennovate-workshop-demo.vercel.app/login) | `dpl_cSE7Ztd5XyZbyrKvkfGBdk6zy8JT` | `workshop_admin_demo_20260924`   |
| Enspire  | [Open Enspire](https://enspire-workshop-demo.vercel.app/login)   | `dpl_GSuhZq7W7RDYTk8WHEu1kSfFWVga` | `workshop_enspire_demo_20260924` |

### Admin directory and email recovery release

Both demos now include **Admins**, where an existing administrator can add another active administrator account. The release also validates Resend sender syntax, trims configured credentials before use, and directly tests accepted and rejected provider responses. No database migration was required.

Both Vercel builds reached Ready before the stable aliases were promoted. Hosted verification passed public login, enabled email sign-in, demo-admin authentication, the new Admins page, and sign-out on both aliases without application errors or scheduling writes. One authorized Ennovate sign-in request to the existing personal administrator was accepted by Resend and reached the check-email screen after the environment variables were updated; inbox receipt remains for the recipient to confirm. Release evidence is under ignored `work/admin-email-release-20260928/`, with the immutable deployment snapshot under `work/vercel-admin-email-20260928/`.

### Calendar occurrence removal release

Both demo links serve the verified [calendar occurrence update](CALENDAR_OCCURRENCE_REMOVAL_REVIEW.md). Weekly cards now support **Remove for this date**, **Undo**, and durable **Restore**. The standalone date-specific changes and school-closure creation sections are removed. Existing dated times and booked sessions remain protected.

The frozen export contains 331 source/configuration/documentation files. Relative to the preceding usability release, only the 18 expected implementation, schema, migration, and test files changed outside documentation; no unrelated source changes were included. Local verification passed 239 unit tests, 248 integration tests, 8 browser regressions, lint, TypeScript, formatting, and production build. Both Vercel builds are Ready and the stable aliases have been promoted.

Migration `20260927194703_teacher_calendar_occurrence_skips` is applied on both dedicated databases; all 22 migration checksums match. Database-side counts and fingerprints verified all 25 existing tables unchanged, and the new skip table is empty. Preflight found no existing school closures or teacher exceptions. No reset, seed, or scheduling-data mutation ran. Full row export was rejected by automatic approval review, so this release used server-side fingerprints without copying record contents. The additive migration retains compatibility with the previous deployment.

Existing database/authentication overrides, email settings, public alias access, and project-level protection remain intact. Release manifests, preflight fingerprints, migration logs, previous alias identities, and live verification evidence are under ignored `work/calendar-release-20260927/`. Deployment source is frozen in `work/vercel-calendar-20260927/`.

Hosted verification passed on 39 desktop/mobile page states across both demos, including admin/PA sign-in/out, secure two-hour sessions, role restrictions, cross-demo session rejection, and enabled email sign-in. A further targeted check verified the existing teacher's October 6 weekly card and **Remove for this date** at 1365px and 390px, with both retired sections absent. Accessibility and overflow checks passed; no browser errors or application 5xx responses were observed. Hosted checks made no scheduling changes, and subsequent database fingerprints still matched. The targeted check's initial browser-context and mobile sign-out cleanup errors were corrected in the verification script before its passing rerun; no application change was needed.

### Integrated usability release

Both demo links now serve the integrated usability and teacher-scheduling version verified in [the stability review](STABILITY_REVIEW_2026-09-27.md). The release was frozen from the audited working tree on top of `85bc8fc`: all 286 validation hashes matched, and the upload contains 325 source/configuration/documentation files with a separate manifest. Environment files, credentials, logs, and generated workspace artifacts were excluded. Both Vercel builds are Ready.

The release includes clearer Plan → Staff → Publish navigation, shared PA warnings, quieter session settings and history, and durable publication retry recovery. Existing schools navigation and teacher-owned setup are retained. Local verification covers 238 unit tests, 235 integration tests, all 85 main browser scenarios including corrected reruns, 5 preview-authentication scenarios, lint, TypeScript, formatting, and the production build.

Read-only deployment preflight confirmed all 21 migration checksums and publication receipt support on both dedicated databases. No migration, reset, or seed ran. Each demo retains its existing database and authentication configuration, public alias access, and inherited email settings; project-level protection remains unchanged. The previous deployments remain recorded in the promotion plan inputs for rollback. Release evidence is under ignored `work/usability-release-20260927/`.

Hosted verification passed across 39 desktop/mobile page states (24 Ennovate, 15 Enspire), including the new three-step run workspace, calendar, setup directories, and booking. Admin/PA sign-in and sign-out, secure two-hour sessions, role restrictions, cross-demo session rejection, and enabled email sign-in passed. No accessibility violations, horizontal overflow, browser errors, or application 5xx responses were observed. Live mobile screenshots were visually inspected. Hosted checks created no scheduling records. An older hosted navigation assertion was corrected to follow the link’s preserved month context before the successful rerun.

### Schools navigation follow-up

The Schools directory now always offers a top-right **Teachers** button for returning to the teacher directory, preserving scheduling context. The existing contextual setup return remains available. This is a single-page patch to the verified teacher scheduling release, with no database changes. All 238 unit tests, lint, TypeScript, formatting, and production build passed. Both live demos passed desktop/mobile button navigation, preserved-context, accessibility, and overflow checks. The desktop button position was checked and visually inspected. Release hashes and verification are under ignored `work/school-navigation-release-20260927/`.

### Teacher-owned scheduling update

Both demos now expose schools and teachers, with one implicit scheduling profile per teacher. Adding a teacher leads directly to availability, session defaults, and workshop enrollment. Separate class creation, class labels/pickers, and teacher transfers are removed. Old class-directory links redirect to teachers; existing schedule IDs and saved links remain compatible. See [the implementation and verification plan](TEACHER_SCHEDULING.md).

The verified source export passed 238 unit tests, 235 integration tests, 10 focused desktop/mobile browser cases, lint, TypeScript, formatting, and a production build. Both Vercel builds are Ready. Schema and migrations are committed as `85bc8fc`. The release includes the publication recovery receipt present in the tested concurrent usability update; later workspace edits are outside the frozen export.

Both dedicated databases were backed up before applying `20260927110636_one_schedule_per_teacher` and `20260927111434_remove_teacher_transfers`. All 21 migrations are applied. Table comparisons confirmed existing records were preserved, one profile per teacher is enforced, and the obsolete transfer table is removed. No reset or seed ran. Authentication configuration and database separation are unchanged. Source hashes, backups, migration checks, build logs, and hosted verification are under ignored `work/teacher-scheduling-release-20260927/`.

Fresh hosted checks passed across 25 desktop/mobile page states, including teacher setup, the teacher availability page, class-free booking, admin/PA sign-in and sign-out, role restrictions, secure two-hour sessions, and cross-demo session rejection. Email sign-in remains enabled. No accessibility violations, horizontal overflow, browser errors, or application 5xx responses were observed. Live teacher and booking screenshots were visually inspected. These checks created no scheduling records.

### School setup update

Both demos now use school names without a district field. School creation, editing, the directory and search, and confirmed-session booking use the simplified model. Booking reuses active schools by normalized name. Existing school records are not merged.

Migration `20260927103601_remove_school_district`, committed with its schema as `411ecdb`, was applied to both dedicated databases after their new builds reached Ready. Both databases now have 19 migrations. Separate backups and before/after comparisons verified all 25 domain and identity tables: only the district column was removed, with every other saved record preserved. No seed or reset ran. Database overrides, authentication settings, email delivery configuration, and the stable public links remain in place.

The source export integrates the school changes into the preceding verified sign-in release. Local verification passed 244 unit tests, 233 PostgreSQL integration tests, school creation/editing and direct-booking browser regressions, lint, TypeScript, formatting, and the production build. A dedicated populated-migration check also preserved active, retired, and duplicate-name schools and their relationships. The older broad migration verifier still has an obsolete workload-reason assertion unrelated to this change. Both Vercel builds passed. Release source hashes, backups, migration verification, deployments, and hosted checks are retained under ignored `work/school-district-release-20260927/`.

Fresh hosted checks passed on 18 desktop/mobile page states, including the school directory and new-school booking form with no district input. Admin and PA sign-in/out, role restrictions, secure two-hour sessions, cross-demo session rejection, enabled email sign-in, accessibility and overflow checks passed without browser errors or application 5xx responses. School and booking screenshots were visually inspected. Hosted checks created no scheduling records.

### Sign-in and email configuration

Both deployments are Ready. The same application now offers personal one-time email sign-in alongside **Continue as demo admin** and **Continue as demo PA**. Shared accounts use the workspace's saved data. The misleading test-data claim was removed; the two-hour session limit remains and does not delete records. Branding is unchanged.

A demo PA and the personal admin requested by the owner were added to each existing database. Before/after fingerprints verified all other records were preserved. No seed, reset or migration ran. Demo users, personal admins and authentication secrets remain separate between programs. Deployment-specific database overrides are still required; project defaults point to the older seeded preview.

**Email delivery is enabled.** The owner added `AUTH_RESEND_KEY` and `AUTH_RESEND_FROM` for Production; their scope was extended to Preview without changing either value or its secret type. Both programs were rebuilt with their original database overrides, then the stable aliases above were updated. The email form is enabled and the unavailable message is absent on both desktop and mobile. One authorized personal-admin sign-in email from each site was accepted by Resend and reached the app's check-email screen. Inbox receipt and following the delivered links were not independently observed.

The preceding email activation was an environment-only redeployment of the verified sign-in source export. Source hashes were checked against that export; school setup and booking changes were added in the later release above. No application code, migration, seed or scheduling data changed for email activation. Use a Resend Sending access key restricted to the verified domain; no full-access key is required.

Source verification: 244 unit tests; five actual-HTTPS preview-auth browser tests covering personal links, all three roles, one-time use, unknown/deleted-account rejection, demo filtering, secure two-hour cookies and mobile accessibility; three standard email-auth browser regressions. Lint, TypeScript, formatting and an isolated production build passed for the unchanged exported application. Both new Vercel builds passed. Fresh hosted checks passed on ten desktop/mobile page states, admin/PA sign-in and sign-out, role restrictions, session expiry and cross-demo session rejection, with no browser errors, accessibility violations or overflow. They explicitly asserted enabled email sign-in and absence of the blocker on each site. Hosted checks made no scheduling-data changes.

The named aliases and their two deployment URLs have public protection exceptions. Project-level Vercel Authentication is unchanged. The preceding email activation's deployment, environment metadata, browser checks and email-send evidence are under ignored `work/email-live-release-20260927/`; earlier source verification and private database configuration remain in `work/email-signin-release-20260927/` and the original release directories. The nontechnical [admin guide](ADMIN_RUNBOOK.md) explains both login methods, shared demo access, persistent data and manual communication. Both four-page PDFs retain the stable program links; all eight rendered pages were visually inspected and their links verified. The updated desktop/mobile sign-in screenshots were inspected after email activation.

## Previous public-access release — verified 27 September 2026

Both deployments are Ready and use the same reviewed application without branding changes. Their databases, admin identities and sign-in secrets are separate. At creation on 23 September, each database contained one admin, migration-owned settings, and no sample domain records. No seed ran. The public-access change did not redeploy the app, reset data or run migrations.

| Demo     | Canonical deployment                                                                             | Database                         |
| -------- | ------------------------------------------------------------------------------------------------ | -------------------------------- |
| Ennovate | [Open Ennovate](https://workshop-scheduler-test-k5ssjmpzl-bryanj1angs-projects.vercel.app/login) | `workshop_admin_demo_20260924`   |
| Enspire  | [Open Enspire](https://workshop-scheduler-test-axa5goofu-bryanj1angs-projects.vercel.app/login)  | `workshop_enspire_demo_20260924` |

Enspire deployment: `dpl_Cai2f6wJRSP37856dzfXo3T56WCf`. Its production build and 13 hosted desktop/mobile accessibility and overflow states passed, along with admin sign-in/out, role checks and Create/Cancel. Hosted checks created no domain records. The same 286 non-document source/configuration files match the previously verified export.

The user explicitly requested public demos on 27 September. Deployment Protection Exceptions now apply to exactly the two deployment URLs above. Open either ordinary link and choose **Continue as admin**; no Vercel account, share token or password is required. Anyone visiting can use the demo admin account. These are rehearsal workspaces.

Fresh-browser verification passed for both plain public login URLs, admin sign-in/out, secure two-hour sessions, role restrictions, and desktop/mobile accessibility and overflow. A session from either demo was rejected by the other. Project-level protection settings are unchanged, and the previous workspace preview still requires Vercel access. Checks created no domain records. Evidence is under ignored `work/public-demo-access/`; database credentials remain in the original ignored release directories.

The earlier one-shareable-link limitation is resolved by the user's public-access choice. [Vercel Deployment Protection Exceptions](https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/deployment-protection-exceptions) provide this per-domain setting on all plans. No plan upgrade or billing change was needed. Both four-page admin PDFs now contain ordinary public links and were rendered and visually checked.

## Ennovate clean admin demo — initial verification 23 September 2026

[Open the clean admin app](https://workshop-scheduler-test-k5ssjmpzl-bryanj1angs-projects.vercel.app/login). Deployment `dpl_C5WX3w5yKtCv3mWVGwjEY85mS8ft` is Ready in Preview. Its original private access was replaced by public access on 27 September as recorded above. Choose **Continue as admin**.

At the user's request, this deployment starts with no seed data. A separate database has all 18 migrations, one admin account, and no schools, classes, teachers, PAs, workshops, availability or assignments. No seed ran; the previous demo's domain records were verified unchanged. Only existing active configured accounts appear on the preview login screen. The new database and auth settings are deployment-specific overrides; existing project defaults still point to the previous demo.

The [admin guide](ADMIN_RUNBOOK.md) explains setup from an empty workspace, Plan → Staff → Publish, warnings, communication and recovery. [The readiness review](DEMO_READINESS_2026-09-23.md) records the complete validation results and remaining live-pilot gates. Hosted verification covered the private access link, admin sign-in/out, empty screens, role restrictions and 13 desktop/mobile accessibility/overflow states. No hosted sample records were created.

## Previous workspace preview — verified 23 September 2026

[Open the protected test app](https://workshop-scheduler-test-kwexe4syk-bryanj1angs-projects.vercel.app/login). Deployment `dpl_B8YGcUYQQRv8a6nz11PvG6jYRK1B` is Ready in the existing test project's Preview environment. Sign in to Vercel if prompted, then choose a demo role.

Each workshop now has **Plan → Staff → Publish**. Staffing changes save immediately to private drafts with persistent Undo. **Auto-fill missing PAs** adds only enough to reach minimum staffing, preserving all existing teams and dates. Removed PAs stay excluded from that session's auto-fill until explicitly restored. Old locks show neutral **Auto-fill off**; new manual edits do not lock the session. Normal staffing has no proposal/apply stage, protected-session warnings or 15-minute expiry. Manual availability/day/week warnings remain visible without override forms; real conflicts and publication checks remain enforced. Workshop creation remains on demand.

Verification passed: **243 unit, 233 PostgreSQL integration, 85 browser tests in one clean final run, plus the separate demo-auth test for all three roles**. Lint, TypeScript, formatting, diff checks, and isolated local/Vercel production builds passed. Independent multi-agent review covered UI flow, solver/concurrency/data safety and browser regressions. Desktop and 390px mobile layouts were inspected; keyboard/accessibility, exact scope, lost-response retries, Undo, duplicate submissions, lifecycle and privacy assertions passed. See [the workspace review](WORKSHOP_WORKSPACE_REVIEW.md).

Migration `20260923081728_persistent_draft_workspace`, committed with its schema as `55d36b9`, adds only operation history and auto-fill exclusions. All 18 migrations are applied. A domain backup preceded migration; comparisons immediately after migration and again after hosted smoke checks verified every existing row unchanged, including 19 sessions and 21 assignments. No reset or reseed ran.

Authenticated read-only hosted checks verified the workspace tabs, final publication notice, preserved auto-fill settings, legacy routing, empty selection, creation/Cancel, enabled warning-only Assign controls and calendar warning data. The source-only upload contains 309 files and excludes credentials, local databases, dependencies and build output. Functions remain in Oregon, and anonymous visitors remain behind Vercel SSO protection. Release documentation was finalized after the export. Use this URL for the new workflow; do not roll back to the former replacing matcher without retaining the additive-compatible backend.

## Previous workload-warning preview — verified 23 September 2026

[Open the protected test app](https://workshop-scheduler-test-pkpp2uz1p-bryanj1angs-projects.vercel.app/login). Deployment `dpl_GNifXLdLYymzFvtWabsFWr1UBFfv` is Ready in the existing test project's Preview environment. Sign in to Vercel if prompted, then choose a demo role.

Manual PA assignment now needs only the visible availability/day/week warnings and a direct Assign/Add click. The separate workload review panel, confirmation checkboxes and override-reason field are removed from the calendar drawer, session detail, staffing proposal and published staffing changes. Normal published-change review/reasons and class date exceptions remain. Automatic matching and genuine conflict protections stay strict; workshop creation remains on demand.

Verification passed: 219 unit tests, 206 PostgreSQL integration tests, all 23 affected browser cases across the initial run and focused reruns, required lint/type/format/diff checks, and isolated local/Vercel production builds. Four mobile warning-card states passed accessibility/overflow checks and visual review. Independent UI/core review found no blocking defects. Authenticated hosted checks verified ten availability-warning candidates and two workload-warning candidates with enabled Assign buttons and no extra confirmation, calendar warning data, and the explicit creation/Cancel flow. The hosted checks made no scheduling-data changes. See [manual workload verification](MANUAL_WORKLOAD_WARNINGS.md).

Migration `20260923074048_warning_only_manual_workload`, committed in `9a342f0`, removes only the obsolete SQL requirement for a separate workload reason. A demo domain-data backup preceded migration; all existing rows and every other Assignment constraint were verified unchanged. No reset or reseed ran. The reviewed source-only upload contains 294 files and excludes credentials, local databases, dependencies and build output. Preview protection remains enabled and functions remain in Oregon. Release documentation and supplemental test screenshots were finalized after the deployment export.

## Previous availability-warning preview — verified 23 September 2026

[Open the protected test app](https://workshop-scheduler-test-rc86dv3tm-bryanj1angs-projects.vercel.app/login). Deployment `dpl_9m5W1CbVLLXYXvo1WUKnaHGGAv6C` is Ready in the existing test project's Preview environment. Sign in to Vercel if prompted, then choose a demo role.

Missing or partial PA availability is now warning-only on every manual assignment screen. Assign/Add stays enabled without a new availability checkbox, reason or confirmation step. This covers calendar and session staffing, the editable proposal, published team edits/replacements, and retained PAs during rescheduling. Availability overrides remain visible, persist through publication and survive matcher reruns. Automatic matching still requires full availability; overlap, inactive-account, capacity, consecutive-school and workload protections remain. Workshop creation remains on demand.

Verification passed: 218 unit tests, 196 PostgreSQL integration tests, all 76 browser cases across the full run and focused reruns, all required lint/type/format checks, and isolated local/Vercel production builds. The browser run exposed and verified a narrow Cancel/tooltip interaction fix; hover, focus, tap and Escape checks remain intact. Three new 390px mobile audits passed accessibility, overflow and persistence checks. Independent UI/core review found no blocking defects. Hosted authenticated HTTP checks verified ten existing warning-only candidates with enabled Assign buttons and no extra availability controls, calendar warning data, and the explicit creation/Cancel flow. These hosted checks made no scheduling-data changes. See [manual availability verification](MANUAL_AVAILABILITY_OVERRIDES.md).

The additive migration `20260923070920_manual_availability_override` is committed in `9a9ed89` and applied to the verified dedicated demo database after a local domain-data backup. Before/after comparison confirmed every existing domain row was unchanged; existing assignments default to no availability override. No reset or reseed ran. The source-only upload contains 292 files and excludes credentials, local databases, dependencies and build output. Preview protection remains enabled and functions remain in Oregon. Release documentation was finalized after deployment.

## Previous explicit-creation preview — verified 22 September 2026

[Open the protected test app](https://workshop-scheduler-test-4bhzthhrj-bryanj1angs-projects.vercel.app/login). Deployment `dpl_AXP8PLr19DJjYdvvKbqd4je2tmR9` is Ready in the existing test project's Preview environment. Sign in to Vercel if prompted, then choose a demo role.

Workshop creation is now explicit: normal Workshops navigation shows the list, Create opens the form, and Cancel returns to the list. Validation retains entered values; successful creation opens the new workshop. All explicit creation links use the same on-demand state. The streamlined workshop overview and the independently verified interactive staffing preview are included.

Verification passed: 207 unit tests, 185 integration tests, lint, TypeScript, formatting, and local/Vercel production builds. All 65 browser cases passed across the full run and focused reruns: five stale UI-label selectors were corrected without weakening context, keyboard-focus, date, or database assertions. Coverage now explicitly checks no writes on Cancel or invalid creation, exactly one record after a valid retry, missing delivery-end rejection, and desktop/mobile accessibility. Authenticated hosted HTTP checks verified demo login, the default closed list, explicit creation, the Cancel destination, and reset on ordinary navigation.

The source-only export contains 284 deployment files and excludes local credentials, test databases, dependencies, and build output. Functions remain in Oregon. Deployment protection remains enabled; no migration, reset, reseed, or hosted workshop-data change was performed.

## Previous compact-override preview — verified 21 September 2026

[Open the protected test app](https://workshop-scheduler-test-5tofxtfok-bryanj1angs-projects.vercel.app/login). Deployment `dpl_BzVqg2HwvoyFM7HKZZgppqKwKnmj` is Ready in the existing test project's Preview environment. Sign in to Vercel if prompted, then choose a demo role.

**Assign with override** candidates now use compact yellow rows in both staffing views. Hover, keyboard focus, or a tap on the warning icon explains the conflict. Selecting the assignment button opens the full comparison, required confirmations, and reason; Cancel returns focus to the candidate. Same-day confirmation remains red, and changed workload information resets the review.

The deployed UI snapshot passed 175 unit tests and full lint, TypeScript, and formatting checks. The focused browser regression verifies saved weekly override flags and reason, same-day confirmations, keyboard and touch interactions, and accessibility. Eight hosted desktop/mobile states passed accessibility and overflow checks with no browser exceptions or application 5xx responses. Vercel's production build passed. The export contains 256 non-document source/configuration files and is based on the preceding deployed snapshot with only the three staffing UI files and the new browser regression changed. Separate exact-scheduler work remains in the shared workspace for its own release. No migration, reset, reseed, or hosted scheduling-data change was performed. See the [compact override review](FLOW_IMPLEMENTATION_REVIEW.md#21-september--compact-workload-override-candidates).

## Previous draft-session preview — verified 21 September 2026

[Open the protected test app](https://workshop-scheduler-test-j1e9snxds-bryanj1angs-projects.vercel.app/login). Deployment `dpl_8gwmEzh6uUjoyh4Pq9oobd8XMHdD` is Ready in the existing test project's Preview environment. Sign in to Vercel if prompted, then choose a demo role.

**Save draft class sessions** now confirms completion before opening the saved batch, with retained choices on errors and duplicate-submit protection. **Minimum staffing is not met** details are collapsed by default; the warning and all approval controls remain visible. This release also fixes a full-batch staffing-preview timeout discovered during hosted verification. See the [draft save and staffing details review](FLOW_IMPLEMENTATION_REVIEW.md#21-september--draft-session-save-and-collapsible-staffing-details).

Validation passed: 175 unit tests, 175 integration tests, 12 affected browser cases, independent Sol reviews, full quality checks, and local/Vercel production builds. The isolated production browser completed a nine-class staffing preview and a two-class save across weeks without manual recovery. Hosted desktop/mobile validation, keyboard disclosure, accessibility, and overflow checks passed with no captured browser exceptions or application 5xx responses. The reviewed export contains 254 non-document source/configuration files. Functions remain in Oregon; no hosted migration, reset, or reseed was performed. Existing workshop data remains intact.

## Previous creation and enrollment preview — verified 21 September 2026

[Open the protected test app](https://workshop-scheduler-test-33uzkjo8u-bryanj1angs-projects.vercel.app/login). Deployment `dpl_CaHSLCNAfPGUrQz6K1GsCa3gMpkx` is Ready in the existing test project's Preview environment. Sign in to Vercel if prompted, then choose a demo role.

This update fixes **Create a workshop** and **Add selected classes** remaining on **Saving…** after the database save completed. Both forms now acknowledge the save before opening a fresh workshop page. Validation errors retain entered values and class selections. Repeat enrollment remains idempotent. See the [creation and enrollment review](FLOW_IMPLEMENTATION_REVIEW.md#21-september--workshop-creation-and-add-classes-completion).

Three independent Sol reviews signed off. Verification passed: 175 unit tests, 173 integration tests, 11 affected browser cases, full quality checks, and local/Vercel production builds. An isolated production browser completed creation, ten-class enrollment, and two no-op repeats without manual recovery. Four hosted desktop/mobile form states passed validation, accessibility, and overflow checks with no browser exceptions or application 5xx responses. Hosted verification made no scheduling-data changes; the existing January 2027 workshop and its five classes remain available. All 252 exported non-document source/configuration files match the reviewed workspace. Functions remain in Oregon; no migration, reset, or reseed was performed.

## Previous deletion preview — verified 21 September 2026

[Open the protected test app](https://workshop-scheduler-test-qpxsokwr4-bryanj1angs-projects.vercel.app/login). Deployment `dpl_DSmMRRRindQBRQnWHVpLcp4RVT2E` is Ready in the existing test project's Preview environment. Sign in to Vercel if prompted, then choose a demo role.

This update adds **Delete workshop** to each workshop overview. The confirmation shows the workshop and affected draft records, with **Cancel** and **Yes, delete workshop**. Only unused or draft-only workshops can be deleted; published, completed, and cancelled history is protected. Shared classes, people, and availability remain. A changed workshop requires a fresh deletion review. See [FLOW_IMPLEMENTATION_REVIEW.md](FLOW_IMPLEMENTATION_REVIEW.md#21-september--delete-workshop).

Independent Sol reviews signed off. Verification passed: 175 unit tests, 150 integration tests, seven affected browser cases, full quality checks, and local/Vercel production builds. Four hosted desktop/mobile confirmation/protected-history states passed accessibility and overflow checks; teacher/PA access was denied, and no browser exceptions or application 5xx responses were captured. Hosted verification made no scheduling-data changes. All 246 exported non-document source/configuration files match the reviewed workspace. Functions remain in Oregon; no migration or reseed was performed.

## Previous flow preview — verified 20 September 2026

[Open the protected test app](https://workshop-scheduler-test-8omtdk8mi-bryanj1angs-projects.vercel.app/login). Deployment `dpl_63qg1K6YHFYFyTN5UvA7g2i3W8jj` is Ready in the existing test project's Preview environment. Sign in to Vercel if prompted, then choose a demo role.

Start at **Workshops → Create a workshop**, or open an existing workshop. The connected flow is **Add classes → Choose class dates → Assign PAs → Review & publish**. Choices persist across weeks and availability detours; saved batches, PA assignment, and publication retain workshop scope across months. Schools and teacher contacts are reachable under **Schools & classes**. See [FLOW_IMPLEMENTATION_REVIEW.md](FLOW_IMPLEMENTATION_REVIEW.md) for the full change and review record.

Validation passed: 175 unit tests, 139 PostgreSQL integration tests, 41 affected browser cases plus a strengthened mobile-overview rerun, all required quality checks, and local/Vercel production builds. Three GPT-5.6 Sol agents completed implementation and independent review. All 17 hosted desktop/mobile states passed accessibility and overflow checks; all three roles passed secure sign-in/out, role isolation, and privacy checks with no captured application 5xx responses or browser exceptions. The creation form opens with a blank custom Workshop title.

All 242 exported non-document source/configuration files match the reviewed workspace. Application functions remain in Oregon. This release performs no hosted migration, reset, or reseed; existing demo data and test edits are preserved. Vercel Authentication remains enabled. Hosted evidence is retained under ignored `work/run-planning-release/hosted-flow/`.

## Previous navigation preview — verified 20 September 2026

[Open the protected test app](https://workshop-scheduler-test-1kzbvzdtl-bryanj1angs-projects.vercel.app/login). Deployment `dpl_EyXMYbp4b7zY13NF5MGvtjfBQz32` is Ready in the existing test project's Preview environment. Sign in to Vercel if prompted, then choose a demo role.

This update adds immediate navigation feedback, reduces duplicate server reads, colocates all application functions with the database in Oregon, and renames **Book workshop** to **Schedule class session**. Repeat calendar navigation measured 473 ms, down from 2,976 ms; date planning measured 464 ms, down from 5,072 ms. See [NAVIGATION_PERFORMANCE.md](NAVIGATION_PERFORMANCE.md) for all before/after measurements, independent reviews, and their limits.

Validation passed: 162 unit tests, 134 PostgreSQL integration tests, nine affected browser cases, full lint/TypeScript/format checks, and local/Vercel production builds. Hosted verification covered all three roles, secure short sessions, role isolation, privacy, thirteen desktop/mobile page states, and two deliberately delayed navigation states. Accessibility and overflow checks passed; the page/role checks captured no application 5xx responses or browser exceptions. All 233 exported non-document source/configuration files match the reviewed workspace.

No database reset, reseed, or migration was performed for this update. The existing demo and subsequent test changes remain available. Vercel Authentication remains enabled. Hosted evidence is retained under ignored `work/run-planning-release/hosted-navigation/` and `work/navigation-performance/`. The earlier release records below describe their original verification and seed state.

## Previous workshop-run preview — verified 20 September 2026

[Open the protected workshop-run demo](https://workshop-scheduler-test-pkd66mmh2-bryanj1angs-projects.vercel.app/login). Deployment `dpl_8C5SkGuGSJfDbH5NjQpsYo6wwyJ3` is Ready in the existing test project's Preview environment. Sign in to Vercel if prompted, then choose a demo role.

Start at **Workshop runs → Build a business** for the October 2026 delivery window. The demo contains three schools, ten classes, six independent runs, sixty enrollments, eighteen PAs, and sixteen sessions. It includes unscheduled classes, missing availability, a Friday staffing shortage, published work, a locked draft, weekly/same-day overrides, a makeup outside the shared window, completed history, a waiver, closures, and a future teacher handover. See [IMPLEMENTATION_REVIEW.md](IMPLEMENTATION_REVIEW.md) for the walkthrough and independent GPT-5.6 Sol review record.

The dedicated test database was backed up before the explicitly authorized reseed. All fifteen migrations are applied. There are no monthly quota rows or assignment prerequisites. Use this deployment URL; older builds reflect earlier scheduling rules and schema.

Final verification passed:

- 162 unit and 133 PostgreSQL integration tests; the 44-test full browser gate followed by eight affected browser regressions, including the new recurrence/handover/lifecycle case; separate preview authentication verification.
- Full lint, TypeScript, formatting, diff checks, and local and Vercel production builds.
- Hosted HTTPS sign-in/out for admin, teacher, and PA, secure short sessions, correct role isolation, and participant privacy.
- Thirteen hosted desktop/mobile accessibility and overflow checks, with no captured application 5xx responses or browser exceptions. Recurring class readiness, published coverage, and run-detail planner routing were explicitly asserted and visually inspected.
- Anonymous visitors still meet Vercel Authentication. The reviewed source export excludes environment files, credentials, and generated local artifacts; all 226 exported non-document source/configuration files match the workspace.

Release artifacts are retained locally under ignored `work/run-planning-release/`, including the source manifest, pre-reseed domain backup, database verification, hosted screenshots, and `hosted/verification.json`. Application source remains in the working tree; schema migrations are committed. Documentation was finalized after deployment. The known Prisma configuration dependency advisory remains a production release gate, as recorded in [PILOT_RUNBOOK.md](PILOT_RUNBOOK.md).

## Previous class-workshop preview — verified 20 September 2026

[Open the protected class-workshop preview](https://workshop-scheduler-test-a8pm65uxr-bryanj1angs-projects.vercel.app/login). Deployment `dpl_Ea2dgZWAJ2Yd6x39dyBUQEdqw88b` is Ready in the existing test project's Preview environment. Sign in to Vercel if prompted, then choose a demo role.

This deployment includes the ClassWorkshop refactor and the current booking UI. Start with **Workshop catalog**, then **Classes & teachers → Workshop sequence** to record candidate dates and schedule a session. The two existing sessions remain explicitly imported because their original records had no workshop definition; identify them with the appropriate catalog definition without changing their dates or assignments.

All eleven migrations are applied to the dedicated Neon test database. Before/after fingerprints verified that existing sessions, assignments, schools, users, classes, weekly reference times, PA availability, quotas, batches and audit records were preserved. No reset or reseed was performed. Use this new URL: earlier deployment builds use the previous database relationships and are no longer compatible with the migrated schema.

Release verification passed:

- 129 unit tests and 116 PostgreSQL integration tests; lint, TypeScript, formatting, and clean local and Vercel production builds.
- Hosted HTTPS sign-in/out for admin, teacher and PA; correct roles, secure HTTP-only sessions with two-hour expiry, and both other-role routes denied.
- Existing October schedule, class sequences, imported-session identity controls, candidate availability and workshop catalog pages.
- Mobile class-workshop accessibility and overflow checks; no captured application 5xx responses or browser exceptions.
- Anonymous visitors still meet Vercel Authentication. The upload excludes environment files, credentials and generated local work artifacts.

The source was exported from the current working tree based on schema/migration commit `cbc8f08`; application changes remain uncommitted. Deployment input manifests, migration fingerprints and four hosted screenshots are retained locally under ignored `work/class-workshop-refactor/`, with the live report in `hosted/verification.json`.

## Previous preview — verified 17 September 2026

[Open the protected demo](https://workshop-scheduler-test-74mb243ea-bryanj1angs-projects.vercel.app/login). Sign in to Vercel if prompted, then choose a demo role. The sample workshops are in October 2026. Use **Book workshop** to select or add the school, teacher and class inline; **Classes & teachers** is their combined directory.

Final deployment: `dpl_HpHwExSLP1Sup227DcF6fdpJsur3` (Ready, Preview). It uses the normal `npm run build` command; initialization and QA helpers are excluded from its source. The dedicated database has all ten migrations. The additive day-gap and direct-booking migrations preserved existing data. The preview's current assignment gap was explicitly saved as **7 days**. No database reset or reseed was performed.

Validation passed:

- 128 unit, 103 integration, and 33 browser tests, including the existing regression suite, direct booking/reuse/error/mobile cases, and the separate HTTPS preview-session test. All 264 tests pass. The full normal browser run identified obsolete booking selectors and an accessible error-label issue; all 11 affected browser cases passed after correction.
- Lint, TypeScript, formatting, diff checks, and the Vercel production build.
- Live HTTPS sign-in and sign-out for all three configured accounts; correct roles, secure HTTP-only SameSite Lax cookies, and sessions expiring within two hours.
- Both other-role routes denied for every account. The teacher and PA see their shared published workshop; only the admin sees the separate draft.
- Vercel SSO protection for anonymous visitors, zero captured application 5xx responses, zero axe violations in the hosted checks, and a contained mobile login layout.
- The deployed gap is 7 days and retains the selected quota month on save. The old dashboard task panel is absent; the combined directory and inline booking controls work on desktop/mobile, saved-class selection is prefilled by Book again, and class duration fills the end time without replacing a deliberate edit.
- The compact monthly workspace, staffing panel/focus return, mobile bulk quota table and mobile availability editor pass hosted accessibility and overflow checks. The availability Save button remains visible in the mobile viewport. Local browser audits cover 51 desktop/mobile states without axe violations or document overflow.
- Two fresh GPT-5.6-sol agents implemented and cross-reviewed the direct-booking UI and backend, alongside the primary agent's directory/dashboard/default work. Both gave scoped signoff with no outstanding findings. The prior September 16 work had three independent reviewer signoffs. The primary agent ran the combined automated and hosted checks.

The Codex task retains sixteen current hosted screenshots and `outputs/vercel-preview-booking/verification.json`, plus earlier workflow-review captures. See `DIRECT_BOOKING_REVIEW.md` for the latest behavior and review record and `UX_IMPLEMENTATION_REVIEW.md` for the preceding changes. Hosted checks exercise the booking form and saved-record reuse without creating extra QA records; booking mutations and publication/rescheduling rollback are covered against isolated databases. Tailwind source detection is scoped to `src` and TypeScript excludes generated `work/` copies. The hosted check verifies the full click-to-dashboard transition over real HTTPS.

The deployment includes the reviewed direct-booking source from `feature/dated-workshops` on top of `63419c7`. All 118 source files match the reviewed export. Release documentation was finalized after hosted verification.

## Demo sign-in

On `/login`, choose an available demo role. The two blank demos offer only **Continue as admin**. The email addresses are configured on the server for these roles. Demo access does not send email or verify ownership of those addresses; visitors to the public demos, or people admitted through an older preview's protection, can choose an available role.

Demo sign-in requires all of the following:

- Vercel's system `VERCEL_ENV` is `preview`.
- `AUTH_PREVIEW_DEMO_ENABLED` is exactly `true`.
- The system `VERCEL_PROJECT_ID` matches the nonempty `AUTH_PREVIEW_DEMO_PROJECT_ID`.
- `AUTH_PREVIEW_ADMIN_EMAIL`, `AUTH_PREVIEW_TEACHER_EMAIL`, and `AUTH_PREVIEW_PA_EMAIL` contain distinct, valid addresses.
- The selected address belongs to an active database user with the corresponding role.

Sessions use secure, HTTP-only Auth.js database cookies and expire within two hours. The normal role checks still apply to every protected page and mutation. The user-authorized Ennovate and Enspire demos are public rehearsal environments; other previews retain Vercel Deployment Protection. Never connect demo sign-in to production data. Production continues to use invite-only email sign-in with a verified Resend sender.

## Database and release setup

Set `DATABASE_URL` to the new database's pooled URL and `DIRECT_URL` to its unpooled URL. Set a unique `AUTH_SECRET` and `AUTH_TRUST_HOST=true` for Preview. The dedicated project exposes Vercel system environment variables. Do not copy local credentials, test logs, or generated auth files into the deployment source.

Apply all committed migrations with `prisma migrate deploy`. For an explicitly authorized disposable test reset, back up the domain data first, enable `SEED_PREVIEW_DEMO_ACCOUNTS=true` and `SEED_RICH_DEMO=true` with the verified demo project configuration, then run `tsx prisma/seed.ts`. The rich seed provides three schools, ten classes, six independent runs, sixty enrollments, eighteen PAs, and sixteen sessions across draft, published, and completed states. The main run is in the next Vancouver calendar month; other runs exercise cross-month windows, history, shortages, and admin exceptions. The default local seed remains unchanged.

The seed resets sample availability, quotas, assignments, and workshop state. Do not run it as part of routine builds after people start testing. Seed-mode guards run before database writes; an incomplete or mismatched preview configuration is rejected.

For the initial September 10 deployment, Windows Prisma encountered a Schannel TLS credential error before connecting to Neon, so initialization ran in Vercel's Linux build environment. On September 16, the additive migration succeeded from the local CLI outside the restricted Windows test sandbox. Routine builds still use the normal build command and migrations remain a separate coordinated step.

## Remaining pilot rehearsal

This demo does not complete the real-email, backup/restore, or hosted incident-recovery gates in `PILOT_RUNBOOK.md`. Those remain required before a live pilot release.
