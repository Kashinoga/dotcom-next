import { json } from '@sveltejs/kit';
import { site } from '$lib/site';
import type { RequestHandler } from './$types';

/*
 * THE WEATHER OVER ONE PLACE, from the National Weather Service, in one answer.
 *
 * ONE READING TAKES THREE HOPS upstream. `/points/{lat},{lon}` names the list
 * of stations that report for the spot, that list names the nearest one, and
 * only that station's latest observation carries a temperature. From a browser
 * that is three round trips on every visit with nothing shared between visitors;
 * here it is one request in and one small object out, and the forecasts ride
 * along beside it.
 *
 * THE SERVICE IS FREE, KEYLESS AND PUBLIC, and asks one thing in return: that
 * a caller say who it is in the User-Agent, which a page cannot do because the
 * browser owns that header. Its documentation warns that a bare default may be
 * refused.
 *
 * It opts out of prerendering, as every route that answers a question does.
 */
export const prerender = false;

const UA = `${site.name} Weather (${site.email})`;
const NWS = 'https://api.weather.gov';

type Reading = { value: number | null } | null | undefined;

/*
 * `any`, because what comes back is somebody else's GeoJSON and every field is
 * checked where it is read. The Worker's types say `unknown`, which would ask
 * for a cast at each of those reads instead.
 */
async function get(url: string): Promise<any> {
	const response = await fetch(url, {
		headers: { accept: 'application/geo+json', 'user-agent': UA },
		signal: AbortSignal.timeout(6000),
	});
	if (!response.ok) throw new Error(`${response.status} ${url}`);
	return response.json();
}

/*
 * A reading is often present and null — a station that measures no humidity —
 * and NWS reports in Celsius, km/h and metres wherever the place is. They are
 * turned into plain numbers here, so the page holds values and not unit codes.
 */
const num = (reading: Reading) =>
	typeof reading?.value === 'number' ? reading.value : null;
const toF = (c: number) => (c * 9) / 5 + 32;
const toMph = (kmh: number) => kmh * 0.621371;

/*
 * FEELS-LIKE FOR A FORECAST HOUR, from the formulas NWS itself publishes: the
 * Rothfusz heat index when it is hot, the wind-chill regression when it is cold
 * and blowing, and the plain temperature between.
 *
 * NWS computes the same series, but only in the raw gridpoint endpoint — a few
 * hundred kilobytes of every series it keeps — while the hourly forecast already
 * carries the three inputs. Arithmetic is cheaper than that fetch.
 */
function apparentF(tF: number, rh: number | null, windMph: number | null) {
	if (tF >= 80 && rh !== null) {
		return (
			-42.379 +
			2.04901523 * tF +
			10.14333127 * rh -
			0.22475541 * tF * rh -
			0.00683783 * tF * tF -
			0.05481717 * rh * rh +
			0.00122874 * tF * tF * rh +
			0.00085282 * tF * rh * rh -
			0.00000199 * tF * tF * rh * rh
		);
	}
	if (tF <= 50 && windMph !== null && windMph > 3) {
		const v = windMph ** 0.16;
		return 35.74 + 0.6215 * tF - 35.75 * v + 0.4275 * tF * v;
	}
	return tF;
}

// NWS sends about 156 hours. The page is a glance and not a planner.
const HOURS = 12;

/*
 * THE FORECASTS ARE A GARNISH, and each of the two fetches below answers [] on
 * any trouble. Either one failing must never take the current conditions down
 * with it.
 */
async function fetchHours(url: string | undefined) {
	if (!url) return [];
	try {
		const forecast = await get(url);
		const periods: any[] = forecast?.properties?.periods ?? [];
		const now = Date.now();

		return (
			periods
				// The hour we are inside still counts; the ones already spent do not.
				.filter((p) => Date.parse(p.endTime) > now)
				.slice(0, HOURS)
				.map((p) => {
					const tempF = typeof p.temperature === 'number' ? p.temperature : null;
					// `windSpeed` arrives as prose, "5 mph". The leading number is the value.
					const windMph = Number.parseFloat(p.windSpeed) || null;
					return {
						// With the PLACE'S offset on it, which is what the page reads the
						// hour off. See `hourOf` in $lib/weather.svelte.
						t: p.startTime as string,
						tempF,
						feelsF:
							tempF === null
								? null
								: apparentF(tempF, num(p.relativeHumidity), windMph),
						pop: num(p.probabilityOfPrecipitation) ?? 0,
						label: (p.shortForecast as string) ?? '',
						night: p.isDaytime === false,
					};
				})
		);
	} catch {
		return [];
	}
}

/*
 * THE DAYS AHEAD, folded from the twelve-hour periods: the high from the day,
 * the low from the night that starts that evening, the words from the day (or
 * from the night, when the day arrives half spent and has no daytime left).
 *
 * The date is sliced off `startTime`, which carries the place's offset, so it is
 * the place's calendar date and not the server's.
 */
