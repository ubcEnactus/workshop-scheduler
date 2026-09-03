# Workshop Scheduler

An admin-led scheduling tool for assigning UBC student volunteers (PAs) to school workshops across the Lower Mainland.

Read [the pilot brief](docs/DESIGN_BRIEF.md) before changing scheduling behavior. In one line: admins create dated workshop slots, then assign available PAs to them. Teachers are view-only and PAs do not accept or decline assignments.

## Current state

Implemented today:

- Invite-only Auth.js magic-link login
- Admin management of schools, teachers, PAs, classes, and class meeting times
- Recurring PA availability
- Read-only PA and teacher dashboards for published work

The old cycle-based screens and scheduler have been removed. The legacy `Cycle` database relationship remains until it can be replaced by a committed migration. See `AGENTS.md` for the exact handoff point.

## Local setup

Use Node.js 20.19 or newer. The repository includes `.nvmrc`.

```bash
npm ci
cp .env.example .env.local
npm run db:migrate
npm run db:seed
npm run dev
```

Open <http://localhost:3000> and sign in as `admin@workshopscheduler.local`. Without a Resend key, the development server prints the magic link in its terminal. The seed also creates `teacher1@workshopscheduler.local` and `pa1@workshopscheduler.local`.

Your `.env.local` needs:

```dotenv
DATABASE_URL="postgresql://...pooled Neon connection..."
DIRECT_URL="postgresql://...direct Neon connection..."
AUTH_SECRET="generate-a-local-secret"
AUTH_RESEND_KEY=""
AUTH_RESEND_FROM=""
```

## Neon and migrations

Use a personal Neon branch such as `dev-yourname`, created from the shared `main` branch. Point both local database URLs at that personal branch. Never run development migrations or resets against the shared database.

For a schema change:

```bash
npm run db:migrate -- --name descriptive_name
```

Commit both `prisma/schema.prisma` and the generated migration. Migrations are append-only; do not edit one that has already been shared. CI applies committed migrations to the shared Neon branch with `prisma migrate deploy` after a merge to `main`.

## Useful commands

| Command                | Purpose                                            |
| ---------------------- | -------------------------------------------------- |
| `npm run dev`          | Start the local app                                |
| `npm test`             | Run Vitest                                         |
| `npm run lint`         | Run ESLint                                         |
| `npm run typecheck`    | Run TypeScript without emitting files              |
| `npm run format`       | Format source and docs                             |
| `npm run format:check` | Check formatting                                   |
| `npm run build`        | Generate Prisma Client and build Next.js           |
| `npm run db:migrate`   | Apply or create migrations on your personal branch |
| `npm run db:seed`      | Upsert local demo data                             |
| `npm run db:studio`    | Open Prisma Studio                                 |

Before handing off a change, run the tests, lint, typecheck, format check, and build.
