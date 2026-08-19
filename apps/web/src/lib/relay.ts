/*
 * WHAT THE DAV RELAY IS ALLOWED TO DO. The rules, on their own, so they can be
 * checked without a server — src/routes/api/dav/+server.ts is the thing that
 * applies them and nothing else.
 *
 * WHY THERE IS A RELAY AT ALL. Nextcloud's WebDAV endpoint sends no
 * `Access-Control-Allow-Origin` for a third-party origin, and PROPFIND with a
 * `Depth` header is preflighted — so a browser cannot reach it from this site
 * unless the server's owner installs something. That is a fine thing to ask of
 * somebody who runs their own instance and an impossible thing to ask of anybody
 * else, which is why there are two modes and why this one exists.
 *
 * AND IT IS A RELAY WITH THIS SITE'S NAME ON IT. That is the honest description
 * and the whole reason this file is separate from the route: an endpoint that
 * forwards to whatever URL a header names can be pointed anywhere by anyone, and
 * every rule below is about narrowing "anywhere" until what is left is a bounded,
 * uninteresting thing to abuse.
 *
 * What the rules leave possible, stated plainly rather than hidden: somebody can
 * use this Worker to talk to Nextcloud DAV endpoints on public https hosts, at up
 * to 4MB a request, with credentials they already had. What they cannot do is
 * reach a private network, probe a port, use it as a general HTTP relay, or get a
 * response cached anywhere.
 *
 * NEXTCLOUD AND OWNCLOUD, AND NOTHING ELSE, ON PURPOSE. The two share one URL
 * layout — `/remote.php/dav/files/<user>` — and that layout being FIXED is what
 * lets the path rule below exist at all. Supporting WebDAV generally would mean a
 * configurable root, which would mean forwarding to any path on any https host,
 * and that is not a control you can tighten later. It is the control.
 *
 * A CHECK THE CLIENT MAKES IS A CHECK AN ATTACKER SKIPS. Nothing here may move
 * into the store that calls it.
 */

/*
 * WHO THIS SAYS IT IS, and it is not a courtesy — it is the NAME OF THE
 * CREDENTIAL.
 *
 * Nextcloud names an app password after the `User-Agent` that asked for it, and
 * that name is what a person reads in Devices & sessions. That list is the one
 * real control anybody has over a token this app holds — $lib/drives.ts says so
 * plainly, and calls everything it does itself a supporting act — so a name
 * nobody recognises quietly takes away the only thing that was actually
 * protecting them.
 *
 * Unset, the name was `node`: the browser's own agent never reaches the far end
 * (see FORWARD_REQ), so what a server saw was whatever the runtime doing the
 * fetch calls itself. Measured on the dev server, which is the literal string
 * `node`; a Worker says something else again, which is the other half of the
 * problem — the name changed with the machine.
 *
 * SET AND NEVER FORWARDED. `user-agent` is deliberately absent from FORWARD_REQ,
 * and must stay absent: a relay that let a caller choose this header would let
 * one person name a stranger's app password anything they liked, in the list that
 * stranger is meant to be able to trust.
 *
 * Kept STABLE for the same reason it is set at all. Somebody who connected a
 * drive last year should find the entry they made, so this must not carry a
 * version or anything else that moves.
 */
export const USER_AGENT = 'Kashinoga Text Editor';

/** How large a document this will carry. These are notes; a cap is not a hardship. */
export const MAX_BODY = 4 * 1024 * 1024;

/** How long to wait on the far end before giving up. */
export const TIMEOUT_MS = 20_000;

/*
 * The methods a workspace uses, and no others. PROPFIND lists, GET reads, PUT
 * writes, MOVE renames and moves, MKCOL makes a folder, DELETE deletes; POST is
 * for the login flow alone.
 *
 * IT GROWS ONE METHOD AT A TIME, each time a gesture needs one, and never in
 * advance. PROPPATCH, LOCK, REPORT and COPY are out — not because they are
 * dangerous, but because this editor does not do them, and a relay should not be
 * able to do on somebody's behalf what its own app cannot.
 */
export const METHODS = new Set([
	'PROPFIND',
	'GET',
	'HEAD',
	'PUT',
	'MOVE',
	'MKCOL',
	'DELETE',
	'POST',
]);

/*
 * Request headers that go on. An allow-list of exactly what this app SENDS.
 * `authorization` is not in it because the credential does not travel under its
 * own name — see the route — and `cookie` is not in it for the reason you would
 * hope.
 *
 * `user-agent` is not in it either, and that one is worth saying out loud because
 * the route DOES send one: it sets its own constant rather than passing on
 * whatever arrived. See USER_AGENT for what that header ends up naming.
 */
