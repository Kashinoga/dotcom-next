import {
	change,
	Contended,
	readStored,
	SESSION_COOKIE,
	tripAt,
	verifySession,
} from '$lib/server/trip';
import { readOp, whoIs } from '$lib/trip';
import type { RequestHandler } from './$types';

/*
 * THE TRIP, FOR A PAGE THAT IS ALREADY OPEN: GET for what it is now, POST for
 * one change to it. The page one level up loads the first copy itself; this is
 * everything after.
 *
 * UNDER THE PAGE'S OWN ADDRESS, and not at /api/trip, for two reasons. The
 * session cookie is kept to that path, so it is sent here and nowhere else. And
 * a wrong slug is a 404 here exactly as it is on the page, so the API says no
 * more about whether a trip exists than the page does.
 *
 * Every answer is the whole trip and its version. A trip is a few kilobytes, and
 * a page that always receives the full picture cannot drift out of step with it
 * by missing a delta.
 */

export const prerender = false;

const HEADERS = { 'cache-control': 'no-store', 'x-robots-tag': 'noindex' };

/* Nothing about why. A stranger is owed a status and nothing else. */
const refuse = (status: number) =>
	new Response(null, { status, headers: HEADERS });

const answer = (body: unknown) =>
	new Response(JSON.stringify(body), {
		headers: { ...HEADERS, 'content-type': 'application/json' },
	});

/*
 * ONE CHANGE IS SMALL. The largest one there is — an item with every field at
 * its ceiling — is under eight kilobytes, so anything past this is not an op.
 */
const MAX_BODY = 16_000;

export const GET: RequestHandler = async ({ cookies, params, platform }) => {
	const env = tripAt(platform, params.slug);
	if (!env.passcode || !env.db) return refuse(503);
	if (!(await verifySession(env.passcode, cookies.get(SESSION_COOKIE))))
		return refuse(401);

	return answer(await readStored(env.db));
};

export const POST: RequestHandler = async ({
	request,
	cookies,
	params,
	platform,
}) => {
	const env = tripAt(platform, params.slug);
	if (!env.passcode || !env.db) return refuse(503);
	/* Who is asking, as signed into their cookie — it goes into the history. */
	const session = await verifySession(
		env.passcode,
		cookies.get(SESSION_COOKIE),
	);
	if (!session) return refuse(401);

	/*
	 * JSON OR NOTHING, and this is part of the defence against a forged request
	 * and not only tidiness. SvelteKit checks the origin of FORM posts; it leaves
	 * a JSON post alone, because a page on another site cannot send one without
	 * the browser first asking this origin's permission — which is never given.
	 * Accepting a form-encoded body here would be accepting the one kind of
	 * request another site CAN send without asking.
	 */
	if (!request.headers.get('content-type')?.startsWith('application/json'))
		return refuse(415);

	const raw = await request.text();
	if (new TextEncoder().encode(raw).length > MAX_BODY) return refuse(413);

	let body: unknown;
	try {
		body = JSON.parse(raw);
	} catch {
		return refuse(400);
	}

	const op = readOp(body);
	if (!op) return refuse(400);

	try {
		return answer(
			await change(env.db, op, whoIs(session.nickname, session.device)),
		);
	} catch (error) {
		/* Too many friends at once. The page keeps the op and sends it again. */
		if (error instanceof Contended) return refuse(409);
		throw error;
	}
};
