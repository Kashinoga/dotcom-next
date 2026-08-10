# dotcom

The personal website of kashinoga.com, and the reference example of the Kashinoga
Design System.

This is a pnpm monorepo. It contains one app at the moment.

| Path       | What it is                          |
| ---------- | ----------------------------------- |
| `apps/web` | The website. SvelteKit + Cloudflare |

## Requirements

- Node 25.2.1 (see `.node-version`)
- pnpm 11 (see the `packageManager` field in `package.json`)

## Commands

Run these from the repository root.

| Command       | What it does                            |
| ------------- | --------------------------------------- |
| `pnpm install` | Install the dependencies of all packages |
| `pnpm dev`    | Start the dev server for `apps/web`     |
| `pnpm build`  | Build all packages                      |
| `pnpm check`  | Type-check all packages                 |
