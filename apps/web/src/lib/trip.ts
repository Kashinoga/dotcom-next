/*
 * A TRIP, and every change anybody can make to one.
 *
 * THE TRIP ITSELF IS NOT IN THIS REPOSITORY, and must never be. The repository is
 * public, and an itinerary is where somebody will be sleeping on which nights.
 * It lives in the Worker's database and nowhere else; `scripts/trip-seed.ts`
 * loads it there from a file kept outside the tree. What is here is the SHAPE of
 * a trip, which says nothing about anybody's.
 *
 * ── Changes, not saves ───────────────────────────────────────────────────────
 *
 * A browser never sends a whole trip back. It sends one `TripOp` — move this,
 * rename that — and the server applies it to whatever the trip is NOW. Two people
 * moving two different things at the same moment therefore both get what they
 * did, where a save of the whole document would hand the second one's copy over
 * the first one's change without either of them knowing.
 *
 * `applyOp` is the ONE place a change is carried out, and both ends run it: the
 * page to show a change before the server has answered, the server to make it
 * real. It is pure and takes no clock, no network and no DOM, which is what lets
 * the two agree and lets e2e/trip.spec.ts ask it questions directly.
 *
 * EVERY OP IS SAFE TO SEND TWICE. A request that timed out may or may not have
 * landed, and the page sends it again; an `add` whose id already exists and a
 * `remove` of something already gone both do nothing, so a retry cannot double a
 * dinner or fail on a delete that worked.
 *
 * EVERY OP IS SAFE TO SEND LATE, too. Somebody may have deleted the thing it
 * names while it was on its way, and an op aimed at nothing does nothing.
 */

export const CATEGORIES = [
	{ id: 'logistics', name: 'Getting around' },
	{ id: 'water', name: 'Beaches & water' },
	{ id: 'nature', name: 'Hikes & nature' },
	{ id: 'tours', name: 'Tours & excursions' },
	{ id: 'food', name: 'Food & drink' },
	{ id: 'shopping', name: 'Shopping & markets' },
	{ id: 'other', name: 'Everything else' },
] as const;

export type CategoryId = (typeof CATEGORIES)[number]['id'];

export interface Item {
	id: string;
	title: string;
	category: CategoryId;
	/* `HH:MM`, or empty for "some time that day". Most things are empty. */
	time: string;
	/* Where it is, for the map link. Empty means the title is searched instead. */
	place: string;
	notes: string;
	/* What has to happen BEFORE the day — a booking, something to pack. Empty
	 * means nothing does. */
	prep: string;
	prepDone: boolean;
	/* Where `place` was found. Absent means not looked up yet; null means
	 * looked up and not found. */
	at?: Coords | null;
	/* A base of its own, so every other row says how far it is from here. */
	base?: boolean;
}

export interface Coords {
	lat: number;
	lon: number;
}

/* One answer to "where is this?", for a person to choose among. */
export interface PlaceMatch {
	/* Nominatim's full name for it, "Lake McDonald Lodge, …, Montana, United States". */
	name: string;
	at: Coords;
}

/*
 * A PLACE THE WHOLE TRIP IS MEASURED FROM, the hotel or the airport. Kept
 * apart from the days, because nobody does the hotel on Day 3.
 */
export interface Base {
	id: string;
	label: string;
	place: string;
	at?: Coords | null;
}

export interface Day {
	id: string;
	/* `YYYY-MM-DD`, or empty for a day that has not been given one. */
	date: string;
	title: string;
	items: Item[];
}

/*
 * THE TRIP'S MARK, the tile beside its name: how everybody is getting there,
 * or what kind of trip it is.
 * Ids and not components, because the seed script runs this file in plain
 * Node; $lib/trip-icons draws them.
 */
export const TRIP_ICONS = [
	{ id: 'plane', name: 'Plane', group: 'travel' },
	{ id: 'car', name: 'Car', group: 'travel' },
	{ id: 'train', name: 'Train', group: 'travel' },
	{ id: 'bus', name: 'Bus', group: 'travel' },
	{ id: 'ship', name: 'Ship', group: 'travel' },
	{ id: 'sailboat', name: 'Sailboat', group: 'travel' },
	{ id: 'bike', name: 'Bike', group: 'travel' },
	{ id: 'walk', name: 'On foot', group: 'travel' },
	{ id: 'beach', name: 'Beach', group: 'kind' },
	{ id: 'parasol', name: 'Parasol', group: 'kind' },
	{ id: 'forest', name: 'Forest', group: 'kind' },
	{ id: 'mountains', name: 'Mountains', group: 'kind' },
	{ id: 'camping', name: 'Camping', group: 'kind' },
	{ id: 'snow', name: 'Snow', group: 'kind' },
	{ id: 'road-trip', name: 'Road trip', group: 'kind' },
	{ id: 'backpacking', name: 'Backpacking', group: 'kind' },
	{ id: 'wildlife', name: 'Wildlife', group: 'kind' },
	{ id: 'fishing', name: 'Fishing', group: 'kind' },
	{ id: 'city', name: 'City', group: 'kind' },
	{ id: 'sights', name: 'Sights', group: 'kind' },
	{ id: 'castles', name: 'Castles', group: 'kind' },
	{ id: 'wine', name: 'Wine country', group: 'kind' },
	{ id: 'festival', name: 'Festival', group: 'kind' },
	{ id: 'music', name: 'Music', group: 'kind' },
	{ id: 'theme-park', name: 'Theme park', group: 'kind' },
] as const;

