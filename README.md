# Ennovate + Enspire Workshop Scheduler

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