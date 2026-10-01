<script lang="ts">
	import { tick } from 'svelte';
	import { flip } from 'svelte/animate';
	import { blur, crossfade } from 'svelte/transition';

	// One deep import per icon, as everywhere else.
	import ArrowDown from '@lucide/svelte/icons/arrow-down';
	import ArrowUp from '@lucide/svelte/icons/arrow-up';
	import CalendarPlus from '@lucide/svelte/icons/calendar-plus';
	import Car from '@lucide/svelte/icons/car';
	import Footprints from '@lucide/svelte/icons/footprints';
	import GripVertical from '@lucide/svelte/icons/grip-vertical';
	import MapPin from '@lucide/svelte/icons/map-pin';
	import Maximize2 from '@lucide/svelte/icons/maximize-2';
	import Minimize2 from '@lucide/svelte/icons/minimize-2';
	import Mountain from '@lucide/svelte/icons/mountain';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Plus from '@lucide/svelte/icons/plus';
	import Search from '@lucide/svelte/icons/search';
	import ShoppingBag from '@lucide/svelte/icons/shopping-bag';
	import StickyNote from '@lucide/svelte/icons/sticky-note';
	import X from '@lucide/svelte/icons/x';
	import Ticket from '@lucide/svelte/icons/ticket';
	import Utensils from '@lucide/svelte/icons/utensils';
	import Waves from '@lucide/svelte/icons/waves';
	import type { Component } from 'svelte';

	import { enhance } from '$app/forms';
	import Morph from '$lib/components/Morph.svelte';
	import TripMap, { type Pin } from '$lib/components/TripMap.svelte';
	import { morphDuration, morphIn, morphOut } from '$lib/motion';
	import {
		areaOf,
		areaParam,
		basesOf,
		CATEGORIES,
		type Coords,
		formatDate,
		FAR_MILES,
		formatMiles,
		formatTime,
		IDEAS,
		nextDate,
		type CategoryId,
		type Day,
		type Item,
		miles,
		type PlaceMatch,
		NICKNAME_MAX,
		outside,
		type Revision,
		type Trip,
		TRIP_ICON_GROUPS,
		TRIP_ICONS,
	} from '$lib/trip';
	import { tripIcons } from '$lib/trip-icons';
	import { TripSync, type SyncState } from '$lib/trip-sync.svelte';
	import { bar, type BarStatus } from '$lib/bar.svelte';

	let {
		stored,
		nickname,
		device,
		endpoint,
		ontrip,
		panel = $bindable(null),
	}: {
		/* The first answer, from the page's load. The board keeps it from here. */
		stored: { trip: Trip; version: number; history: Revision[] };
		/* Who this browser signed in as. Follows a rename, through the page's load. */
		nickname: string;
		/* The name this browser gave its device, or `''`. */
		device: string;
		endpoint: string;
		/* Told the live trip whenever it changes, for the page's heading and tab. */
		ontrip?: (trip: Trip) => void;
		/* Which side panel is open, if any. The page's masthead opens them. */
		panel?: 'history' | 'settings' | null;
	} = $props();

	/* ─── The side panels ──────────────────────────────────────────────────── */

	/*
	 * HISTORY AND SETTINGS ARE LOOKED AT NOW AND THEN, not while planning, so
	 * they wait behind the masthead's buttons rather than under the schedule.
	 * A modal <dialog>, for the focus trap, Escape, and a page that stays put.
	 */
	let historyDialog = $state<HTMLDialogElement>();
	let settingsDialog = $state<HTMLDialogElement>();

	$effect(() => {
		for (const [name, dialog] of [
			['history', historyDialog],
			['settings', settingsDialog],
		] as const) {
			if (!dialog) continue;
			if (panel === name && !dialog.open) dialog.showModal();
			if (panel !== name && dialog.open) dialog.close();
		}
	});

	/*
	 * A THING THAT CHANGES LISTS GOES THERE, from where it was: a row onto
	 * another day or into the ideas, a checked item into "done". One pair per
	 * kind of list, so a row never flies into the checklist. With nowhere to
	 * go, as when it is deleted, it blurs out as a morph does.
	 */
	const fade = () =>
		crossfade({
			duration: () => morphDuration(),
			fallback: (node, _params, intro) =>
				blur(node, intro ? morphIn() : morphOut()),
		});
	const [sendRow, receiveRow] = fade();
	const [sendPrep, receivePrep] = fade();

	/* A press on the backdrop lands on the dialog itself, never on its content. */
	const closeOnBackdrop = (e: MouseEvent) => {
		if (e.target === e.currentTarget) panel = null;
	};

	/* ─── The trip, kept in step with everybody else's ─────────────────────── */

	/*
	 * A FRIEND'S CHANGE WAITS while this person is in the middle of one. A field
	 * with a cursor in it would have its words replaced under the cursor, and a
	 * row being dragged would have its list rebuilt under the finger.
	 */
	const hold = () =>
		!!drag ||
		!!document.activeElement?.matches(
			'input:not([type=checkbox]), textarea, select',
		);

	// svelte-ignore state_referenced_locally
	const sync = new TripSync(stored, endpoint, hold);
	const trip = $derived(sync.trip);

	/*
	 * READY IS THE MOMENT THE ROWS ANSWER. Before it the page is the server's HTML
	 * and a grip is a button with nothing listening; an effect only runs once the
	 * client has the page, so it is what says so. The tests wait on it, on the
	 * board, the same arrangement as the editor's `data-ready`.
	 */
	let ready = $state(false);

	$effect(() => {
		ready = true;
		return sync.start();
	});

	/* ─── History ──────────────────────────────────────────────────────────── */

	/*
	 * TEN, UNTIL ASKED FOR ALL. The last hundred changes are a long card beside
	 * the short ones in its row, and the ones anybody wants are the newest.
	 */
	const HISTORY_PREVIEW = 10;
	let showAllHistory = $state(false);
	const shownHistory = $derived(
		showAllHistory ? sync.history : sync.history.slice(0, HISTORY_PREVIEW),
	);

	/*
	 * HOW LONG AGO, from a clock that ticks every half-minute, so "just now" does
	 * not stay "just now" all afternoon.
	 *
	 * DRAWN ONLY ONCE THE PAGE IS HYDRATED. The server and the browser have
	 * different clocks and different time zones, and a time written by one and
	 * then again by the other would flicker; the <time> element carries the
	 * instant itself for anybody who needs it before then.
	 */
	let now = $state(Date.now());

	$effect(() => {
		const timer = setInterval(() => (now = Date.now()), 30_000);
		return () => clearInterval(timer);
	});

	function ago(at: number) {
		const seconds = Math.max(0, Math.round((now - at) / 1000));
		if (seconds < 45) return 'just now';
		const minutes = Math.round(seconds / 60);
		if (minutes < 60) return `${minutes} min ago`;
		const hours = Math.round(minutes / 60);
		if (hours < 24) return `${hours} hr ago`;
		const days = Math.round(hours / 24);
		if (days < 7) return days === 1 ? 'yesterday' : `${days} days ago`;
		return new Date(at).toLocaleDateString(undefined, {
			month: 'short',
			day: 'numeric',
		});
	}

	/*
	 * THE FIRST CHARACTER OF A NAME, as a person would count it. A grapheme, not a
	 * code unit, so a name that starts with an emoji gives the whole emoji and not
	 * the first half of it.
	 */
	const segmenter = new Intl.Segmenter();
	const initial = (name: string) =>
		(
			segmenter.segment(name)[Symbol.iterator]().next().value?.segment ?? '?'
		).toLocaleUpperCase();

	/*
	 * WHAT THE BAR SAYS ABOUT SAVING. Short, because it shares a line with the
	 * site's controls and on a phone with the trip's name as well — and the
	 * `title` on it is these same words, so there is no longer version hiding
	 * anywhere to be found.
	 */
	const STATUS: Record<SyncState, BarStatus> = {
		saved: { text: 'All changes saved.', tone: 'quiet' },
		saving: { text: 'Saving…', tone: 'busy' },
		offline: { text: 'Offline. Will retry.', tone: 'alert' },
		refreshed: { text: 'Updated from the others.', tone: 'quiet' },
		refused: { text: 'Couldn’t save that.', tone: 'alert' },
	};

	/*
	 * THE BAR CARRIES THE STATUS AND THE TRIP'S NAME, both claimed from here and
	 * both taken back when the board goes. The name is the one on the page, and it
	 * follows a rename by anybody.
	 */
	$effect(() => bar.report(STATUS[sync.state]));
	$effect(() => bar.name(trip.title));
	$effect(() => ontrip?.(trip));

	/* What a keyboard move said, for a screen reader. Separate from the status,
	 * which is about saving and would otherwise be talked over. */
	let announcement = $state('');

	const ICONS: Record<CategoryId, Component> = {
		logistics: Car,
		water: Waves,
		nature: Mountain,
		tours: Ticket,
		food: Utensils,
		shopping: ShoppingBag,
		other: Footprints,
	};

	const categoryName = (id: CategoryId) =>
		CATEGORIES.find((c) => c.id === id)?.name ?? '';

	const dayName = (index: number) => `Day ${index + 1}`;

	function listName(id: string) {
		if (id === IDEAS) return 'Not scheduled yet';
		const index = trip.days.findIndex((d) => d.id === id);
		const day = trip.days[index];
		return day?.date
			? `${dayName(index)}, ${formatDate(day.date)}`
			: dayName(index);
	}

	/*
	 * A map, SEARCHED FOR rather than pinned. A place written in a note is enough
	 * for a search to find, and nobody on the trip is going to paste coordinates.
	 * The title is searched when there is no place, with the islands added so
	 * "Dukes" finds the one in Waikiki rather than a hardware store.
	 */
	const mapHref = (item: Item) =>
		`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
			item.place || `${item.title}, Hawaii`,
		)}`;

	const newId = () => crypto.randomUUID();

	/* ─── Pins and distances ───────────────────────────────────────────────── */

	/*
	 * ONE LOOKUP AT A TIME, for any place not looked up yet, by whichever page is
	 * open. Each place is tried once per page, so one that fails is not asked
	 * about again until the next visit.
	 */
	const tried = new Set<string>();

	/* The trip's area, which every lookup prefers. See `areaOf`. */
	const area = $derived(areaOf(trip));
	const near = () => (area ? `&near=${areaParam(area)}` : '');
	let locating = $state(false);

	$effect(() => {
		if (!ready || locating) return;
		const next = [
			...trip.days.flatMap((d) => d.items),
			...trip.ideas,
			...(trip.bases ?? []),
		].find(
			(p) => p.place && p.at === undefined && !tried.has(`${p.id} ${p.place}`),
		);
		if (!next) return;

		const { id, place } = next;
		tried.add(`${id} ${place}`);
		locating = true;
		fetch(`${endpoint}/geocode?q=${encodeURIComponent(place)}${near()}`)
			.then((r) => (r.ok ? (r.json() as Promise<{ at: Coords | null }>) : null))
			.then((body) => {
				// Somebody may have chosen a match by hand while this was out.
				if (body && pinOf(id)?.at === undefined)
					sync.do({ type: 'pin', id, place, at: body.at });
			})
			.catch(() => {})
			.finally(() => (locating = false));
	});

	const pinOf = (id: string) =>
		[
			...trip.days.flatMap((d) => d.items),
			...trip.ideas,
			...(trip.bases ?? []),
		].find((p) => p.id === id);

	const bases = $derived(basesOf(trip));

	/*
	 * FIND, for a place the background lookup got wrong or could not find: up to
	 * five matches for what is in the field, and the one chosen is pinned as is.
	 * `matches` is null while asking, and `failed` when the service is not there.
	 */
	let finding = $state<{
		id: string;
		query: string;
		matches: PlaceMatch[] | null;
		failed: boolean;
	} | null>(null);

	async function find(id: string, query: string) {
		query = query.trim();
		if (!query) return;
		finding = { id, query, matches: null, failed: false };
		try {
			const response = await fetch(
				`${endpoint}/geocode?all=1&q=${encodeURIComponent(query)}${near()}`,
			);
			if (!response.ok) throw new Error();
			const { matches } = (await response.json()) as {
				matches: PlaceMatch[];
			};
			if (finding?.id === id) finding = { id, query, matches, failed: false };
		} catch {
			if (finding?.id === id)
				finding = { id, query, matches: [], failed: true };
		}
	}

	function choose(id: string, query: string, match: PlaceMatch) {
		if (pinOf(id)?.place !== query) edit(id, { place: query });
		sync.do({ type: 'pin', id, place: query, at: match.at });
		finding = null;
	}

	/* "Lake McDonald Lodge" and "Flathead County, Montana, United States". */
	function splitName(name: string) {
		const [head, ...rest] = name.split(', ');
		return {
			head,
			rest: rest
				.filter((part) => !/^\d+$/.test(part))
				.slice(-3)
				.join(', '),
		};
	}

	/* "3.1 mi from Hotel", "12 mi from Airport", nearest first. */
	function distances(item: Pick<Item, 'id' | 'at'>) {
		const at = item.at;
		if (!at) return [];
		return bases
			.filter((b) => b.id !== item.id)
			.map((b) => ({ label: b.label, d: miles(at, b.at) }))
			.sort((a, b) => a.d - b.d)
			.map(({ label, d }) => `${formatMiles(d)} from ${label}`);
	}

	/* Everything found, bases included; an item marked as a base is drawn as one. */
	const pins = $derived.by((): Pin[] => {
		const placed = [
			...trip.days.flatMap((day) =>
				day.items.map((item) => ({ item, where: day.id })),
			),
			...trip.ideas.map((item) => ({ item, where: IDEAS })),
		];
		return [
			...(trip.bases ?? []).flatMap((b) =>
				b.at
					? [
							{
								id: b.id,
								title: b.label,
								at: b.at,
								base: true,
								editable: false,
								lines: [b.place, ...distances(b)],
							},
						]
					: [],
			),
			...placed.flatMap(({ item, where }) =>
				item.at
					? [
							{
								id: item.id,
								title: item.title,
								at: item.at,
								base: !!item.base,
								editable: true,
								lines: [listName(where), ...distances(item)],
							},
						]
					: [],
			),
		];
	});

	let tripMap = $state<ReturnType<typeof TripMap>>();

	/* The map over the whole page, under the bar, until Escape or the button. */
	let fullMap = $state(false);

	/* A new base is the hotel, then the airport, then whatever it is renamed to. */
	function addBase() {
		const taken = new Set((trip.bases ?? []).map((b) => b.label));
		const label =
			['Hotel', 'Airport'].find((name) => !taken.has(name)) ?? 'Base';
		sync.do({ type: 'addBase', base: { id: newId(), label, place: '' } });
	}

	/* ─── Before we go ─────────────────────────────────────────────────────── */

	const prep = $derived.by(() => {
		const all = [
			...trip.days.flatMap((day) =>
				day.items.map((item) => ({ item, where: day.id })),
			),
			...trip.ideas.map((item) => ({ item, where: IDEAS })),
		].filter(({ item }) => item.prep);
		return {
			open: all.filter(({ item }) => !item.prepDone),
			done: all.filter(({ item }) => item.prepDone),
		};
	});

	/* ─── Editing ───────────────────────────────────────────────────────────── */

	let editing = $state<string | null>(null);
	let editingDay = $state<string | null>(null);
	let adding = $state<string | null>(null);

	/* A delete asks twice, and this is which thing is on its second asking. */
	let confirming = $state<string | null>(null);

	function edit(id: string, fields: Partial<Item>) {
		sync.do({ type: 'edit', id, fields });
	}

	function onTitle(item: Item, input: HTMLInputElement) {
		const title = input.value.trim();
		// A row called nothing cannot be found again, so an emptied title is put back.
		if (!title) input.value = item.title;
		else if (title !== item.title) edit(item.id, { title });
	}

	function add(to: string, form: HTMLFormElement) {
		const data = new FormData(form);
		const title = String(data.get('title') ?? '').trim();
		if (!title) return;

		sync.do({
			type: 'add',
			to,
			item: {
				id: newId(),
				title,
				category: String(data.get('category')) as CategoryId,
				time: '',
				place: '',
				notes: '',
				prep: '',
				prepDone: false,
			},
		});

		// The form stays open, because the next thing is usually another thing.
		form.reset();
		form.querySelector<HTMLInputElement>('input[name=title]')?.focus();
	}

	function addDay() {
		const last = trip.days.at(-1);
		const id = newId();
		sync.do({
			type: 'addDay',
			day: { id, title: '', date: last?.date ? nextDate(last.date) : '' },
		});
		editingDay = id;
	}

	/* The category a new thing on a day starts as: whatever the last thing there was. */
	const defaultCategory = (items: Item[]): CategoryId =>
		items.at(-1)?.category ?? 'food';

	/* ─── Moving ────────────────────────────────────────────────────────────── */

	/*
	 * THE LISTS IN READING ORDER, which is the order the arrow keys walk: each day,
	 * then the ideas. A move past the end of one list lands at the edge of the
	 * next, so a keyboard can carry a thing from Day 1 to Day 5 without anything
	 * but the arrows.
	 */
	function where(id: string) {
		for (const day of trip.days) {
			const index = day.items.findIndex((i) => i.id === id);
			if (index !== -1)
				return { list: day.id, index, length: day.items.length };
		}
		const index = trip.ideas.findIndex((i) => i.id === id);
		return index === -1
			? null
			: { list: IDEAS, index, length: trip.ideas.length };
	}

	async function move(id: string, to: string, index: number, focus = true) {
		const from = where(id);
		if (!from) return;
		if (from.list === to && from.index === index) return;

		sync.do({ type: 'move', id, to, index });

		const now = where(id);
		const count =
			to === IDEAS
				? trip.ideas.length
				: (trip.days.find((d) => d.id === to)?.items.length ?? 0);
		announcement =
			to === IDEAS
				? `Moved to ${listName(to)}.`
				: `Moved to ${listName(to)}, ${(now?.index ?? 0) + 1} of ${count}.`;

		// A move between lists makes a new row, and the focus would fall to the
		// top of the page with the old one. Not from the map, which keeps it.
		if (!focus) return;
		await tick();
		document.querySelector<HTMLElement>(`[data-grip="${id}"]`)?.focus();
	}

	function onGripKey(event: KeyboardEvent, id: string) {
		if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
		event.preventDefault();

		const at = where(id);
		if (!at) return;
		const dayIndex = trip.days.findIndex((d) => d.id === at.list);

		if (event.key === 'ArrowUp') {
			if (at.list !== IDEAS && at.index > 0)
				return move(id, at.list, at.index - 1);
			// Off the top of a day, or up out of the ideas: the end of the day above.
			const above =
				at.list === IDEAS ? trip.days.at(-1) : trip.days[dayIndex - 1];
			if (above) return move(id, above.id, above.items.length);
		} else {
			if (at.list === IDEAS) return;
			if (at.index < at.length - 1) return move(id, at.list, at.index + 1);
			const below = trip.days[dayIndex + 1];
			return below ? move(id, below.id, 0) : move(id, IDEAS, trip.ideas.length);
		}
	}

	/*
	 * DRAGGING, with pointer events and not the HTML drag-and-drop API — which
	 * does nothing at all on a phone, and a phone is where this page is going to
	 * be opened on a beach.
	 *
	 * The grip captures the pointer, so the whole gesture reports to it wherever
	 * the finger goes. The row follows by `translate`, which moves the drawing and
	 * not the layout: every other row stays exactly where it was measured, and the
	 * drop position can be worked out from where they are.
	 *
	 * The work is done once a frame, not once an event. A finger reports far more
	 * often than a screen paints, and scrolling the page near its edges has to
	 * keep happening while the finger holds still.
	 */
	type Drag = {
		id: string;
		startX: number;
		startY: number;
		startScroll: number;
		x: number;
		y: number;
		/* Past the few pixels that tell a drag from a tap. */
		moved: boolean;
		target: { list: string; index: number } | null;
		/* Where the line showing the drop is drawn, in the window's coordinates. */
		line: { top: number; left: number; width: number } | null;
		zone: string | null;
	};

	let drag = $state<Drag | null>(null);
	let frame = 0;

	/*
	 * THE PAGE'S SCROLL, MIRRORED INTO STATE while a drag is under way. The row
	 * sits in the page and scrolls with it, so as the page scrolls under a still
	 * finger the row has to be pushed back by the same amount to stay under it —
	 * and a derived does not watch the window.
	 */
	let scrollY = $state(0);

	const offset = $derived(
		drag?.moved
			? `${drag.x - drag.startX}px ${drag.y - drag.startY + (scrollY - drag.startScroll)}px`
			: '',
	);

	function onGripDown(event: PointerEvent, id: string) {
		if (event.button !== 0) return;
		event.preventDefault();
		/*
		 * CAPTURE IF IT CAN BE HAD. Without it, a finger that slides off the grip
		 * stops sending moves to it; but WebKit throws when the pointer is not one
		 * it is tracking, and a throw here would lose the drag altogether.
		 */
		try {
			(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
		} catch {
			/* The drag goes ahead on the moves the grip does receive. */
		}

		scrollY = window.scrollY;
		drag = {
			id,
			startX: event.clientX,
			startY: event.clientY,
			startScroll: window.scrollY,
			x: event.clientX,
			y: event.clientY,
			moved: false,
			target: null,
			line: null,
			zone: null,
		};
		frame = requestAnimationFrame(step);
	}

	function onGripMove(event: PointerEvent) {
		if (!drag) return;
		drag.x = event.clientX;
		drag.y = event.clientY;
		if (Math.hypot(drag.x - drag.startX, drag.y - drag.startY) > 4)
			drag.moved = true;
	}

	function onGripUp() {
		if (!drag) return;
		const { id, moved, target } = drag;
		end();
		if (moved && target) void move(id, target.list, target.index);
	}

	function end() {
		cancelAnimationFrame(frame);
		drag = null;
	}

	function step() {
		if (!drag) return;

		if (drag.moved) {
			/*
			 * NEAR AN EDGE, THE PAGE SCROLLS, faster the closer the finger is. The top
			 * edge is the bar's lower one and not the window's, because the bar
			 * covers the window's.
			 */
			const top =
				document.querySelector('header')?.getBoundingClientRect().bottom ?? 0;
			const reach = 64;
			let speed = 0;
			if (drag.y < top + reach) speed = -(top + reach - drag.y) / 4;
			else if (drag.y > innerHeight - reach)
				speed = (drag.y - (innerHeight - reach)) / 4;
			if (speed) window.scrollBy(0, speed);
			scrollY = window.scrollY;

			aim(drag);
		}

		frame = requestAnimationFrame(step);
	}

	/*
	 * WHERE WOULD IT LAND. The nearest list to the finger — measured in both
	 * directions, because on a wide window the days stand side by side and the
	 * nearest one may be the next column over rather than the one below — and in it
	 * the number of rows whose middle the finger is below. The row being dragged
	 * is left out of the count, which is what makes that number the index `move`
	 * wants: the gap it left has already closed.
	 *
	 * The ideas are one zone rather than a list with positions. They are grouped
	 * by category on the page, so "third among the ideas" would mean nothing a
	 * person could see; dropping there just unschedules it.
	 */
	function aim(drag: Drag) {
		let nearest: HTMLElement | null = null;
		let distance = Infinity;

		for (const zone of document.querySelectorAll<HTMLElement>('[data-drop]')) {
			const rect = zone.getBoundingClientRect();
			const dx =
				drag.x < rect.left
					? rect.left - drag.x
					: Math.max(0, drag.x - rect.right);
			const dy =
				drag.y < rect.top
					? rect.top - drag.y
					: Math.max(0, drag.y - rect.bottom);
			const d = Math.hypot(dx, dy);
			if (d < distance) {
				distance = d;
				nearest = zone;
			}
		}
		if (!nearest) return;

		const list = nearest.dataset.drop!;
		drag.zone = list;

		if (list === IDEAS) {
			drag.target = { list, index: trip.ideas.length };
			drag.line = null;
			return;
		}

		const rows = [
			...nearest.querySelectorAll<HTMLElement>(':scope > [data-item]'),
		]
			.filter((row) => row.dataset.item !== drag.id)
			.map((row) => row.getBoundingClientRect());
		const index = rows.filter((r) => r.top + r.height / 2 < drag.y).length;
		const zone = nearest.getBoundingClientRect();

		drag.target = { list, index };
		drag.line = {
			top:
				index < rows.length
					? rows[index].top - 2
					: rows.length
						? rows[rows.length - 1].bottom + 2
						: zone.top + zone.height / 2,
			left: zone.left,
			width: zone.width,
		};
	}

	function onDragKey(event: KeyboardEvent) {
		if (drag && event.key === 'Escape') end();
		else if (fullMap && event.key === 'Escape') fullMap = false;
	}
</script>

<svelte:window onkeydown={onDragKey} />

<p class="visually-hidden" aria-live="assertive">{announcement}</p>
<p class="visually-hidden" id="move-help">
	Use the up and down arrow keys to move it, including onto another day.
</p>

{#if drag?.line}
	<div
		class="drop-line"
		aria-hidden="true"
		style="top: {drag.line.top}px; left: {drag.line.left}px; width: {drag.line
			.width}px"
	></div>
{/if}

<!--
	THE BOARD IS ONE THING, MANY TIMES, in three levels of heading and no others:

	  h1  the trip — Letter's masthead, above all of this
	  h2  a SECTION: Before we go, Schedule, Not scheduled yet, Settings
	  h3  a CARD in a section: the checklist, a day, a kind of idea, a setting

	Every section is a name over a grid of cards, and every card is the same
	element — a header, what is under it, and a way to add to it — differing only
	in what its header says. A card's header can carry one dimmed detail after a
	dot, the way a day carries its date: "Day 1 · Thu, Oct 15", "Food & drink · 17".
	So a reader walking the page by heading hears the same shape in every section,
	and a change to how a card looks is a change to all of them.

	THE GRID IS A CALENDAR'S: cards in rows and columns, as many columns as the
	width holds at 20rem each, every row starting on one line.
-->
<div class="board" data-ready={ready || undefined}>
	<!-- ─── Before we go ──────────────────────────────────────────────────────── -->

	<section class="section before" aria-labelledby="prep-heading">
		<h2 id="prep-heading" class="section-title">Before we go</h2>

		<div class="grid">
			<section class="card" aria-labelledby="checklist-heading">
				<div class="card-head">
					<h3 id="checklist-heading" class="card-title">
						Checklist{#if prep.open.length}<span class="dim"
								>{' · '}<Morph key={prep.open.length}>{prep.open.length}</Morph
								>{' left'}</span
							>{/if}
					</h3>
				</div>

				{#if prep.open.length}
					<ul class="checklist">
						{#each prep.open as { item, where } (item.id)}
							<li
								in:receivePrep={{ key: item.id }}
								out:sendPrep={{ key: item.id }}
							>
								<label>
									<input
										type="checkbox"
										onchange={() => edit(item.id, { prepDone: true })}
									/>
									<span>
										{item.prep}
										<span class="dim">— {item.title}, {listName(where)}</span>
									</span>
								</label>
							</li>
						{/each}
					</ul>
				{:else}
					<p class="empty">Nothing left to book or pack.</p>
				{/if}

				{#if prep.done.length}
					<details class="done">
						<summary
							><Morph key={prep.done.length}>{prep.done.length}</Morph> done</summary
						>
						<ul class="checklist">
							{#each prep.done as { item, where } (item.id)}
								<li
									in:receivePrep={{ key: item.id }}
									out:sendPrep={{ key: item.id }}
								>
									<label>
										<input
											type="checkbox"
											checked
											onchange={() => edit(item.id, { prepDone: false })}
										/>
										<span>
											<s>{item.prep}</s>
											<span class="dim">— {item.title}, {listName(where)}</span>
										</span>
									</label>
								</li>
							{/each}
						</ul>
					</details>
				{/if}
			</section>
		</div>
	</section>

	<!-- ─── Map ───────────────────────────────────────────────────────────────── -->

	<!--
		ONLY ONCE SOMETHING IS ON IT. An empty map of the ocean says nothing, and
		the lookups fill it in on their own as places are added.
	-->
	{#if pins.length}
		<section
			class="section map-section"
			class:full={fullMap}
			aria-labelledby="map-heading"
		>
			<div class="drawer-head">
				<h2 id="map-heading" class="section-title">Map</h2>
				<div class="actions">
					<button type="button" class="pill" onclick={() => tripMap?.fit()}>
						Show everything
					</button>
					<button
						type="button"
						class="pill"
						onclick={() => (fullMap = !fullMap)}
					>
						{#if fullMap}<Minimize2 /> Back to the page{:else}<Maximize2 /> Full view{/if}
					</button>
				</div>
			</div>
			<TripMap bind:this={tripMap} {pins} full={fullMap} editor={mapEditor} />
		</section>
	{/if}

	<!-- ─── Schedule ──────────────────────────────────────────────────────────── -->

	<section class="section schedule" aria-labelledby="schedule-heading">
		<h2 id="schedule-heading" class="section-title">Schedule</h2>

		<div class="grid">
			{#each trip.days as day, d (day.id)}
				{@render daySection(day, d)}
			{/each}

			<!--
				THE NEXT CELL, where the next day will appear. A card with nothing in it
				but its header row, so the button stands where a new day's name will.
			-->
			<div class="card next">
				<div class="card-head">
					<button type="button" class="pill" onclick={addDay}>
						<CalendarPlus /> Add a day
					</button>
				</div>
			</div>
		</div>
	</section>

	<!-- ─── Not scheduled yet ─────────────────────────────────────────────────── -->

	<!--
		ONE DROP ZONE FOR ALL OF IT. Dropping a thing here unschedules it and keeps
		its kind, so which card it lands nearest says nothing; the whole section
		lights up instead of one card pretending to be the target.

		ONE CARD, GROUPED BY KIND, and only the kinds that hold something. A card
		for every kind stood three empty boxes on a short trip; the form's Kind
		field already says where a new one goes.
	-->
	<section
		class="section ideas"
		class:target={drag?.moved && drag.zone === IDEAS}
		aria-labelledby="ideas-heading"
		data-drop={IDEAS}
	>
		<h2 id="ideas-heading" class="section-title">Not scheduled yet</h2>

		<div class="grid">
			<div class="card">
				{#each CATEGORIES as category (category.id)}
					{@const items = trip.ideas.filter(
						(item) => item.category === category.id,
					)}
					{@const Icon = ICONS[category.id]}
					{#if items.length}
						<section class="group" aria-labelledby="group-{category.id}">
							<h3 id="group-{category.id}" class="card-title">
								<Icon aria-hidden="true" />
								<span
									>{category.name}<span class="dim"
										>{' · '}<Morph key={items.length}>{items.length}</Morph
										></span
									></span
								>
							</h3>

							<ul class="items">
								{#each items as item (item.id)}
									<li
										class="item"
										data-item={item.id}
										data-dragging={drag?.moved && drag.id === item.id
											? ''
											: undefined}
										style:translate={drag?.id === item.id ? offset : undefined}
										animate:flip={{ duration: morphDuration() }}
										in:receiveRow={{ key: item.id }}
										out:sendRow={{ key: item.id }}
									>
										{@render row(item, IDEAS)}
									</li>
								{/each}
							</ul>
						</section>
					{/if}
				{/each}

				{#if !trip.ideas.length}
					<p class="empty">
						Nothing waiting. Drag a thing here to unschedule it.
					</p>
				{/if}

				{@render adder(IDEAS, defaultCategory(trip.ideas))}
			</div>
		</div>
	</section>

	<!-- ─── History ───────────────────────────────────────────────────────────── -->

	<!--
		WHO CHANGED WHAT, newest first: the last hundred changes the server took,
		each in one sentence written at the moment it happened. Each line leads with
		the initial of whoever made it, in the column where a row has its grip — so
		the words line up with every other card's.
	-->
	<dialog
		class="drawer"
		aria-labelledby="history-heading"
		bind:this={historyDialog}
		onclose={() => panel === 'history' && (panel = null)}
		onclick={closeOnBackdrop}
	>
		<section class="section changes">
			<div class="drawer-head">
				<h2 id="history-heading" class="section-title">History</h2>
				<button
					type="button"
					class="control"
					aria-label="Close history"
					onclick={() => (panel = null)}><X /></button
				>
			</div>

			<div class="grid">
				<section class="card" aria-labelledby="changes-heading">
					<div class="card-head">
						<h3 id="changes-heading" class="card-title">
							Recent changes{#if sync.history.length}<span class="dim"
									>{' · '}<Morph key={sync.history.length}
										>{sync.history.length}</Morph
									></span
								>{/if}
						</h3>
					</div>

					{#if sync.history.length}
						<ol class="history">
							{#each shownHistory as revision (revision.version)}
								<li class="revision">
									<span class="initial" aria-hidden="true"
										>{initial(revision.who)}</span
									>
									<div class="body">
										<p>{revision.summary}</p>
										<p class="meta">
											<span class="who">{revision.who}</span>
											<time
												datetime={new Date(revision.at).toISOString()}
												title={ready
													? new Date(revision.at).toLocaleString()
													: undefined}>{ready ? ago(revision.at) : ''}</time
											>
										</p>
									</div>
								</li>
							{/each}
						</ol>

						{#if sync.history.length > HISTORY_PREVIEW}
							<div class="actions">
								<button
									type="button"
									class="pill"
									aria-expanded={showAllHistory}
									onclick={() => (showAllHistory = !showAllHistory)}
								>
									{showAllHistory
										? 'Show fewer'
										: `Show all ${sync.history.length}`}
								</button>
							</div>
						{/if}
					{:else}
						<p class="empty">Nothing has changed yet.</p>
					{/if}
				</section>
			</div>
		</section>
	</dialog>

	<!-- ─── Settings ──────────────────────────────────────────────────────────── -->

	<!--
		TWO CARDS, BECAUSE THEY REACH TWO DIFFERENT DISTANCES. A change to the trip is
		everybody's; locking is this browser's alone. Standing them side by side under
		their own names says which is which before anybody presses anything.
	-->
	<dialog
		class="drawer"
		aria-labelledby="settings-heading"
		bind:this={settingsDialog}
		onclose={() => panel === 'settings' && (panel = null)}
		onclick={closeOnBackdrop}
	>
		<section class="section settings">
			<div class="drawer-head">
				<h2 id="settings-heading" class="section-title">Settings</h2>
				<button
					type="button"
					class="control"
					aria-label="Close settings"
					onclick={() => (panel = null)}><X /></button
				>
			</div>

			<div class="grid">
				<section class="card" aria-labelledby="trip-settings-heading">
					<div class="card-head">
						<h3 id="trip-settings-heading" class="card-title">
							This trip<span class="dim">{' · for everyone'}</span>
						</h3>
					</div>

					<div class="fields">
						<label class="field">
							<span>Name</span>
							<input
								class="input"
								value={trip.title}
								maxlength="200"
								onchange={(e) => {
									const title = e.currentTarget.value.trim();
									if (title) sync.do({ type: 'editTrip', fields: { title } });
									else e.currentTarget.value = trip.title;
								}}
							/>
						</label>
						<label class="field">
							<span>Under the name</span>
							<input
								class="input"
								value={trip.tagline}
								maxlength="200"
								placeholder="Oct 15 – 22"
								onchange={(e) =>
									sync.do({
										type: 'editTrip',
										fields: { tagline: e.currentTarget.value.trim() },
									})}
							/>
						</label>

						<!--
						RADIOS, so the arrow keys move between them and a screen reader
						hears one choice of many. One group, in two rows under their own
						names; the tile beside the trip's name is where the choice shows.
					-->
						<fieldset class="field marks">
							<legend>Mark</legend>
							{#each TRIP_ICON_GROUPS as group, g (group.id)}
								<p class="mark-group" aria-hidden="true">{group.name}</p>
								<div class="mark-options">
									{#if g === 0}
										<label
											class="control"
											title="None"
											data-open={!trip.icon || undefined}
										>
											<input
												class="visually-hidden"
												type="radio"
												name="trip-mark"
												checked={!trip.icon}
												onchange={() =>
													sync.do({ type: 'editTrip', fields: { icon: '' } })}
											/>
											<StickyNote aria-hidden="true" />
											<span class="visually-hidden">None</span>
										</label>
									{/if}
									{#each TRIP_ICONS.filter((o) => o.group === group.id) as option (option.id)}
										{@const Icon = tripIcons[option.id]}
										<label
											class="control"
											title={option.name}
											data-open={trip.icon === option.id || undefined}
										>
											<input
												class="visually-hidden"
												type="radio"
												name="trip-mark"
												checked={trip.icon === option.id}
												onchange={() =>
													sync.do({
														type: 'editTrip',
														fields: { icon: option.id },
													})}
											/>
											<Icon aria-hidden="true" />
											<span class="visually-hidden">{option.name}</span>
										</label>
									{/each}
								</div>
							{/each}
						</fieldset>
					</div>
				</section>

				<!--
					WHAT EVERY ROW IS MEASURED FROM. A thing on the schedule can be one too,
					from its own form; these are the ones that are not on any day.
				-->
				<section class="card" aria-labelledby="bases-heading">
					<div class="card-head">
						<h3 id="bases-heading" class="card-title">
							Bases<span class="dim">{' · for everyone'}</span>
						</h3>
					</div>

					<p class="note">
						Every place on the trip says how far it is from these, as the crow
						flies.
					</p>

					{#each trip.bases ?? [] as base (base.id)}
						<div class="row base">
							<label class="field">
								<span>Name</span>
								<input
									class="input"
									value={base.label}
									maxlength="200"
									onchange={(e) => {
										const label = e.currentTarget.value.trim();
										if (!label) e.currentTarget.value = base.label;
										else if (label !== base.label)
											sync.do({
												type: 'editBase',
												id: base.id,
												fields: { label },
											});
									}}
								/>
							</label>
							<label class="field grow">
								<span>Place</span>
								<input
									class="input"
									value={base.place}
									maxlength="200"
									placeholder="An address or a name"
									onchange={(e) =>
										sync.do({
											type: 'editBase',
											id: base.id,
											fields: { place: e.currentTarget.value.trim() },
										})}
								/>
							</label>
							<button
								type="button"
								class="control"
								aria-label="Remove {base.label}"
								onclick={() => sync.do({ type: 'removeBase', id: base.id })}
							>
								<X />
							</button>
						</div>
						{#if base.place && base.at === null}
							<p class="note">
								{base.label} was not found on the map. A fuller address may help.
							</p>
						{/if}
					{/each}

					<div class="actions">
						<button type="button" class="pill" onclick={addBase}>
							<Plus /> Add a base
						</button>
					</div>
				</section>

				<section class="card" aria-labelledby="device-settings-heading">
					<div class="card-head">
						<h3 id="device-settings-heading" class="card-title">
							This device<span class="dim">{' · only here'}</span>
						</h3>
					</div>

					<!--
					THE NAMES THIS BROWSER SIGNS ITS CHANGES WITH: "nickname on device".
					Saved by the server, which re-signs the cookie under them; `reset: false`
					so the fields keep what was typed while the page's load comes back.
				-->
					<form
						method="POST"
						action="?/nickname"
						class="fields"
						use:enhance={() =>
							async ({ update }) => {
								await update({ reset: false });
							}}
					>
						<label class="field">
							<span>Your nickname</span>
							<input
								class="input"
								name="nickname"
								value={nickname}
								maxlength={NICKNAME_MAX}
								autocomplete="nickname"
							/>
						</label>
						<label class="field">
							<span>Device Name</span>
							<input
								class="input"
								name="device"
								value={device}
								maxlength={NICKNAME_MAX}
								placeholder="Tells your devices apart"
								autocomplete="off"
							/>
						</label>
						<div class="actions">
							<button class="pill">Save names</button>
						</div>
					</form>

					<!--
					LOCKING IS PER DEVICE. It takes this browser's cookie away and nobody
					else's; to lock everybody out, change the passcode.
				-->
					<p class="note">
						Asks for the passcode again next time. Everyone else stays signed
						in.
					</p>
					<form method="POST" action="?/lock" use:enhance class="actions">
						<button class="pill">Lock this device</button>
					</form>
				</section>
			</div>
		</section>
	</dialog>
</div>

<!-- ─── One day ───────────────────────────────────────────────────────────── -->

{#snippet daySection(day: Day, d: number)}
	<section
		class="card"
		aria-labelledby="day-{day.id}"
		in:blur={morphIn()}
		out:blur={morphOut()}
	>
		<div class="card-head">
			<h3 id="day-{day.id}" class="card-title">
				<!-- The space is in the expression, where neither Svelte nor a formatter
			     will trim it off the front of the span. -->
				{dayName(d)}{#if day.date}<span class="dim"
						>{` · ${formatDate(day.date)}`}</span
					>{/if}
			</h3>
			<!--
				ADDING AND EDITING, side by side in the head, and one open at a time: both
				open a form under the head, and two at once would be a card of forms.
			-->
			<div class="card-tools">
				<button
					type="button"
					class="control"
					aria-label="Add to {dayName(d)}"
					aria-expanded={adding === day.id}
					data-open={adding === day.id || undefined}
					onclick={() => {
						adding = adding === day.id ? null : day.id;
						editingDay = null;
					}}
				>
					<Plus />
				</button>
				<button
					type="button"
					class="control"
					aria-label="Edit {dayName(d)}"
					aria-expanded={editingDay === day.id}
					data-open={editingDay === day.id || undefined}
					onclick={() => {
						editingDay = editingDay === day.id ? null : day.id;
						if (adding === day.id) adding = null;
					}}
				>
					<Pencil />
				</button>
			</div>
		</div>

		{#if day.title}<p class="day-title">{day.title}</p>{/if}

		{#if editingDay === day.id}
			<div class="editor">
				<div class="row">
					<label class="field">
						<span>Date</span>
						<input
							class="input"
							type="date"
							value={day.date}
							onchange={(e) =>
								sync.do({
									type: 'editDay',
									id: day.id,
									fields: { date: e.currentTarget.value },
								})}
						/>
					</label>
					<label class="field grow">
						<span>What the day is about</span>
						<input
							class="input"
							value={day.title}
							placeholder="North Shore day"
							maxlength="200"
							onchange={(e) =>
								sync.do({
									type: 'editDay',
									id: day.id,
									fields: { title: e.currentTarget.value.trim() },
								})}
						/>
					</label>
				</div>

				<div class="actions">
					<button
						type="button"
						class="pill"
						disabled={d === 0}
						onclick={() =>
							sync.do({ type: 'moveDay', id: day.id, index: d - 1 })}
					>
						<ArrowUp /> Earlier
					</button>
					<button
						type="button"
						class="pill"
						disabled={d === trip.days.length - 1}
						onclick={() =>
							sync.do({ type: 'moveDay', id: day.id, index: d + 1 })}
					>
						<ArrowDown /> Later
					</button>

					<span class="spacer"></span>

					<!--
					TWO PRESSES, because this is everybody's trip and not only the
					person holding the phone. What goes back to the ideas is said on
					the second one, so nobody deletes a day believing its plans go too.
				-->
					<button
						type="button"
						class="pill danger"
						onclick={() => {
							if (confirming !== day.id) return (confirming = day.id);
							confirming = editingDay = null;
							sync.do({ type: 'removeDay', id: day.id });
						}}
						onblur={() => confirming === day.id && (confirming = null)}
					>
						{confirming === day.id
							? day.items.length
								? `Remove day, unschedule ${day.items.length}`
								: 'Remove day for everyone'
							: 'Remove day'}
					</button>
					<button
						type="button"
						class="pill primary"
						onclick={() => (editingDay = null)}
					>
						Done
					</button>
				</div>
			</div>
		{/if}

		{#if adding === day.id}
			{@render adderForm(day.id, defaultCategory(day.items))}
		{/if}

		<ol class="items" data-drop={day.id}>
			{#each day.items as item (item.id)}
				<li
					class="item"
					data-item={item.id}
					data-dragging={drag?.moved && drag.id === item.id ? '' : undefined}
					style:translate={drag?.id === item.id ? offset : undefined}
					animate:flip={{ duration: morphDuration() }}
					in:receiveRow={{ key: item.id }}
					out:sendRow={{ key: item.id }}
				>
					{@render row(item, day.id)}
				</li>
			{:else}
				<li class="empty" class:target={drag?.zone === day.id}>
					Nothing planned yet. Drag something here.
				</li>
			{/each}
		</ol>
	</section>
{/snippet}

<!-- ─── One thing to do ───────────────────────────────────────────────────── -->

{#snippet row(item: Item, list: string)}
	{@const Icon = ICONS[item.category]}
	{@const away = distances(item)}
	{@const timed =
		list !== IDEAS &&
		!!trip.days.find((day) => day.id === list)?.items.some((i) => i.time)}
	<!--
		THE GRIP IS A BUTTON, so it is reachable by Tab and the arrow keys can move
		it; a pointer drags it; and `touch-action: none` on it — only on it — is
		what stops a phone taking the gesture as a scroll. The rest of the row
		scrolls the page as normal, so a long list is not a trap.
	-->
	<button
		type="button"
		class="control grip"
		data-grip={item.id}
		aria-label="Move {item.title}"
		aria-describedby="move-help"
		onpointerdown={(e) => onGripDown(e, item.id)}
		onpointermove={onGripMove}
		onpointerup={onGripUp}
		onpointercancel={end}
		onkeydown={(e) => onGripKey(e, item.id)}
	>
		<GripVertical />
	</button>

	<!--
		THE TIME HAS A COLUMN OF ITS OWN, in a day where anything has a time, so
		the titles line up down the day as they do in a calendar's agenda.
	-->
	{#if timed}
		<span class="time">{item.time ? formatTime(item.time) : ''}</span>
	{/if}

	<div class="body">
		<p class="title">{item.title}</p>

		<p class="meta">
			{#if list !== IDEAS}
				<span class="category"
					><Icon aria-hidden="true" /> {categoryName(item.category)}</span
				>
			{/if}
			<!--
				A NEW TAB, which the rest of this site does not do and this page does on
				purpose. The trip is where somebody is in the middle of arranging
				things — a row half-edited, a scroll to Day 6 — and a map is a glance
				to come back from, not a place to go. On a phone the map app usually
				takes the link anyway, and the page is still here behind it.

				`noopener` so the map cannot reach back into this page, and
				`noreferrer` so Google is not told the trip's address. The words saying
				it opens elsewhere are for a screen reader; the eye has the pin.
			-->
			<a
				class="map"
				href={mapHref(item)}
				target="_blank"
				rel="noopener noreferrer"
			>
				<MapPin aria-hidden="true" />{item.place ? item.place : 'Map'}
				<span class="visually-hidden">(opens in a new tab)</span>
			</a>
			{#if away.length}
				<span class="away" title="As the crow flies">{away.join(' · ')}</span>
			{/if}
			{#if item.prep && !item.prepDone}
				<span class="prep">To do: {item.prep}</span>
			{/if}
		</p>

		{#if item.notes}<p class="notes">{item.notes}</p>{/if}
	</div>

	<button
		type="button"
		class="control"
		aria-label="Edit {item.title}"
		aria-expanded={editing === item.id}
		data-open={editing === item.id || undefined}
		onclick={() => (editing = editing === item.id ? null : item.id)}
	>
		<Pencil />
	</button>

	{#if editing === item.id}
		{@render itemEditor(item, list, () => (editing = null), true)}
	{/if}
{/snippet}

<!-- ─── Editing one thing ──────────────────────────────────────────────────── -->

<!--
	ONE FORM, IN TWO PLACES: under a row, and in a pin's popup on the map.
	`done` is how each closes it, and `onPage` whether a move of day may take the
	focus to the row, which from the map it must not.
-->
{#snippet itemEditor(
	item: Item,
	list: string,
	done: () => void,
	onPage: boolean,
)}
	<div class="editor">
		<label class="field">
			<span>Title</span>
			<input
				class="input"
				value={item.title}
				maxlength="200"
				onchange={(e) => onTitle(item, e.currentTarget)}
			/>
		</label>

		<div class="row">
			<label class="field">
				<span>Day</span>
				<select
					class="input"
					value={list}
					onchange={(e) => {
						const to = e.currentTarget.value;
						const length =
							to === IDEAS
								? trip.ideas.length
								: (trip.days.find((day) => day.id === to)?.items.length ?? 0);
						void move(item.id, to, length, onPage);
					}}
				>
					{#each trip.days as day, d (day.id)}
						<option value={day.id}>
							{dayName(d)}{day.date ? ` · ${formatDate(day.date)}` : ''}
						</option>
					{/each}
					<option value={IDEAS}>Not scheduled yet</option>
				</select>
			</label>
			<label class="field">
				<span>Time</span>
				<input
					class="input"
					type="time"
					value={item.time}
					onchange={(e) => edit(item.id, { time: e.currentTarget.value })}
				/>
			</label>
			<label class="field">
				<span>Kind</span>
				<select
					class="input"
					value={item.category}
					onchange={(e) =>
						edit(item.id, { category: e.currentTarget.value as CategoryId })}
				>
					{#each CATEGORIES as category (category.id)}
						<option value={category.id}>{category.name}</option>
					{/each}
				</select>
			</label>
		</div>

		<div class="row">
			<label class="field grow">
				<span>Place</span>
				<input
					class="input"
					value={item.place}
					maxlength="200"
					placeholder="An address or a name, for the map"
					onchange={(e) =>
						edit(item.id, { place: e.currentTarget.value.trim() })}
					onkeydown={(e) => {
						if (e.key !== 'Enter') return;
						e.preventDefault();
						void find(item.id, e.currentTarget.value);
					}}
				/>
			</label>
			<button
				type="button"
				class="pill"
				onclick={(e) =>
					find(
						item.id,
						e.currentTarget
							.closest('.row')
							?.querySelector<HTMLInputElement>('input.input')?.value ?? '',
					)}
			>
				<Search /> Find
			</button>
			<label class="check">
				<input
					type="checkbox"
					checked={!!item.base}
					onchange={(e) => edit(item.id, { base: e.currentTarget.checked })}
				/>
				Measure from here
			</label>
		</div>
		{#if finding?.id === item.id}
			{@render matches(finding)}
		{:else if item.place && item.at === null}
			<p class="note">
				Not found on the map. Press Find to see what the map knows, or add the
				town or state.
			</p>
		{/if}

		<label class="field">
			<span>Notes</span>
			<textarea
				class="input"
				rows="3"
				maxlength="4000"
				value={item.notes}
				onchange={(e) => edit(item.id, { notes: e.currentTarget.value.trim() })}
			></textarea>
		</label>

		<div class="row">
			<label class="field grow">
				<span>Before we go</span>
				<input
					class="input"
					value={item.prep}
					maxlength="200"
					placeholder="Book it, reserve it, pack for it"
					onchange={(e) =>
						edit(item.id, { prep: e.currentTarget.value.trim() })}
				/>
			</label>
			<label class="check">
				<input
					type="checkbox"
					checked={item.prepDone}
					onchange={(e) => edit(item.id, { prepDone: e.currentTarget.checked })}
				/>
				Done
			</label>
		</div>

		<div class="actions">
			<button
				type="button"
				class="pill danger"
				onclick={() => {
					if (confirming !== item.id) return (confirming = item.id);
					confirming = null;
					done();
					sync.do({ type: 'remove', id: item.id });
				}}
				onblur={() => confirming === item.id && (confirming = null)}
			>
				{confirming === item.id ? 'Delete for everyone' : 'Delete'}
			</button>
			<span class="spacer"></span>
			<button type="button" class="pill primary" onclick={done}> Done </button>
		</div>
	</div>
{/snippet}

{#snippet mapEditor(id: string, done: () => void)}
	{@const at = where(id)}
	{@const item = at
		? (at.list === IDEAS
				? trip.ideas
				: (trip.days.find((d) => d.id === at.list)?.items ?? []))[at.index]
		: undefined}
	{#if at && item}
		{@render itemEditor(item, at.list, done, false)}
	{/if}
{/snippet}

<!-- What Find found, to choose from. -->
{#snippet matches(found: NonNullable<typeof finding>)}
	<div class="matches" aria-live="polite">
		{#if !found.matches}
			<p class="note">Looking for “{found.query}”…</p>
		{:else if found.failed}
			<p class="note">
				Couldn’t reach the map just now. Try again in a moment.
			</p>
		{:else if !found.matches.length}
			<p class="note">
				Nothing found for “{found.query}”. Adding the town or state usually
				helps.
			</p>
		{:else}
			<p class="note">Which one is it?</p>
			<ul>
				{#each found.matches as match (match.name)}
					{@const name = splitName(match.name)}
					<li>
						<button
							type="button"
							class="match"
							onclick={() => choose(found.id, found.query, match)}
						>
							<MapPin aria-hidden="true" />
							<span
								>{name.head}{#if name.rest}<span class="dim"
										>{' · '}{name.rest}</span
									>{/if}{#if area && outside(area, match.at) > FAR_MILES}<span
										class="far">{' · far from the trip'}</span
									>{/if}</span
							>
						</button>
					</li>
				{/each}
			</ul>
			<div class="actions">
				<button type="button" class="pill" onclick={() => (finding = null)}>
					None of these
				</button>
			</div>
		{/if}
	</div>
{/snippet}

<!-- ─── Adding ────────────────────────────────────────────────────────────── -->

{#snippet adder(to: string, category: CategoryId, key: string = to)}
	{#if adding === key}
		{@render adderForm(to, category)}
	{:else}
		<div class="actions">
			<button type="button" class="pill" onclick={() => (adding = key)}>
				<Plus /> Add an idea
			</button>
		</div>
	{/if}
{/snippet}

<!--
	THE FORM ALONE, for the two places that open it: an idea's pill at the foot of
	its list, and a day's plus in its head.
-->
{#snippet adderForm(to: string, category: CategoryId)}
	<form
		class="editor adder"
		onsubmit={(e) => {
			e.preventDefault();
			add(to, e.currentTarget);
		}}
	>
		<div class="row">
			<label class="field grow">
				<span>What</span>
				<!--
					FOCUSED ON ARRIVAL, by hand. `autofocus` only takes the focus when
					nothing holds it, and a day's plus stays on the page holding it.
				-->
				<input
					class="input"
					name="title"
					maxlength="200"
					required
					{@attach (input) => input.focus()}
					onkeydown={(e) => e.key === 'Escape' && (adding = null)}
				/>
			</label>
			<label class="field">
				<span>Kind</span>
				<select class="input" name="category" value={category}>
					{#each CATEGORIES as c (c.id)}
						<option value={c.id}>{c.name}</option>
					{/each}
				</select>
			</label>
		</div>
		<div class="actions">
			<span class="spacer"></span>
			<button type="button" class="pill" onclick={() => (adding = null)}
				>Close</button
			>
			<button class="pill primary">Add</button>
		</div>
	</form>
{/snippet}

<style>
	/*
	 * Every value here is a token from src/app.css, for the reason Letter gives:
	 * a page built from the same seven spaces and five sizes looks related to the
	 * rest of the site without either knowing about the other.
	 */

	.dim {
		color: color-mix(in oklab, var(--fg) 60%, transparent);
	}

	/*
	 * THE PAGE'S RHYTHM. Sections and cards are framed, so the frames do the
	 * separating and the space only has to match: `--space-12` inside a pane,
	 * under its name and between its cards, and `--space-8` inside a card.
	 */
	/* Panes 4px apart, under the masthead's pane, as the Text Editor's are. */
	.board {
		display: flex;
		flex-direction: column;
		gap: var(--gap-panel);
	}

	/* EACH SECTION IS A PANE: the document surface, framed on the shell. The
	 * side panels are sections too, and draw their own box. */
	.board > .section {
		padding: var(--space-12);
		border-radius: var(--radius-l);
		background-color: var(--bg);
		box-shadow: inset 0 0 0 1px var(--frame);
	}

	/*
	 * THE CALENDAR. As many 20rem columns as fit, each stretched to share what is
	 * left over, so a row of cards always meets both edges. 20rem is about the
	 * narrowest a row stays readable at, with an open editor still fitting two
	 * fields to a line. `min(…, 100%)` so a window narrower than that gets one
	 * column the width of the window rather than one wider than it.
	 *
	 * `auto-fill` and not `auto-fit`: the empty tracks are kept, so a group of one
	 * card — Before we go — is one column wide, the same width as a day, rather
	 * than stretched across the row.
	 *
	 * `align-items: start`: a card is as tall as what is in it. Every row still
	 * begins on one line, which is what makes it read as a calendar.
	 */
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(20rem, 100%), 1fr));
		align-items: start;
		/* The pane's padding, so a card is as far from the next as from the edge. */
		gap: var(--space-12);
	}

	/*
	 * A CARD IS A PANE, framed on the shell as the Text Editor's are, so a day
	 * reads as a thing and not as a run of text under a heading.
	 */
	.card {
		min-inline-size: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-8);
		padding: var(--space-12);
		border-radius: var(--radius-l);
		background-color: var(--shell);
		box-shadow: inset 0 0 0 1px var(--frame);
	}

	/* Where the next day will go: the outline of a card, and nothing in it yet. */
	.card.next {
		background: none;
		box-shadow: none;
		outline: 1px dashed var(--frame);
		outline-offset: -1px;
	}

	/* A section of one card gives it the whole width, at any size. */
	.before .grid,
	.ideas .grid,
	.changes .grid {
		grid-template-columns: minmax(0, 1fr);
	}

	/*
	 * THE SIDE PANEL: a pane standing at the window's end edge, the panel gap
	 * clear of it, as tall as the window. 30rem holds a setting's field and its
	 * label on one line.
	 */
	.drawer {
		position: fixed;
		inset: var(--gap-panel) var(--gap-panel) var(--gap-panel) auto;
		margin: 0;
		inline-size: min(30rem, 100% - var(--gap-panel) * 2);
		block-size: auto;
		max-block-size: none;
		padding: 0;
		border: none;
		border-radius: var(--radius-l);
		background-color: var(--bg);
		color: var(--fg);
		box-shadow: inset 0 0 0 1px var(--frame);
		overflow-y: auto;
		overscroll-behavior: contain;
	}

	.drawer::backdrop {
		background-color: rgb(0 0 0 / 40%);
	}

	/*
	 * IT SLIDES IN FROM THE EDGE IT STANDS AT, and back out, at the morph's
	 * pace, which is zero for a visitor who asked for less motion.
	 * `allow-discrete` lets `display` and the top layer wait for the slide
	 * to finish before the panel is taken away.
	 */
	.drawer,
	.drawer::backdrop {
		transition:
			translate var(--motion-morph) ease-out,
			opacity var(--motion-morph) ease-out,
			display var(--motion-morph) allow-discrete,
			overlay var(--motion-morph) allow-discrete;
	}

	.drawer:not([open]) {
		translate: 2rem 0;
		opacity: 0;
	}

	.drawer:not([open])::backdrop {
		opacity: 0;
	}

	@starting-style {
		.drawer[open] {
			translate: 2rem 0;
			opacity: 0;
		}

		.drawer[open]::backdrop {
			opacity: 0;
		}
	}

	.drawer > .section {
		padding: var(--space-16);
	}

	.drawer-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-8);
	}

	/* One column in the panel, whatever the section's grid would do. */
	.drawer .grid {
		grid-template-columns: minmax(0, 1fr);
	}

	/* A kind of idea inside the one ideas card. */
	.group {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}

	.group + .group {
		padding-block-start: var(--space-8);
		border-block-start: 1px solid var(--frame);
	}

	/*
	 * TWO COLUMNS ONCE THERE IS ROOM: the schedule takes the width, and what is
	 * waiting to happen stands beside it. The document order is untouched, so a
	 * phone and a screen reader still go checklist, schedule, ideas, history.
	 * 68rem is 1088px, the narrowest the schedule still holds two days of 20rem
	 * beside the 22rem rail.
	 */
	@media (min-width: 68rem) {
		.board {
			display: grid;
			grid-template-columns: minmax(0, 1fr) 22rem;
			grid-template-rows: auto auto 1fr;
			grid-template-areas:
				'map map'
				'schedule before'
				'schedule ideas';
			align-items: stretch;
			gap: var(--gap-panel);
		}

		.schedule {
			grid-area: schedule;
		}

		.map-section {
			grid-area: map;
		}

		.before {
			grid-area: before;
		}

		.ideas {
			grid-area: ideas;
		}
	}

	/*
	 * THE HEADER ROW IS ONE HEIGHT ON EVERY CARD — a control's — whether or not
	 * this card's header has a pencil in it. Without that, a day's list would start
	 * lower than Before we go's beside it, by exactly the pencil, and a row of cards
	 * would not line up at the one place a calendar must.
	 */
	.card-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-8);
		min-block-size: var(--control-block-size);
	}

	/* A day's plus and pencil, kept together at the end of its head. */
	.card-tools {
		display: flex;
		flex: none;
		gap: var(--space-4);
	}

	/* Every card's name, at one size: a day's, the checklist's, a kind of idea's. */
	.card-title {
		display: flex;
		align-items: center;
		gap: var(--space-8);
		min-inline-size: 0;
		font-size: var(--text-heading2);
		line-height: var(--leading-tight);
		letter-spacing: var(--tracking-tight);
	}

	.card-title .dim {
		font-weight: var(--weight-regular);
	}

	.card-title :global(svg) {
		inline-size: 1em;
		block-size: 1em;
		flex: none;
	}

	/* A name for a group of cards, a step above the cards' own. */
	/* A section: its name, then its grid, as far apart as the pane's padding. */
	.section {
		display: flex;
		flex-direction: column;
		gap: var(--space-12);
	}

	/*
	 * TWICE A PHONE'S HEIGHT ONCE THERE IS ROOM, and never more than most of the
	 * window, so the schedule still peeks out beneath it.
	 */
	.map-section {
		--map-size: 20rem;
	}

	@media (min-width: 48rem) {
		.map-section {
			--map-size: min(40rem, 70dvh);
		}
	}

	/*
	 * FULL VIEW: the page's whole area under the bar, a panel gap in from every
	 * edge as the drawers stand. Not the Fullscreen API, which would hide the bar
	 * and the save status with it.
	 */
	.map-section.full {
		position: fixed;
		inset: calc(var(--bar-block-size) + var(--gap-panel)) var(--gap-panel)
			calc(var(--gap-panel) + var(--fab-reserve, 0px));
		z-index: 1;
	}

	.map-section.full :global(.map) {
		flex: 1;
		block-size: auto;
	}

	/* The page under it stays where it was, and does not scroll behind. */
	:global(html:has(.map-section.full)) {
		overflow: hidden;
	}

	.section-title {
		font-size: var(--text-heading1);
		line-height: var(--leading-tight);
		letter-spacing: var(--tracking-tight);
	}

	.day-title {
		font-style: italic;
	}

	/* ─── The checklist ─── */

	.checklist {
		list-style: none;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}

	/*
	 * A LINE OF THE CHECKLIST IS A ROW, drawn to a row's measurements: the box
	 * stands in a column as wide as a row's grip, centred on it, and the words
	 * start where a row's title does and sit level with the box — so the checklist
	 * and the day beside it line up down the page, the same element with a
	 * checkbox where the other has a grip.
	 */
	.checklist label {
		display: grid;
		grid-template-columns: var(--control-block-size) minmax(0, 1fr);
		column-gap: var(--space-8);
		padding-block: var(--space-4);
		cursor: pointer;
	}

	.checklist input {
		justify-self: center;
		margin-block-start: calc((var(--control-block-size) - 1.125rem) / 2);
	}

	/* The page's own leading, not a heading's: a line of the checklist wraps onto a
	 * second more often than a row's title does, and the tight one crowded it. */
	.checklist label > span {
		padding-block-start: calc((var(--control-block-size) - 1lh) / 2);
	}

	.check {
		display: flex;
		align-items: center;
		gap: var(--space-8);
		cursor: pointer;
	}

	/* The site's one colour, on the one control that is ticked. */
	input[type='checkbox'] {
		accent-color: var(--accent);
		inline-size: 1.125rem;
		block-size: 1.125rem;
		flex: none;
	}

	summary {
		cursor: pointer;
		font-size: var(--text-label1);
	}

	.done summary {
		color: color-mix(in oklab, var(--fg) 60%, transparent);
	}

	/* ─── The history ─── */

	.history {
		list-style: none;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}

	/*
	 * A LINE OF HISTORY IS A ROW, to a row's measurements, like the checklist: a
	 * column the width of a grip, holding the initial of who did it, and the words
	 * starting where a row's title does. `.body` and `.meta` are the rows' own
	 * rules, so the sentence and the name under it are set exactly as a title and
	 * its details are.
	 */
	.revision {
		display: grid;
		grid-template-columns: var(--control-block-size) minmax(0, 1fr);
		align-items: start;
		column-gap: var(--space-8);
		padding-block: var(--space-4);
	}

	/*
	 * THE INITIAL, in the shape the grip's hover draws — a circle with a hairline —
	 * so it reads as the same furniture and not as a button.
	 */
	.initial {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		inline-size: var(--control-block-size);
		block-size: var(--control-block-size);
		border-radius: var(--radius-round);
		box-shadow: inset 0 0 0 1px var(--edge);
		font-size: var(--text-label1);
		font-weight: var(--weight-semibold);
		line-height: 1;
	}

	/*
	 * THE DOT BETWEEN THE NAME AND THE TIME, with the same air on both sides: the
	 * meta line's own gap after it, and that gap again as a margin before it. A
	 * space character there was narrower than the gap and sat the dot against the
	 * name.
	 */
	.who::after {
		content: '·';
		margin-inline-start: var(--space-12);
	}

	/* ─── The rows ─── */

	.items {
		list-style: none;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}

	/*
	 * THE GRIP, THE WORDS, THE PENCIL, and the editor under all three when it is
	 * open. The two controls are the bar's own `.control` from src/app.css — the
	 * same circle, the same size, the same answer to a pointer — so a row's
	 * buttons are recognisably the site's buttons.
	 */
	.item {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		align-items: start;
		gap: 0 var(--space-8);
		padding-block: var(--space-4);
		border-radius: var(--radius-s);
	}

	/*
	 * LIFTED, while it travels. `--bg` so the rows it passes over do not show
	 * through it, and the hairline so it has an edge to be a thing by.
	 *
	 * `z-index: 0` and not higher: enough to paint over the rows after it, which
	 * are not positioned, and still under the bar, which is `1` — a row dragged
	 * up past the top of the page slides beneath the bar as the letter does.
	 */
	.item[data-dragging] {
		position: relative;
		z-index: 0;
		background-color: var(--bg);
		box-shadow: 0 0 0 1px var(--edge);
	}

	/*
	 * `touch-action: none` so a finger on the grip drags rather than scrolls, and
	 * no selection or long-press menu, which iOS otherwise starts on a held press
	 * and which takes the gesture away from the drag.
	 */
	.grip {
		cursor: grab;
		touch-action: none;
		user-select: none;
		-webkit-user-select: none;
		-webkit-touch-callout: none;
	}

	.item[data-dragging] .grip {
		cursor: grabbing;
	}

	/*
	 * THE CONTROLS WAIT FOR THE POINTER, where there is one that can hover. A day
	 * of rows each with a grip and a pencil is a column of icons beside the words;
	 * this keeps them out of sight until the row is pointed at.
	 *
	 * OPACITY, and not `display` or `visibility`: the row keeps its shape, so the
	 * words do not shift when the pointer arrives, and the buttons stay in the tab
	 * order — `:focus-visible` shows them to a keyboard, without leaving a pencil
	 * showing after a mouse has clicked it and moved on. They also stay shown on
	 * the row being dragged and the row whose editor is open.
	 *
	 * A phone has no hover, so it keeps them showing all the time.
	 */
	@media (hover: hover) and (pointer: fine) {
		.item > .control,
		.card-tools > .control {
			opacity: 0;
		}

		.item:hover > .control,
		.item:has(:focus-visible) > .control,
		.item[data-dragging] > .control,
		.item:has(> .control[data-open]) > .control,
		.card-head:hover .card-tools > .control,
		.card-tools:has(:focus-visible) > .control,
		.card-tools:has(> .control[data-open]) > .control {
			opacity: 1;
		}
	}

	.body {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		/* The first line sits level with the middle of the controls beside it. */
		padding-block-start: calc((var(--control-block-size) - 1lh) / 2);
	}

	.title {
		line-height: var(--leading-tight);
		padding-block: calc((1lh - 1em) / 2);
	}

	/* 4rem holds "12:45 pm", the widest a time gets. */
	.item:has(> .time) {
		grid-template-columns: auto 4rem minmax(0, 1fr) auto;
	}

	/*
	 * ON A PHONE THE TIME GOES ABOVE THE TITLE, where a column of its own would
	 * leave the title a third of the width. 40rem is 640px, below which a day
	 * card is the whole screen.
	 */
	@media (max-width: 40rem) {
		.item:has(> .time) {
			grid-template-columns: auto minmax(0, 1fr) auto;
		}

		.item > .grip {
			grid-row: 1 / span 2;
		}

		.item > .time {
			grid-column: 2;
			grid-row: 1;
		}

		.item > .time:empty {
			display: none;
		}

		.item:has(> .time) > .body {
			grid-column: 2;
			grid-row: 2;
		}

		.item:has(> .time) > .body > .title {
			padding-block-start: 0;
		}

		.item:has(> .time) > .control:last-child {
			grid-column: 3;
			grid-row: 1 / span 2;
		}
	}

	.time {
		font-variant-numeric: tabular-nums;
		font-weight: var(--weight-semibold);
		line-height: var(--leading-tight);
		/* Level with the title beside it, which the body pads the same way. */
		padding-block-start: calc(
			(var(--control-block-size) - 1lh) / 2 + (1lh - 1em) / 2
		);
		white-space: nowrap;
	}

	.meta {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-4) var(--space-12);
		font-size: var(--text-label1);
		line-height: var(--leading-tight);
		color: color-mix(in oklab, var(--fg) 60%, transparent);
	}

	.category,
	.map {
		display: inline-flex;
		align-items: center;
		gap: var(--space-4);
	}

	.meta :global(svg) {
		inline-size: 1em;
		block-size: 1em;
		flex: none;
	}

	.map {
		color: inherit;
		text-underline-offset: 0.2em;
		/* A long address wraps rather than pushing the row wider than a phone. */
		overflow-wrap: anywhere;
	}

	.map:hover {
		color: var(--fg);
	}

	/*
	 * STILL TO DO, in the accent — the same highlighter the title wears, and for
	 * the same reason: it is the thing on the row that wants to be read first.
	 */
	.prep {
		background-color: var(--accent);
		color: var(--accent-fg);
		padding: var(--space-2) var(--space-6);
		border-radius: var(--radius-s);
	}

	.away {
		overflow-wrap: anywhere;
	}

	.matches {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}

	.matches ul {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
	}

	/* A match is a row to press: the pin, the name, and where it is, dimmed. */
	.match {
		appearance: none;
		display: flex;
		align-items: start;
		gap: var(--space-8);
		inline-size: 100%;
		padding: var(--space-6) var(--space-8);
		border: none;
		border-radius: var(--radius-s);
		background: none;
		color: inherit;
		font: inherit;
		font-size: var(--text-label1);
		text-align: start;
		cursor: pointer;
	}

	/* A match somewhere else of the same name, said so before it is chosen. */
	.far {
		font-style: italic;
		color: color-mix(in oklab, var(--fg) 60%, transparent);
	}

	.match:hover {
		background-color: var(--surface-hover);
	}

	.match:focus-visible {
		outline: 2px solid var(--fg);
		outline-offset: 2px;
	}

	.match :global(svg) {
		flex: none;
		inline-size: 1em;
		block-size: 1em;
		margin-block-start: 0.1em;
	}

	.notes {
		font-size: var(--text-label1);
		white-space: pre-line;
	}

	/* Dashed, as a slot to drop into, since it now stands inside a framed card. */
	.empty {
		padding: var(--space-12);
		border-radius: var(--radius-l);
		outline: 1px dashed var(--edge);
		outline-offset: -1px;
		font-size: var(--text-label1);
		color: color-mix(in oklab, var(--fg) 60%, transparent);
		text-align: center;
	}

	.empty.target,
	.ideas.target {
		background-color: var(--surface-hover);
		box-shadow: inset 0 0 0 2px var(--accent);
	}

	/* The whole section is one drop zone; see the markup. */
	/* The whole unscheduled section is one drop zone; the rounding is for its highlight. */
	.ideas {
		border-radius: var(--radius-l);
	}

	/*
	 * WHERE IT WOULD LAND. Fixed to the window, because it is placed from
	 * measurements taken in the window's coordinates; and ZERO HEIGHT in the
	 * layout, because a line that took room would move the rows it was measured
	 * between, and then point somewhere else.
	 *
	 * The accent, with an edge in `--fg` — yellow alone on white is 1.4:1 and a
	 * line of it would be hard to find mid-drag.
	 */
	.drop-line {
		position: fixed;
		z-index: 0;
		block-size: 4px;
		margin-block-start: -2px;
		border-radius: var(--radius-round);
		background-color: var(--accent);
		box-shadow: 0 0 0 1px var(--fg);
		pointer-events: none;
	}

	/* ─── The forms ─── */

	/*
	 * ON THE DOCUMENT'S GROUND, as the Text Editor's sheet is: a form is where
	 * something is written, and it has to stand off the card it opens in. With
	 * no ground of its own it was the card's colour under a hairline.
	 */
	.editor {
		grid-column: 1 / -1;
		display: flex;
		flex-direction: column;
		gap: var(--space-12);
		margin-block: var(--space-16);
		padding: var(--space-16);
		border-radius: var(--radius-l);
		background-color: var(--bg);
		box-shadow: inset 0 0 0 1px var(--edge);
	}

	/* A card's fields, stacked with the gap an editor gives its own. */
	.fields {
		display: flex;
		flex-direction: column;
		gap: var(--space-12);
	}

	.note {
		font-size: var(--text-label1);
		color: color-mix(in oklab, var(--fg) 60%, transparent);
	}

	.row {
		display: flex;
		flex-wrap: wrap;
		align-items: end;
		gap: var(--space-12);
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		font-size: var(--text-label1);
		min-inline-size: 0;
	}

	.grow {
		flex: 1 1 12rem;
	}

	/* A base's name is a word or two, and its place wants the rest. */
	.base > .field:first-child {
		flex: 0 1 8rem;
	}

	/* A fieldset for the legend and the grouping, with the browser's frame off. */
	.marks {
		border: none;
		padding: 0;
		margin: 0;
	}

	.marks legend {
		padding: 0;
		margin-block-end: var(--space-4);
	}

	.mark-group {
		margin-block-start: var(--space-4);
		color: color-mix(in oklab, var(--fg) 60%, transparent);
	}

	.mark-options {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-4);
	}

	/* The input is hidden, so the ring goes on the label that shows it. */
	.mark-options label:has(:focus-visible) {
		outline: 2px solid var(--fg);
		outline-offset: 2px;
	}

	/*
	 * A FIELD IS THE SEARCH FIELD'S SHAPE — the pill, the hairline, the ring on
	 * focus — so every place on this site that takes typing looks like the first
	 * one did.
	 */
	.input {
		block-size: var(--control-block-size);
		padding-inline: var(--space-12);
		border: 1px solid var(--edge);
		border-radius: var(--radius-s);
		background: none;
		color: inherit;
		font-size: var(--text-body1);
		min-inline-size: 0;
		max-inline-size: 100%;
	}

	/*
	 * A PILL CANNOT HOLD PARAGRAPHS, so the notes take the pill's END — half the
	 * control's height — as their corner. On one line the two shapes are the same;
	 * past it the box grows and its corners stay the ones every field has.
	 */
	/*
	 * THE OPEN LIST OF A SELECT IS PAINTED BY THE SYSTEM, from the select's own
	 * background. Transparent gives it nothing to go on, so Chrome on Windows falls
	 * back to white while the options inherit the page's text colour: white on
	 * white in dark. The options are given both colours outright.
	 */
	select.input option {
		background-color: var(--bg);
		color: var(--fg);
	}

	textarea.input {
		block-size: auto;
		padding-block: var(--space-8);
		border-radius: var(--radius-s);
		line-height: var(--leading-prose);
		resize: vertical;
	}

	.input:focus-visible {
		outline: 2px solid var(--fg);
		outline-offset: 2px;
	}

	.check {
		block-size: var(--control-block-size);
		align-items: center;
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-8);
	}

	.spacer {
		flex: 1;
	}

	/*
	 * A BUTTON WITH WORDS. The bar's controls are circles because they hold a mark;
	 * this holds a label, and the same radius on a wider box draws a pill — see the
	 * note beside `--radius-round`. Hover and focus are theirs exactly.
	 */
	.pill {
		appearance: none;
		display: inline-flex;
		align-items: center;
		gap: var(--space-8);
		block-size: var(--control-block-size);
		padding-inline: var(--space-12);
		border: none;
		border-radius: var(--radius-s);
		background: none;
		box-shadow: inset 0 0 0 1px var(--edge);
		color: inherit;
		font-size: var(--text-label1);
		cursor: pointer;
	}

	.pill :global(svg) {
		inline-size: 1rem;
		block-size: 1rem;
	}

	.pill:hover {
		background-color: var(--surface-hover);
	}

	.pill:focus-visible {
		outline: 2px solid var(--fg);
		outline-offset: 2px;
	}

	.pill:disabled {
		opacity: 0.4;
		cursor: default;
	}

	.pill.primary {
		background-color: var(--accent);
		color: var(--accent-fg);
		box-shadow: none;
		font-weight: var(--weight-semibold);
	}

	/*
	 * NO RED, because this site has one colour and it is yellow. A destructive
	 * button is told apart by its weight and its words, and by asking twice.
	 */
	.pill.danger {
		font-weight: var(--weight-semibold);
	}
</style>
