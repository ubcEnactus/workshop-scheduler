# Workshop Scheduler — frontend agent notes

Stack: **Next.js 15** (App Router) · **Prisma 6** · **Auth.js v5** (magic-link via Resend) · **Tailwind v4** · **TypeScript strict**.

Auth.js v5 ships from npm with a `-beta` tag but is the de-facto stable line — it's what every current tutorial assumes. We pin an exact beta version in `package.json` and only bump it deliberately.

## Project conventions (locked)

- **Mutations go through Server Actions**, never API routes (unless an *external* caller needs them).
- Validate every Server Action input with a Zod schema from `src/lib/schemas/`. No untyped `formData.get(...)` reaching the DB. See `src/lib/schemas/auth.ts` + `src/app/login/page.tsx` for the canonical example.
- **Every Server Action and protected page calls `requireRole(...)` from `@/lib/auth` on its first line.** This is the *only* authorization layer — there is no middleware/proxy guard. Don't skip it.
- Never query the DB from client components. Server Components or Server Actions only.
- No `any`. Use `unknown` and narrow. Lint rule enforces this.
- Don't modify `prisma/schema.prisma` without running `npm run db:migrate -- --name <descriptive_name>`. Migrations are committed.
- Soft delete (`deletedAt`) on `User` and `School`. When you query, **always filter `where: { deletedAt: null }`** — there's no global filter. Add new models with hard delete unless you have a specific reason; document the policy here if you choose soft delete.
- **`Teacher` is currently inlined as `User { schoolId? }`.** Reasoning: a separate table with one FK and no other fields is premature normalization. If it grows real fields (specialty, grades taught, hire date), extract to a `Teacher` table with `userId` FK — don't shoehorn teacher-only fields onto `User`.
- **All workshop dates/times are stored as UTC, rendered in `America/Vancouver`.** Use `Intl.DateTimeFormat` with `timeZone: 'America/Vancouver'` for display. Never construct a `new Date('2026-05-19')` and expect local TZ — it parses as UTC midnight.

## File layout

```
src/
  app/
    page.tsx                       # routes user to /admin /teacher /pa by role
    login/page.tsx                 # magic-link form (Zod-validated)
    login/check-email/page.tsx
    403/page.tsx
    admin/page.tsx                 # role-gated stub
    teacher/page.tsx               # role-gated stub
    pa/page.tsx                    # role-gated stub
    api/auth/[...nextauth]/route.ts  # Auth.js handler
  lib/
    auth.ts                        # NextAuth() config + requireRole/getCurrentUser
    db.ts                          # PrismaClient singleton
    schemas/
      auth.ts                      # add one file per feature
prisma/
  schema.prisma
  seed.ts
  migrations/                      # commit these
```

## Adding a new feature (suggested pattern)

```
src/app/<role>/<feature>/
  page.tsx        # async Server Component. First line: await requireRole(...)
  actions.ts      # 'use server' at top. Each action: requireRole + Zod parse + Prisma + revalidatePath
src/lib/schemas/<feature>.ts  # Zod schemas, export inferred types
```

Example skeleton for `actions.ts`:

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

- **Don't use `useEffect` for data fetching.** Use Server Components.
- **`cookies()` from `next/headers` is async in Next 15** — `const cookieStore = await cookies()`.
- **Resend `From` must be a verified-domain address in production.** Use `AUTH_RESEND_FROM` env, never hardcode. `auth.ts` throws at boot if `NODE_ENV=production` and `AUTH_RESEND_KEY` is unset.
- **Adapter session strategy is `database`.** If you switch to JWT, `requireRole` still works but `session.user.role` will need to come from a JWT callback rather than the DB user.
- **Prisma client is a singleton** — import `prisma` from `@/lib/db`, don't `new PrismaClient()` anywhere else (except `prisma/seed.ts`, which is a one-shot script).
- **`@prisma/client` types update on `prisma generate`.** It runs via `postinstall`, but if you change `schema.prisma` and your editor still shows the old types, run `npm run db:migrate` (or `npx prisma generate`) and restart the TS server.

## What's done

- Auth.js v5 magic-link via Resend (with dev console-log fallback)
- `requireRole` helper as the single source of authorization truth
- `User`, `School`, and NextAuth adapter tables
- Seed (1 admin, 2 schools, 2 teachers, 2 PAs)
- Stub landing pages for each role (`/admin`, `/teacher`, `/pa`) with sign-out
- CI: ESLint + Prettier + `tsc --noEmit` + `next build` on every PR into `dev`

## What's deferred (your team designs these)

- Availability submission (slot-tick vs free-form windows — undecided)
- Workshop / Cycle / Slot models
- Matching / assignment algorithm
- All feature pages beyond the role stubs
- UI library (shadcn / Radix / Headless — pick one)
- Notifications (email + in-app)
- Rate limiting on the magic-link route (currently none — fine for a closed beta, fix before going public)
- Tests (Vitest + Playwright — add when there's logic worth testing)