/* The picker's two rows: how everybody gets there, and what kind of trip it is. */
export const TRIP_ICON_GROUPS = [
	{ id: 'travel', name: 'Getting there' },
	{ id: 'kind', name: 'Kind of trip' },
] as const;

export type TripIconId = (typeof TRIP_ICONS)[number]['id'];

export interface Trip {
	title: string;
	tagline: string;
	/* Optional, because trips stored before it existed have none. None means
	 * the site's sticky note. */
	icon?: TripIconId;
	days: Day[];
	/* Optional, as `icon` is. */
	bases?: Base[];
	/* NOT SCHEDULED YET. Kept in the order they arrived; the page groups them by
	 * category, so an order among them is not something anybody arranges. */
	ideas: Item[];
}

/** Where an item can be put: a day's id, or this. */
export const IDEAS = 'ideas';

export type ItemFields = Omit<Item, 'id'>;
export type BaseFields = Pick<Base, 'label' | 'place'>;
export type DayFields = Pick<Day, 'date' | 'title'>;
/* An empty icon takes the mark off. */
export type TripFields = Partial<
	Pick<Trip, 'title' | 'tagline'> & { icon: TripIconId | '' }
>;

export type TripOp =
	| { type: 'move'; id: string; to: string; index: number }
	| { type: 'edit'; id: string; fields: Partial<ItemFields> }
	| { type: 'add'; to: string; item: Item }
	| { type: 'remove'; id: string }
	| { type: 'addDay'; day: Omit<Day, 'items'> }
	| { type: 'editDay'; id: string; fields: Partial<DayFields> }
	| { type: 'moveDay'; id: string; index: number }
	| { type: 'removeDay'; id: string }
	| { type: 'editTrip'; fields: TripFields }
	| { type: 'addBase'; base: Omit<Base, 'at'> }
	| { type: 'editBase'; id: string; fields: Partial<BaseFields> }
	| { type: 'removeBase'; id: string }
	/* Where an item's or a base's place was found. Carries the place it looked
	 * up, so an answer that arrives after the place changed lands nowhere. */
	| { type: 'pin'; id: string; place: string; at: Coords | null };

export const EMPTY_TRIP: Trip = {
	title: 'Trip',
	tagline: '',
	days: [],
	ideas: [],
};

/*
 * CEILINGS, so one bad request cannot grow the one row every friend loads on
 * every visit. Generous against a real trip: eight days of seven things each is
 * fifty-six items.
 */
export const LIMITS = {
	days: 60,
	bases: 20,
	items: 600,
	title: 200,
	notes: 4000,
};

/** The list an id is in, and where in it. `null` when nothing has that id. */
export function locate(
	trip: Trip,
	id: string,
): { list: Item[]; index: number } | null {
	for (const list of [...trip.days.map((d) => d.items), trip.ideas]) {
		const index = list.findIndex((item) => item.id === id);
		if (index !== -1) return { list, index };
	}
	return null;
}

function listFor(trip: Trip, to: string): Item[] | null {
	if (to === IDEAS) return trip.ideas;
	return trip.days.find((d) => d.id === to)?.items ?? null;
}

const clamp = (n: number, max: number) =>
	Math.max(0, Math.min(Number.isFinite(n) ? Math.trunc(n) : max, max));

const countItems = (trip: Trip) =>
	trip.ideas.length + trip.days.reduce((n, d) => n + d.items.length, 0);

/*
 * CARRY OUT ONE CHANGE, and hand back a NEW trip. The one passed in is left as it
 * was: the page keeps the server's last answer beside its own unconfirmed
 * changes, and has to be able to lay those changes on it again.
 *
 * `structuredClone` would be the obvious copy and is the wrong one here — Svelte
 * holds state in proxies, and a proxy cannot be cloned that way. JSON can, and a
 * trip is nothing but JSON.
 */
