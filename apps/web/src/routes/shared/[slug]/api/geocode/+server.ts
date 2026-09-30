import { SESSION_COOKIE, tripAt, verifySession } from '$lib/server/trip';
import { site } from '$lib/site';
import type { Coords } from '$lib/trip';
import type { RequestHandler } from './$types';

/*
 * WHERE A PLACE IS, from OpenStreetMap's Nominatim, for the trip's pins.
 *
 * Behind the trip's cookie, so it is not a free geocoder for anybody who finds
 * it. Nominatim is free and keyless, and asks three things in return: a
 * User-Agent that says who is calling, no more than one request a second, and
 * answers kept rather than asked for again.
 */
export const prerender = false;

const UA = `${site.name} Trip (${site.email})`;
const HEADERS = { 'cache-control': 'no-store', 'x-robots-tag': 'noindex' };

/* Lives as long as the isolate. A place does not move. */
const cache = new Map<string, Coords | null>();

/* Every lookup waits its turn behind the last, one second apart. */
let queue = Promise.resolve();
let last = 0;

function lookUp(place: string): Promise<Coords | null> {
	const turn = queue.then(async () => {
		const wait = last + 1000 - Date.now();
		if (wait > 0) await new Promise((r) => setTimeout(r, wait));
		last = Date.now();

		const url = new URL('https://nominatim.openstreetmap.org/search');
		url.searchParams.set('format', 'jsonv2');
		url.searchParams.set('limit', '1');
		url.searchParams.set('q', place);
		const response = await fetch(url, {
			headers: { 'user-agent': UA, accept: 'application/json' },
			signal: AbortSignal.timeout(6000),
		});
		if (!response.ok) throw new Error(`${response.status}`);

		const [hit] = (await response.json()) as { lat?: string; lon?: string }[];
		const lat = Number(hit?.lat);
		const lon = Number(hit?.lon);
		return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
	});
	// One failure must not stop the line behind it.
	queue = turn.then(
		() => {},
		() => {},
	);
	return turn;
}

export const GET: RequestHandler = async ({
	url,
	cookies,
	params,
	platform,
}) => {
	const env = tripAt(platform, params.slug);
	if (!env.passcode) return new Response(null, { status: 503 });
	if (!(await verifySession(env.passcode, cookies.get(SESSION_COOKIE))))
		return new Response(null, { status: 401, headers: HEADERS });

	const place = url.searchParams.get('q')?.trim() ?? '';
	if (!place || place.length > 200)
		return new Response(null, { status: 400, headers: HEADERS });

	const key = place.toLowerCase();
	let at = cache.get(key);
	if (at === undefined) {
		try {
			at = await lookUp(place);
		} catch {
			// Not "not found": the page tries again another time.
			return new Response(null, { status: 502, headers: HEADERS });
		}
		cache.set(key, at);
	}

	return new Response(JSON.stringify({ at }), {
		headers: { ...HEADERS, 'content-type': 'application/json' },
	});
};
