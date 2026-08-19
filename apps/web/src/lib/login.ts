/*
 * LOGIN FLOW V2 — getting an app password without anybody typing one.
 *
 * Nextcloud's own hand-off. Three steps and a wait:
 *
 *   1. POST /index.php/login/v2, unauthenticated. The server answers with a URL
 *      to send somebody to, and a token to wait on.
 *   2. That URL opens in a tab of their own browser, on their own server, where
 *      they log in the way they always do — including whatever second factor they
 *      have — and press Grant.
 *   3. POST to the poll endpoint until it stops answering 404. It then hands over
 *      an APP PASSWORD the server made, named for this app, revocable from
 *      Devices & sessions like any other.
 *
 * THE PASSWORD IS NEVER TYPED HERE, and that is the whole point. Nothing in this
 * app ever sees an account password, no field can be shoulder-surfed or filled
 * from the wrong entry, and what arrives is already the narrow, revocable kind of
 * credential the app should be holding anyway.
 *
 * ── Why this is the RELAYED mode's, and only the relayed mode's ──────────────
 *
 * Steps 1 and 3 are both requests from this page to somebody's server, so both
 * need CORS — and the app that makes DIRECT mode possible at all is about the
 * WebDAV endpoints. Whether it covers `/index.php/login/v2` is not something this
 * app should be guessing about, and a sign-in button that silently does nothing
 * is worse than no button.
 *
 * Routing it through the relay regardless would be worse still: direct mode's
 * entire promise is that the credential reaches nobody but their server, and a
 * login flow that quietly borrowed the relay would break that promise once, at
 * the exact moment the credential is created.
 *
 * So direct mode keeps the paste, which costs somebody who owns their server
 * about twenty seconds in a settings page they already know. The button is
 * offered where it is certain to work.
 */

import { DAV_RELAY } from '$lib/dav';

/** What step 1 hands back, once it has been read and checked. */
export type LoginFlow = {
	/** Where to send the visitor. Opened in a tab of their own. */
	login: string;
	/** What step 3 posts, and where it posts it. */
	pollToken: string;
	pollEndpoint: string;
};

/** What step 3 hands over once they have granted it. */
export type Granted = { user: string; token: string };

/*
 * READ STEP 1'S ANSWER, refusing anything that does not name the SAME SERVER the
 * flow was started on.
 *
 * This is the load-bearing check in the file. Step 1 is the UNAUTHENTICATED one,
 * so that JSON comes from a host which has proven nothing yet — and a server
 * answering with a poll endpoint somewhere else would be pointing this app at a
 * third party while somebody watches a login page they trust.
 *
 * Pure, so the shape can be checked without a network. Everything below needs one.
 */
export function readFlow(body: unknown, base: string): LoginFlow | null {
	if (!body || typeof body !== 'object') return null;

	const said = body as {
		login?: unknown;
		poll?: { token?: unknown; endpoint?: unknown };
	};
	const login = typeof said.login === 'string' ? said.login : '';
	const endpoint =
		typeof said.poll?.endpoint === 'string' ? said.poll.endpoint : '';
	const pollToken = typeof said.poll?.token === 'string' ? said.poll.token : '';
	if (!login || !endpoint || !pollToken) return null;

	const sameServer = (url: string) => {
		try {
			return new URL(url).origin === new URL(base).origin;
		} catch {
			return false;
		}
	};
	if (!sameServer(login) || !sameServer(endpoint)) return null;

	return { login, pollToken, pollEndpoint: endpoint };
}

/** Read step 3's answer. The DAV path is built from `loginName`, so it must be there. */
export function readGranted(body: unknown): Granted | null {
	if (!body || typeof body !== 'object') return null;

	const said = body as { loginName?: unknown; appPassword?: unknown };
	if (typeof said.loginName !== 'string' || !said.loginName) return null;
	if (typeof said.appPassword !== 'string' || !said.appPassword) return null;

	return { user: said.loginName, token: said.appPassword };
}

/*
 * HOW LONG TO WAIT FOR SOMEBODY TO SIGN IN, and how often to ask.
 *
 * Five minutes is a login page with a second factor on it, found on a phone, by
 * somebody who has been interrupted. Two seconds is the interval, which over the
 * whole deadline is at most 150 requests through this site's relay for one
 * attempt — worth knowing, and the reason both numbers are written down here
 * rather than being an interval somebody picked in a component.
 */
export const POLL_EVERY_MS = 2000;
export const POLL_FOR_MS = 5 * 60 * 1000;

/*
 * Through the relay, always — see the note at the head of this file. The route
 * allows the two login paths and nothing else about them is special: no
 * authorization header, because this is the step that exists to create one.
 */
async function viaRelay(
	target: string,
	body?: string,
): Promise<Response | null> {
	try {
		return await fetch(DAV_RELAY, {
			method: 'POST',
			headers: {
				'x-dav-target': target,
				...(body
					? { 'content-type': 'application/x-www-form-urlencoded' }
					: {}),
			},
			body,
		});
	} catch {
		return null;
	}
}

/** Step 1. Null if the server would not start a flow — an old Nextcloud, or not one. */
export async function startLogin(base: string): Promise<LoginFlow | null> {
	const answer = await viaRelay(
		`${base.replace(/\/+$/, '')}/index.php/login/v2`,
	);
	if (!answer?.ok) return null;

	try {
		return readFlow(await answer.json(), base);
	} catch {
		return null;
	}
}

/*
 * STEP 3, ONCE.
 *
 * `pending` is the ORDINARY answer and is not an error: Nextcloud sends 404 for
 * as long as nobody has granted it, which is most of the time somebody is looking
 * at a login page.
 *
 * A request that did not happen, and the relay's own word for a server it could
 * not reach, are `pending` TOO — and that is a change from the first site, which
 * gave up on both. A dropped connection or one 502 while somebody is halfway
 * through a login is not an answer about whether they granted it, and abandoning
 * the flow there means abandoning it at the moment they are most likely to be
 * about to finish. The DEADLINE is what ends a flow that is going nowhere; a
 * blip is not a decision.
 */
export async function pollOnce(
	flow: LoginFlow,
): Promise<Granted | 'pending' | null> {
	const answer = await viaRelay(
		flow.pollEndpoint,
		`token=${encodeURIComponent(flow.pollToken)}`,
	);

	if (!answer) return 'pending';
	if (answer.status === 404) return 'pending';
	if (answer.status === 502 || answer.status === 504) return 'pending';
	if (!answer.ok) return null;

	try {
		return readGranted(await answer.json());
	} catch {
		return null;
	}
}