export function applyOp(current: Trip, op: TripOp): Trip {
	const trip: Trip = JSON.parse(JSON.stringify(current));

	switch (op.type) {
		case 'move': {
			const from = locate(trip, op.id);
			const target = listFor(trip, op.to);
			if (!from || !target) return current;

			const [item] = from.list.splice(from.index, 1);
			// The index is into the list WITHOUT the item, which is what a reader
			// dragging it sees: the gap it left has already closed.
			target.splice(clamp(op.index, target.length), 0, item);
			return trip;
		}

		case 'edit': {
			const at = locate(trip, op.id);
			if (!at) return current;
			const item = { ...at.list[at.index], ...op.fields };
			// A new place is somewhere new, and the old pin no longer marks it.
			if (
				op.fields.place !== undefined &&
				op.fields.place !== at.list[at.index].place
			)
				delete item.at;
			if (item.base === false) delete item.base;
			at.list[at.index] = item;
			return trip;
		}

		case 'add': {
			const target = listFor(trip, op.to);
			if (!target || locate(trip, op.item.id)) return current;
			if (countItems(trip) >= LIMITS.items) return current;
			target.push(op.item);
			return trip;
		}

		case 'remove': {
			const at = locate(trip, op.id);
			if (!at) return current;
			at.list.splice(at.index, 1);
			return trip;
		}

		case 'addDay': {
			if (trip.days.some((d) => d.id === op.day.id)) return current;
			if (trip.days.length >= LIMITS.days) return current;
			trip.days.push({ ...op.day, items: [] });
			return trip;
		}

		case 'editDay': {
			const day = trip.days.find((d) => d.id === op.id);
			if (!day) return current;
			Object.assign(day, op.fields);
			return trip;
		}

		case 'moveDay': {
			const index = trip.days.findIndex((d) => d.id === op.id);
			if (index === -1) return current;
			const [day] = trip.days.splice(index, 1);
			trip.days.splice(clamp(op.index, trip.days.length), 0, day);
			return trip;
		}

		case 'removeDay': {
			/*
			 * A DAY GOES, ITS PLANS DO NOT. Everything that was on it goes back to
			 * the ideas, because a person deleting "Day 6" has decided there is no
			 * Day 6 — not that the lei class is off.
			 */
			const index = trip.days.findIndex((d) => d.id === op.id);
			if (index === -1) return current;
			const [day] = trip.days.splice(index, 1);
			trip.ideas.push(...day.items);
			return trip;
		}

		case 'editTrip': {
			const { icon, ...rest } = op.fields;
			Object.assign(trip, rest);
			if (icon === '') delete trip.icon;
			else if (icon) trip.icon = icon;
			return trip;
		}

		case 'addBase': {
			const bases = (trip.bases ??= []);
			if (bases.some((b) => b.id === op.base.id)) return current;
			if (bases.length >= LIMITS.bases) return current;
			bases.push({ ...op.base });
			return trip;
		}

		case 'editBase': {
			const base = trip.bases?.find((b) => b.id === op.id);
			if (!base) return current;
			if (op.fields.place !== undefined && op.fields.place !== base.place)
				delete base.at;
			Object.assign(base, op.fields);
			return trip;
		}

		case 'removeBase': {
			const index = trip.bases?.findIndex((b) => b.id === op.id) ?? -1;
			if (index === -1) return current;
			trip.bases!.splice(index, 1);
			return trip;
		}

		case 'pin': {
			const found = locate(trip, op.id);
			const target =
				found?.list[found.index] ?? trip.bases?.find((b) => b.id === op.id);
			if (!target || target.place !== op.place) return current;
			if (JSON.stringify(target.at) === JSON.stringify(op.at)) return current;
			target.at = op.at;
			return trip;
		}
	}
}

/* ─── How far ────────────────────────────────────────────────────────────────
 * As the crow flies, and said so on the page. Driving time would need a routing
 * service, and the free ones ask not to be used for anything real.
 */

/* Haversine, on a sphere of the Earth's mean radius in miles. */
export function miles(a: Coords, b: Coords) {
	const rad = Math.PI / 180;
	const dLat = (b.lat - a.lat) * rad;
	const dLon = (b.lon - a.lon) * rad;
	const h =
		Math.sin(dLat / 2) ** 2 +
		Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
	return 2 * 3958.8 * Math.asin(Math.sqrt(h));
}

/** `0.04` → `under 0.1 mi`; `3.14` → `3.1 mi`; `12.6` → `13 mi` */
export function formatMiles(n: number) {
	if (n < 0.1) return 'under 0.1 mi';
	return n < 10 ? `${n.toFixed(1)} mi` : `${Math.round(n)} mi`;
}

