import { expect, test } from '@playwright/test';

import { readFlow, readGranted } from '../src/lib/login';

/*
 * WHAT A SERVER SAID, AND WHETHER IT MAY BE BELIEVED.
 *
 * Both readers are pure so they can be asked directly — no page, no server. The
 * first is the load-bearing one: step 1 of the flow is UNAUTHENTICATED, so its
 * JSON comes from a host that has proven nothing yet.
 */

const BASE = 'https://cloud.example.com';

const good = {
	login: 'https://cloud.example.com/index.php/login/v2/flow/abc',
	poll: {
		token: 'poll-token',
		endpoint: 'https://cloud.example.com/index.php/login/v2/poll',
	},
};

test('a well-formed answer from the right server is read', () => {
	const flow = readFlow(good, BASE);

	expect(flow).not.toBeNull();
	expect(flow!.login).toBe(good.login);
	expect(flow!.pollToken).toBe('poll-token');
	expect(flow!.pollEndpoint).toBe(good.poll.endpoint);
});

test('an answer naming another server is refused', () => {
	/*
	 * THE ONE THAT MATTERS. A server answering with a poll endpoint somewhere else
	 * would point this app at a third party while somebody watches a login page
	 * they trust — and step 1 is the step where nothing has authenticated itself.
	 *
	 * Both halves are checked, because either one alone would do it: a `login` that
	 * sends the visitor elsewhere, or a `poll` that sends the token elsewhere.
	 */
	expect(
		readFlow(
			{
				...good,
				login: 'https://evil.example.com/index.php/login/v2/flow/abc',
			},
			BASE,
		),
	).toBeNull();

	expect(
		readFlow(
			{
				...good,
				poll: { ...good.poll, endpoint: 'https://evil.example.com/poll' },
			},
			BASE,
		),
	).toBeNull();

	// A different scheme or port is a different origin, and is refused the same.
	expect(
		readFlow({ ...good, login: 'http://cloud.example.com/x' }, BASE),
	).toBeNull();
	expect(
		readFlow({ ...good, login: 'https://cloud.example.com:8443/x' }, BASE),
	).toBeNull();
});

test('anything that is not the shape of an answer is refused', () => {
	const refused: unknown[] = [
		null,
		undefined,
		'a string',
		42,
		{},
		// A piece missing is as good as no answer: all three are needed.
		{ login: good.login },
		{ login: good.login, poll: { token: 't' } },
		{ login: good.login, poll: { endpoint: good.poll.endpoint } },
		// Present but empty, which is not the same as absent and is just as useless.
		{ ...good, login: '' },
		{ ...good, poll: { token: '', endpoint: good.poll.endpoint } },
		// The right shape with the wrong types.
		{ login: 1, poll: { token: 2, endpoint: 3 } },
	];

	for (const body of refused) {
		expect(
			readFlow(body, BASE),
			JSON.stringify(body) ?? 'undefined',
		).toBeNull();
	}

	// And a base that is not a URL cannot be compared against, so nothing passes.
	expect(readFlow(good, 'not a url')).toBeNull();
});

test('a grant is read, and half a grant is not', () => {
	expect(readGranted({ loginName: 'someone', appPassword: 'secret' })).toEqual({
		user: 'someone',
		token: 'secret',
	});

	/*
	 * `loginName` is what the DAV path is built from — `/files/<user>` — so a grant
	 * without one is a password with nowhere to use it, and that is worth refusing
	 * here rather than failing later with a 404 nobody can explain.
	 */
	for (const body of [
		null,
		{},
		{ appPassword: 'secret' },
		{ loginName: 'someone' },
		{ loginName: '', appPassword: 'secret' },
		{ loginName: 'someone', appPassword: '' },
		{ loginName: 1, appPassword: 2 },
	]) {
		expect(readGranted(body), JSON.stringify(body)).toBeNull();
	}
});

/*
 * THE BUTTON IS OFFERED WHERE IT IS CERTAIN TO WORK, and nowhere else.
 *
 * Both steps of the flow are page-to-server requests, so both need CORS — and
 * what makes DIRECT mode possible is about the WebDAV endpoints. Whether it
 * covers the login ones is not something this app should guess at, and a sign-in
 * button that silently does nothing is worse than no button.
 *
 * The alternative — quietly borrowing the relay for the login while the drive is
 * direct — is worse still: direct mode's whole promise is that the credential
 * reaches nobody but their server, and that would break it once, at the exact
 * moment the credential is created.
 */
