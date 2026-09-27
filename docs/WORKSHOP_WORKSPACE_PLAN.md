# Workshop workspace: Plan → Staff → Publish

Status: implemented, verified and deployed to the protected demo Preview, 23 September 2026. See [WORKSHOP_WORKSPACE_REVIEW.md](WORKSHOP_WORKSPACE_REVIEW.md) for actual release evidence. The sections below retain the accepted design contract.

## 1. Outcome and confirmed decision

An admin should open a workshop, see what needs doing, edit its private schedule and publish the ready sessions without managing a separate proposal lifecycle.

**Confirmed by the user:** staffing changes save immediately to the private draft, including automatic additions, with Undo. Publication remains a separate, deliberate action.

The rest of this document is the recommended implementation contract. It intentionally changes the old whole-session manual-protection and preview/apply workflow; it does not loosen assignment conflicts, participant visibility or automatic workload rules.

### Product principles

- One workshop context, one working draft, one publication boundary.
- Plan, Staff and Publish are views of the same sessions, not three separate copies or a mandatory wizard.
- The admin can work on ready classes without waiting for the whole workshop.
- Automatic actions add help without replacing admin work. Manual edits remain direct.
- Warnings explain consequences; blockers explain what must change. A preserved team is neither.
- Saved means saved on the server, not merely optimistically displayed in the browser.

## 2. Problems in the current implementation

1. Date planning shows a combined staffing simulation, but saving dates discards the simulated PA selections. A second staffing preview is then generated, edited, applied and separately published.
2. Staffing proposals expire after 15 minutes and reject all edits when their schedule hash changes. Ordinary planning is presented as a race against a timer.
3. A direct manual PA addition/removal, or an edited proposal, locks the entire session. The matcher also independently protects any session with manual assignments; unlocking alone is insufficient.
4. Protection reasons are mixed into staffing problems. A fully staffed locked session can increase Needs attention and trigger partial-proposal wording.
5. The matcher is a rebuilding algorithm: it clears mutable assignments, runs multiple repair paths and adds optional PAs up to the maximum. It cannot safely become additive auto-fill by changing its button label.
6. Workshop overview, date planner, preview, calendar drawer and publication review duplicate context and make the admin repeatedly choose the same workshop or navigate away from it.
7. Some date-planning copy still says weekly approval is required, although manual warnings no longer require the old override form. The new design must reconcile copy across all entry points.

## 3. Information architecture

### One workshop workspace

Use the existing workshop detail identity as the canonical destination, with URL-addressable Plan, Staff and Publish views. Keep the title, inclusive delivery window, Back to workshops and a compact progress summary visible throughout. Do not introduce a second workshop entity or change existing session IDs.

- **Plan:** included classes, class availability and saved/selected dates.
- **Staff:** dated draft sessions, their current teams and inline staffing tools.
- **Publish:** current readiness checks and one final publication action for selected sessions.

These are freely navigable views. Published sessions remain available from the workshop, but their official-change actions remain distinct from private draft staffing. Completed/cancelled history and Not required classes are retained in a secondary section, not squeezed into the planning statuses.

### Navigation and scope

- Default to the next useful view on first entry; thereafter preserve the requested view, class, selection and filters in the URL.
- Inside a workshop, never ask the admin to choose that workshop again.
- Show the entire delivery window across months. A calendar month is a viewing filter, not a staffing or publication boundary.
- Global Calendar remains a cross-workshop view and deep-links into the same editors/services.
- Secondary school/PA availability detours return to the exact workshop/class context and retain unsaved date choices.
- Auto-fill and publication show their explicit target count. Filters must never silently broaden the mutation scope. Freeze selected session IDs when starting an operation; newly added sessions do not join it mid-flight.
- Workshop creation remains closed unless Create workshop is selected. Deletion remains in the secondary workshop menu with its existing safeguards.

### Visual hierarchy

Use a compact header, three navigation items and one primary action for the active task. Replace the status-card wall with a short summary such as “2 need dates · 3 need PAs · 4 ready to publish.” Each number filters the relevant rows.

Each class/session row shows school/class, date/time, team, one clear next action and relevant issues. Teacher contact and secondary details expand on demand. Desktop can use a table; mobile uses stacked cards without a horizontally scrolling staffing comparison.

Staffing should show one team list, not Current PAs and Proposed PAs containing the same names. Published/unchanged sessions are collapsed or filtered out of the default staffing work queue, but remain accessible.

## 4. Plan view: dates without a second staffing workflow