/* ─── Where the trip is ──────────────────────────────────────────────────────
 * A short name means different places in different states: "Waikiki Beach" is
 * first a beach in Salem, Massachusetts. So lookups prefer the trip's own
 * area, and a background lookup that still lands far outside it is taken as
 * not found rather than pinned there.
 */

export interface Area {
	west: number;
	south: number;
	east: number;
	north: number;
}

/* Past this from the middle a pin is a stray, and does not stretch the area. */
const STRAY_MILES = 250;
/* A quarter of a degree is about 17 miles, room round the outermost pins. */
const PAD = 0.25;
/* A match further than this outside the area is somewhere else of that name. */
export const FAR_MILES = 150;

const median = (values: number[]) =>
	values.toSorted((a, b) => a - b)[values.length >> 1];

/** The box round the trip's bases and pins, strays left out. `null` before any are found. */
export function areaOf(trip: Trip): Area | null {
	const points = [
		...(trip.bases ?? []).map((b) => b.at),
		...[...trip.days.flatMap((d) => d.items), ...trip.ideas].map((i) => i.at),
	].filter((at): at is Coords => !!at);
	if (!points.length) return null;

	const middle = {
		lat: median(points.map((p) => p.lat)),
		lon: median(points.map((p) => p.lon)),
	};
	const near = points.filter((p) => miles(middle, p) <= STRAY_MILES);
	return {
		west: Math.max(-180, Math.min(...near.map((p) => p.lon)) - PAD),
		south: Math.max(-90, Math.min(...near.map((p) => p.lat)) - PAD),
		east: Math.min(180, Math.max(...near.map((p) => p.lon)) + PAD),
		north: Math.min(90, Math.max(...near.map((p) => p.lat)) + PAD),
	};
}

/** How far a point is outside the area, in miles; 0 inside it. */
export function outside(area: Area, at: Coords) {
	const nearest = {
		lat: Math.max(area.south, Math.min(at.lat, area.north)),
		lon: Math.max(area.west, Math.min(at.lon, area.east)),
	};
	return miles(nearest, at);
}

/** `west,south,east,north`, Nominatim's own order for a viewbox. */
export const areaParam = (area: Area) =>
	[area.west, area.south, area.east, area.north]
		.map((n) => n.toFixed(3))
		.join(',');

export function readArea(v: string | null): Area | null {
	const n = v?.split(',').map(Number);
	if (!n || n.length !== 4 || !n.every(Number.isFinite)) return null;
	const [west, south, east, north] = n;
	if (Math.abs(west) > 180 || Math.abs(east) > 180) return null;
	if (Math.abs(south) > 90 || Math.abs(north) > 90) return null;
	return west < east && south < north ? { west, south, east, north } : null;
}

/*
 * EVERYTHING THE TRIP IS MEASURED FROM, with a place found: the trip's own
 * bases, then any item marked as one. An item marked as a base goes by its title.
 */
export function basesOf(
	trip: Trip,
): { id: string; label: string; at: Coords }[] {
	const items = [...trip.days.flatMap((d) => d.items), ...trip.ideas];
	return [
		...(trip.bases ?? []).map((b) => ({ id: b.id, label: b.label, at: b.at })),
		...items
			.filter((i) => i.base)
			.map((i) => ({ id: i.id, label: i.title, at: i.at })),
	].filter((b): b is { id: string; label: string; at: Coords } => !!b.at);
}

/* ─── Who changed what ───────────────────────────────────────────────────────
 * Every change the server takes is written down: who, when, and one sentence of
 * what. The newest hundred are kept. The sentence is made HERE, from the trip as
 * it was just before the change — "Moved Zip-lining from Day 2 to Day 3" needs to
 * know it was on Day 2 — and stored as words, so the history still reads
 * correctly after Day 2 has been renamed, moved or deleted.
 */

export interface Revision {
	/* The trip's version this change made. */
	version: number;
	/* Milliseconds since the epoch, as the Worker's clock had it. */
	at: number;
	who: string;
	summary: string;
}

export const HISTORY_LIMIT = 100;

export const NICKNAME_MAX = 32;

/*
 * A NICKNAME, as typed. Runs of whitespace become one space, the ends are
 * trimmed, and anything a person cannot see is refused: control characters, and
 * the bidirectional overrides that would let "Alex" be stored so it displays as
 * somebody else's name. Emoji are welcome, joiners and all — a joiner is how 👩‍💻
 * is one picture rather than two.
 *
 * Counted in characters rather than code units, so a name in emoji is allowed as
 * many as a name in letters.
 */
