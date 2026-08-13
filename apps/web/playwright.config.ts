import { defineConfig, devices } from '@playwright/test';

/*
 * THE END-TO-END SETUP.
 *
 * What these tests are for: the things `pnpm check` cannot see. A type checker
 * has nothing to say about whether a sticky bar stops in the right place, a
 * backdrop blur survived an edit, or a list still has nine items in it. Those
 * are the failures this site actually has.
 *
 * `@playwright/test` and not the raw library with a runner of our own — which
 * is what the first site does. This one is small enough that a runner is a
 * thing to maintain and not a thing to gain.
 */
export default defineConfig({
	testDir: 'e2e',

	/*
	 * THREE ENGINES, and this is the main reason the suite exists rather than a
	 * nicety. The stylesheet makes claims about Safari and Firefox — the
	 * `-webkit-` prefix on the frost, the `@supports` arm behind it, whether a
	 * translucent `::selection` composites the same way — and until now every one
	 * of them was an assertion nobody had run.
	 *
	 * `deviceScaleFactor: 1` on purpose. The machine this was written on is a 2x
	 * display, and screenshots taken through it came back cropped rather than
	 * scaled. A test should not inherit the desk it runs on.
	 */
	projects: [
		{
			name: 'chromium',
			use: { ...devices['Desktop Chrome'], deviceScaleFactor: 1 },
		},
		{
			name: 'firefox',
			use: { ...devices['Desktop Firefox'], deviceScaleFactor: 1 },
		},
		/*
		 * WEBKIT IS BEHIND A FLAG, and not because it matters less — it is the one
		 * engine that would settle the Safari questions this stylesheet keeps
		 * raising.
		 *
		 * Playwright's WebKit build links against Debian's library names and
		 * versions: it asks for libicu74, libmanette-0.2-0 and libenchant-2-2,
		 * and Arch ships libicu 78 and different names for the rest. It cannot
		 * launch here, and a suite that always fails is a suite nobody reads.
		 *
		 * Run it with `E2E_WEBKIT=1 pnpm test:e2e` on a machine that can, which
		 * includes any macOS one — where it is the real Safari engine and worth
		 * the trip.
		 */
		...(process.env.E2E_WEBKIT
			? [
					{
						name: 'webkit',
						use: { ...devices['Desktop Safari'], deviceScaleFactor: 1 },
					},
				]
			: []),
	],

	use: {
		baseURL: 'http://localhost:4174',
		/* Kept only for a test that failed, which is when anybody wants one. */
		trace: 'on-first-retry',
	},

	/*
	 * A viewport WIDE ENOUGH FOR THE RAIL by default. The emoji TOC appears at
	 * 70rem and the tests that check it would otherwise be checking that it is
	 * absent. Individual tests narrow this where the narrow case is the point.
	 */
	expect: { timeout: 5000 },

	/*
	 * `dev` and not `preview`. Preview runs the built Worker under wrangler,
	 * which is the truer thing to test and takes long enough that nobody would
	 * run the suite. The build is checked by `pnpm build` on its own.
	 *
	 * `reuseExistingServer` so a dev server already up — which is the normal
	 * state while working — is used instead of fought with.
	 */
	webServer: {
		command: 'pnpm dev --port 4174 --strictPort',
		url: 'http://localhost:4174',
		reuseExistingServer: !process.env.CI,
		timeout: 120_000,
	},

	/* A failing suite should fail, not pass on the second go. Retries only where
	 * nobody is watching to notice the flake. */
	retries: process.env.CI ? 2 : 0,
	forbidOnly: !!process.env.CI,
});
