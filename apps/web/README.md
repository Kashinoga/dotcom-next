# web

The kashinoga.com website. SvelteKit, on Cloudflare Workers.

Run the commands from the repository root. See the root `README.md`.

`wrangler.jsonc` holds the Worker configuration. After you change it, run
`pnpm --filter web gen` to make `worker-configuration.d.ts` again. That file is
generated, so it is not in git.
