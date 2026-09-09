# Workshop Scheduler

An admin-led scheduling tool for assigning UBC student volunteers (PAs) to school workshops across the Lower Mainland.

Read [the pilot brief](docs/DESIGN_BRIEF.md) before changing scheduling behavior. In one line: admins create dated workshop slots, then assign available PAs to them. Teachers are view-only and PAs do not accept or decline assignments.

## Current state

Implemented today:

- Invite-only Auth.js magic-link login
- Admin management of schools, teachers, PAs, classes, and class meeting times
- Recurring PA availability
- Read-only PA and teacher dashboards for published work
- Dated draft workshops: month navigation, school/class filters, create and detail/edit forms
- Vancouver date/time, hosting-block, staffing and class/teacher overlap validation
- Monthly class cadence/defaults and selected-class batch planning with safe retries
- Explicit PA quotas and assignment gaps; manual staffing, locking and publication
- Automatic staffing previews with protected work and stale-input detection
- Reviewed replacement, rescheduling, cancellation/completion and audit history
- Availability review warnings and published history in PA/teacher views
- Isolated PostgreSQL integration tests and Playwright browser coverage

The cycle schema has been removed through a committed migration. Workshops have required UTC start/end instants and draft/published/completed/cancelled lifecycle states. Assignments are draft or published. Iterations 0–5 are implemented; the local pilot rehearsal is covered. Hosted staging, real email delivery and database recovery checks remain pending. See [the pilot runbook](docs/PILOT_RUNBOOK.md) for workflow, recovery and release checks. See [the implementation plan](docs/IMPLEMENTATION_PLAN.md) for completed work and the remaining iterations.

## Local setup

Use Node.js 20.19 or newer. The repository includes `.nvmrc`.

```bash
npm ci
npm run db:local
```

Keep that terminal running. `db:local` starts a local-only PostgreSQL cluster under ignored `work/dev-db`, chooses a free port and creates `.env.local` with random credentials. It preserves an existing environment file and refuses to replace one pointing to another database. In a second terminal:

```bash
npm run db:migrate
npm run db:seed
npm run dev
```

Open <http://localhost:3000> and sign in as `admin@workshopscheduler.local`. Without a Resend key, the development server prints the magic link in its terminal. The seed also creates `teacher1@workshopscheduler.local` and `pa1@workshopscheduler.local`.

Alternatively, copy `.env.example` to `.env.local` and configure a personal Neon development branch. That environment needs:

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

## Integration and browser checks

Install the test browser into the checkout once:

```bash
# POSIX shell
PLAYWRIGHT_BROWSERS_PATH=work/browsers npx playwright install chromium
```

```powershell
# PowerShell
$env:PLAYWRIGHT_BROWSERS_PATH = Join-Path (Get-Location) 'work/browsers'
npx playwright install chromium
```

Then run:

```bash
npm test
npm run test:integration
npm run test:e2e
npm run lint
npm run typecheck
npm run format:check
npm run build
```

Each integration/browser command starts its own PostgreSQL cluster with random credentials and ports, applies all committed migrations and runs the seed twice. Fixture resets require the runner's exact local test URL. Neither command uses or resets the development database from `.env.local`. Stopped test clusters and failure artifacts remain in ignored `work/` for inspection.

Browser tests run the real development app and consume the existing console-delivered magic links from their private server log. There is no testing login route or production authentication bypass. Run the browser suite separately from `next dev` or `next build` in this checkout because they share `.next`. Use a normal non-root OS account for embedded PostgreSQL.

The `dated_workshops` migration deliberately deletes disposable legacy assignments and workshops before removing their obsolete statuses. Apply it only to disposable development/test data at this stage. Committed migration history is preserved; no legacy backfill is implemented.
