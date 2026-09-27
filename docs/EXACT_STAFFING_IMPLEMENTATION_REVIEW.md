# Exact staffing implementation review

Date: 2026-09-21

## Architecture and guarantees

Automatic staffing now builds a deterministic in-process capacity network after removing only mutable automatic target assignments. Shared eligibility remains authoritative for active records, hosting/date approval, full-duration availability, overlap, consecutive classes, and fixed commitments. Each eligible PA/week node has capacity one using the canonical Vancouver Monday–Friday week key. Source marginal costs prefer lower lifetime totals without limiting eligibility.

Min-cost maximum flow runs to completion. Flow equal to mutable minimum demand proves full mutable coverage; a smaller flow proves the reported global deficit for the current target set, fixed dates, protected and non-target commitments, and automatic rules. Protected target deficits are reported separately and prevent all-target readiness. There is no automatic search-state cutoff.

When full coverage is impossible, a deterministic completion-first seed is retained. Flow feasibility selects repairable fully covered sessions and an additional residual flow fills remaining minimum places without taking capacity from those sessions. The result is never lexicographically worse than the retained seed by covered sessions and then deficit. This secondary selection is heuristic and does not claim globally optimal completed-session count. Optional staffing is added only afterward.

Preview loads a repeatable-read snapshot, ends the transaction, computes the plan, and saves a versioned reviewed plan. Apply takes the scheduling write lock, reloads and hashes the current scope, strictly parses plan version 2, checks exact target membership, duplicates, protections, and PA choices, then validates every proposed automatic assignment with strict automatic eligibility before any writes. It applies the stored plan rather than solving again. Existing unchanged assignment rows are preserved. A concurrent change makes the preview stale.

Legacy previews do not acquire proof status. Their old plan shape is rejected with a request to generate a new preview. Manual same-day/weekly feasibility remains a separate bounded search; its budget result cannot weaken or broaden the automatic proof.

## Correctness evidence

- Unit suite: 189 tests passed across 29 files, including exact-flow reassignment, deterministic fairness, weekly capacity, Friday/next-Monday reuse, protected records, completion-first `3+1` behavior, optional staffing ordering, purity, and a `2,147,483,647` declared-demand regression that verifies graph size is bounded by real PA/week capacity.
- Independent exhaustive oracle: 240 fixed-seed generated policy fixtures, 17,318 enumerated legal leaves, and 63 full-feasible cases. It independently enumerates PA/week assignments and found zero full-feasibility, validity, weekly-uniqueness, marginal-fairness, proof-metadata, purity, input-order determinism, partial-covered-count, or retained-seed deficit mismatches. A durable 120-case oracle also runs under `npm test`.
- Stored previews use strict Zod parsing and an explicit plan version. Apply rejects missing, extra, duplicate, protected-changed, stale-hash, and automatically ineligible contents through shape and fresh policy validation.
- Integration coverage interleaves an availability mutation after solver completion but before the preview row is inserted; the old reviewed choice is saved, apply rejects the hash as stale, and no assignment is written. A separate two-PA case replaces the stored reviewed choice with another valid PA and proves apply uses that exact reviewed set rather than recomputing.

## Performance

Eligibility is constructed once per automatic preview and reused by full feasibility and partial repair checks. Staffing demand is represented as numeric capacities; no array or edge is expanded by `minPAs`. Solver diagnostics record nodes, edges, and augmentations.

`npm run benchmark:staffing` ran on Windows with Node 24.21.0 after one warmup and five measured samples. Whole-matcher results, including eligibility construction and partial selection, were:

| Scenario                                              | Graph                                        | Samples    |
| ----------------------------------------------------- | -------------------------------------------- | ---------- |
| Same-week 9 sessions / 8 PAs, proved shortage         | 27 nodes, 97 edges, 8 augmentations          | 6.7–8.5 ms |
| Dense same-week 60 sessions / 30 PAs, proved shortage | 122 nodes, 1,920 edges, 30 augmentations     | 341–353 ms |
| Pilot 40 sessions / 50 PAs, minimum 2                 | 492 nodes, 2,840 edges, 80 augmentations     | 33–41 ms   |
| Stress 200 sessions / 150 PAs / 40 weeks              | 6,352 nodes, 42,200 edges, 200 augmentations | 827–919 ms |

The benchmark reports whole-matcher time and flow operation counts. It does not separately instrument eligibility construction versus solve time; that remains a profiling improvement rather than a correctness limitation.

## Validation

Validation completed: `npm test` (189), `npm run test:integration` (178), and all six affected Playwright scenarios passed using disposable local data. Browser coverage includes the matching-review shortage route: proof wording, absence of the old budget warning, partial-draft persistence, unchanged dates, and blocked publication. `npm run lint`, `npm run typecheck`, `npm run format:check`, and `npm run build` passed. No deployment or production data operation was performed.

## Limitations

- Completion-first partial-session selection is deterministic and seed-preserving but heuristic; only full mutable minimum feasibility and maximum filled places in an individual flow solve are exact.
- Manual override searches retain their existing bound. A failed or interrupted manual search is not proof that no reviewed override arrangement exists.
- The shortage metadata reports the full mutable target set, global required places, maximum filled places, and deficit. It is not presented as a Hall-subset or manual-shortage proof.
- Operational request/database timeouts remain possible infrastructure failures and are not converted into mathematical shortage outcomes.
