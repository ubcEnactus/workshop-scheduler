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
