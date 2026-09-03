# Workshop Scheduler — working agreement

Stack: Next.js 15 App Router, Prisma 6, Auth.js v5, Tailwind v4, and strict TypeScript.

## Start here

- Read `docs/DESIGN_BRIEF.md` before changing scheduling behavior.
- The brief describes the pilot we are building. The checked-in schema, migrations, and routes describe what exists today.
- Do not build new work on `Cycle`. Its removal must be the first scheduling migration, and it must preserve any data that matters.

## Product rules

- The admin controls the schedule. Only admins create or change workshops, assignments, publishing, cancellations, replacements, and completion state.
- Teachers are view-only. They provide schedules outside the app; admins record those schedules as class meeting times.
- PAs submit recurring availability and view published assignments. They do not accept, decline, or edit assignments.
- A workshop has a real date and time before matching begins. **Assign PAs** only staffs existing workshop slots; it never creates, moves, or dates them.
- Planning follows calendar months. There is no cycle or term workflow.
- Automatic matching respects PA availability, monthly quotas, and a configurable gap between assignments. It may leave a workshop unstaffed rather than break a constraint.
- Admin edits and published work must survive a matcher rerun.

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

The app currently has invite-only magic-link auth, admin management for schools, teachers, PAs, classes and class meeting times, PA availability, and read-only PA/teacher dashboards.

The obsolete cycle and schedule screens have been removed, but the legacy `Cycle` relationship and old scheduling statuses remain in Prisma until a developer can create and verify the database migration. Do not expose that legacy model in new UI. The next scheduling feature should replace it with admin-created dated workshops, then add monthly quotas, assignment gaps, locking, and publishing in that order.

## Before handoff

Run:

```bash
npm test
npm run lint
npm run typecheck
npm run format:check
npm run build
```
