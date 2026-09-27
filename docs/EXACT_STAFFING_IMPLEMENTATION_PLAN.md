# Exact automatic staffing implementation and validation plan

Status: implemented and tested by GPT-5.6 Sol on 2026-09-21, with independent review. See [implementation review and validation evidence](EXACT_STAFFING_IMPLEMENTATION_REVIEW.md).

## Outcome and scope

Replace the automatic matcher's greedy plus 20,000-state backtracking search with exact capacity-constrained matching for full minimum staffing. Ordinary automatic matching must finish the feasibility computation without a search-state cutoff. Preserve the existing one automatic session per PA per Vancouver Monday-Friday week; this work introduces no new PA workload restriction.

Keep dates, scope, protection, admin authority, publication requirements, hard eligibility, manual overrides, and soft lifetime fairness intact. Improve preview/apply transaction boundaries and test correctness, concurrency, performance, and UI behavior. No deployment, production data changes, schema migration, new hosting service, or solver service is expected.

The workspace already contains extensive uncommitted implementation work. Preserve it. Read AGENTS.md, docs/DESIGN_BRIEF.md, docs/CLASS_WORKSHOPS.md, and relevant current source before editing. This plan supersedes only the old automatic bounded-search implementation requirement in phase 6 of docs/IMPLEMENTATION_PLAN.md. It does not remove bounded manual-override feasibility checks.

## Current behavior to replace

- src/lib/scheduling/matcher.ts clears only mutable target assignments, tries greedy minimum/optional staffing, then recursively enumerates assignments and skipped sessions with a 20,000-state limit.
- assessAssignment in eligibility.ts owns eligibility; totalAssignments incorporates historical aggregate counts and changes represented in the current snapshot.
- Match proposals and persisted preview JSON contain searchBudgetReached. Old saved previews and callers must be handled deliberately.
- Match preview and apply currently call the solver under scheduleTransaction's shared scheduling write lock, whose transaction timeout is 20 seconds. The batch planner preview has already been moved outside an interactive transaction in the current working tree; preserve that change.
- Manual feasibility searches preserve the automatic partial plan and may explore weekly or same-day overrides. Their unsuccessful result is not proof that no manual arrangement exists.
- A local diagnostic using the current matcher measured 8 sessions/8 PAs at 27 ms and a 9 sessions/8 PAs same-week shortage at 4,147 ms with the 20,000-state limit. These synthetic local timings are a baseline, not deployment measurements or a general performance guarantee.

## 1. Build the exact automatic eligibility network

Implement a small, typed, deterministic in-process flow/matching module. Prefer a focused TypeScript implementation over adding a Python service, native dependency, or broad solver framework. Keep it pure and separately testable.

1. Clone the schedule; determine protected targets using the existing protectionReason contract. Preserve entire protected sessions, including partially staffed manual/locked sessions, exactly. Preserve all non-target assignments.
2. Clear only mutable automatic target assignments. Compute each PA's baseline lifetime count after this removal; do not double-count assignments from a rerun.
3. Build eligible PA/session connections once using the shared eligibility policy against fixed commitments. Never loosen availability, overlap, consecutive-school, active-person/class, capacity, hosting, or approved date-exception checks.
4. Group capacity by Vancouver Monday-Friday week, sharing the canonical policy week-key helper rather than creating a different UTC or rolling-seven-day definition. Do not silently authorize weekends or invalid cross-day sessions.
5. Each PA-week supplies at most one new assignment. Each eligible PA-week/session connection has capacity one. Each mutable session demands minPAs for the minimum-coverage phase. Existing fixed commitments remove eligibility according to current policy, including cross-run commitments and approved existing overrides.
6. Solve maximum flow to completion. Full flow equal to total demand is an exact witness for complete mutable minimum coverage. Smaller maximum flow proves a deficit under these fixed dates, fixed/protected commitments, scope, and automatic rules. A protected session already below its minimum is a separate protected deficit, not a claim that all targets are Ready.
7. Use stable ordering throughout. Record graph/candidate/augmentation counts useful for diagnostic benchmarks. Do not use a 20,000 or other arbitrary state cutoff in automatic feasibility.

The one-per-week rule eliminates pairwise conflicts among newly assigned sessions in the same week. Every connection still has to pass the fixed-commitment eligibility check. Explicitly test and document this reduction; if another implemented hard rule invalidates it, resolve the modeling issue rather than claiming exactness for an incomplete model.