export function readNickname(v: unknown): string | null {
	if (typeof v !== 'string') return null;
	const name = v.normalize('NFC').replace(/\s+/g, ' ').trim();
	if (!name || [...name].length > NICKNAME_MAX) return null;
	if (/[\p{Cc}\u202A-\u202E\u2066-\u2069]/u.test(name)) return null;
	return name;
}

/*
 * THE NAME FOR SOMEBODY WHO GAVE NONE. A nickname is optional, so a field left
 * blank signs as this; one that has something in it is still read, and refused,
 * like any other.
 */
export const NICKNAME_ANONYMOUS = 'Anonymous';

export function readOptionalNickname(v: unknown): string | null {
	if (v == null || (typeof v === 'string' && !v.trim())) {
		return NICKNAME_ANONYMOUS;
	}
	return readNickname(v);
}

/*
 * A DEVICE NAME, for somebody on the trip from more than one phone or computer.
 * Read by the nickname's rules, and optional without a stand-in: blank is `''`,
 * and the history then gives the nickname alone. `null` is a name refused.
 */
export function readDevice(v: unknown): string | null {
	if (v == null || (typeof v === 'string' && !v.trim())) return '';
	return readNickname(v);
}

/* What the history calls a change's author: "Kashinoga on Artemis", or "Kashinoga". */
export const whoIs = (nickname: string, device: string) =>
	device ? `${nickname} on ${device}` : nickname;

/*
 * ONE SENTENCE FOR ONE CHANGE, from the trip BEFORE it. Titles are written as
 * they are; words somebody typed into a field that is not a title are quoted,
 * so a to-do reading "Book it" is not mistaken for part of the sentence.
 *
 * An edit names the field that changed. The page sends one field per edit, so
 * the first one found is the one there is.
 */
export function describeOp(before: Trip, op: TripOp): string {
	const item = (id: string) => {
		const at = locate(before, id);
		return at ? at.list[at.index] : null;
	};
	const title = (id: string) => item(id)?.title ?? 'something';
	const baseLabel = (id: string) =>
		before.bases?.find((b) => b.id === id)?.label ?? 'a base';
	const listOf = (id: string) =>
		before.days.find((d) => d.items.some((i) => i.id === id))?.id ?? IDEAS;
	const dayLabel = (id: string) => {
		const index = before.days.findIndex((d) => d.id === id);
		return index === -1 ? 'a day' : `Day ${index + 1}`;
	};
	const where = (list: string) =>
		list === IDEAS ? 'Not scheduled yet' : dayLabel(list);

	switch (op.type) {
		case 'move': {
			const from = listOf(op.id);
			if (from === op.to) return `Reordered ${title(op.id)} on ${where(from)}`;
			if (op.to === IDEAS)
				return `Unscheduled ${title(op.id)} from ${where(from)}`;
			if (from === IDEAS) return `Scheduled ${title(op.id)} on ${where(op.to)}`;
			return `Moved ${title(op.id)} from ${where(from)} to ${where(op.to)}`;
		}

		case 'edit': {
			const name = title(op.id);
			const f = op.fields;
			const prep = f.prep ?? item(op.id)?.prep ?? '';
			if (f.title !== undefined) return `Renamed ${name} to ${f.title}`;
			if (f.prepDone === true) return `Checked off “${prep}” for ${name}`;
			if (f.prepDone === false) return `Unchecked “${prep}” for ${name}`;
			if (f.time !== undefined)
				return f.time
					? `Set ${name} for ${formatTime(f.time)}`
					: `Cleared the time on ${name}`;
			if (f.category !== undefined)
				return `Filed ${name} under ${CATEGORIES.find((c) => c.id === f.category)?.name}`;
			if (f.place !== undefined)
				return f.place
					? `Set the place for ${name} to “${f.place}”`
					: `Cleared the place for ${name}`;
			if (f.notes !== undefined) return `Edited the notes on ${name}`;
			if (f.base !== undefined)
				return f.base
					? `Measured everything from ${name}`
					: `Stopped measuring from ${name}`;
			if (f.prep !== undefined)
				return f.prep
					? `Added “${f.prep}” to do for ${name}`
					: `Removed the to-do from ${name}`;
			return `Edited ${name}`;
		}

		case 'add':
			return `Added ${op.item.title} to ${where(op.to)}`;

		case 'remove':
			return `Deleted ${title(op.id)} from ${where(listOf(op.id))}`;

		case 'addDay':
			return op.day.date
				? `Added Day ${before.days.length + 1}, ${formatDate(op.day.date)}`
				: `Added Day ${before.days.length + 1}`;

		case 'editDay': {
			const label = dayLabel(op.id);
			if (op.fields.date !== undefined)
				return op.fields.date
					? `Set ${label} to ${formatDate(op.fields.date)}`
					: `Cleared the date on ${label}`;
			if (op.fields.title !== undefined)
				return op.fields.title
					? `Described ${label} as “${op.fields.title}”`
					: `Cleared the description of ${label}`;
			return `Edited ${label}`;
		}

		case 'moveDay': {
			const to = Math.min(op.index, before.days.length - 1) + 1;
			return `Moved ${dayLabel(op.id)} to Day ${to}`;
		}

		case 'removeDay': {
			const count = before.days.find((d) => d.id === op.id)?.items.length ?? 0;
			return count
				? `Removed ${dayLabel(op.id)} and unscheduled ${count} ${count === 1 ? 'thing' : 'things'}`
				: `Removed ${dayLabel(op.id)}`;
		}

		case 'addBase':
			return `Added ${op.base.label} as a base`;

		case 'editBase': {
			const label = baseLabel(op.id);
			if (op.fields.label !== undefined)
				return `Renamed the base ${label} to ${op.fields.label}`;
			return op.fields.place
				? `Set the place for ${label} to “${op.fields.place}”`
				: `Cleared the place for ${label}`;
		}

		case 'removeBase':
			return `Removed the base ${baseLabel(op.id)}`;

		/* A lookup, not a decision anybody made, so it has no line in the history. */
		case 'pin':
			return '';

		case 'editTrip':
			if (op.fields.title !== undefined)
				return `Renamed the trip to “${op.fields.title}”`;
			if (op.fields.icon !== undefined)
				return op.fields.icon
					? `Changed the mark to “${iconName(op.fields.icon)}”`
					: 'Took the mark off the trip';
			return op.fields.tagline
				? `Changed the line under the name to “${op.fields.tagline}”`
				: 'Cleared the line under the name';
	}
}

