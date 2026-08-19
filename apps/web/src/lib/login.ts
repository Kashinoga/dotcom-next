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
 * AND HOW LONG TO WAIT AFTER BEING TOLD TO SLOW DOWN. Nextcloud counts every
 * unanswered poll against its brute-force protection, so asking at the same rate
 * after a 429 is asking to be throttled harder — this is the one answer where
 * carrying on unchanged makes the next one worse.
 */
export const POLL_SLOWLY_MS = 10_000;

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
 * WHAT ONE POLL CAME BACK WITH.
 *
 * `failed` CARRIES THE STATUS, and that is not for a log — it is for the sentence
 * somebody reads. A poll that collapses every way of not working into one null
 * can only say "that sign-in did not finish", which is true, useless, and
 * indistinguishable from the case where they simply did not finish it. The number
 * is the difference between "your server is rate-limiting this" and "something is
 * wrong", and only the number can tell them apart.
 */
export type Polled =
	| { state: 'granted'; granted: Granted }
	/* A pending answer carries its status too, because one of them — 429 — is the
	 * server asking to be asked less often, and the caller can only slow down if it
	 * is told which. */
	| { state: 'pending'; status: number | null }
	| { state: 'failed'; status: number | null };

/*
 * WHICH ANSWERS MEAN "ASK AGAIN", and this is the part with a server's own
 * behaviour written into it.
 *
 * 404 is the ORDINARY one: Nextcloud sends it for as long as nobody has granted
 * the flow, which is most of the time somebody is looking at a login page.
 *
 * 429 is the one that cost a working sign-in. Nextcloud counts every unanswered
 * poll as a failed attempt against its brute-force protection, so a flow that
 * takes a minute to complete — a password, then a second factor, on a phone —
 * has already spent thirty attempts by the time somebody presses Grant. The
 * server then answers the SUCCESSFUL poll with a throttle rather than the
 * credential, and treating that as a refusal throws away a grant that was made.
 *
 * 502 and 504 are the relay's own words for a server it could not reach, and a
 * 5xx is the server having a moment. Neither is an answer about whether anybody
 * granted anything.
 *
 * Everything else is a real no. The DEADLINE is what ends a flow that is going
 * nowhere; a blip is not a decision.
 */
const ASK_AGAIN = (status: number) =>
	status === 404 || status === 429 || status >= 500;

/** Step 3, once. */
export async function pollOnce(flow: LoginFlow): Promise<Polled> {
	const answer = await viaRelay(
		flow.pollEndpoint,
		`token=${encodeURIComponent(flow.pollToken)}`,
	);

	/* The request did not happen at all — offline, or a tab that has been asleep.
	 * Nothing about the grant is known either way. */
	if (!answer) return { state: 'pending', status: null };

	if (!answer.ok) {
		return ASK_AGAIN(answer.status)
			? { state: 'pending', status: answer.status }
			: { state: 'failed', status: answer.status };
	}

	try {
		const granted = readGranted(await answer.json());
		return granted
			? { state: 'granted', granted }
			: { state: 'failed', status: answer.status };
	} catch {
		return { state: 'failed', status: answer.status };
	}
}