References: [maximum flow](https://developers.google.com/optimization/flow/maxflow), [assignment with costs](https://developers.google.com/optimization/flow/assignment_min_cost_flow).

## 2. Preserve priorities and lifetime fairness

The priority order remains: sessions meeting minimum staffing, remaining minimum deficit, lifetime fairness, then optional staffing up to maxPAs. Never trade complete feasible coverage for fairness or optional staffing.

For complete minimum coverage, use deterministic minimum-cost matching/flow or an equivalent coverage-preserving method to prefer lower lifetime totals. A recommended model is source -> PA -> PA-week -> session -> sink, with increasing marginal assignment costs for each PA (baseline total + proposed assignment index). This accounts for multiple weeks together without making fairness an eligibility cap. Use safe integer costs and deterministic ties; avoid an unchecked huge multiplier for IDs or objectives.

Full minimum feasibility is exact. Choosing the partial plan with the greatest number of fully staffed sessions when full coverage is impossible is a different optimization problem; plain maximum flow does not prove that objective. Preserve the completion-first preference explicitly:

- Retain a deterministic valid completion-first seed as an incumbent.
- Use exact flow feasibility checks to choose and improve a set of fully covered sessions, then allocate remaining minimum places without breaking covered sessions. Compare candidates lexicographically by fully covered count and minimum deficit before fairness. A deterministic completion-first heuristic with flow-based repairs is acceptable for this secondary objective, matching the prior heuristic contract; do not introduce another factorial assignment enumeration or claim proven optimal partial-session coverage.
- Never return a partial plan worse in covered-session count/deficit than the retained seed. Test 4 PAs / two sessions needing 3 each: prefer 3+1 over 2+2. Test heterogeneous minima and shared candidate bottlenecks.
- Add optional staffing only after the chosen minimum plan is fixed. It must never undo minimum coverage, exceed maxPAs, or cause a workload violation. Update lifetime counts as optional assignments are added.

Keep full-coverage proof metadata distinct from partial-plan quality. A measured operational timeout or interruption, if needed, must return an explicit incomplete/unknown result; it must never be reported as proven shortage. Do not add a new low state ceiling under another name. Benchmark the polynomial automatic solver before selecting any application-level runtime guard. Existing request limits remain operational failures rather than mathematical results.

## 3. Results, explanations, and compatibility

Introduce explicit typed automatic outcomes such as complete, proven automatic shortage, and interrupted/unknown if interruption is supported. Include a stable shortage witness from the residual network/min-cut where practical: affected sessions, required places, reachable eligible PA-week capacity, and deficit. Test the witness independently against the input graph. At minimum, distinguish a demonstrated automatic minimum deficit from an unfinished computation.

Use product language: full coverage available; insufficient eligible PA capacity under automatic weekly rules; protected session needs an admin edit; or computation interrupted. Scope every infeasibility claim to the exact automatic model. Avoid displaying internal solver jargon in normal user flows.

- Update MatchProposal/result types, Zod persisted-plan parsing, matching review UI, batch planning status/reasons, and callers together.
- New normal automatic previews must not emit the old search-budget warning. Old stored preview JSON must either parse with conservative legacy semantics or require regeneration with a clear message. Never retrofit a proof onto an old heuristic result.
- Batch Ready requires valid staffing for every target; individual candidate counts and protected deficits do not qualify.
- Keep manual feasibility separate. A failed or budget-exhausted manual search cannot overturn a proved automatic shortage or prove a hard shortage across all allowed manual arrangements. Clearly distinguish automatic results from manual-review uncertainty.
- Preserve explicit red same-day and amber weekly confirmation flows. This implementation does not automatically grant overrides or fully redesign the manual feasibility algorithm.

## 4. Compute outside the scheduling write lock

Keep protected Server Actions authorized first and inputs validated before use. Use the existing singleton and authorized server-side data access patterns.

Preview should obtain a consistent schedule snapshot in a short read transaction (for example RepeatableRead without the scheduling write lock), then run graph construction and matching after the transaction ends. Save the reviewed plan, input hash, scope, owner, expiry, and a solver/plan version in existing JSON storage if needed. Do not hold a database transaction open during solver execution. If a simpler read strategy is chosen, demonstrate consistent-snapshot and stale-input correctness rather than merely assuming repeated reads are atomic.

Apply should use the exact stored reviewed plan, not recompute a potentially different plan inside the write lock. Under scheduleTransaction, recheck owner, expiry, idempotency, current scope, input hash, plan shape/version, exact target membership, PA uniqueness, protections, capacities, and every final assignment's eligibility. Then atomically apply only allowed changes. Reject stale/unsupported previews for regeneration. Never accept plan contents from form fields or trust a proof flag as authorization. Revalidate the final combined plan, including workload and non-target commitments.

Maintain hash stability and scope semantics. Protect against new relevant commitments, availability edits, archive/transfer changes, scope growth/removal, concurrent apply, and changes occurring while preview computation is running. Existing protected/manual assignments and assignment IDs for unchanged plans must survive reruns.

## 5. Meaningful correctness tests

Add an independent exhaustive reference checker used only for small generated cases. It must enumerate legal assignment sets directly and must not call the new flow solver. Compare full minimum feasibility, maximum filled minimum places from the flow primitive, and validity of returned plans across deterministic seeded instances. Test full-session partial-plan optimality only if the implementation actually claims it. Document the number/range of oracle cases and use fixed seeds.

Unit/regression matrix:

- Existing four-session greedy counterexample and a longer reassignment chain; full feasible coverage always recovered.
- Empty scope, no active PAs, zero candidates, exact supply=demand, 9 sessions/8 eligible PAs, and an eligible subset shortage despite enough PAs overall.
- Multiple PAs per session, heterogeneous min/max, duplicate assignment prevention, completion-first partial plans, and optional staffing never starving minima.
- Same-week sharing; Friday/next Monday reuse; cross-month weeks; Vancouver/UTC boundaries and DST; same-day and consecutive-school prohibitions; effective availability and dated exceptions; full-duration coverage and exact historical times.
- Manual/locked/published/completed/cancelled protection; existing approved overrides; protected deficits; non-target/cross-run commitments; allowed out-of-window date exceptions; no input mutation.
- Lifetime history, cancelled/removed exclusion, baseline removal on rerun, totals updated across proposed weeks, no quota/gap/title cap, fairness never sacrificing coverage, deterministic ties and input-order invariance where the contract permits.
- New outcome parsing and legacy preview compatibility; automatic proof vs manual unknown/budget status; independent shortage-witness validation if emitted.

Database integration matrix (isolated test database only):

- Preview writes no assignments and does not hold the scheduling write lock during computation; save/apply uses exactly reviewed PA IDs.
- Authorization-first, malformed/duplicate/out-of-scope plan rejection, expiry/ownership/version checks, and protected record preservation.
- Stale availability, new overlapping/cross-run commitments, archive/transfer/scope changes between snapshot and apply; competing previews and concurrent apply retries; atomic rollback and idempotency.
- Named run across months, selected sessions, saved batch and monthly scope; invalid scope never widens silently; matching and planning both consume the same exact feasibility outcome.

Browser coverage:

- Feasible preview -> review -> save -> publication prerequisites, preserving dates.
- Demonstrated automatic shortage displayed clearly, with valid partial draft save and no obsolete automatic budget warning.
- Protected deficit and manual override review remain visible and cannot be labeled Ready.
- Stale preview recovery and the relevant planning flow remain usable; existing role/accessibility expectations remain intact.

## 6. Performance and complete validation

Add a reproducible local benchmark (separate from flaky wall-clock unit assertions) for feasible and infeasible cases, restricted candidate subsets, several PAs per session, multiple weeks, fixed commitments, and historical totals. Include 9/8, a pilot-sized batch, and a documented stress case around the supported 200-session selected scope with 100-200 PAs. Do not infer that whole-run scope is capped at 200 if its schema is not. Record machine/runtime, graph size, construction time, solve time, total time, and whether full coverage was established. Run repeated measured samples after warmup. Use operation-count regression bounds in CI where useful and generous timing thresholds only as emergency hang detection.

Demonstrate that the 9/8 case returns a definitive automatic deficit and that feasible cases exceeding the old search's effective reach find complete coverage. Measure cost of building eligibility, not only the flow loop. Record partial-selection and optional-staffing costs separately when they dominate. Do not run million-state versions of the old solver just to benchmark it.

Run the required full checks on final code:

```text
npm test
npm run lint
npm run typecheck
npm run format:check
npm run build
npm run test:integration
npm run test:e2e -- tests/e2e/matching.spec.ts tests/e2e/planning.spec.ts tests/e2e/planning-feedback.spec.ts tests/e2e/staffing.spec.ts
```

Add other affected browser files and new cases as required by changed flows. Use scripts/with-test-db.mjs; it creates disposable local PostgreSQL clusters and must never be pointed at a live database. Record results and any environment limitations honestly. On Windows, sandbox errors from Node user-profile lookup or esbuild may require a scoped escalation for local test execution; never change application behavior to work around the sandbox.

## 7. Review and handoff acceptance

Update the relevant design/runbook/implementation references to distinguish exact automatic feasibility, heuristic partial-session prioritization, and bounded manual-review searches. Preserve historical audit records as history. Write docs/EXACT_STAFFING_IMPLEMENTATION_REVIEW.md with final architecture, actual guarantees, test counts/commands, benchmark data, review findings and fixes, and remaining limitations.

Completion requires: full automatic feasibility has no state budget; no scheduling policy change; valid deterministic plans; honest proof scope; completion-first partial behavior; lifetime fairness; short database write transactions with stale-safe exact reviewed-plan apply; all required checks and relevant integration/browser tests passing, or explicitly documented external blockers. Do not deploy or claim deployed verification. Report changed files and evidence to the parent agent for an independent review before final handoff.
