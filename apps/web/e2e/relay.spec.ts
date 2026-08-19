import { expect, test } from '@playwright/test';

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