test('signing in is offered only where the requests can be made', async ({
	page,
}) => {
	await page.setViewportSize({ width: 1400, height: 780 });
	await page.goto('/text-editor');
	await expect(page.locator('.workspace[data-ready]')).toBeVisible();

	await page.getByRole('button', { name: 'Connect a drive' }).click();
	await expect(page.locator('.connect')).toBeVisible();

	const signIn = page.getByRole('button', { name: /Sign in instead/ });
	const [relayed, direct] = await page.getByRole('radio').all();

	// Relayed is the default, so the button is there — and dead until it knows
	// which server to start a flow on.
	await expect(signIn).toHaveCount(1);
	await expect(signIn).toBeDisabled();

	await page.getByLabel('Server', { exact: true }).fill('cloud.example.com');
	await expect(signIn).toBeEnabled();

	// Direct: gone, not disabled. A control that is present and dead invites
	// somebody to work out what would enable it, and nothing would.
	await direct.check();
	await expect(signIn).toHaveCount(0);

	// And the paste is still there in both, because it is the way in that always
	// works and the sign-in is the shortcut.
	await expect(page.getByLabel('App password', { exact: true })).toBeVisible();

	await relayed.check();
	await expect(signIn).toHaveCount(1);
});

/*
 * THE WHOLE FLOW, against a stubbed server.
 *
 * This is the test that would have caught the bug the readers above cannot see.
 * Everything in `readFlow` and `readGranted` was right; what was wrong was three
 * lines of the component, and no amount of asking the pure parts would have said
 * so.
 *
 * THE BUG: `window.open(url, '_blank', 'noopener')` returns NULL BY SPEC — the
 * browser disowns the window and so has no reference to hand back — and the
 * null-check that exists to notice a blocked pop-up read every successful open as
 * a blocked one. The tab opened, somebody signed in on their own server and
 * pressed Grant, and this never polled once.
 *
 * `/api/dav` is stubbed rather than reached, so no Nextcloud is needed: the relay
 * is the only thing between this and a server, and what it forwards is tested
 * separately in relay.spec.ts.
 */
test('a granted sign-in fills the form in', async ({ page, context }) => {
	const BASE_URL = 'https://cloud.example.com';

	/* Nobody is sent anywhere real: the tab that opens lands on a stub. What
	 * matters is that a tab opens at all. */
	await context.route(`${BASE_URL}/**`, (route) =>
		route.fulfill({ status: 200, body: 'the sign-in page' }),
	);

	let polls = 0;
	await context.route('**/api/dav', async (route) => {
		const target = route.request().headers()['x-dav-target'] ?? '';

		if (target.endsWith('/index.php/login/v2')) {
			return route.fulfill({
				status: 200,
				contentType: 'application/json',
				/*
				 * THE REWRITTEN FORM, because that is what a real server sends:
				 * Nextcloud writes these with `linkToRouteAbsolute`, which drops
				 * `/index.php` wherever URL rewriting is on.
				 *
				 * It does not make this test catch an allow-list that refuses that
				 * form — `/api/dav` is stubbed here, so the relay never runs. Checked:
				 * with the narrow list restored, this still passes and the relay's own
				 * test is the one that fails. It is the right URL to stub anyway, so
				 * the two tests are not describing different servers.
				 */
				body: JSON.stringify({
					login: `${BASE_URL}/login/v2/flow/abc`,
					poll: {
						token: 'poll-token',
						endpoint: `${BASE_URL}/login/v2/poll`,
					},
				}),
			});
		}

		if (target.endsWith('/poll')) {
			polls += 1;
			/* 404 is the ORDINARY answer for as long as nobody has granted it, which
			 * is most of the time somebody is looking at a login page. Two of them
			 * first, so the loop has to actually loop. */
			if (polls < 3) return route.fulfill({ status: 404, body: '' });
			return route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					loginName: 'someone',
					appPassword: 'the-app-password',
				}),
			});
		}

		return route.fulfill({ status: 400, body: '' });
	});

	await page.setViewportSize({ width: 1400, height: 780 });
	await page.goto('/text-editor');
	await expect(page.locator('.workspace[data-ready]')).toBeVisible();

	await page.getByRole('button', { name: 'Connect a drive' }).click();
	await page.getByLabel('Server', { exact: true }).fill('cloud.example.com');

	const opened = context.waitForEvent('page');
	await page.getByRole('button', { name: /Sign in instead/ }).click();

	// A tab really is opened, and it is sent to the server's own login page.
	const tab = await opened;
	expect(tab.url()).toContain('/login/v2/flow/');

	// And while it waits, it says what it is waiting for.
	await expect(
		page.getByRole('button', { name: /Waiting for you to grant it/ }),
	).toBeVisible();

	/*
	 * THE ANSWER FILLS THE FORM IN rather than connecting on its own. A granted
	 * password and a reachable workspace are two different claims, so the probe
	 * still runs before anything is remembered.
	 */
	await expect(page.getByLabel('User', { exact: true })).toHaveValue(
		'someone',
		{
			timeout: 15_000,
		},
	);
	await expect(page.getByLabel('App password', { exact: true })).toHaveValue(
		'the-app-password',
	);

	// It polled more than once, so a 404 really is treated as "not yet".
	expect(polls).toBeGreaterThan(1);
});
