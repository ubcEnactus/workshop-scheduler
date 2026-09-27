# Workshop Scheduler — working agreement

Stack: Next.js 15 App Router, Prisma 6, Auth.js v5, Tailwind v4, and strict TypeScript.

## Start here

- Read `docs/DESIGN_BRIEF.md` before changing scheduling behavior.
- The brief describes the pilot we are building. The checked-in schema, migrations, and routes describe what exists today.
- Do not build new work on `Cycle`. Its removal must be the first scheduling migration, and it must preserve any data that matters.

## Product rules

- Schools and teachers are the only setup entities. Each teacher owns one implicit scheduling profile; `ClassSection.teacherId` is unique. Do not restore separate class creation, labels, multiple classes per teacher, or teacher transfers. Availability, exceptions, defaults, and run enrollment are managed through the teacher. See `docs/TEACHER_SCHEDULING.md`.

These rules describe the implemented run-planning contract. See `docs/IMPLEMENTATION_REVIEW.md` for validation and review status, and `docs/IMPLEMENTATION_PLAN.md` for the acceptance criteria.

- The admin controls the schedule. Only admins create or change workshops, assignments, publishing, cancellations, replacements, and completion state.
- Teachers are school-wide view-only. They provide weekly time blocks outside the app; admins record class availability with effective dates and exceptions. Named workshop runs have shared, inclusive Vancouver delivery windows. Automatic date suggestions fit availability and the window; admins can explicitly move one session outside the window with a recorded exception. Legacy candidates retain scope, and weekly reference rows require activation before authorizing dates.
- One representative class has one non-cancelled session per run. Combined classes use an admin note on the representative class, not new grouping logic. Another visit is another run, including a temporary one.
- PAs submit recurring availability and view published assignments. They do not accept, decline, or edit assignments.
- A workshop has a real date and time before staffing begins. **Auto-fill missing PAs** adds only the residual minimum to selected dated drafts; it never replaces existing PAs or creates, moves, or dates sessions. Manual and automatic staffing save directly to the private draft with operation-scoped Undo; there is no expiring proposal/apply stage.
- Planning starts with a named run/window and explicit class enrollment; calendar months are session views. No automatic monthly class obligations or cycle/term workflow. Use 15-minute scheduling increments while preserving legacy coverage and exact historical times.
- Automatic PA assignment requires full availability, at most one session per day and initially one per week. On every manual assignment screen, missing/partial availability and same-day/same-week workload are visible warnings only; clicking Assign/Add records the relevant exceptions without an override form, checkbox, separate reason or confirmation step. Same-day warnings remain prominent red; same-week warnings remain amber. Preserve per-assignment exceptions through publication and matcher reruns. Overlapping assignments remain blocked for both automatic and manual actions. The earlier prohibition on consecutive classes at the same school remains separate. Weekly capacity uses Monday–Friday in America/Vancouver and resets the following Monday; no rolling seven-day gap applies.
- Candidate counts separate recommended PAs from available PAs needing workload overrides; hard-blocked PAs count in neither group. Lifetime workload affects ranking only. Batch Ready requires a valid staffing preview; a failed heuristic search is not proof of an unavoidable shortage or required override. Warnings use text/icons as well as color.
- Monthly quotas are not assignment prerequisites. Prefer suitable PAs with fewer total assignments as soft fairness; any workload cap is separately configured. No per-run/title PA cap is implied. Automatic matching may leave a session unstaffed rather than break its rules.
- Auto-fill preserves every existing assignment and exception, including automatic assignments. Manual removals exclude that PA from auto-fill for the session until explicitly allowed/added again. Existing locks mean Auto-fill off; new manual edits do not auto-lock. Published/historical sessions are never draft auto-fill targets. Undo must revalidate restored assignments against current commitments and never overwrite subsequent edits or publication.
- Ready class sessions can publish individually or in a batch. Initial publication needs valid staffing; a later admin PA removal may leave a published session with a visible staffing deficit. Do not force cancellation to record a withdrawal. Communication remains manual for the pilot; teacher enhancements are low priority.

## Code rules

- Use Server Actions for mutations unless an external caller genuinely needs an API route.
- Call `requireRole(...)` from `@/lib/auth` as the first executable line of every protected page and Server Action.
- Validate every Server Action input with a Zod schema from `src/lib/schemas/` before using it.
- Access Prisma only from Server Components and Server Actions. Import the singleton from `@/lib/db`; only `prisma/seed.ts` may create a client.
- Do not use `any`. Accept `unknown` and narrow it.
- Create schema changes with `npm run db:migrate -- --name <descriptive_name>` and commit the generated migration. Never use `db push` for feature work.
- `User` and `School` are soft-deleted and must be queried with `deletedAt: null`. Scheduling records use lifecycle statuses and otherwise hard-delete.
- Keep teachers as `User { schoolId? }` until teacher-specific data justifies a separate model.
- Store concrete workshop instants in UTC and render or group them in `America/Vancouver`.
- `ClassMeeting` and `Availability` are recurring Vancouver wall-clock values: weekday `0…4` plus minutes from midnight. They are not `DateTime`s.
- Production email requires `AUTH_RESEND_KEY` and a verified `AUTH_RESEND_FROM`.

## Current handoff point

The app implements named runs, reviewed bulk class enrollment, coverage and waivers, effective recurring class/PA availability and exceptions, 15-minute planning, bounded staffing previews, lifetime fairness, explicit admin date/day/week exceptions, atomic reviewed edits, archive/reactivation, publication, and per-change communication tasks. Monthly quotas and rolling assignment gaps are retained only as legacy data; they never authorize or block assignment.

Cycle is removed. WorkshopSession maps to the existing Workshop database table to preserve IDs and history. All scheduling relationships go through ClassWorkshop; assignments point to sessions. There is one PA assignment type and no manager distinction. Read docs/CLASS_WORKSHOPS.md for migration and workflow details.

## Before handoff

Run:

```bash
npm test
npm run lint
npm run typecheck
npm run format:check
npm run build
```
