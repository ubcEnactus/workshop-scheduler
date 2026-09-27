# Workshop flow implementation

20 September 2026, with the deletion follow-up verified 21 September. Implements the accepted recommendations from [the user-flow and naming audit](USER_FLOW_NAMING_AUDIT.md). Implementation, independent reviews, local validation, test deployment, and hosted verification are complete. [Open the protected test app](https://workshop-scheduler-test-qpxsokwr4-bryanj1angs-projects.vercel.app/login).

## Admin journey

The main navigation is **Overview · Workshops · Calendar · Schools & classes · PAs**. **Create a workshop** opens a blank **Workshop title** field and shared inclusive delivery dates. Creation opens the new workshop with **Add classes** as the next action. Existing workshops remain easy to reopen. Repeated titles remain independent records, identified by window and a stable record reference.

Inside a workshop, the connected steps are **Add classes → Choose class dates → Assign PAs → Review & publish**. These are direct links, so admins can return to an earlier step or manage an individual class session without repeating setup.

- **Dates:** choices and batch details are retained in the same browser tab, separately for each admin and workshop, across week changes, reloads, and availability detours. Off-screen choices stay visible in the selected-date summary. Combined staffing checks include all selections. The server revalidates dates and current scheduling inputs before saving. Successfully saved choices are removed from the browser draft; unsaved choices remain.
- **Save:** the result opens the saved batch in its workshop across every month, with an explicit dates-only confirmation and **Assign PAs to these sessions**. The full workshop schedule includes approved dates outside its window.
- **Staff:** the matcher accepts the whole workshop, a saved batch, or selected sessions. Its optional monthly bulk tool is separate. A preview does not save assignments; **Save draft PA assignments** does. Dates never move, and existing manual, locked, and published work remains protected.
- **Publish:** the workshop schedule supports an atomic reviewed publication across months, using the same schedule scope for the preview hash and server revalidation. A neighboring session from another workshop cannot be injected into a workshop-scoped publication. Publication makes sessions official and visible, sends no email, and leaves an explicit communication task.
- **Progress:** coverage distinguishes need availability, need dates, need PAs, staffed drafts, published, completed, and not required. “Staffed draft” is a count-based description; “Ready to publish” is reserved for the view that runs current staffing checks.

## Availability and supporting flows

The class calendar and date generator share a pure availability-window resolver. It respects active recurring rules, effective dates, dated additions, and class/school closures, while preserving the authorization of scoped historical slots. The calendar displays availability windows; session-duration-specific starts and PA counts remain in the selected workshop’s date planner.

The old class-details availability editor links to the canonical calendar editor. **Add class** is prominent and opens availability after creation. Availability, workshops for the class, and details have clear local links. Detours and mutations preserve the originating workshop and planning week. Candidate displays resolve the teacher effective on the candidate date, including an active successor to a deactivated teacher.

**Schools & classes** also links to schools and teacher contacts. If a class cannot yet be created, the setup panel explains the prerequisite and connects school creation, teacher creation, and class creation without losing the workshop or planning week. Normal directory creation remains independent of that opt-in return flow.

PAs expose **Availability & workload**, with effective periods and links from assignment conflicts to the affected class session. Participant instructions are labeled. Public change summaries use a fixed set of safe descriptions; internal notes and reasons remain private. Deactivation wording describes retained history without promising a restore feature.

## Scope and limitations

No schema migration or test-data reset is required. The existing named workshop identity, one non-cancelled session per representative class/workshop, hard availability/overlap rules, Monday–Friday weekly capacity, explicit admin exceptions, and lifetime fairness remain unchanged.

Date choices are retained in browser session storage, not shared between admins or devices. If storage is unavailable, the planner warns before navigation. Reopening a view requires a fresh combined staffing check; an earlier temporary proposal is not treated as saved staffing.

Whole-workshop automatic date selection remains a separately identified feature. This release improves retained, editable date selection and scoped staffing; it does not add a “Suggest dates for all classes” action.

## Review and validation

Three GPT-5.6 Sol agents implemented bounded areas and reviewed one another’s changes. The root integrated the planner, cross-month schedule/publication, direct scheduling, test updates, and release checks. Findings corrected during review include duplicate URL scope parameters, global calendar links retaining workshop scope, date-effective teacher filtering, availability detours opening the wrong month, and mutation redirects dropping planning context.

Local verification passed:

- 175 unit tests across 26 files and 139 PostgreSQL integration tests across 13 files, including fresh migration application and repeatable demo seeding in isolated databases.
- 41 affected browser cases across creation, enrollment, class availability, effective teachers, planning, assignment, publication, changes, direct scheduling, directories, participant privacy, accessibility, mobile layouts, and immediate navigation feedback. The final broad run passed 33 cases; eight follow-up cases passed after correcting two calendar test assumptions and covering workshop lifecycle/navigation again.
- Full ESLint, TypeScript, Prettier, whitespace checks, and the local production build.

The full cross-month browser journey selects January and February dates, retains choices and details through an availability detour, checks staffing, saves dates without assignments, assigns PAs to the saved batch, publishes both sessions, records pending communication tasks, and opens the global Calendar without retaining workshop scope.

Independent review signoffs are complete:

- Admin/workshop navigation, coverage, enrollment, planner persistence, exact saved-choice cleanup, and scoped publication: signed off after fixes.
- Effective class availability, calendar consistency, teacher handover, and return context: signed off after fixes.
- PA matching scopes, protected assignments, participant privacy, and publication wording: signed off after fixes.
- School/teacher prerequisites and return flow: independently signed off; optional scope is validated, redirects use fixed application routes, and the teacher's selected school remains separate from the carried filter.
- Hosted mobile overview: a positioned table wrapper contains the hidden action-column header without disabling horizontal table scrolling. The strengthened long-name/390px browser regression and independent review passed.

## Test deployment

Deployment `dpl_63qg1K6YHFYFyTN5UvA7g2i3W8jj` is Ready in the existing `workshop-scheduler-test` Preview project. Application functions remain in Oregon (`pdx1`). Vercel Authentication remains enabled; sign in to Vercel if prompted, then select a demo role.

All 17 hosted desktop/mobile states passed accessibility and document-overflow checks. Admin, teacher, and PA sign-in/out, secure HTTP-only SameSite Lax sessions with two-hour expiry, cross-role rejection, and participant privacy passed. The creation form has an empty Workshop title. No application 5xx responses or browser exceptions were captured. The final mobile workshop overview and planner were visually inspected.

All 242 exported non-document source/configuration files match the reviewed workspace. Local and Vercel production builds passed. No hosted migration, reset, or reseed was performed for this flow release; existing demo data and subsequent test edits remain intact. Hosted checks changed authentication sessions only. Verification reports and screenshots remain under ignored `work/run-planning-release/hosted-flow/`; documentation was finalized after deployment.

## 21 September — Delete workshop

Each workshop overview now offers **Delete workshop**. A dedicated confirmation identifies its title, delivery window, and record reference, lists the affected class enrollments, draft sessions, draft PA assignments, and workshop-specific candidate times, and offers **Cancel** or **Yes, delete workshop**. The confirmation states that deletion is permanent and that shared schools, classes, people, availability, and other workshops are preserved.

Deletion is available only for unused or draft-only workshops. Published, completed, or cancelled session history, a prior publication timestamp, published assignments/events, or a completed class delivery prevents deletion. Cancelling a session does not make its workshop deletable. The Server Action authorizes the admin, validates explicit confirmation, re-reads the workshop under the scheduling write lock, and compares the complete reviewed graph before removing anything atomically. A changed record requires a fresh confirmation. Existing matcher previews cannot recreate deleted work.

Independent GPT-5.6 Sol reviews signed off the backend and interface after correcting misleading cancellation guidance. Local validation passed: 175 unit tests, 150 PostgreSQL integration tests, seven affected browser cases, full lint, TypeScript, formatting, whitespace checks, and the production build. Browser cases cover safe cancellation, draft cleanup, stale review, protected history, mobile overflow, and accessibility. Integration cases test each history blocker separately and preserve shared records and neighboring workshops.

The deletion update is deployed as `dpl_DSmMRRRindQBRQnWHVpLcp4RVT2E`, Ready in the existing test Preview with application functions in Oregon (`pdx1`). Four hosted confirmation/protected-history desktop/mobile states passed accessibility and overflow checks; teacher and PA access was denied. Cancel returned to the workshop without a domain mutation, and no browser exceptions or application 5xx responses were captured. The mobile confirmation was visually inspected. No hosted workshops were deleted and no migration or reseed was performed. All 246 exported non-document source/configuration files match the reviewed workspace. Evidence is retained under ignored `work/run-planning-release/hosted-delete/`.

## 21 September — Workshop creation and Add classes completion

The reported failure saved enrollments but left **Saving…** displayed until the workshop was reopened. Enrollment previously coupled the completed database transaction to broad layout revalidation and a Server Action redirect back to the same workspace. The development browser probe passed even when the completed response was deliberately delayed, so an ordinary successful-save assertion did not cover the reported failure.

Both the workshop detail and reviewed bulk-enrollment forms now use one result-returning action. Authorization, Zod validation, the scheduling transaction, active teacher checks, and request-key idempotence are unchanged. Known validation failures return an inline error while retaining the selection and request key. Successful saves commit a disabled **Opening workshop…** state and a **Classes saved** message with a **Continue** link, then load a fresh document. The mutation response does not wait for workspace rendering or an RSC redirect. The fresh document updates coverage, resets the selection, and clears the old router cache; bulk enrollment returns to its clean selection page.

The local production reproduction also exposed the same redirect failure on **Create a workshop**. Creation now uses a create-only result-returning action and the same save-and-open form. Its custom title, delivery window, duration, and staffing defaults use the existing persistence mapping, shared with the edit action. Validation errors preserve the entered values; success opens the new workshop's Add classes workspace. Workshop editing and duplication retain their existing actions.

Independent reviews signed off after moving navigation into an effect so success feedback and duplicate-submit protection commit before navigation begins. Browser testing also caught React's automatic form reset clearing checkbox DOM while the selected count stayed unchanged. A native reset listener prevents that reset on returned errors; successful saves clear the form through the fresh document. The PostgreSQL integration coverage checks validation, authorization, idempotent retries, atomic rejection, existing waivers, effective teacher handovers, and creation metadata. No scheduling rules or schema changed.

Final local validation passed: 175 unit tests, 173 PostgreSQL integration tests, 11 affected browser cases, full ESLint/TypeScript/Prettier/whitespace checks, and the production build. Three independent Sol reviews signed off. The browser cases cover inline creation errors and retained values, corrected creation, delayed mutation acknowledgment, delayed document navigation, repeated zero-addition saves, bulk enrollment, domain errors with retained selection, and existing workshop lifecycle/mobile workflows.

An isolated production-mode browser test reproduced the old behavior: creation and enrollment persisted, but their `303` action redirects needed manual recovery after seven seconds. The final build completes creation, enrollment of all ten demo classes, and two no-op repeats with **zero recovery navigations** and no browser errors. Local end-to-end timings were 112 ms for creation, 430 ms for enrollment, and 401/411 ms for repeats. These are local measurements, not hosted latency guarantees. Evidence is retained under ignored `work/run-planning-release/enrollment-local-before.json` and `enrollment-local-report.json`.

Deployment `dpl_CaHSLCNAfPGUrQz6K1GsCa3gMpkx` is Ready in the existing test Preview, with application functions in Oregon (`pdx1`) and Vercel Authentication retained. All 252 exported non-document source/configuration files match the reviewed workspace. Four hosted desktop/mobile states verify that empty enrollment and invalid creation windows return inline errors, leave the submit buttons usable, and retain entered values. Accessibility and overflow checks passed with no captured browser exceptions or application 5xx responses. The existing **Workshop 2027 January** and its five included classes remain visible. Hosted checks changed authentication sessions only; no workshop/enrollment mutation, schema migration, reset, or reseed was performed. Reports and screenshots are retained under ignored `work/run-planning-release/hosted-enrollment/`; documentation was finalized after deployment.

## 21 September — Draft session save and collapsible staffing details

The date planner now acknowledges **Save draft class sessions** independently of opening the saved batch. Its form action returns a typed destination or inline error without layout revalidation or a Server Action redirect. Successful saves commit **Draft class sessions saved**, disable further submissions, and provide a **Continue** link before opening a fresh schedule document. Failed validation preserves selected dates, session details, and the request key for a corrected retry. The existing atomic transaction, authorization, scheduling validation, and idempotence remain unchanged; the legacy redirecting wrapper keeps its original behavior.

The destination retains the workshop and saved batch across calendar months. It displays the persisted sessions and removes only exact saved, non-cancelled class/date/time choices from the admin's workshop-specific browser draft. Other unsaved choices remain. Saving dates still creates no PA assignments and does not publish sessions.

**Minimum staffing is not met** and other primary staffing warnings remain visible beside an icon. Their diagnostic details now use native keyboard-accessible disclosures, collapsed by default, in the planner, staffing panel, session detail, publication review, and matching preview. Planning diagnostics are grouped by class and session instead of mixing every class's PA reasons in one long list. The bounded-search caveats, blocked-publication messaging, and workload override comparisons and confirmations remain visible. Publication still requires all existing staffing checks to pass.

Three independent Sol reviews signed off. Local validation passed: 175 unit tests, 175 PostgreSQL integration tests, all 12 affected browser cases, full ESLint/TypeScript/Prettier/whitespace checks, and the production build. The initial browser group passed ten cases; after updating two stale test assertions, the three-case targeted rerun passed. Browser coverage includes separately delayed mutation acknowledgment and document loading, an identical request replay creating just one batch, conflict errors retaining fields and choices, corrected retries, keyboard disclosure toggling, cross-month draft retention, assignment, and publication. No scheduling-rule or schema changes were needed.

Hosted verification also exposed an existing full-batch staffing-preview failure: its read-only queries and bounded search ran inside Prisma's default five-second interactive transaction. The nine-class demo took about 11.3 seconds and failed at commit with `P2028`. Preview reads and calculations now run outside that transaction; saves still atomically recheck the schedule hash, workshop revision, and every selected slot. A nine-class integration regression verifies the shortage result and no writes to sessions, assignments, batches, previews, scheduling revision, or enrollment state. Two independent reviewers signed off this correction.

The isolated production-mode browser selected two classes across different weeks, saved exactly two sessions in one batch, and opened that batch with no manual recovery or browser errors. The action returned HTTP 200. Evidence is retained under ignored `work/run-planning-release/planning-local-report.json`; all writes for this production-mode save test were confined to a disposable localhost database.

Final deployment `dpl_8gwmEzh6uUjoyh4Pq9oobd8XMHdD` is Ready in the existing protected test Preview. The final production probe also completed the full nine-class demo preview before saving the two-session batch. Hosted checks verified retained selections and usable buttons after invalid saves on desktop and mobile; deliberately competing Friday-afternoon choices produced two collapsed staffing warnings. Keyboard expansion/collapse, accessibility, and overflow checks passed, and the expanded mobile disclosure was visually inspected. The final hosted run captured no application 5xx responses or browser exceptions. The existing January 2027 workshop and its five included classes remain visible.

The reviewed deployment export contains 254 non-document source/configuration files, verified before upload. Later concurrent scheduler edits in the shared workspace are separate from this release; its saved source export remains under ignored `work/vercel-run-planning-20260921-drafts2/`. Functions remain in Oregon and Vercel Authentication stays enabled. Hosted verification used invalid saves and read-only previews, changing only authentication sessions. No hosted scheduling records, migrations, reset, or reseed were involved. Reports and screenshots are retained under ignored `work/run-planning-release/hosted-planning/`; documentation was finalized after deployment.

Both planning feedback cases were rerun successfully from an isolated copy of that exact deployed export after the preview timeout fix. The disposable database and test server stopped cleanly; concurrent workspace code was left untouched.

## 21 September — Compact workload override candidates

Override candidates now occupy compact yellow rows in the staffing drawer and session detail page. The warning icon and **Assign with override** label distinguish them from recommended PAs. Hover or keyboard focus displays the warning and an existing commitment; tapping the icon toggles the same explanation. Longer conflict lists show a count and remain fully available in the explicit review. The tooltip stays available while hovered, dismisses with Escape without closing the drawer, and moves above a low row when needed to fit the viewport.

**Assign with override** opens the full comparison and focuses its review heading. Existing and proposed school/date/time details remain visible alongside every conflicting commitment. Same-day confirmation remains red, weekly confirmation remains amber, and each required checkbox, reason, and reviewed policy hash is preserved. Cancel removes the form and restores focus to the candidate; pending saves disable it. Review keys include the session, PA, and policy hash, so changed workload information resets prior confirmations. The staffing drawer's keyboard trap now includes textareas and selects.

Independent GPT-5.6 Sol implementation, browser verification, and policy/accessibility review signed off with no remaining findings. The shared workspace passed 189 unit tests, lint, TypeScript, formatting, and a production build. A UI-only release was then assembled from the previous deployed snapshot plus the three staffing components and new override browser regression, preserving separate exact-scheduler work for its own release. That release passed its 175 unit tests, lint, TypeScript, and formatting checks. All three affected browser flows passed against its application source: progressive override review and persisted weekly assignment, normal staffing/publication, and the separate consecutive-same-school restriction. The existing day-spacing test required a test-only wait for removal to finish before navigating; its targeted rerun passed. Screenshots and accessibility checks cover compact, expanded, hovered, and mobile touch states.

Deployment `dpl_BzVqg2HwvoyFM7HKZZgppqKwKnmj` is Ready at [the protected test app](https://workshop-scheduler-test-5tofxtfok-bryanj1angs-projects.vercel.app/login). Vercel's production build passed. All 256 non-document files in the saved deployment export were verified. Eight hosted desktop/mobile states passed accessibility and overflow checks, with no captured application 5xx responses or browser exceptions; actual compact rows and the mobile tooltip were visually inspected. Hosted checks opened, inspected, and cancelled confirmations without scheduling mutations. No migration, reset, or reseed was performed. Evidence is retained under ignored `work/run-planning-release/hosted-overrides/` and the reviewed source under `work/vercel-run-planning-20260921-overrides/`.