1. Add classes on demand; keep every included class visible, including those lacking availability or dates.
2. Select dates using the existing class availability and 15-minute start increments. Retain exact historical/off-grid times unchanged.
3. Run a debounced, read-only combined staffing check after date selections settle. Ignore out-of-order responses and bind results to the exact selection revision. Provide an explicit Retry when the check fails; do not leave an indefinite spinner.
4. Show a compact result: “Staffing looks feasible,” “Automatic staffing has a shortfall,” or “Staffing not checked.” Explain limited backup coverage on expansion. Candidate names are optional diagnostic detail, not presented as saved assignments.
5. **Save dates & continue** saves only the dated private sessions and opens Staff focused on those sessions. State “PAs are added in Staff.” Keep an optional Save dates action when the admin wants to stop there.

Do not silently turn a staffing simulation into assignment writes. Dates may still be saved with a staffing shortage or failed feasibility check if their own hosting/date rules are valid; clearly show that staffing remains unresolved. On save, revalidate actual date/hosting inputs and refresh the feasibility display as necessary. A stale staffing check alone must not erase selected dates or claim readiness.

Scope remains date selection, not automatic date generation. No global date optimization or automatic movement of saved/published sessions is added.

Editing a saved draft's date is an explicit complete-form save, not autosave on every time-field keystroke. Revalidate its whole existing PA team atomically, display any changed warnings, retain the existing class/date-window exception flow and never silently remove a PA. Published date edits continue through the official change review.

## 5. Staff view: actual draft teams

### Direct manual editing

- Add/remove acts immediately on the private draft. Keep the editor open, preserve scroll/focus and refresh relevant counts/candidates after success.
- Show concise “Saving…”, “Saved to draft” and failure states. Serialize dependent edits on the same session so a second click cannot use a stale version from the first.
- Drag/drop may remain as an enhancement; ordinary Add/Remove buttons and keyboard operation must provide the complete functionality.
- Availability and day/week warnings remain visible and permit direct selection. No override form, checkbox or separate reason returns.
- Overlap, invalid/inactive participants or hosting, maximum capacity and the existing consecutive-school restriction remain real blocks.
- Existing assignments retain their IDs, source and exception metadata. New manual choices record applicable exceptions server-side as today.
- A later availability change is not silently accepted on an older assignment. Show the changed warning and provide a direct **Keep PA** action where reaffirmation is required; no override dialog or reason. Revalidate current information at that action.
- New manual edits do not automatically freeze the whole session.

### Auto-fill missing PAs

Use **Auto-fill missing PAs**, not Suggest PAs, because this action saves actual draft assignments. Supporting text: “Adds PAs to meet minimum staffing. Existing teams and dates stay unchanged. Only admins can see drafts.”

Recommended contract:

1. Operate on explicitly scoped, eligible draft sessions with a staffing deficit.
2. Preserve every existing assignment, whether manual or automatic, including its identity and exceptions. Preserve all non-target commitments.
3. Add only enough PAs to reach each session's minimum, not its maximum. For a 2–4 target, 2 or 3 PAs already means no automatic addition; admins can add optional PAs directly.
4. Apply full availability and automatic day/week rules. Never grant manual exceptions automatically, move dates, delete a PA or rebalance another session.
5. Solve the remaining minimum demand across all targets together. Retain exact full-minimum feasibility and honest completion-first partial behavior; a failure or timeout is not proof of a shortage.
6. If only some places can be filled, save that valid partial result and show “Added 5 PAs; 2 sessions still need staffing,” with direct links to the gaps. All computed additions commit atomically; partial staffing is not partial transaction failure.
7. If nothing can be added, make no assignment writes and explain why. Distinguish no available capacity, sessions excluded from auto-fill, already staffed and an interrupted check.
8. Show a result summary with Undo. Do not route to another review/apply page.

Existing fixed teams can make full coverage impossible even if rebuilding every team would solve it. Say “Could not fill all gaps while keeping existing teams.” Do not label this a shortage across all possible schedules. Rebalance/replace-all is not part of this release.

### Intentional removals and existing locks

Preserving admin choices includes removals, not just additions:

