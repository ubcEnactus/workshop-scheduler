# Ennovate + Enspire Workshop Scheduler

## Project Overview

Enspire and Enactus run monthly / bi-monthly workshops at schools across the Lower Mainland. We have tens of PAs, several partner schools (1–3 teachers each), and an admin team that has to assign PAs to workshops based on both the teachers' and the PAs' availability. The tool needs three views:

- **Admin** — manage schools, teachers, PAs, and (eventually) workshops and assignments.
- **PA** — submit availability, see assigned workshops.
- **Teacher** — submit availability, see what workshops are happening at their school and who's attending.

## Getting started locally

```bash
cd frontend
npm install
cp .env.example .env.local        # fill in DATABASE_URL, DIRECT_URL, AUTH_SECRET
npm run db:migrate                # applies migrations to your Neon dev branch
npm run db:seed                   # creates the demo users
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), enter `admin@workshopscheduler.local` on the login form, and the magic-link URL will print to your dev server's terminal (because `AUTH_RESEND_KEY` is unset). Click it to sign in.

To test the other roles, sign out and use `teacher1@workshopscheduler.local` or `pa1@workshopscheduler.local`.
```

Use the **prod** Neon branch URL for the `production` scope and the **dev** Neon branch URL for `preview`. Run `npx vercel env add AUTH_TRUST_HOST production` and set it to `true`.

## Conventions

Hard-coded by the scaffold and documented in [`frontend/AGENTS.md`](frontend/AGENTS.md):

- All mutations go through **Server Actions**, validated with **Zod** schemas in `src/lib/schemas/`
- Every Server Action and protected page calls `requireRole(...)` from `@/lib/auth` on its **first line**
- DB access only from Server Components / Server Actions — never from client components
- `prisma migrate dev --name <descriptive>` for any schema change; migrations are committed
- No `any` — use `unknown` and narrow

## Branching Strategy

This project follows a structured branching model to keep development organised and deployments stable.

### Branches

- **`main`** - Production branch. This is the branch that gets deployed. Nothing is committed directly to `main`; it only receives merges from `dev` when a release is ready.
- **`dev`** - Integration branch. All feature branches are merged into `dev` first. This is where ongoing development is accumulated and tested before being promoted to `main`.
- **`feature branches`** - Short-lived branches created for individual pieces of work. Each feature branch is based off `dev` and merged back into `dev` via a pull request when complete.

### Feature Branch Naming

Feature branches must follow this naming convention, using the corresponding ticket number from Linear:

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
ENCT-### ──► dev ──► main
```

1. Create a feature branch off `dev` using the Linear ticket number
2. Do your work and push commits to the feature branch
3. Open a pull request from `ENCT-###` into `dev`
4. Once reviewed and approved, merge into `dev`
5. When `dev` is stable and ready for release, open a pull request from `dev` into `main`

### Quick Reference

```bash
# Start a new feature
git checkout dev
git pull origin dev
git checkout -b ENCT-###

# Push your feature branch
git push -u origin ENCT-###
```