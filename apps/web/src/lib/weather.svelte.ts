/*
 * THE WEATHER APP'S STATE: the cities a visitor keeps, the one showing, and a
 * reading for each.
 *
 * The shapes here are what /api/weather and /api/places answer with, and the
 * two routes are the only things that make them. See each for where the numbers
 * come from.
 */

export type Place = {
	id: string;
	name: string;
	state: string;
	lat: number;
	lon: number;
};

/** One forecast hour. `t` carries the place's own offset. */
export type Hour = {
	t: string;
	tempF: number | null;
	feelsF: number | null;
	pop: number;
	label: string;
	night: boolean;
};

/** One day ahead, as the place's calendar has it. */
export type Day = {
	t: string;
	hiF: number | null;
	loF: number | null;
	label: string;
	pop: number;
};

export type Reading = {
	place: string;
	station: { id: string; name: string };
	observedAt: string | null;
	conditions: string;
	night: boolean;
	tempC: number | null;
	tempF: number | null;
	feelsC: number | null;
	feelsF: number | null;
	humidity: number | null;
	windMph: number | null;
	windDir: number | null;
	hours: Hour[];
	days: Day[];
};

export type Unit = 'F' | 'C';

/*
 * SOMEWHERE TO START, so a first visit shows the weather rather than an empty
 * page asking for a city.
 */
const DEFAULT: Place = {
	id: 'default',
	name: 'Des Moines',
	state: 'Iowa',
	lat: 41.601,
	lon: -93.609,
};

const PLACES_KEY = 'weather-places';
const UNIT_KEY = 'weather-unit';

/*
 * A reading is loading only until the first one arrives. A refresh after that
 * keeps the old numbers up and says nothing, because an hour-old temperature is
 * truer than a blank.
 */
export type Status = 'loading' | 'ok' | 'error';

export const weather = $state({
	places: [DEFAULT] as Place[],
	active: 0,
	readings: {} as Record<string, Reading>,
	status: {} as Record<string, Status>,
	unit: 'F' as Unit,
});

export const current = () => weather.places[weather.active] ?? DEFAULT;

/*
 * WHAT THE SKY IS DOING, as one of a few kinds. NWS reports conditions as
 * prose — "Mostly Cloudy", "Light Rain and Fog" — and the mark wants a word it
 * can draw. The ORDER IS THE PRIORITY: a rainy overcast day is a rainy day, so
 * precipitation is asked about before cloud. Anything not recognised is cloud,
 * which is the least wrong guess.
 */
export type Kind =
	'storm' | 'snow' | 'rain' | 'fog' | 'wind' | 'clear' | 'partly' | 'cloudy';

export function kindOf(text: string): Kind {
	const t = text.toLowerCase();
	if (/thunder|tstorm|squall/.test(t)) return 'storm';
	if (/snow|sleet|ice|freezing|wintry/.test(t)) return 'snow';
	if (/rain|drizzle|shower/.test(t)) return 'rain';
	if (/fog|mist|haze|smoke/.test(t)) return 'fog';
	if (/wind|breezy|blustery/.test(t)) return 'wind';
	if (/clear|fair|sunny/.test(t)) return 'clear';
	if (/partly|few|scattered/.test(t)) return 'partly';
	return 'cloudy';
}

export async function load(place: Place) {
	weather.status[place.id] = weather.readings[place.id] ? 'ok' : 'loading';
	try {
		const response = await fetch(
			`/api/weather?lat=${place.lat}&lon=${place.lon}`,
		);
		if (!response.ok) throw new Error(String(response.status));
		weather.readings[place.id] = (await response.json()) as Reading;
		weather.status[place.id] = 'ok';
	} catch {
		weather.status[place.id] = weather.readings[place.id] ? 'ok' : 'error';
	}
}

function save() {
	try {
		localStorage.setItem(
			PLACES_KEY,
			JSON.stringify({ places: weather.places, active: weather.active }),
		);
	} catch {
		// No storage, as in a private window. The cities hold for this visit.
	}
}

/*
 * A CITY PICKED FROM THE SEARCH OPENS BESIDE THE OTHERS and is shown. One
 * already open is shown instead of opened twice.
 */
export function add(place: Place) {
	const open = weather.places.findIndex((p) => p.id === place.id);
	if (open >= 0) {
		weather.active = open;
	} else {
		weather.places = [...weather.places, place];
		weather.active = weather.places.length - 1;
	}
	save();
	load(current());
}

export function show(index: number) {
	weather.active = index;
	save();
	if (!weather.readings[current().id]) load(current());
}

/*
 * THE LAST CITY STAYS. An app with no city in it has nothing to say, and the
 * page offers no way to get there.
 */
export function close(index: number) {
	if (weather.places.length === 1) return;

	weather.places = weather.places.filter((_, i) => i !== index);
	// The city being read stays the one being read, wherever it now sits.
	if (index < weather.active || weather.active >= weather.places.length) {
		weather.active--;
	}
	save();
	if (!weather.readings[current().id]) load(current());
}

export function setUnit(unit: Unit) {
	weather.unit = unit;
	try {
		localStorage.setItem(UNIT_KEY, unit);
	} catch {
		// As in `save`.
	}
}

/** Bring back the cities and the unit from the last visit, then read the sky. */
export function restore() {
	try {
		const saved = JSON.parse(localStorage.getItem(PLACES_KEY) ?? 'null') as {
			places?: Place[];
			active?: number;
		} | null;
		const places = (saved?.places ?? []).filter(
			(p) => typeof p?.lat === 'number' && typeof p?.lon === 'number',
		);
		if (places.length) {
			weather.places = places;
			weather.active = Math.min(
				Math.max(saved?.active ?? 0, 0),
				places.length - 1,
			);
		}

		const unit = localStorage.getItem(UNIT_KEY);
		if (unit === 'F' || unit === 'C') weather.unit = unit;
	} catch {
		// Storage refused or the row malformed. The default city stands.
	}
	load(current());
}

/*
 * THE PLACE'S OWN HOUR, read straight off the string. `…T22:00:00-05:00` is
 * written on the place's wall clock, and `new Date()` would move it to the
 * reader's — so someone in California looking at New York would see New York's
 * weather at California's times.
 */
export function hourOf(iso: string) {
	const hour = Number(iso.slice(11, 13));
	if (!Number.isFinite(hour)) return '';
	const twelve = hour % 12 || 12;
	return `${twelve} ${hour < 12 ? 'AM' : 'PM'}`;
}