async function fetchDays(url: string | undefined) {
	if (!url) return [];
	try {
		const forecast = await get(url);
		const periods: any[] = forecast?.properties?.periods ?? [];
		type Day = {
			t: string;
			hiF: number | null;
			loF: number | null;
			label: string;
			pop: number;
		};
		const days = new Map<string, Day>();

		for (const p of periods) {
			const date = typeof p.startTime === 'string' ? p.startTime.slice(0, 10) : '';
			if (!date) continue;

			let day = days.get(date);
			if (!day) {
				day = { t: date, hiF: null, loF: null, label: '', pop: 0 };
				days.set(date, day);
			}

			const temp = typeof p.temperature === 'number' ? p.temperature : null;
			if (p.isDaytime) {
				day.hiF = temp;
				day.label = p.shortForecast ?? day.label;
			} else {
				day.loF = temp;
				if (!day.label) day.label = p.shortForecast ?? '';
			}
			day.pop = Math.max(day.pop, num(p.probabilityOfPrecipitation) ?? 0);
		}

		return [...days.values()];
	} catch {
		return [];
	}
}

/*
 * ONE READING PER PLACE, KEPT FOR AS LONG AS IT IS STILL THE LATEST. Module
 * scope, so it lives as long as the Worker's isolate does and no longer.
 *
 * How long is read off the OBSERVATION rather than a clock picked here. A
 * station reports about hourly and says when it did, so once a reading is held
 * there is nothing new to ask for until an hour after its timestamp. Asking
 * before then is a request whose answer is already known, which is exactly the
 * traffic a free public service should not have to carry.
 *
 * FLOOR is the fallback for a reading with no timestamp: never ask about the
 * same place more than once in a few minutes.
 */
type Body = { observedAt: string | null };
const cache = new Map<string, { at: number; body: Body }>();
const FLOOR = 5 * 60 * 1000;
const CYCLE = 60 * 60 * 1000;
// A little past the hour, before expecting the next reading to have landed.
const SLACK = 5 * 60 * 1000;

function stillCurrent(hit: { at: number; body: Body }) {
	const now = Date.now();
	if (now - hit.at < FLOOR) return true;

	const observed = hit.body.observedAt ? Date.parse(hit.body.observedAt) : NaN;
	if (!Number.isFinite(observed)) return false;

	return now < observed + CYCLE + SLACK;
}

export const GET: RequestHandler = async ({ url }) => {
	const lat = Number(url.searchParams.get('lat'));
	const lon = Number(url.searchParams.get('lon'));
	if (
		!url.searchParams.has('lat') ||
		!url.searchParams.has('lon') ||
		!Number.isFinite(lat) ||
		!Number.isFinite(lon) ||
		Math.abs(lat) > 90 ||
		Math.abs(lon) > 180
	) {
		return json({ message: 'Bad coordinates.' }, { status: 400 });
	}

	// Three decimals is about a hundred metres, finer than a forecast grid cell.
	const key = `${lat.toFixed(3)},${lon.toFixed(3)}`;
	const hit = cache.get(key);
	if (hit && stillCurrent(hit)) {
		return json(hit.body, { headers: { 'cache-control': 'public, max-age=300' } });
	}

	try {
		// 1. The grid point. It knows the nearest town and who reports for it.
		const point = await get(`${NWS}/points/${key}`);
		const near = point?.properties?.relativeLocation?.properties;
		const place = near?.city && near?.state ? `${near.city}, ${near.state}` : '';

		// 2. The stations that report for it, nearest first.
		const stations = await get(point.properties.observationStations);
		const station = stations?.features?.[0]?.properties;
		if (!station?.stationIdentifier) throw new Error('No station.');

		// 3. That station's latest reading, and the two forecasts the grid point
		// already named. The three do not depend on each other.
		const [observation, hours, days] = await Promise.all([
			get(`${NWS}/stations/${station.stationIdentifier}/observations/latest`),
			fetchHours(point.properties.forecastHourly),
			fetchDays(point.properties.forecast),
		]);

		const p = observation?.properties ?? {};
		const tempC = num(p.temperature);
		// NWS reports whichever of the two applies, if either does.
		const feelsC = num(p.heatIndex) ?? num(p.windChill);
		const windKmh = num(p.windSpeed);

		const body = {
			place,
			station: { id: station.stationIdentifier, name: station.name ?? '' },
			observedAt: (p.timestamp as string) ?? null,
			conditions: (p.textDescription as string) ?? '',
			/*
			 * Night matters to the mark: a clear night is a moon and not a sun. NWS
			 * says so only in the path of its own icon, `…/icons/land/night/skc`,
			 * and the icon itself goes unused — the page draws its own.
			 */
			night: typeof p.icon === 'string' && p.icon.includes('/night/'),
			tempC,
			tempF: tempC === null ? null : toF(tempC),
			feelsC,
			feelsF: feelsC === null ? null : toF(feelsC),
			humidity: num(p.relativeHumidity),
			windMph: windKmh === null ? null : toMph(windKmh),
			windDir: num(p.windDirection),
			hours,
			days,
		};
		if (body.tempC === null && !body.conditions) throw new Error('Empty.');

		cache.set(key, { at: Date.now(), body });
		return json(body, { headers: { 'cache-control': 'public, max-age=300' } });
	} catch {
		/*
		 * THE LAST GOOD READING BEATS NONE. The upstream is down, or a station
		 * briefly reports nothing: an hour-old temperature is still worth showing.
		 * With nothing kept, the page says so.
		 */
		if (hit) {
			return json(hit.body, { headers: { 'cache-control': 'public, max-age=60' } });
		}
		return json({ message: 'The upstream is unavailable.' }, { status: 502 });
	}
};
