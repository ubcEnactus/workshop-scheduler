# Workshop Scheduler — agent notes

Stack: **Next.js 15** (App Router) · **Prisma 6** · **Auth.js v5** (magic-link via Resend) · **Tailwind v4** · **TypeScript strict**.

> Auth.js v5 ships under a `-beta` npm tag but is the de-facto stable line. We pin an exact beta in `package.json`; bump it only deliberately.

## Before changing code

- Read `docs/DESIGN_BRIEF.md` before changing scheduling concepts or flows.
- The brief is the target pilot. The checked-in schema, migrations, and routes describe current behavior.
- The target has no `Cycle` or `Term`. Planning moves through calendar months derived from workshop dates. Remove the current `Cycle` dependency as an explicit feature with a committed migration; do not mix it into unrelated work.

## Pilot authority (locked)

- Admins are the only role that may create or change workshops, schedules, assignments, cancellations, replacements, or completion state.
- PAs may submit availability. They cannot accept, decline, or change assignments.
- Teachers are view-only. Admins enter teacher schedules as `ClassMeeting`s and create each dated `Workshop` slot before PA matching runs.
- **Assign PAs assigns PAs only.** It must not create workshop slots or choose/change their dates and times.
- Each PA has an admin-set monthly workshop quota. Automatic matching balances toward those quotas and never exceeds one; assigning fewer is valid when constraints prevent safe staffing.
- Never automatically give a PA back-to-back assignments. Enforce the configured minimum gap between workshops, including workshops at the same school; leave the slot unassigned if necessary.

## Engineering rules (locked)

- Mutations use Server Actions, not API routes, unless an external caller requires an API.
- `requireRole(...)` from `@/lib/auth` is the first executable line of every protected page and Server Action. There is no middleware authorization layer.
- Validate every Server Action input with a Zod schema from `src/lib/schemas/` before using it.
- Query Prisma only from Server Components or Server Actions. Import the singleton from `@/lib/db`; only `prisma/seed.ts` may instantiate `PrismaClient`.
- Never use `any`; accept `unknown` and narrow it.
- Create schema changes with `npm run db:migrate -- --name <descriptive_name>` and commit the migration.
- `User` and `School` are soft-deleted; always filter them with `deletedAt: null`. Scheduling models hard-delete unless this file documents otherwise.
- Keep teachers as `User { schoolId? }` until teacher-only fields justify a separate `Teacher { userId }` model.
- Store concrete instants in UTC and render them in `America/Vancouver`.
- Derive workshop calendar months in `America/Vancouver`, not from the UTC month of the stored instant.
- `ClassMeeting` and `Availability` are recurring Vancouver wall-clock slots: `dayOfWeek` (0=Mon…4=Fri) plus minute-of-day integers. Never store recurring slots as `DateTime`.
- Production email requires `AUTH_RESEND_KEY` and a verified `AUTH_RESEND_FROM`; never hardcode either.

## Current implementation guardrails

- The live schema still uses `Cycle`; the target removes it entirely. Do not introduce `Term` or assume the calendar-month workflow exists before its migration lands.
- Teacher availability screens exist but are not scheduler inputs. The target matcher uses PA availability plus admin-entered class meetings.
- The current scheduler chooses workshop dates from class meetings. That placement behaviour is not part of the target: **Assign PAs** must assign PAs to admin-created, dated workshop slots only.
- The current scheduler also lacks travel constraints, manual overrides, and locking.
- Invite-only authentication and admin PA management are pilot blockers and are not implemented yet.

## Verify changes

Run the relevant checks before handoff:

```bash
npm test
npm run lint
npm run typecheck
npm run format:check
npm run build
```