/* ─── Saying a date and a time ───────────────────────────────────────────────
 * By hand and in one fixed English, not `toLocaleDateString`. The page is
 * rendered by the Worker and then again by the browser, and the two have
 * different locales and different time zones — so the server would print one
 * weekday and the browser another, and whichever lost would flicker. A date here
 * is a day on a calendar and not an instant, so it is read as UTC and nothing
 * shifts it.
 */

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
	'Jan',
	'Feb',
	'Mar',
	'Apr',
	'May',
	'Jun',
	'Jul',
	'Aug',
	'Sep',
	'Oct',
	'Nov',
	'Dec',
];

const utc = (iso: string) => {
	const [y, m, d] = iso.split('-').map(Number);
	return new Date(Date.UTC(y, m - 1, d));
};

/** `2026-10-15` → `Thu, Oct 15` */
export function formatDate(iso: string) {
	const date = utc(iso);
	return `${WEEKDAYS[date.getUTCDay()]}, ${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}`;
}

/** `2026-10-15` → `2026-10-16`, for a day added after it. */
export function nextDate(iso: string) {
	const date = utc(iso);
	date.setUTCDate(date.getUTCDate() + 1);
	return date.toISOString().slice(0, 10);
}

/** `15:40` → `3:40 pm`; `09:00` → `9 am`. */
export function formatTime(hhmm: string) {
	const [h, m] = hhmm.split(':').map(Number);
	const hour = h % 12 || 12;
	const suffix = h < 12 ? 'am' : 'pm';
	return m
		? `${hour}:${String(m).padStart(2, '0')} ${suffix}`
		: `${hour} ${suffix}`;
}

/* ─── Reading what arrived ───────────────────────────────────────────────────
 * Everything below takes `unknown`, because what it reads came over a network or
 * out of a file, and hands back a well-formed value or `null`. A field that is
 * the wrong type is a refusal, not a guess: a trip is everyone's, and one
 * malformed op must not be able to put a `null` where every page expects text.
 */

const ID = /^[A-Za-z0-9_-]{1,64}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

type Record_ = Record<string, unknown>;
const isRecord = (v: unknown): v is Record_ =>
	!!v && typeof v === 'object' && !Array.isArray(v);

const text = (v: unknown, max: number) =>
	typeof v === 'string' && v.length <= max ? v : null;

const isTripIcon = (v: unknown): v is TripIconId =>
	TRIP_ICONS.some((icon) => icon.id === v);

const iconName = (id: TripIconId) =>
	TRIP_ICONS.find((icon) => icon.id === id)!.name;

const isCategory = (v: unknown): v is CategoryId =>
	CATEGORIES.some((c) => c.id === v);

