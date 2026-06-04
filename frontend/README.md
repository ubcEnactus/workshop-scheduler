# Workshop Scheduler — Frontend

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app), using TypeScript and Tailwind CSS.

## Getting Started

Install dependencies:

```bash
npm install
```

Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser to see the result.

You can start editing the page by modifying `src/app/page.tsx`. The page auto-updates as you edit the file.

> **Note:** the app uses Auth.js + Prisma, so you need a database and a `.env.local`
> before `npm run dev` will fully work. See [Database Setup](#database-setup-neon) below.

## Database Setup (Neon)

The app runs on Postgres, hosted on [Neon](https://neon.tech). We use **per-developer
database branches** so everyone has an isolated copy of the schema and seed data —
you can run migrations, reset, and experiment without affecting anyone else.

### One-time setup

1. **Create your own Neon branch.** In the Neon console, open the project and create a
   branch off `dev` (Branches → New branch). This gives you an instant copy-on-write
   clone, including data.

2. **Create your env file** from the template and fill in your branch's connection
   strings:

   ```bash
   cp .env.example .env.local
   ```

   From your Neon branch's **Connect** dialog, copy:
   - `DATABASE_URL` — the **pooled** connection string (host contains `-pooler`). Used by the app.
   - `DIRECT_URL` — the **direct** connection string (no `-pooler`). Used by migrations.

   Then generate your own auth secret and paste it into `AUTH_SECRET`:

   ```bash
   npx auth secret
   ```

   `AUTH_RESEND_KEY` can be left blank in local dev — the magic-link URL prints to the
   server console instead of being emailed.

3. **Apply migrations and seed:**

   ```bash
   npm run db:migrate   # applies committed migrations to your branch
   npm run db:seed      # creates 1 admin, 2 schools, 2 teachers, 2 PAs
   ```

   `db:seed` prints the seeded login emails. Sign in at `/login`, then click the
   magic link from your server console.

### Important notes

- **Never commit `.env.local`** — it's gitignored and holds secrets. Each developer
  keeps their own; never share branch connection strings around (that defeats the
  isolation).
- **`AUTH_SECRET` is per-environment**, not shared. Generate your own locally; the
  hosted environments have their own.
- **Migrations are committed to git.** When you change `prisma/schema.prisma`, run
  `npm run db:migrate -- --name <descriptive_name>` and commit the generated migration.
  Teammates apply it to their own branch with `npm run db:migrate`.

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

So the loop is: **edit `schema.prisma` → run `db:migrate` → commit the migration**. The
migration files are the shared, ordered history of schema changes — when a teammate pulls
your changes, they run `npm run db:migrate` (no `--name`) to apply any new migrations to
their own branch and stay in sync. Never edit a migration that's already been committed;
make a new one instead.

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
| `npm run db:migrate` | Applies/creates Prisma migrations against your branch (`-- --name <name>` to create) |
| `npm run db:seed` | Seeds the database with sample admin / teacher / PA accounts |
| `npm run db:reset` | Drops, re-migrates, and re-seeds your branch (destructive) |
| `npm run db:studio` | Opens Prisma Studio to browse/edit your branch's data |

## Code Quality

This project uses ESLint for linting and Prettier for formatting. Both are enforced on every pull request via GitHub Actions — a PR cannot be merged into `dev` if either check fails.

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

## Learn More

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial
