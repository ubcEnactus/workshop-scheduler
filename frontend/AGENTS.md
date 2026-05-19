<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Notable Next 16 gotchas already encountered

- `middleware.ts` is renamed to **`proxy.ts`** in Next 16. Function is named `proxy` (default or named export). See `src/proxy.ts` and `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`.
- `cookies()` from `next/headers` is **async** — `const cookieStore = await cookies()`.
- `forbidden()` and `unauthorized()` helpers exist but are marked experimental — prefer `redirect('/403')` for now (see `src/lib/auth.ts`).

## Project conventions (locked)

- **Mutations go through Server Actions**, never API routes (unless explicitly external).
- Validate every Server Action input with a Zod schema from `src/lib/schemas/`. No untyped `formData.get(...)` reaching the DB.
- **Every Server Action and protected page calls `requireRole(...)` from `@/lib/auth` on its first line.** The proxy is an optimistic check only; never trust it for authorization.
- Never query the DB from client components. Server Components or Server Actions only.
- No `any`. Use `unknown` and narrow.
- Don't modify `prisma/schema.prisma` without running `npm run db:migrate -- --name <descriptive_name>`. Migrations are committed.
- Soft delete (`deletedAt`) on `User` and `School`. Other models: your call when you add them — pick a policy and document it here.
- **`Teacher` is currently inlined as `User { schoolId? }`.** Reasoning: a separate table with one FK and no other fields is premature normalization. If it grows real fields (specialty, grades taught, hire date), extract to a `Teacher` table with `userId` FK — don't shoehorn teacher-only fields onto `User`.

## File layout

```
src/
  app/
    page.tsx                       # routes user to /admin /teacher /pa by role
    login/page.tsx                 # magic-link form
    login/check-email/page.tsx
    403/page.tsx
    admin/page.tsx                 # role-gated stub
    teacher/page.tsx               # role-gated stub
    pa/page.tsx                    # role-gated stub
    api/auth/[...nextauth]/route.ts  # Auth.js handler
  components/
    role-shell.tsx                 # shared header + sign-out
  lib/
    auth.ts                        # NextAuth() config + helpers
    db.ts                          # PrismaClient singleton
    schemas/                       # add Zod schemas here (one file per feature)
  proxy.ts                         # session-cookie optimistic check; redirects to /login
prisma/
  schema.prisma
  seed.ts
  migrations/                      # commit these
```

## Adding a new feature (suggested pattern)

```
src/app/<role>/<feature>/
  page.tsx        # 'use server' (default for RSC). First line: await requireRole(...)
  actions.ts      # 'use server'. Each action: requireRole + Zod parse + Prisma + revalidatePath
src/lib/schemas/<feature>.ts  # Zod schemas, export inferred types
```

## Common pitfalls

- **Don't use `useEffect` for data fetching.** Use Server Components.
- **Resend `From` must be a verified-domain address in production.** Use `AUTH_RESEND_FROM` env, never hardcode.
- **Adapter session strategy is `database`.** If you switch to JWT, `requireRole` still works but `session.user.role` will need to come from a JWT callback rather than the DB user.
- **Prisma client is a singleton** — import from `@/lib/db`, don't `new PrismaClient()` anywhere else.

## What's done

- Auth.js v5 magic-link via Resend (with dev console-log fallback)
- Role-based proxy + `requireRole` helper
- `User`, `School`, and NextAuth adapter tables
- Seed (1 admin, 2 schools, 2 teachers, 2 PAs)
- Stub pages for each role

## What's deferred (your team designs these)

- Availability submission (slot-tick vs free-form windows — undecided)
- Workshop / Cycle / Slot models
- Matching / assignment algorithm
- All feature pages beyond the role stubs
- UI library (shadcn / Radix / Headless — pick one)
- Notifications
- Tests (Vitest + Playwright — add when there's logic worth testing)