- When an admin removes a PA, remember that PA as excluded from auto-fill for that session. Manual Add/Undo can restore them; a small secondary control can allow them to be suggested again. Do not silently refill with the person just removed.
- These exclusions affect automatic candidate selection/feasibility only, not global PA availability or the ability to add the person manually. Include exclusions in automatic freshness checks and display their effect when they explain an unfilled place.
- Allow **Exclude session from auto-fill** in secondary controls for deliberately incomplete or empty teams. Always show “Auto-fill off” on excluded draft rows; this is neutral information, not an error. Turning it back on never assigns someone by itself.
- Preserve existing `locked: true` draft sessions conservatively as Auto-fill off. The database does not reliably distinguish an explicit old lock from an automatically created one, so do not infer that all old locks can be erased.
- Replace Unlock with **Allow auto-fill**. Under the new additive operation, manual assignments no longer independently prevent filling the remaining places. The existing team is still preserved.
- Published/history status always excludes a session from draft auto-fill regardless of any flag.

## 6. Save, Undo and concurrency

### One persisted working state

Normal staffing reads/writes real DRAFT assignments. There is no user-managed proposal, Save staffing button, preview countdown or session timeout. Opening a page, inspecting candidates or running date feasibility checks does not mutate the schedule.

### Undo is a compensating edit, not a reset

- Record each staffing operation with a unique request key, actor, exact scope, affected assignment IDs/deltas, relevant exclusion/auto-fill changes and resulting session versions.
- Undo is available in the success message and recent draft activity, so it does not disappear merely because a toast times out or the page reloads.
- Undo automatic fill removes only the additions from that operation. It never restores a whole historical schedule snapshot.
- Undo removal re-adds the removed PA only after current eligibility/capacity validation; it also restores that operation's prior exclusion state.
- Undo is all-or-nothing across the operation and is rejected if affected sessions were subsequently changed, published or otherwise no longer match the recorded post-state. Explain which session changed; do not erase a colleague's newer work.
- Restoring an assignment preserves its recorded exception metadata only where still applicable. A newly introduced warning must be displayed and deliberately accepted through the normal direct manual action, not silently waived by Undo.
- Retrying the same operation or Undo must be idempotent and produce no duplicate rows/audit events. Preserve unaffected assignment identities; restored deleted assignments may require a new assignment ID with an audit link to the original.
- Reusing a request key with a different actor or payload is an error. Undo auto-fill does not create manual exclusions; Undo Add/Remove restores that operation's previous exclusion state. Restore validation includes commitments on other sessions, not merely the edited session's version.

### Revalidation replaces the timer

- Manual commands use current session version and policy data. If warning/conflict details have changed, refresh that row and preserve the admin's editing context instead of discarding the whole workspace.
- Auto-fill reads a consistent snapshot, computes outside the scheduling write lock and rechecks scope, versions, commitments and eligibility inside a short serialized transaction before writing.
- If the snapshot changed, recompute at most once for the same fixed scope; because Auto-fill authorizes generating current additions rather than approving specific names, this is not a silent replacement of a reviewed team. If changes continue, save nothing and offer Retry with the latest context.
- Network uncertainty uses the operation key to reconcile whether a save already committed. Never display success or apply a naive local rollback without checking the authoritative result.
- Publish is disabled while relevant edits are pending or unreconciled. Automatic background refresh never mutates teams.

## 7. Publish view and lifecycle

Keep the primary lifecycle vocabulary **Draft** and **Published**. Completed/cancelled history and delivery waivers still exist; do not collapse them into those two states.

Readiness is a derived, current assessment, not a second lifecycle and not just a PA count:

| Display                | Meaning                                              | Next action                        |
| ---------------------- | ---------------------------------------------------- | ---------------------------------- |
| Needs a date           | Included class has no dated session                  | Choose date                        |
| Needs 1 PA             | Draft is below minimum                               | Add PA / auto-fill                 |
| Resolve a conflict     | Current hard block or unreviewed changed eligibility | Open the affected row              |
| Ready to publish       | Current full publication checks pass                 | Select for publication             |
| Published              | Official participant-visible session                 | Manage changes                     |
| Published · needs 1 PA | Later withdrawal left a deficit                      | Repair staffing without cancelling |

Accepted manual warnings remain visible but do not become blockers. Auto-fill off and preserved teams do not increase Needs attention. A staff count between min/max is not alone sufficient to declare Ready.

Publication flow:

1. Publish view shows ready drafts and a compact, expandable list of unfinished sessions with reasons. Offer Select all ready plus per-session selection; nothing is pre-authorized outside the visible scope.
2. The view itself is the final review: class/date/time/current PA names and material warnings. Do not add another generic Are you sure dialog.
3. **Publish N sessions** revalidates the exact reviewed selected teams/versions and commits them atomically. If one changed or is blocked, publish none of that selection, preserve selection where valid and show the affected row. Never silently publish a smaller subset than the button promised.
4. Other sessions remain private drafts. Existing published sessions are never silently republished or edited through draft controls.
5. Explain once at the final action: “Visible to assigned PAs and school teachers. No email is sent.” Then surface Contact school and PAs / Record communication using the existing per-change tracking.

