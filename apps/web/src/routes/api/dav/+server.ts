import {
	checkDestination,
	checkTarget,
	FORWARD_REQ,
	FORWARD_RES,
	MAX_BODY,
	METHODS,
	TIMEOUT_MS,
} from '$lib/relay';
import type { RequestHandler } from './$types';

/*
 * ONE HOP TO A WEBDAV SERVER the browser cannot reach on its own. See $lib/relay
 * for what it is allowed to do and why each rule is there; this applies those
 * rules and forwards, and holds no policy of its own.
 *
 * THIS IS THE FIRST SERVER CODE ON THIS SITE. Every page is prerendered and the
 * Worker has never been woken to answer anything — the note in +layout.ts says it
 * "stays available for anything dynamic added later", and this is the later. The
 * route opts out of prerendering below; nothing else changes, and every page is
 * still HTML written at build time.
 *
 * AND IT CARRIES A SECRET, which is the thing to hold in mind when reading it.
 * What passes through is somebody's app password and somebody's documents, so:
 *
 *   · the credential travels as `x-dav-authorization` and is put back as
 *     `authorization` on the way out. A header of its own, so nothing in a log
 *     pipeline that knows to redact `authorization` is surprised by the name, and
 *     so a mis-forward cannot leak it under the header a server logs.
 *   · nothing is logged. Not the target, not the path, not a status. A path IS a
 *     filename, and a filename is somebody's business.
 *   · `cache-control: no-store` on the way back, and no `vary` games. This is a
 *     private document and the platform in front of it must not be given a reason
 *     to keep one.
 *   · the body is capped and the far end is given a deadline, so neither a large
 *     PUT nor a hung server can hold a worker open.
 *
 * THE OTHER MODE IS DIRECT, where the credential and the documents never touch
 * this site at all and the server's owner installs a CORS shim instead. Both are
 * offered, as a choice made once when a drive is connected. There is deliberately
 * no fallback between them: a blocked preflight rejects `fetch` with a bare
 * TypeError indistinguishable from a dead network, so "try direct, fall back to
 * proxy" would be a GUESS about where a password goes.
 */

/* Nothing here is a page, and there is nothing to write at build time. */
export const prerender = false;

/** A refusal says nothing. What was wrong is the caller's to know, not a stranger's. */
const refuse = (status: number) =>
	new Response(null, { status, headers: { 'cache-control': 'no-store' } });

const relay: RequestHandler = async ({ request, fetch }) => {
	const method = request.method.toUpperCase();
	if (!METHODS.has(method)) return refuse(405);

	const target = checkTarget(request.headers.get('x-dav-target'));
	if (!target.ok) return refuse(400);

	const headers = new Headers();
	for (const name of FORWARD_REQ) {
		const value = request.headers.get(name);
		if (value !== null) headers.set(name, value);
	}

	/*
	 * A MOVE names a second URL, and it gets every check the first got plus a
	 * same-server rule. Checked here rather than in the loop above because a bad
	 * one must refuse the whole request, not quietly travel without its
	 * destination — which the server would read as a malformed MOVE and answer 400
	 * to, from behind this site's name.
	 */
	if (method === 'MOVE') {
		const destination = checkDestination(
			request.headers.get('destination'),
			target.url,
		);
		if (!destination.ok) return refuse(400);
		headers.set('destination', destination.url.toString());
	}

	const auth = request.headers.get('x-dav-authorization');
	if (auth) headers.set('authorization', auth);

	let body: string | undefined;
	if (method === 'PUT' || method === 'PROPFIND' || method === 'POST') {
		body = await request.text();
		/* Measured in BYTES and not characters: a cap counted in code units is not a
		 * cap, and these are documents in whatever language somebody writes in. */
		if (new TextEncoder().encode(body).length > MAX_BODY) return refuse(413);
	}

	let upstream: Response;
	try {
		upstream = await fetch(target.url.toString(), {
			method,
			headers,
			body,
			/* A redirect is where a validated target becomes an unvalidated one. */
			redirect: 'manual',
			signal: AbortSignal.timeout(TIMEOUT_MS),
		});
	} catch {
		/* Unreachable, refused, timed out. 502 rather than a message: there is
		 * nothing in the failure worth relaying and some of it is the server's own
		 * business. */
		return refuse(502);
	}

	const out = new Headers({ 'cache-control': 'no-store' });
	for (const name of FORWARD_RES) {
		const value = upstream.headers.get(name);
		if (value !== null) out.set(name, value);
	}

	/*
	 * THE STATUS IS THE ANSWER — 207 for a listing, 412 for a conflict, 401 for a
	 * bad password — and every one means something specific to the store at the
	 * other end. Passed through exactly, including the ones that are failures.
	 */
	return new Response(upstream.body, { status: upstream.status, headers: out });
};

export const GET = relay;
export const HEAD = relay;
export const PUT = relay;
export const POST = relay;
export const DELETE = relay;
/** PROPFIND and MOVE have no named export in SvelteKit; this is how they arrive. */
export const fallback = relay;
