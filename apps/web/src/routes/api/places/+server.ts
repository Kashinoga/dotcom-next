import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/*
 * CITY SEARCH, for the Weather app's field.
 *
 * Open-Meteo's geocoder is free and keyless, and sends no CORS header, so a
 * page cannot ask it directly. This asks for it.
 *
 * ONLY THE UNITED STATES COMES BACK, and that is the service's boundary rather
 * than a shortcut. The National Weather Service covers the US and its
 * territories, and a search that offered Paris would be offering a city the app
 * cannot then report on.
 */
export const prerender = false;

const UPSTREAM = 'https://geocoding-api.open-meteo.com/v1/search';

type Hit = {
	id?: number;
	name?: string;
	admin1?: string;
	country_code?: string;
	feature_code?: string;
	latitude?: number;
	longitude?: number;
	population?: number;
};

export const GET: RequestHandler = async ({ url }) => {
	const q = (url.searchParams.get('q') ?? '').trim();
	// Below two characters the geocoder says nothing useful.
	if (q.length < 2) {
		return json({ places: [] }, { headers: { 'cache-control': 'no-store' } });
	}

	try {
		const response = await fetch(
			`${UPSTREAM}?name=${encodeURIComponent(q)}&count=20&language=en&format=json`,
			{ headers: { accept: 'application/json' }, signal: AbortSignal.timeout(6000) },
		);
		if (!response.ok) throw new Error(String(response.status));
		const data = (await response.json()) as { results?: Hit[] };

		const places = (data.results ?? [])
			/*
			 * `PPL…` is GeoNames for a populated place — a city, town or village.
			 * Without it "Seattle" also offers a raceway and a heliport.
			 */
			.filter(
				(hit) =>
					hit.country_code === 'US' &&
					typeof hit.latitude === 'number' &&
					(hit.feature_code ?? 'PPL').startsWith('PPL'),
			)
			// The biggest first, so "Springfield" means the one most people mean.
			.sort((a, b) => (b.population ?? 0) - (a.population ?? 0))
			.slice(0, 6)
			.map((hit) => ({
				id: String(hit.id ?? `${hit.latitude},${hit.longitude}`),
				name: hit.name ?? '',
				state: hit.admin1 ?? '',
				lat: hit.latitude as number,
				lon: hit.longitude as number,
			}));

		// A city does not move. The answer can be kept for a day.
		return json({ places }, { headers: { 'cache-control': 'public, max-age=86400' } });
	} catch {
		return json({ places: [], message: 'Search is unavailable.' }, { status: 502 });
	}
};