Published team/date changes retain the existing explicit review and ordinary change reason. Draft Undo cannot reverse publication. Completion, cancellation and communication remain separate operations.

## 8. Implementation architecture and migration

### Reuse and consolidate

- Extend the existing workshop detail workspace, planning form, staffing editor and publication components. Avoid a parallel new scheduling app or a new participant-facing design.
- Put derived readiness, manual command validation and additive auto-fill in shared scheduling services used by workshop workspace, calendar drawer and session detail. Keep role authorization as the first executable line of protected pages/actions and Zod validation at every mutation boundary.
- Introduce an explicit fixed-team/additions representation for the solver. All full-feasibility, greedy seed and repair paths operate on additions only. Audit every assignment-clearing path; do not patch only the initial matcher loop.
- Adapt the independent small-case oracle to pinned teams, residual minimum demand and excluded PAs. Keep cross-run capacity and lifetime aggregates correct without double-counting existing assignments.
- Use an explicit draft operation record for idempotency/results/Undo, connected to existing per-session audit history. Prefer a narrow operation model over repurposing expiring MatchingPreview JSON as the authoritative draft.
- Add durable per-session PA auto-fill exclusions. An explicit auto-fill-disabled flag may initially map the existing locked storage conservatively; name the new service/UI semantics clearly and ensure no legacy matcher interprets manual provenance as a whole-team freeze in the new flow.

### Compatibility and data safety

- Create and commit generated Prisma migrations for added persistence using the repository migration workflow; do not use db push or seed/reset shared data.
- Preserve session IDs, assignments, existing locks, exception flags/reasons, publication timestamps, exact dates, audit/communication history and the database table mapping.
- Keep old proposal records during transition. Old preview links must show a clear archived/read-only proposal summary and link to the current draft; do not silently apply or erase pending proposals, or revive stale proposals as current assignments. Importing old unsaved proposals is deferred unless explicitly implemented with a fresh diff and revalidation.
- Redirect normal old staffing entry routes into the canonical workshop Staff view while preserving workshop/session/batch context. Update all links together. Retire legacy preview write actions so bookmarks cannot invoke the old replacing matcher after the new behavior ships.
- Keep published-change review routes and their safeguards operational. Do not remove the exact feasibility engine used by date planning when removing the old preview UI.
- Roll out schema compatibility before switching writes. A rollback after new unlocked manual drafts exist must not reactivate the old rebuild path; disable that path or keep an additive-compatible backend until rollback safety is verified.

## 9. Delivery sequence

1. **Policy and state contract:** agree this design; update the current brief/runbook to distinguish add-only draft staffing from historical preview/rebuild behavior. Define typed readiness, operation scope and Undo results. Record baseline tests before replacing their expected contracts.
2. **Mutation and persistence foundation:** operation journal, exclusions, conservative lock mapping, shared direct editing and safe Undo. Add migrations and integration tests before wiring the UI. No automatic unlocking or data rewrite.
3. **Additive staffing engine:** pinned teams, residual minimum solver, exclusions, idempotent transactional auto-fill and exact/partial-result explanations. Validate against the independent oracle and realistic performance fixtures.
4. **Workshop workspace:** Plan/Staff/Publish navigation, retained context, direct editable teams, save indicators and Undo, min-only auto-fill. Date feasibility becomes compact/background with error recovery. Keep all existing entry points on shared services.
5. **Publication and compatibility:** one final Publish view, fresh readiness, atomic selected publication, communication handoff, legacy links/proposals and old-write-path retirement. Remove protected/expired/partial-proposal vocabulary from normal flows.
6. **Independent review and full validation:** separate UX/data-safety and solver/concurrency reviews; resolve findings, run the full suite and inspect actual desktop/mobile screens.
7. **Demo release:** only after implementation is requested and release checks pass, take a verified demo backup, apply migrations, deploy the reviewed source export, smoke-test the new flow and compare preserved data. No production promotion or reseed.

Do not deploy intermediate screens backed by mixed old/new staffing semantics. Each engineering slice can be tested independently; release the coherent workflow together.

## 10. Acceptance and test plan

### Unit and independent algorithm checks

