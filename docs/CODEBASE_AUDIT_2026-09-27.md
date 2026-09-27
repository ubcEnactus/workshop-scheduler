# Codebase audit — 27 September 2026

Follow-up: this is the pre-implementation audit snapshot. See [the usability version 2 review](USABILITY_V2_REVIEW.md) for subsequent fixes, verification, and concurrent changes to the teacher model.

The application has a sound scheduling core and substantial automated coverage. The main weakness is consistency across workflows: effective teacher ownership, overlap policy, and retry behavior are not applied uniformly. Targeted repairs and consolidation are appropriate; this review does not establish a need for an architectural rewrite.

This audit covers the current working tree, including existing uncommitted and untracked implementation files. Application source and migrations were not modified. Audit reproductions and their output are retained locally under `work/audit-2026-09-27/`, outside the normal test suites.

## Confirmed findings

All three findings are P2: normal-use correctness or recovery issues that should be addressed. No P0 or P1 issue was confirmed in the reviewed paths. That is not a comprehensive security certification.

### 1. Teacher removal and school changes ignore effective transfers

**Evidence:** `src/app/admin/teachers/actions.ts:98`, `:105`, and `:150`; `src/app/admin/classes/actions.ts:354`; `src/lib/scheduling/teacher-assignments.ts:16`.

The scheduling engine resolves a class's teacher from dated transfers. Teacher directory mutations instead use `classesTaught` or a direct `ClassSection.teacherId` query. A future transfer leaves that original teacher ID unchanged. There is no automatic rollover of that field when the effective date arrives.

**Reproduction:** Schedule a session after a future transfer to a teacher with no directly owned classes. Delete the incoming teacher, or move that teacher to another school. Both operations succeed. Loading the saved session then returns `activeClass: false` because its effective teacher is deleted or belongs to another school. The transfer itself remains active.

**Impact:** An ordinary directory edit can invalidate a reviewed host relationship and block staffing/publication. The same mismatch affects teachers whose future-dated transfer has already become effective. Original-teacher relationship counts can also remain misleading.

**Fix:** Introduce one effective-teacher dependency query for deletion and school changes. Check current ownership and pending, non-cancelled transfers within the scheduling transaction. Require reassignment or cancellation of those obligations before permitting the directory mutation. Preserve historical transfers rather than treating every past transfer as a permanent deletion blocker.

**Verification:** Two isolated PostgreSQL tests reproduced the deletion and school-change cases.

### 2. Teacher/class overlap policy still differs between screens

**Evidence:** `src/app/admin/class-workshops/[id]/page.tsx:148`, `src/app/admin/workshop-definitions/[id]/page.tsx:146`, `src/app/admin/classes/actions.ts:314` and `:484`. Compare `src/components/workshop-plan-content.tsx:98` and the intentional-overlap contract in `docs/DESIGN_BRIEF.md`.

The embedded planner permits overlapping teacher/class sessions, consistent with the brief. Other paths retain the earlier prohibition:

- The class-workshop page builds busy intervals from class and teacher commitments and removes those candidate times.
- Run coverage removes overlapping candidates and can label the same class **Needs class availability** while the embedded planner offers a valid date.
- Teacher transfer and transfer cancellation still reject teacher overlaps.

**Reproduction:** Give a class a single Monday 09:00–12:00 block, enroll it in a 180-minute run for that Monday, and retain a 10:00–11:00 session in another run. Run coverage says availability is missing, while the embedded planner offers 09:00. Separate action tests reproduce the transfer and cancellation blocks.

**Impact:** Admins receive contradictory instructions and lose valid scheduling or handover options depending on the entry point.

**Fix:** Centralize class-date eligibility and availability-to-coverage mapping. Remove teacher/class commitment exclusion from these callers under the current contract. Keep PA overlap and same-school consecutive-assignment restrictions separate and enforced.

**Verification:** One isolated server-component comparison and two action tests reproduced these differences. The existing browser suite already verifies that the primary planner permits intentional overlaps, which explains why its passing result does not cover the remaining callers.

### 3. Publication does not support the retry promise made by its UI

**Evidence:** `src/components/workshop-workspace.tsx:235`, `:267`, and `:491`; `src/lib/scheduling/draft-mutations.ts:47`; `src/lib/schemas/workspace.ts:6`.

The workspace saves publication commands in session storage and offers **Retry and check save** after an uncertain response. Draft edits, auto-fill, and Undo have operation receipts, but publication has no request key or receipt. It checks the original schedule hash and draft status on every invocation.

**Reproduction:** Publish a valid selection, then replay the identical input as if the successful response were lost. The first call succeeds; the replay reports that the schedule changed, although the session is already published. Only one publication event is created.

**Impact:** Data is not duplicated, but the recovery action reports failure after success and cannot distinguish its own completed publication from competing edits. Refresh eventually reveals the true state; the advertised reconciliation behavior is incomplete.

**Fix:** Add an actor-bound publication receipt keyed by request ID and payload hash. Return the original committed outcome for an identical retry, while rejecting key reuse with a different payload. Test a lost response followed by reload and retry through the browser.

**Verification:** One isolated PostgreSQL test reproduced the successful commit followed by the misleading retry result.

## Architecture assessment

The current monolithic Next.js application fits the pilot. Server Actions form the mutation boundary; scheduling helpers implement transactions and policy; Prisma provides persistence. Pure policy and solver modules are independently testable. There is no demonstrated need to introduce additional services.

**Strengths to preserve:**