/*
 * The fields an edit may carry, each checked, and anything not listed dropped.
 * `partial` is whether a missing field is fine — an edit names only what
 * changed, and a whole item must name everything.
 */
function readItemFields(v: unknown, partial: true): Partial<ItemFields> | null;
function readItemFields(v: unknown, partial: false): ItemFields | null;
function readItemFields(v: unknown, partial: boolean) {
	if (!isRecord(v)) return null;
	const out: Partial<ItemFields> = {};

	const strings = [
		['title', LIMITS.title],
		['place', LIMITS.title],
		['notes', LIMITS.notes],
		['prep', LIMITS.title],
	] as const;

	for (const [key, max] of strings) {
		if (v[key] === undefined) {
			if (!partial) return null;
			continue;
		}
		const value = text(v[key], max);
		if (value === null) return null;
		out[key] = value;
	}

	if (v.time !== undefined) {
		if (v.time !== '' && !(typeof v.time === 'string' && TIME.test(v.time)))
			return null;
		out.time = v.time as string;
	} else if (!partial) return null;

	if (v.category !== undefined) {
		if (!isCategory(v.category)) return null;
		out.category = v.category;
	} else if (!partial) return null;

	if (v.prepDone !== undefined) {
		if (typeof v.prepDone !== 'boolean') return null;
		out.prepDone = v.prepDone;
	} else if (!partial) return null;

	// Optional even on a whole item, which a trip from before it has not got.
	if (v.base !== undefined) {
		if (typeof v.base !== 'boolean') return null;
		out.base = v.base;
	}

	// A title is what a row is called, and a row called nothing cannot be found.
	if (out.title !== undefined && !out.title.trim()) return null;

	return out;
}

function readItem(v: unknown): Item | null {
	if (!isRecord(v) || typeof v.id !== 'string' || !ID.test(v.id)) return null;
	const fields = readItemFields(v, false);
	return fields && { id: v.id, ...fields };
}

/* An item as a trip file holds it, where a pin already found is kept. */
function readStoredItem(v: unknown): Item | null {
	const item = readItem(v);
	if (!item || !isRecord(v) || v.at === undefined) return item;
	const at = readCoords(v.at);
	return at === undefined ? null : { ...item, at };
}

const inRange = (v: unknown, max: number): v is number =>
	typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= max;

/* `undefined` for no coordinates at all, which is not the same as `null`. */
function readCoords(v: unknown): Coords | null | undefined {
	if (v === null) return null;
	if (!isRecord(v) || !inRange(v.lat, 90) || !inRange(v.lon, 180))
		return undefined;
	return { lat: v.lat, lon: v.lon };
}

function readBaseFields(v: unknown): Partial<BaseFields> | null {
	if (!isRecord(v)) return null;
	const out: Partial<BaseFields> = {};
	for (const key of ['label', 'place'] as const) {
		if (v[key] === undefined) continue;
		const value = text(v[key], LIMITS.title);
		if (value === null) return null;
		out[key] = value;
	}
	// A base called nothing would read "3 mi from" and stop.
	if (out.label !== undefined && !out.label.trim()) return null;
	return out;
}

function readDayFields(v: unknown): Partial<DayFields> | null {
	if (!isRecord(v)) return null;
	const out: Partial<DayFields> = {};

	if (v.date !== undefined) {
		if (v.date !== '' && !(typeof v.date === 'string' && DATE.test(v.date)))
			return null;
		out.date = v.date as string;
	}
	if (v.title !== undefined) {
		const title = text(v.title, LIMITS.title);
		if (title === null) return null;
		out.title = title;
	}
	return out;
}

const readIndex = (v: unknown) =>
	typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : null;

const readId = (v: unknown) => (typeof v === 'string' && ID.test(v) ? v : null);