- A 2–4 session with 3 PAs is unchanged and has no lock/partial warning. A session with 1 PA receives at most 1 automatic addition.
- Every solver path preserves pinned manual/automatic teams, metadata and input immutability; already-assigned PAs cannot create duplicate edges or assignments.
- Exhaustive small-instance oracle covers pinned teams, residual demand, manual exclusions, occupied weeks, scarce candidates and multi-session partial fills. Proven shortage is scoped to fixed teams, not hypothetical reassignment.
- Automatic full-duration availability/day/week rules remain strict, with Monday–Friday Vancouver boundaries, Friday/next Monday, cross-month weeks and DST. All real hard conflicts remain enforced.
- Fairness uses lifetime totals plus only new deltas. Optional maximum staffing does not consume PAs in the new fill operation. Exact historical times and approved date exceptions remain valid.
- Readiness/warning/blocker classification does not equate preserved/locked with invalid; accepted manual warnings and later newly changed eligibility are distinguished.

### Database and migration checks

- Legacy locked/manual/published/completed/cancelled records and existing assignment IDs/flags/history survive migration unchanged. Allow auto-fill affects only the chosen draft's participation, not its existing team.
- Manual add/remove/keep, auto-fill, exclusion changes, Undo and publication validate role, Zod inputs, exact workshop membership and current versions. Teacher/PA access is denied.
- Double clicks, retries and two-admin races are idempotent or rejected safely; every operation and its audit events commit atomically.
- Undo after reload works; Undo after subsequent edits/publication fails without erasing them. Undo removal revalidates eligibility and exclusions; batch Undo cannot silently partially apply.
- Snapshot changes during solving cannot write stale assignments. Computation runs outside the write lock; bounded retries cannot spin indefinitely.
- New availability, closure, teacher transfer, archived accounts, cross-run commitments and changes to min/max are checked at the correct boundary.
- Partial valid auto-fill persists only its declared additions. No-op fill writes no assignments; runtime failure makes no schedule changes. Repeated fill after minima are met is a no-op.
- Drafts remain invisible to participants; publishing the exact chosen ready subset changes visibility but sends no email. One stale/invalid selected session prevents the entire selected publication.

### Browser, accessibility and recovery

- Open workshop → choose dates → save dates → auto-fill → manually adjust with visible warnings → Undo → publish a subset, without reselecting the workshop or managing a preview.
- Navigate away/reload after each saved staffing operation: the actual draft persists. Advance the test clock beyond 15 minutes: staffing remains editable and saved data remains intact.
- Verify slow/double clicks, keyboard and drag alternatives, pending-state blocking of publish, failed requests, uncertain saves and retry reconciliation. No stale-version race between sequential edits.
- Preserve date choices across weeks, months and availability detours. Stale background feasibility responses cannot overwrite the newest result or be labeled Ready.
- Existing auto-fill-off sessions remain editable and are never yellow errors just for being excluded. Enabling fill on a partially manual team adds only missing PAs. Removed PAs are not silently re-added.
- Published deficits stay visible and repairable without cancelling; published edits use their existing review, not private-draft autosave.
- Old preview links remain intelligible and do not mutate anything. Normal legacy staffing links land in the right workshop/class view.
- Test 390px mobile and desktop, no page/dialog overflow, accessible names and announcements, focus restoration and no color-only warnings. Inspect rendered layouts, not just snapshots or source strings.
- Confirm create-workshop-on-demand, cancellation/history, communication tasks and role privacy remain intact.

Run all repository handoff gates, the full isolated PostgreSQL integration suite and the full browser suite for this cross-cutting change. Do not weaken existing preservation/privacy/conflict assertions merely to fit new button names; deliberately replace only obsolete preview, expiry, whole-team-lock and max-fill expectations with the new contract.

## 11. Explicit non-goals

- No automatic date selection/movement, travel routing, external calendar sync, participant acceptance flow or email delivery.
- No automatic team rebuilding/rebalancing or overwrite-all action.
- No loosening of overlap, inactive/hosting/capacity or consecutive-school blocks; no new PA run/title quotas.
- No global redesign of school, teacher or PA management.
- No timer on normal private draft staffing; unrelated authentication/session security remains unchanged.
- The user's subsequent execution request authorizes this implementation and demo release after verification; no production promotion or shared database reset is in scope.

## Original planning review

This plan was informed by independent read-only UI/state-flow and algorithm/test reviews. Both identified the same critical distinction: removing the preview page is insufficient; the rebuild matcher, implicit whole-team locks and save/Undo boundaries must change together. Their pinned-team, scope, publication-readiness, exclusion and cross-session Undo findings are incorporated above. The original planning pass changed only this document; subsequent implementation and test evidence is recorded in [the workspace review](WORKSHOP_WORKSPACE_REVIEW.md).
