# Workshop Scheduler — agent notes

Stack: **Next.js 15** (App Router) · **Prisma 6** · **Auth.js v5** (magic-link via Resend) · **Tailwind v4** · **TypeScript strict**.

> Auth.js v5 ships under a `-beta` npm tag but is the de-facto stable line. We pin an exact beta in `package.json`; bump it only deliberately.

## Project conventions (locked)

- **Mutations go through Server Actions**, never API routes (unless an *external* caller needs them).
- **Validate every Server Action input with a Zod schema from `src/lib/schemas/`.** No untyped `formData.get(...)` reaching the DB. Canonical example: `src/lib/schemas/auth.ts` + `src/app/login/page.tsx`.
- **`requireRole(...)` from `@/lib/auth` is the first line of every Server Action and protected page.** It's the *only* authorization layer — there's no middleware guard. Don't skip it.
- **Never query the DB from client components** — Server Components or Server Actions only.
- **No `any`.** Use `unknown` and narrow (lint-enforced).
- **Schema changes go through `npm run db:migrate -- --name <descriptive_name>`**, and the migration is committed.
- **Soft delete (`deletedAt`) on `User` and `School` only** — always filter `where: { deletedAt: null }` (there's no global filter). New models hard-delete unless you document a reason here.
- **Scheduling models hard-delete.** `Cycle`, `ClassSection`, `ClassMeeting`, `Workshop`, `Assignment` track lifecycle via status enums (`CycleStatus`, `WorkshopStatus`, `AssignmentStatus`), not `deletedAt`. A `Workshop` exists because a class requested a session that cycle; the scheduler fills in `scheduledStart/End` + `Assignment`s.
- **`Teacher` is inlined as `User { schoolId? }`** — don't add a table for one FK. If teacher-only fields appear (specialty, grades taught, hire date), extract a `Teacher { userId }` table rather than bloating `User`.
- **Times are stored UTC, rendered in `America/Vancouver`** via `Intl.DateTimeFormat` with `timeZone: 'America/Vancouver'`. Don't `new Date('2026-05-19')` expecting local TZ — it parses as UTC midnight.
- **Recurring weekly slots are NOT instants.** `ClassMeeting` (and any availability model) store `dayOfWeek` (1=Mon…5=Fri) + `startMinute`/`endMinute` as **local** wall-clock minutes from midnight. They become a UTC instant only when combined with a concrete `Cycle` date. Never store one as a `DateTime`.

## File layout

```
src/
  app/
    page.tsx                       # routes user to /admin /teacher /pa by role
    login/page.tsx                 # magic-link form (Zod-validated)
    login/check-email/page.tsx
    403/page.tsx
    admin|teacher|pa/page.tsx      # role-gated stubs
    api/auth/[...nextauth]/route.ts  # Auth.js handler
  lib/
    auth.ts                        # NextAuth() config + requireRole/getCurrentUser
    db.ts                          # PrismaClient singleton
    schemas/auth.ts                # one schema file per feature
prisma/
  schema.prisma
  seed.ts
  migrations/                      # commit these
```

## Adding a new feature

```
src/app/<role>/<feature>/
  page.tsx        # async Server Component. First line: await requireRole(...)
  actions.ts      # 'use server' at top. Each action: requireRole + Zod parse + Prisma + revalidatePath
src/lib/schemas/<feature>.ts  # Zod schemas, export inferred types
```

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { mySchema } from '@/lib/schemas/my-feature'

export async function createThing(formData: FormData) {
  const user = await requireRole('ADMIN')
  const parsed = mySchema.parse({ name: formData.get('name') })
  await prisma.thing.create({ data: { ...parsed, createdById: user.id } })
  revalidatePath('/admin/things')
}
```

## Common pitfalls

- **Don't fetch data in `useEffect`.** Use Server Components.
- **`cookies()` from `next/headers` is async in Next 15** — `const cookieStore = await cookies()`.
- **Prisma client is a singleton** — import `prisma` from `@/lib/db`; never `new PrismaClient()` elsewhere (except `prisma/seed.ts`, a one-shot script).
- **`@prisma/client` types regenerate on `prisma generate`** (runs via `postinstall`). If your editor shows stale types after a schema change, run `npm run db:migrate` and restart the TS server.
- **Resend `From` must be a verified-domain address in production.** Use the `AUTH_RESEND_FROM` env, never hardcode. `auth.ts` throws at boot if `NODE_ENV=production` and `AUTH_RESEND_KEY` is unset.
- **Session strategy is `database`.** Switching to JWT keeps `requireRole` working, but `session.user.role` would then need to come from a JWT callback instead of the DB user.
- **The magic-link route has no rate limiting** — fine for the closed beta, add before going public.

## Not built yet — don't assume these exist

- **Availability model** is intentionally NOT in `schema.prisma` (slot-tick vs free-form windows undecided). **Owned by ENCT-027** — coordinate with that branch before adding it.
- **Matching / assignment algorithm**: reads `ClassMeeting` times + availability, writes `Workshop.scheduledStart/End` + `Assignment`s. Commute distance is a later extension via lat/lng on `School`.
