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

## The Shared Trip, Locally

The trip at `/shared/<TRIP_SLUG>` answers only when its address and passcode are
set, and shows only what is in the database. For local work there is a dummy
trip, so nothing real has to leave the machine it lives on.

```sh
cp apps/web/.dev.vars.example apps/web/.dev.vars
pnpm --filter web trip:seed scripts/dummy-trip.json
```

Then open `http://localhost:5173/shared/local-trip`; the passcode is `local`.
The seed will not write over a trip already in the local database. Add
`--replace` to put the dummy back after a change.

The trip's end-to-end tests need the same two values:

```sh
TRIP_SLUG=local-trip TRIP_PASSCODE=local pnpm test:e2e trip
```

## The End-to-End Tests

`e2e/` holds one spec per part of the site: `chrome.spec.ts` for the bar,
footer and frame every page wears, `text-editor.spec.ts`, `trip.spec.ts`, and so
on. `helpers.ts` is what more than one of them needs.

They run in Chromium and Firefox, which Playwright keeps apart from the
browsers on the machine. Install them once:

```sh
pnpm --filter web exec playwright install chromium firefox
pnpm test:e2e
```

A spec or a line narrows the run: `pnpm test:e2e text-editor`. Shortcuts are
pressed as `ControlOrMeta`, so the suite passes on a Mac as well as on Windows.
