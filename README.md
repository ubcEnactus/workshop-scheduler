# Ennovate + Enspire Workshop Scheduler

## Project Overview

Enspire and Enactus run monthly / bi-monthly workshops at schools across the Lower Mainland. We have tens of PAs, several partner schools (1–3 teachers each), and an admin team that has to assign PAs to workshops based on both the teachers' and the PAs' availability. The tool needs three views:

- **Admin** — manage schools, teachers, PAs, and (eventually) workshops and assignments.
- **PA** — submit availability, see assigned workshops.
- **Teacher** — submit availability, see what workshops are happening at their school and who's attending.

It's a single full-stack [Next.js](https://nextjs.org) app (App Router) — the API layer lives in Server Actions and the DB layer in Prisma, so there is no separate backend service. Stack: **Next.js 15** · **Prisma 6** · **Auth.js v5** (magic-link via Resend) · **Tailwind v4** · **TypeScript strict**.

## Getting started locally
You will need to setup an .env.local file first. See the database section below first before running these commands.

```bash
npm install
cp .env.example .env.local        # fill in DATABASE_URL, DIRECT_URL, AUTH_SECRET (see Database Setup)
npm run db:migrate                # shortcut for prisma migrate dev, applies migrations to your own Neon branch
npm run db:seed                   # creates the demo users
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), enter `admin@workshopscheduler.local` on the login form, and the magic-link URL for login will print to your dev server's terminal (because `AUTH_RESEND_KEY` is unset). Click it to sign in.

To test the other roles, sign out and use `teacher1@workshopscheduler.local` or `pa1@workshopscheduler.local`.

## Database Setup (Neon)

The app runs on Postgres, hosted on [Neon](https://neon.tech). The shared Neon
project has one long-lived branch plus a personal branch per developer:

- **`main`** — the shared integration database. It mirrors whatever is merged into
  the git `main` branch, and is updated **only by CI/CD** (via `prisma migrate deploy`).
- **`dev-<yourname>`** — your own branch for daily work: an isolated
  copy-on-write clone of `main` that you can migrate, reset, and break freely.

> **git `main` vs Neon `main` are different things.** `main` (and `ENCT-###`
> feature branches) are _git_ branches that hold code; **Neon** `main` and `dev-<yourname>`
> are _Neon_ branches that hold databases.

You do all hands-on work — migrate, reset, experiment — on your **own** Neon branch.

> **Free-tier:** Neon's free plan has no branch protection or per-branch
> access control, so isolation is _by convention_, not enforced. As such, you could
> delete our main Neon database by accident. Enusre that you:
>
> Point your `.env.local` **only at your own Neon database branch** that you create.

### Dev Database Setup

1. **Create your own Neon branch.** In the Neon console: Branches → New branch,
   **parent = `main`**, name it `dev-<yourname>` or whatever other name you wish. This is an instant
   copy-on-write clone, including the current schema and seed data.

2. **Create your env file** and fill in **your branch's** connection strings:

   ```bash
   cp .env.example .env.local
   ```

   From your branch's **Connect** dialog, copy:
   - `DATABASE_URL` — the **pooled** connection string (host contains `-pooler`). Used by the app.
   - `DIRECT_URL` — the **direct** connection string (no `-pooler`). Used by migrations.

   Then generate your own auth secret and paste it into `AUTH_SECRET`:

   ```bash
   npx auth secret
   ```

   `AUTH_RESEND_KEY` can be left blank in local dev — the magic-link URL prints to the
   server console instead of being emailed.

3. **Sync your branch.** You already have the schema + seed (you cloned
   `main`), but these are safe to run and confirm everything's wired up:

   ```bash
   npm run db:migrate   # applies any committed migrations not yet on your branch
   npm run db:seed      # idempotent (upserts) — re-running is safe
   ```

   `db:seed` prints the seeded login emails. Sign in at `/login`, then click the
   magic link from your server console.

### Daily workflow
These steps are only necessary if you make changes to database schema 
- **After `git pull`, sync your branch:** run `npm run db:migrate` to apply any
  newly-merged migrations to your own Neon branch.
- **Changing the schema:** edit `prisma/schema.prisma`, run
  `npm run db:migrate -- --name <descriptive_name>`, then **commit the generated
  migration** and open a PR into `main` (details below).
- **Branch got messy?** Delete it in the Neon console and re-create it off
  `main` — an instant clean reset, no `db:reset` needed.

### How migrations reach the shared **main** database

This is the rule that keeps everyone in sync and prevents drift:

- `npm run db:migrate` (= `prisma migrate dev`) **creates and applies** migrations
  and can reset on drift. **Use it only on your own branch.**
- The shared `main` database is updated **automatically by CI/CD**, which runs
  **`prisma migrate deploy`** on every merge to git `main`. `migrate deploy` only
  _applies_ already-committed migrations (never creates, never resets):

  ```
  merge ENCT-### → git main  ──►  CI/CD: migrate deploy  ──►  Neon `main`
  ```

  CI/CD uses the shared branch's credentials from repository secrets, so the
  migration happens with no manual step. **No one runs `db:migrate` / `db:reset`
  against the shared branch by hand.**

### Important notes

- **Never commit `.env.local`** — it's gitignored and holds secrets. Each developer
  keeps their own; never share branch connection strings around (that defeats the
  isolation).
