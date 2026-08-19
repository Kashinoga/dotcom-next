import { expect, test } from '@playwright/test';

import { FORWARD_REQ, USER_AGENT } from '../src/lib/relay';

/*
 * THE RELAY'S REFUSALS.
 *
 * Every case here is one the rules exist to stop, and every one is asked of the
 * ROUTE rather than of the rules module — a check that is only tested where it is
 * declared is a check that can be left out of the thing that applies it, which is
 * exactly the mistake this file guards against.
 *
 * None of these need a Nextcloud. A request that is refused never leaves the
 * Worker, which is the point: the refusals are testable and the forwarding is
 * not, so the refusals are what is tested.
 */

const relay = (
	request: import('@playwright/test').APIRequestContext,
	target: string | null,
	options: {
		method?: string;
		headers?: Record<string, string>;
		data?: string;
	} = {},
) =>
	request.fetch('/api/dav', {
		method: options.method ?? 'PROPFIND',
		headers: {
			...(target === null ? {} : { 'x-dav-target': target }),
			...options.headers,
		},
		data: options.data ?? '',
	});

const GOOD = 'https://cloud.example.com/remote.php/dav/files/someone/Notes';

test('a method this editor does not use is refused', async ({ request }) => {
	// PROPPATCH, LOCK, REPORT and COPY are all real DAV and none of them are ours.
	for (const method of ['PROPPATCH', 'LOCK', 'REPORT', 'COPY']) {
		const answer = await relay(request, GOOD, { method });
		expect(answer.status(), method).toBe(405);
	}
});

test('a target that is not a Nextcloud files path is refused', async ({
	request,
}) => {
	const refused = [
		// Not a URL at all, and it must not reach the host test.
		'nonsense',
		// Not https: a credential and a document both travel through here.
		'http://cloud.example.com/remote.php/dav/files/someone',
		// Credentials in the URL.
		'https://user:pass@cloud.example.com/remote.php/dav/files/someone',
		// A private host. This matters most in development, where the Worker runs
		// on a laptop inside somebody's home network.
		'https://localhost/remote.php/dav/files/someone',
		'https://192.168.1.10/remote.php/dav/files/someone',
		'https://printer.local/remote.php/dav/files/someone',
		// A port is how a relay becomes a port scanner.
		'https://cloud.example.com:8443/remote.php/dav/files/someone',
		// A DAV path, but not the FILES tree — calendars, contacts and trash are
		// all under the same prefix and none of them are this app's business.
		'https://cloud.example.com/remote.php/dav/calendars/someone',
		'https://cloud.example.com/remote.php/dav/',
		// Not a DAV path at all: the general-relay case.
		'https://example.com/',
	];

	for (const target of refused) {
		const answer = await relay(request, target);
		expect(answer.status(), target).toBe(400);
	}

	// And no target at all.
	expect((await relay(request, null)).status()).toBe(400);
});

test("a MOVE's destination is checked as hard as its target", async ({
	request,
}) => {
	const move = (destination?: string) =>
		relay(request, GOOD, {
			method: 'MOVE',
			headers: destination ? { destination } : {},
		});

	// Missing entirely.
	expect((await move()).status()).toBe(400);

	// Somewhere this relay would never forward to on its own.
	expect((await move('https://example.com/')).status()).toBe(400);

	/*
	 * AND THE ONE A TARGET CHECK ALONE WOULD MISS: a perfectly good Nextcloud
	 * files path on a DIFFERENT server. Without the same-origin rule, a move is a
	 * way to make one Nextcloud write into another with the first one's password.
	 */
	const elsewhere =
		'https://other.example.com/remote.php/dav/files/someone/Notes/moved.md';
	expect((await move(elsewhere)).status()).toBe(400);
});

test('a document larger than the cap is refused', async ({ request }) => {
	// The cap is 4MB and is counted in BYTES — a cap counted in code units is not
	// a cap. This is comfortably over either way.
	const answer = await relay(request, GOOD, {
		method: 'PUT',
		data: 'x'.repeat(5 * 1024 * 1024),
	});
	expect(answer.status()).toBe(413);
});

test('a refusal says nothing, and is never cached', async ({ request }) => {
	const answer = await relay(request, 'https://example.com/');

	expect(answer.status()).toBe(400);
	// No body: what was wrong with the request is the caller's to know.
	expect((await answer.body()).length).toBe(0);
	// A private document must not give the platform in front of this a reason to
	// keep one, and the refusals answer the same way as the successes.
	expect(answer.headers()['cache-control']).toBe('no-store');
});

/*
 * THE NAME THE FAR END SEES IS THE NAME OF THE CREDENTIAL.
 *
 * Nextcloud names an app password after the `User-Agent` that asked for it, and
 * that name is what somebody reads in Devices & sessions — the one real control
 * they have over a token this app holds. Unset, it was `node`: the browser's own
 * agent never reaches the far end, so what a server saw was whatever runtime did
 * the fetch, which also meant the name changed with the machine.
 *
 * The header cannot be checked from out here without a server to receive it, so
 * what is checked is the two rules that make it right — it is SET by the relay,
 * and it is NOT something a caller can choose.
 */
test('the relay names itself, and a caller cannot name it', () => {
	// Recognisable: it says who, and which app of theirs.
	expect(USER_AGENT).toContain('Kashinoga');
	expect(USER_AGENT).toContain('Text Editor');

	/*
	 * And STABLE. Somebody who connected a drive last year should find the entry
	 * they made, so this must carry no version and no build stamp — which is what
	 * a digit in it would almost always be.
	 */
	expect(USER_AGENT).not.toMatch(/\d/);

	/*
	 * NOT FORWARDABLE. A relay that let a caller choose this header would let one
	 * person name a stranger's app password anything they liked, in the list that
	 * stranger is meant to be able to trust. This is the assertion that keeps it
	 * out of the allow-list when somebody later wonders why it is missing.
	 */
	expect(FORWARD_REQ).not.toContain('user-agent');
	// Nor under any casing — the route reads the list verbatim.
	for (const name of FORWARD_REQ) {
		expect(name.toLowerCase()).not.toBe('user-agent');
	}
});