/** One change, as a browser sent it. */
export function readOp(v: unknown): TripOp | null {
	if (!isRecord(v)) return null;

	switch (v.type) {
		case 'move': {
			const id = readId(v.id);
			const to = readId(v.to);
			const index = readIndex(v.index);
			return id && to && index !== null
				? { type: 'move', id, to, index }
				: null;
		}
		case 'edit': {
			const id = readId(v.id);
			const fields = readItemFields(v.fields, true);
			return id && fields ? { type: 'edit', id, fields } : null;
		}
		case 'add': {
			const to = readId(v.to);
			const item = readItem(v.item);
			return to && item ? { type: 'add', to, item } : null;
		}
		case 'remove': {
			const id = readId(v.id);
			return id ? { type: 'remove', id } : null;
		}
		case 'addDay': {
			const day = isRecord(v.day) ? v.day : null;
			const id = readId(day?.id);
			const fields = readDayFields(day);
			return id && id !== IDEAS && fields
				? {
						type: 'addDay',
						day: { id, date: fields.date ?? '', title: fields.title ?? '' },
					}
				: null;
		}
		case 'editDay': {
			const id = readId(v.id);
			const fields = readDayFields(v.fields);
			return id && fields ? { type: 'editDay', id, fields } : null;
		}
		case 'moveDay': {
			const id = readId(v.id);
			const index = readIndex(v.index);
			return id && index !== null ? { type: 'moveDay', id, index } : null;
		}
		case 'removeDay': {
			const id = readId(v.id);
			return id ? { type: 'removeDay', id } : null;
		}
		case 'editTrip': {
			if (!isRecord(v.fields)) return null;
			const fields: TripFields = {};
			for (const key of ['title', 'tagline'] as const) {
				if (v.fields[key] === undefined) continue;
				const value = text(v.fields[key], LIMITS.title);
				if (value === null) return null;
				fields[key] = value;
			}
			if (v.fields.icon !== undefined) {
				if (v.fields.icon !== '' && !isTripIcon(v.fields.icon)) return null;
				fields.icon = v.fields.icon;
			}
			if (fields.title !== undefined && !fields.title.trim()) return null;
			return { type: 'editTrip', fields };
		}
		case 'addBase': {
			const base = isRecord(v.base) ? v.base : null;
			const id = readId(base?.id);
			const fields = readBaseFields(base);
			return id && fields?.label && fields.place !== undefined
				? {
						type: 'addBase',
						base: { id, label: fields.label, place: fields.place },
					}
				: null;
		}
		case 'editBase': {
			const id = readId(v.id);
			const fields = readBaseFields(v.fields);
			return id && fields ? { type: 'editBase', id, fields } : null;
		}
		case 'removeBase': {
			const id = readId(v.id);
			return id ? { type: 'removeBase', id } : null;
		}
		case 'pin': {
			const id = readId(v.id);
			const place = text(v.place, LIMITS.title);
			const at = readCoords(v.at);
			return id && place && at !== undefined
				? { type: 'pin', id, place, at }
				: null;
		}
	}
	return null;
}

/*
 * A WHOLE TRIP, as a seed file holds it. Stricter than it needs to be for the
 * Worker, which only ever reads back what it wrote — this is for the one moment
 * a trip arrives from outside, typed by hand.
 */
export function readTrip(v: unknown): Trip | null {
	if (!isRecord(v)) return null;
	const title = text(v.title, LIMITS.title);
	const tagline = text(v.tagline ?? '', LIMITS.title);
	if (!title?.trim() || tagline === null) return null;
	if (v.icon !== undefined && !isTripIcon(v.icon)) return null;
	if (!Array.isArray(v.days) || !Array.isArray(v.ideas)) return null;

	const seen = new Set<string>();
	const unique = (id: string) => !seen.has(id) && !!seen.add(id);

	const readItems = (list: unknown[]) => {
		const items = list.map(readStoredItem);
		return items.every((i): i is Item => !!i && unique(i.id)) ? items : null;
	};

	const days: Day[] = [];
	for (const raw of v.days) {
		const id = isRecord(raw) ? readId(raw.id) : null;
		const fields = readDayFields(raw);
		const items =
			isRecord(raw) && Array.isArray(raw.items) ? readItems(raw.items) : null;
		if (!id || id === IDEAS || !unique(id) || !fields || !items) return null;
		days.push({
			id,
			date: fields.date ?? '',
			title: fields.title ?? '',
			items,
		});
	}

	const ideas = readItems(v.ideas);
	if (!ideas) return null;

	let bases: Base[] | undefined;
	if (v.bases !== undefined) {
		if (!Array.isArray(v.bases) || v.bases.length > LIMITS.bases) return null;
		bases = [];
		for (const raw of v.bases) {
			const id = isRecord(raw) ? readId(raw.id) : null;
			const fields = readBaseFields(raw);
			if (!id || !unique(id) || !fields?.label || fields.place === undefined)
				return null;
			const base: Base = { id, label: fields.label, place: fields.place };
			if (isRecord(raw) && raw.at !== undefined) {
				const at = readCoords(raw.at);
				if (at === undefined) return null;
				base.at = at;
			}
			bases.push(base);
		}
	}

	const trip: Trip = { title, tagline, days, ideas };
	if (v.icon !== undefined) trip.icon = v.icon;
	if (bases) trip.bases = bases;
	if (days.length > LIMITS.days || countItems(trip) > LIMITS.items) return null;
	return trip;
}