- A source scan found all 27 protected page entry points and all 66 protected exported Server Actions start with `requireRole`. The separate preview-login action appropriately uses its own environment and origin gates.
- Authorization reloads the live, non-deleted user rather than trusting a stale session role or school.
- Zod schemas and strict TypeScript provide a consistent input boundary; ESLint enforces the prohibition on explicit `any`.
- Scheduling writes use a shared transaction lock. Versions, hashes, and operation receipts address distinct stale-state and retry concerns.
- Auto-fill computation happens outside the write lock, followed by locked revalidation. The fixed-team flow model separates proven feasibility from bounded improvement of partial results.
- Database migrations add real backstops, including one non-cancelled session per class workshop and availability ownership/duration constraints.
- Vancouver time conversion is centralized, and participant pages select and transform public data rather than passing unrestricted scheduling records into client components.

**Improvements, in priority order:**

1. **Share policy-derived read models.** The confirmed overlap and teacher findings show that pages and directory actions reimplement domain decisions. Extract effective teacher dependencies and class scheduling/coverage projections. Keep transport concerns such as redirects and revalidation in actions.
2. **Avoid duplicate Plan reads and projections.** The run page loads the run, active teachers, and schedule at `src/app/admin/workshop-definitions/[id]/page.tsx:50`. Its embedded `WorkshopPlanContent` loads those again, including `loadSchedule` at line 87. The parent also builds PA candidate rows and loads staffing history even for Plan. Pass a request-scoped read model to the child and load step-specific data only when needed. Duplicate work is confirmed by source; hosted latency impact was not measured in this audit.
3. **Keep the global lock, but observe its cost.** `scheduleTransaction` updates one settings row for every participating mutation, with a 15-second acquisition wait and a 20-second transaction timeout. This is a simple, useful correctness guarantee for the pilot. It also serializes unrelated workshop and PA writes. Add timing for lock wait and transaction duration before considering finer-grained locking; do not weaken concurrency safety merely to simplify code.
4. **Make server boundaries explicit.** Database access also exists in server helpers, although the working agreement literally mentions only Server Components and Server Actions. Clarify the permitted helper layer and enforce server-only imports around database/command modules. The audit did not find a current client database-access path; this is preventive architecture work.

## Code and visual style cohesion

Formatting and type discipline are consistent. Shared `PageHeader`, `Panel`, `Button`, `StatusBadge`, form classes, and the role shell provide a recognizable UI foundation. The stylesheet includes shared focus treatment and reduced-motion behavior. Browser accessibility and responsive checks passed.

Structural cohesion is weaker than formatting cohesion:

- `class-calendar.tsx` is 853 lines, `workspace-schedule.tsx` 831, `workshop-booking-form.tsx` 753, and `workshop-workspace.tsx` 735. Length is not itself a defect, but these modules combine command recovery, form state, warning presentation, and substantial markup. Extract a common command/reconciliation hook and focused UI sections along those responsibility boundaries.
- Manual PA warnings appear in `OverrideCandidate`, the workshop workspace, session staffing, and the calendar drawer, with overlapping but different data shapes. Reuse one warning/commitment presentation model to prevent day/week severity and exception explanations from drifting.
- Unused legacy UI remains: `PreviewStaffingEditor` and `QuotaTable` have no current source consumers. The old `suggestedSlots` helper is test-only and still uses 30-minute increments and busy-time exclusion. Retain required historical records and archive routes, but remove or clearly isolate unused interactive code and obsolete policy helpers. Do not remove the active date-preview matcher merely because the old staffing-proposal UI is retired.
- Brand color `#1e2a4a` appears 32 times in TypeScript/TSX. Semantic Tailwind theme tokens would make future palette changes consistent without requiring a broad redesign.
- Schema comments still describe `WorkshopDefinition` as reusable curriculum and recurring class meetings as never authorizing sessions. Those descriptions conflict with named runs and activated recurring availability. Correct them and keep historical release notes clearly separated from the current contract.

## Validation and limits

| Check                          | Result                                                                |
| ------------------------------ | --------------------------------------------------------------------- |
| Unit suite                     | 244 passed, 32 files                                                  |
| PostgreSQL integration suite   | 233 passed, 17 files                                                  |
| Browser suite                  | 87 passed, approximately 7.7 minutes                                  |
| Additional audit reproductions | 6 passed, confirming the defects described above                      |
| ESLint                         | Passed                                                                |
| TypeScript                     | Passed                                                                |
| Prettier                       | Passed before the report was added; report formatted separately       |
| Production build               | Passed                                                                |
| Migration/seed rehearsal       | All 19 migrations applied; standard runners seeded twice successfully |

The initial sandboxed database runner failed during operating-system user lookup before executing tests. Running the authorized disposable database tests outside that sandbox succeeded. No shared or production database was used.

The additional audit tests assert the observed defects, so their passing status does not mean those behaviors are correct. They are evidence for follow-up regression tests, not fixes. Local evidence is in `work/audit-2026-09-27/audit.test.ts` and `reproduction-results.txt`; these ignored files are not part of CI.

This was a source and local-runtime audit, not an exhaustive proof over every path. It did not re-audit package advisories, exercise the separate HTTPS preview-demo suite, verify hosted configuration or email delivery, or perform a hosted backup/restore rehearsal. Existing production-release gates in `docs/PILOT_RUNBOOK.md` remain separate.

## Recommended sequence

1. Repair effective-teacher lifecycle guards and unify the remaining teacher/class overlap callers; promote the reproductions into contract tests.
2. Give publication the same exact-retry guarantee as draft commands.
3. Consolidate scheduling read models and eliminate duplicated Plan loads.
4. Extract shared command recovery and PA warning components; retire unused legacy UI and correct schema comments.

These changes address the observed inconsistencies while preserving the well-tested policy and transaction core.
