# web

The kashinoga.com website. SvelteKit, on Cloudflare Workers.

Run the commands from the repository root. See the root `README.md`.

## The Worker

`wrangler.jsonc` holds the Worker configuration. The Worker is named
`dotcom-web`. That name becomes the address of the free URL,
`dotcom-web.<subdomain>.workers.dev`, and of each preview URL.

`worker-configuration.d.ts` gives the types for that configuration. It is
generated, so it is not in git. `pnpm install` makes it, through the `prepare`
script. After you change `wrangler.jsonc`, make it again:

```sh
pnpm --filter web gen
```

Its content changes with the state of the build directory, so do not compare it
with `wrangler types --check`. The template did this in `build` and in `check`,
and the two wanted different content.