export const FORWARD_REQ = [
	'depth',
	'destination',
	'overwrite',
	'if-match',
	'if-none-match',
	'content-type',
];

/*
 * Response headers that come back. `etag` is the one that matters: it is what
 * makes a write refuse to overwrite a document that changed underneath.
 */
export const FORWARD_RES = ['etag', 'content-type', 'dav', 'last-modified'];

/*
 * Paths this will forward to, and the list is deliberately NARROWER than "a DAV
 * path".
 *
 * `/remote.php/dav/FILES/` — not `/remote.php/dav/`. Nextcloud puts several trees
 * under that prefix: calendars, contacts, system tags, versions, trash. This app
 * touches exactly one of them, and an allow-list that permits five because the
 * app uses one is an allow-list doing four fifths of nothing. The narrower it is,
 * the less an app password borrowed through here can reach.
 *
 * The login paths are how this mode gets a token at all, which cannot itself be
 * done directly for the same CORS reason everything here exists for.
 *
 * BOTH SPELLINGS OF THEM, and that is not belt and braces — it is the difference
 * between the flow working and not. The DAV URL is one this app BUILDS, so it is
 * always the `/remote.php/` form; the poll endpoint is one the SERVER hands back,
 * and Nextcloud writes it with `linkToRouteAbsolute`, which drops `/index.php`
 * on any instance with URL rewriting on — which is most of them, and is the
 * default where the rewrite works.
 *
 * So step 1 succeeded and step 3 was refused by this very list: somebody signed
 * in, their server said it was done, and the poll came back 400 from here. Four
 * exact paths, still narrower than "a login path".
 */
const ALLOWED_PATHS = [
	/^\/remote\.php\/dav\/files\//,
	/^(?:\/index\.php)?\/login\/v2(?:\/poll)?$/,
];

/*
 * Hostnames that are not somebody's cloud.
 *
 * The literal ranges matter MOST IN DEVELOPMENT, which is the opposite of the
 * usual way round: on Cloudflare a fetch goes out to the internet and cannot
 * reach the machine it runs on, but `pnpm dev` runs this on a laptop that is
 * inside somebody's home network and can reach every printer on it.
 *
 * A hostname that RESOLVES to a private address still gets through. That cannot
 * be fixed here, because the name is resolved later by whatever does the fetch —
 * it is worth knowing and not worth pretending otherwise.
 */
const PRIVATE_HOST =
	/^(localhost|\[?::1\]?|0\.0\.0\.0)$|\.(local|internal|localhost|home|lan)$|^127\.|^10\.|^192\.168\.|^169\.254\.|^172\.(1[6-9]|2\d|3[01])\.|^\[?(fc|fd|fe80)/i;

export type TargetCheck = { ok: true; url: URL } | { ok: false; why: string };

/*
 * IS THIS SOMEWHERE THE ROUTE MAY FORWARD TO?
 *
 * The order is deliberate: parse, then scheme, then host, then path. A malformed
 * URL must not reach the host test, and a host test that ran after the path test
 * would let somebody probe which paths exist on a machine they were never allowed
 * to name.
 */
export function checkTarget(raw: string | null): TargetCheck {
	if (!raw) return { ok: false, why: 'no target' };

	let url: URL;
	try {
		url = new URL(raw);
	} catch {
		return { ok: false, why: 'not a URL' };
	}

	/* HTTPS only. A credential and a document both travel through here, and the
	 * whole argument for this mode is that somebody trusted it with them. */
	if (url.protocol !== 'https:') return { ok: false, why: 'not https' };
	if (url.username || url.password) {
		return { ok: false, why: 'credentials in the URL' };
	}
	if (PRIVATE_HOST.test(url.hostname)) {
		return { ok: false, why: 'not a public host' };
	}
	/* A port is how a relay becomes a port scanner. 443 is the only one an https
	 * Nextcloud needs that this app has any business reaching. */
	if (url.port && url.port !== '443') {
		return { ok: false, why: 'not the https port' };
	}
	if (!ALLOWED_PATHS.some((allowed) => allowed.test(url.pathname))) {
		return { ok: false, why: 'not a DAV path' };
	}

	return { ok: true, url };
}

/*
 * A MOVE's `Destination` is a second URL and needs every check the first one got
 * — plus one more: it has to be on the SAME server. Without that, a move becomes
 * a way to make one Nextcloud write into another with the first one's credentials.
 */
export function checkDestination(raw: string | null, target: URL): TargetCheck {
	if (!raw) return { ok: false, why: 'no destination' };

	const checked = checkTarget(raw);
	if (!checked.ok) return checked;
	if (checked.url.origin !== target.origin) {
		return { ok: false, why: 'a different server' };
	}

	return checked;
}
