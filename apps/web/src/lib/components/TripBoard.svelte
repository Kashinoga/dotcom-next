<script lang="ts">
	import { tick } from 'svelte';
	import { flip } from 'svelte/animate';

	// One deep import per icon, as everywhere else.
	import ArrowDown from '@lucide/svelte/icons/arrow-down';
	import ArrowUp from '@lucide/svelte/icons/arrow-up';
	import CalendarPlus from '@lucide/svelte/icons/calendar-plus';
	import Car from '@lucide/svelte/icons/car';
	import Footprints from '@lucide/svelte/icons/footprints';
	import GripVertical from '@lucide/svelte/icons/grip-vertical';
	import MapPin from '@lucide/svelte/icons/map-pin';
	import Mountain from '@lucide/svelte/icons/mountain';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Plus from '@lucide/svelte/icons/plus';
	import ShoppingBag from '@lucide/svelte/icons/shopping-bag';
	import Ticket from '@lucide/svelte/icons/ticket';
	import Utensils from '@lucide/svelte/icons/utensils';
	import Waves from '@lucide/svelte/icons/waves';
	import type { Component } from 'svelte';

	import { enhance } from '$app/forms';
	import { morphDuration } from '$lib/motion';
	import {
		CATEGORIES,
		formatDate,
		formatTime,
		IDEAS,
		nextDate,
		type CategoryId,
		type Day,
		type Item,
		NICKNAME_MAX,
		type Revision,
		type Trip,
	} from '$lib/trip';
	import { TripSync, type SyncState } from '$lib/trip-sync.svelte';
	import { bar, type BarStatus } from '$lib/bar.svelte';

	let {
		stored,
		nickname,
		device,
		endpoint,
		ontrip,
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
	} = $props();

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

	async function move(id: string, to: string, index: number) {
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
		// top of the page with the old one.
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

	<section class="section" aria-labelledby="prep-heading">
		<h2 id="prep-heading" class="section-title">Before we go</h2>

		<div class="grid">
			<section class="card" aria-labelledby="checklist-heading">
				<div class="card-head">
					<h3 id="checklist-heading" class="card-title">
						Checklist{#if prep.open.length}<span class="dim"
								>{` · ${prep.open.length} left`}</span
							>{/if}
					</h3>
				</div>

				{#if prep.open.length}
					<ul class="checklist">
						{#each prep.open as { item, where } (item.id)}
							<li>
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
						<summary>{prep.done.length} done</summary>
						<ul class="checklist">
							{#each prep.done as { item, where } (item.id)}
								<li>
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

	<!-- ─── Schedule ──────────────────────────────────────────────────────────── -->

	<section class="section" aria-labelledby="schedule-heading">
		<h2 id="schedule-heading" class="section-title">Schedule</h2>

		<div class="grid">
			{#each trip.days as day, d (day.id)}
				{@render daySection(day, d)}
			{/each}

			<!--
				THE NEXT CELL, where the next day will appear. A card with nothing in it
				but its header row, so the button stands where a new day's name will.
			-->
			<div class="card">
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

		EVERY KIND HAS A CARD, empty or not, the way a calendar has a square for a
		day with nothing on it — so the cards do not shuffle position as the last
		idea of a kind is scheduled, and each has its own place to add one.
	-->
	<section
		class="section ideas"
		class:target={drag?.moved && drag.zone === IDEAS}
		aria-labelledby="ideas-heading"
		data-drop={IDEAS}
	>
		<h2 id="ideas-heading" class="section-title">Not scheduled yet</h2>

		<div class="grid">
			{#each CATEGORIES as category (category.id)}
				{@const items = trip.ideas.filter(
					(item) => item.category === category.id,
				)}
				{@const Icon = ICONS[category.id]}
				<section class="card" aria-labelledby="group-{category.id}">
					<div class="card-head">
						<h3 id="group-{category.id}" class="card-title">
							<Icon aria-hidden="true" />
							<span
								>{category.name}{#if items.length}<span class="dim"
										>{` · ${items.length}`}</span
									>{/if}</span
							>
						</h3>
					</div>

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
							>
								{@render row(item, IDEAS)}
							</li>
						{:else}
							<li class="empty">Nothing here yet.</li>
						{/each}
					</ul>

					{@render adder(IDEAS, category.id, `${IDEAS}-${category.id}`)}
				</section>
			{/each}
		</div>
	</section>

	<!-- ─── History ───────────────────────────────────────────────────────────── -->

	<!--
		WHO CHANGED WHAT, newest first: the last hundred changes the server took,
		each in one sentence written at the moment it happened. Each line leads with
		the initial of whoever made it, in the column where a row has its grip — so
		the words line up with every other card's.
	-->
	<section class="section" aria-labelledby="history-heading">
		<h2 id="history-heading" class="section-title">History</h2>

		<div class="grid">
			<section class="card" aria-labelledby="changes-heading">
				<div class="card-head">
					<h3 id="changes-heading" class="card-title">
						Recent changes{#if sync.history.length}<span class="dim"
								>{` · ${sync.history.length}`}</span
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

	<!-- ─── Settings ──────────────────────────────────────────────────────────── -->

	<!--
		TWO CARDS, BECAUSE THEY REACH TWO DIFFERENT DISTANCES. A change to the trip is
		everybody's; locking is this browser's alone. Standing them side by side under
		their own names says which is which before anybody presses anything.
	-->
	<section class="section" aria-labelledby="settings-heading">
		<h2 id="settings-heading" class="section-title">Settings</h2>

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
					Asks for the passcode again next time. Everyone else stays signed in.
				</p>
				<form method="POST" action="?/lock" use:enhance class="actions">
					<button class="pill">Lock this device</button>
				</form>
			</section>
		</div>
	</section>
</div>

<!-- ─── One day ───────────────────────────────────────────────────────────── -->

{#snippet daySection(day: Day, d: number)}
	<section class="card" aria-labelledby="day-{day.id}">
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

	<div class="body">
		<p class="title">
			{#if item.time}<span class="time">{formatTime(item.time)}</span>{/if}
			{item.title}
		</p>

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
							void move(item.id, to, length);
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

			<label class="field">
				<span>Place</span>
				<input
					class="input"
					value={item.place}
					maxlength="200"
					placeholder="An address or a name, for the map"
					onchange={(e) =>
						edit(item.id, { place: e.currentTarget.value.trim() })}
				/>
			</label>

			<label class="field">
				<span>Notes</span>
				<textarea
					class="input"
					rows="3"
					maxlength="4000"
					value={item.notes}
					onchange={(e) =>
						edit(item.id, { notes: e.currentTarget.value.trim() })}></textarea>
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
						onchange={(e) =>
							edit(item.id, { prepDone: e.currentTarget.checked })}
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
						confirming = editing = null;
						sync.do({ type: 'remove', id: item.id });
					}}
					onblur={() => confirming === item.id && (confirming = null)}
				>
					{confirming === item.id ? 'Delete for everyone' : 'Delete'}
				</button>
				<span class="spacer"></span>
				<button
					type="button"
					class="pill primary"
					onclick={() => (editing = null)}
				>
					Done
				</button>
			</div>
		</div>
	{/if}
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
	 * THE PAGE'S RHYTHM, one space per level of heading and nothing else:
	 *
	 *   · `--space-2xl` between one SECTION and the next — the widest step, so
	 *     "Schedule" reads as the start of something and not as one more card;
	 *   · `--space-xl` between one CARD and the next, in either direction, in
	 *     every section — a card is a card, so the air around it does not change;
	 *   · `--space-m` from a section's name to its first row of cards;
	 *   · `--space-xs` inside a card, from its header to its list and from its list
	 *     to its button.
	 *
	 * Each step is larger than the one inside it, which is what lets proximity say
	 * which heading a thing belongs to without a line drawn anywhere.
	 */
	.board {
		display: flex;
		flex-direction: column;
		gap: var(--space-2xl);
		margin-block-start: var(--space-l);
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
		gap: var(--space-xl) var(--space-l);
	}

	.card {
		min-inline-size: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-xs);
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
		gap: var(--space-xs);
		min-block-size: var(--control-block-size);
	}

	/* A day's plus and pencil, kept together at the end of its head. */
	.card-tools {
		display: flex;
		flex: none;
		gap: var(--space-2xs);
	}

	/* Every card's name, at one size: a day's, the checklist's, a kind of idea's. */
	.card-title {
		display: flex;
		align-items: center;
		gap: var(--space-xs);
		min-inline-size: 0;
		font-size: var(--text-l);
		line-height: var(--leading-tight);
		letter-spacing: var(--tracking-tight);
	}

	.card-title .dim {
		font-weight: 400;
	}

	.card-title :global(svg) {
		inline-size: 1em;
		block-size: 1em;
		flex: none;
	}

	/* A name for a group of cards, a step above the cards' own. */
	/* A section: its name, then its grid, closer to each other than to the next. */
	.section {
		display: flex;
		flex-direction: column;
		gap: var(--space-m);
	}

	.section-title {
		font-size: var(--text-xl);
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
		gap: var(--space-2xs);
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
		column-gap: var(--space-xs);
		padding-block: var(--space-2xs);
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
		gap: var(--space-xs);
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
		font-size: var(--text-s);
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
		gap: var(--space-2xs);
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
		column-gap: var(--space-xs);
		padding-block: var(--space-2xs);
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
		font-size: var(--text-s);
		font-weight: 600;
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
		margin-inline-start: var(--space-s);
	}

	/* ─── The rows ─── */

	.items {
		list-style: none;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-2xs);
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
		gap: 0 var(--space-xs);
		padding-block: var(--space-2xs);
		border-radius: calc(var(--control-block-size) / 2);
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
		gap: var(--space-2xs);
		/* The first line sits level with the middle of the controls beside it. */
		padding-block-start: calc((var(--control-block-size) - 1lh) / 2);
	}

	.title {
		line-height: var(--leading-tight);
		padding-block: calc((1lh - 1em) / 2);
	}

	.time {
		font-variant-numeric: tabular-nums;
		font-weight: 600;
		margin-inline-end: var(--space-2xs);
	}

	.meta {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2xs) var(--space-s);
		font-size: var(--text-s);
		line-height: var(--leading-tight);
		color: color-mix(in oklab, var(--fg) 60%, transparent);
	}

	.category,
	.map {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2xs);
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
		padding-inline: var(--space-2xs);
	}

	.notes {
		font-size: var(--text-s);
		white-space: pre-line;
	}

	.empty {
		padding: var(--space-s);
		border-radius: calc(var(--control-block-size) / 2);
		box-shadow: inset 0 0 0 1px var(--edge);
		font-size: var(--text-s);
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
		border-radius: calc(var(--control-block-size) / 2);
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

	.editor {
		grid-column: 1 / -1;
		display: flex;
		flex-direction: column;
		gap: var(--space-s);
		margin-block: var(--space-m);
		padding: var(--space-m);
		border-radius: calc(var(--control-block-size) / 2 + var(--space-m));
		box-shadow: inset 0 0 0 1px var(--edge);
	}

	/* A card's fields, stacked with the gap an editor gives its own. */
	.fields {
		display: flex;
		flex-direction: column;
		gap: var(--space-s);
	}

	.note {
		font-size: var(--text-s);
		color: color-mix(in oklab, var(--fg) 60%, transparent);
	}

	.row {
		display: flex;
		flex-wrap: wrap;
		align-items: end;
		gap: var(--space-s);
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: var(--space-2xs);
		font-size: var(--text-s);
		min-inline-size: 0;
	}

	.grow {
		flex: 1 1 12rem;
	}

	/*
	 * A FIELD IS THE SEARCH FIELD'S SHAPE — the pill, the hairline, the ring on
	 * focus — so every place on this site that takes typing looks like the first
	 * one did.
	 */
	.input {
		block-size: var(--control-block-size);
		padding-inline: var(--space-s);
		border: 1px solid var(--edge);
		border-radius: var(--radius-round);
		background: none;
		color: inherit;
		font-size: var(--text-m);
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
		padding-block: var(--space-xs);
		border-radius: calc(var(--control-block-size) / 2);
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
		gap: var(--space-xs);
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
		gap: var(--space-xs);
		block-size: var(--control-block-size);
		padding-inline: var(--space-s);
		border: none;
		border-radius: var(--radius-round);
		background: none;
		box-shadow: inset 0 0 0 1px var(--edge);
		color: inherit;
		font-size: var(--text-s);
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
		font-weight: 600;
	}

	/*
	 * NO RED, because this site has one colour and it is yellow. A destructive
	 * button is told apart by its weight and its words, and by asking twice.
	 */
	.pill.danger {
		font-weight: 600;
	}
</style>
