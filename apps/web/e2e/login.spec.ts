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