- **`AUTH_SECRET` is per-environment**, not shared. Generate your own locally; the
  hosted environments have their own.
- **Migrations are committed to git and are append-only.** Never edit a migration
  that's already committed — add a new one instead.

### How Prisma & migrations work

`prisma/schema.prisma` is the single source of truth for the database structure, but
editing it **does not change the database** — it just changes the desired shape in code.
To make the database actually match, you run a migration:

```bash
npm run db:migrate -- --name <descriptive_name>
```

This does two things: generates a SQL migration file in `prisma/migrations/` (the diff
between the old and new schema) and applies it to your Neon branch. It also regenerates
the Prisma Client so your TypeScript types reflect the new schema.

So the loop is: **edit `schema.prisma` → run `db:migrate` → commit the migration → PR
into `main`**. The migration files are the shared, ordered history of schema changes — when
a teammate pulls your changes, they run `npm run db:migrate` (no `--name`) to apply any new
migrations to **their own** branch and stay in sync. Never edit a migration that's already
been committed; make a new one instead. (The shared `main` database gets these via
`migrate deploy`, not `migrate dev` — see above.)

## Deployment

Not deployed yet. Today, CI/CD applies migrations to the shared **`main`** Neon
branch with `prisma migrate deploy` (never `migrate dev`) on merge to git `main`.

When we ship the MVP, production will live in a **separate Neon project** (keeping
it out of reach of the team's shared-project access). Its connection strings will
live only in deploy/CI secrets — never in a local `.env.local` — and the deploy job
will snapshot prod with a pre-deploy Neon branch before each migration (tracked in
Jira). At that point, also run `npx vercel env add AUTH_TRUST_HOST production` and
set it to `true`.

## Available Commands

| Command | Description |
|---|---|
| `npm run dev` | Starts the development server at http://localhost:3000 |
| `npm run build` | Creates an optimised production build |
| `npm run start` | Starts the production server (requires a build first) |
| `npm run lint` | Runs ESLint across the `src/` directory |
| `npm run lint:fix` | Runs ESLint and auto-fixes any fixable issues |
| `npm run format` | Runs Prettier and auto-formats all `.ts` and `.tsx` files in `src/` |
| `npm run format:check` | Checks formatting without writing changes (used in CI) |
| `npm run typecheck` | Runs `tsc --noEmit` to type-check the project (used in CI) |
| `npm run db:migrate` | Creates/applies Prisma migrations on **your own** branch (`-- --name <name>` to create). Never against shared branches |
| `npm run db:seed` | Seeds the database with sample admin / teacher / PA accounts |
| `npm run db:reset` | Drops, re-migrates, and re-seeds **your own** branch (destructive). Never against the shared `main` branch |
| `npm run db:studio` | Opens Prisma Studio to browse/edit your branch's data |

> The shared `main` database is migrated with `prisma migrate deploy` from CI/CD —
> not with any of the `db:*` scripts above.

## Conventions

Hard-coded by the scaffold and documented in [`AGENTS.md`](AGENTS.md):

- All mutations go through **Server Actions**, validated with **Zod** schemas in `src/lib/schemas/`
- Every Server Action and protected page calls `requireRole(...)` from `@/lib/auth` on its **first line**
- DB access only from Server Components / Server Actions — never from client components
- `npm run db:migrate -- --name <descriptive>` for any schema change; migrations are committed
- No `any` — use `unknown` and narrow
- CI runs ESLint, Prettier, `tsc --noEmit`, and `next build` on every PR into `main`

## Code Quality

This project uses ESLint for linting and Prettier for formatting. Both are enforced on every pull request via GitHub Actions — a PR cannot be merged into `main` if either check fails.

### VS Code Setup

Install the following extensions to get auto-fix on save:

- [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) — `dbaeumer.vscode-eslint`
- [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode) — `esbenp.prettier-vscode`

The `.vscode/settings.json` at the repo root is already configured to format and fix on save once these extensions are installed.

### Running Checks Locally

Before pushing, make sure both checks pass:

```bash
npm run lint
npm run format:check
```

If Prettier reports issues, run the following to auto-fix them:

```bash
npm run format
```

If ESLint reports issues that aren't auto-fixable, they will need to be resolved manually.

## Branching Strategy

Trunk-based: a single long-lived branch plus short-lived feature branches.

### Branches

- **`main`** - The single source of truth. Feature branches merge here via PR, and
  every merge is deployable. (A separate release/prod branch will be introduced when
  we deploy the MVP.)
- **`feature branches`** - Short-lived branches for individual pieces of work, based
  off `main` and merged back into `main` via a pull request when complete.

### Feature Branch Naming

Feature branches must follow this naming convention, using the corresponding ticket number from Jira:

```
ENCT-###
```

**Examples:**
```
ENCT-001
ENCT-042
ENCT-137
```

### Workflow

```
ENCT-### ──► main
```

1. Create a feature branch off `main` using the Jira ticket number
2. Do your work and push commits to the feature branch
3. Open a pull request from `ENCT-###` into `main`
4. Once reviewed and approved, merge into `main` — CI/CD then runs `migrate deploy` against the Neon `main` branch

### Quick Reference

```bash
# Start a new feature
git checkout main
git pull origin main
git checkout -b ENCT-###

# Push your feature branch
git push -u origin ENCT-###
```

## Learn More

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial
