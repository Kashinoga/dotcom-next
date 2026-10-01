import { SESSION_COOKIE, tripAt, verifySession } from '$lib/server/trip';
import { site } from '$lib/site';
import {
	type Area,
	areaParam,
	FAR_MILES,
	outside,
	type PlaceMatch,
	readArea,
} from '$lib/trip';
import type { RequestHandler } from './$types';

/*
 * WHERE A PLACE IS, from OpenStreetMap's Nominatim, for the trip's pins.
 *
 * `?q=` answers with the best match, which the page pins by itself; `&all=1`
 * with up to five, for a person to choose from. `&near=` is the trip's area,
 * which Nominatim ranks first without leaving the rest out, and outside which
 * a best match too far away is answered as not found. Five on a button's press and
 * never as somebody types, because Nominatim does not allow autocomplete.
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
const cache = new Map<string, PlaceMatch[]>();

/* Every lookup waits its turn behind the last, one second apart. */
let queue = Promise.resolve();
let last = 0;

function lookUp(
	place: string,
	limit: number,
	near: Area | null,
): Promise<PlaceMatch[]> {
	const turn = queue.then(async () => {
		const wait = last + 1000 - Date.now();
		if (wait > 0) await new Promise((r) => setTimeout(r, wait));
		last = Date.now();

		const url = new URL('https://nominatim.openstreetmap.org/search');
		url.searchParams.set('format', 'jsonv2');
		url.searchParams.set('limit', String(limit));
		url.searchParams.set('q', place);
		if (near) {
			url.searchParams.set('viewbox', areaParam(near));
			url.searchParams.set('bounded', '0');
		}
		const response = await fetch(url, {
			headers: { 'user-agent': UA, accept: 'application/json' },
			signal: AbortSignal.timeout(6000),
		});
		if (!response.ok) throw new Error(`${response.status}`);

		const hits = (await response.json()) as {
			lat?: string;
			lon?: string;
			display_name?: string;
		}[];
		return hits.flatMap((hit) => {
			const lat = Number(hit.lat);
			const lon = Number(hit.lon);
			return Number.isFinite(lat) && Number.isFinite(lon)
				? [{ name: hit.display_name ?? place, at: { lat, lon } }]
				: [];
		});
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

	const all = url.searchParams.get('all') === '1';
	const near = readArea(url.searchParams.get('near'));
	const key = `${all ? 5 : 1} ${near ? areaParam(near) : ''} ${place.toLowerCase()}`;
	let matches = cache.get(key);
	if (!matches) {
		try {
			matches = await lookUp(place, all ? 5 : 1, near);
		} catch {
			// Not "not found": the page tries again another time.
			return new Response(null, { status: 502, headers: HEADERS });
		}
		cache.set(key, matches);
	}

	const best = matches[0]?.at;
	const body = all
		? { matches }
		: { at: best && !(near && outside(near, best) > FAR_MILES) ? best : null };
	return new Response(JSON.stringify(body), {
		headers: { ...HEADERS, 'content-type': 'application/json' },
	});
};
