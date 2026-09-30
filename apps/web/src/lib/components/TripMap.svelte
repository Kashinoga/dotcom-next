<script lang="ts" module>
	import type { Coords } from '$lib/trip';

	export interface Pin {
		id: string;
		title: string;
		at: Coords;
		base: boolean;
		/* Whether its popup offers the edit form. A thing on the trip, not a base. */
		editable: boolean;
		/* Lines under the title in its popup: the day, then the distances. */
		lines: string[];
	}
</script>

<script lang="ts">
	import 'leaflet/dist/leaflet.css';
	import type { CircleMarker, LayerGroup, Map as LeafletMap } from 'leaflet';
	import type { Snippet } from 'svelte';

	import Pencil from '@lucide/svelte/icons/pencil';
	import X from '@lucide/svelte/icons/x';

	let {
		pins,
		full = false,
		editor,
	}: {
		pins: Pin[];
		full?: boolean;
		/* The board's own edit form, for a thing, and how to put it away. */
		editor?: Snippet<[string, () => void]>;
	} = $props();

	/*
	 * LUCIDE'S PLUS AND MINUS, written out, because Leaflet takes its zoom
	 * buttons' insides as HTML and a Svelte component is not a string.
	 */
	const icon = (d: string) =>
		`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">${d}</svg>`;
	const PLUS = icon('<path d="M5 12h14"/><path d="M12 5v14"/>');
	const MINUS = icon('<path d="M5 12h14"/>');

	let container = $state<HTMLDivElement>();
	let L = $state<typeof import('leaflet')>();
	let map: LeafletMap | undefined;
	let layer: LayerGroup | undefined;
	let fitted = false;

	/*
	 * ONE POPUP FOR EVERY PIN, our own and not Leaflet's: a popover, which the
	 * browser draws above the page, so it can reach past the map's edges. Svelte
	 * draws what is in it, so it follows the trip and can hold the board's form.
	 */
	let popEl = $state<HTMLDivElement>();
	let openId = $state<string | null>(null);
	let editing = $state(false);
	/*
	 * A NEW PLACE TAKES THE OLD PIN OFF until it is found, so while its form is
	 * open a pin is held where it last was, and the form is not closed under the
	 * person typing in it.
	 */
	let last = $state<Pin>();
	const open = $derived(
		pins.find((p) => p.id === openId) ??
			(editing && last?.id === openId ? last : undefined),
	);

	/* Under 40rem, a phone's width, the popup is a sheet from the foot instead. */
	let sheet = $state(false);

	$effect(() => {
		const query = matchMedia('(width < 40rem)');
		const change = () => (sheet = query.matches);
		change();
		query.addEventListener('change', change);
		return () => query.removeEventListener('change', change);
	});

	/* Where the card stands, beside its dot: see `place`. */
	let spot = $state<{
		left: number;
		top: number;
		tip: number;
		side: 'above' | 'below';
		room: number;
	} | null>(null);

	function close() {
		openId = null;
		editing = false;
	}

	function show(id: string) {
		openId = id;
		editing = false;
	}

	/* Leaflet reaches for `window` as it loads, so it is loaded here and not on the server. */
	$effect(() => {
		if (!container) return;
		let gone = false;
		void import('leaflet').then((leaflet) => {
			if (gone || !container) return;
			map = leaflet.map(container, {
				// A wheel over the map scrolls the page. The buttons zoom.
				scrollWheelZoom: false,
				// One finger scrolls the page on a phone; two pinch the map.
				dragging: !leaflet.Browser.mobile,
				zoomControl: false,
			});
			leaflet.control.zoom({ zoomInText: PLUS, zoomOutText: MINUS }).addTo(map);
			leaflet
				.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
					maxZoom: 19,
					attribution:
						'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
				})
				.addTo(map);
			map.attributionControl.setPrefix(false);
			layer = leaflet.layerGroup().addTo(map);
			// The card follows its dot as the map pans and zooms under it.
			map.on('move zoom', place);
			// A click on the map puts the card away, but not one on a base's name,
			// which reaches the map as well as the dot it opened.
			map.on('click', (event) => {
				const target = event.originalEvent.target as Element | null;
				if (!target?.closest('.leaflet-tooltip')) close();
			});
			L = leaflet;
		});

		/* The card grows and shrinks with the window, and Leaflet only measures once. */
		const resize = new ResizeObserver(() => map?.invalidateSize());
		resize.observe(container);

		return () => {
			gone = true;
			resize.disconnect();
			map?.remove();
			map = layer = undefined;
			drawn.clear();
		};
	});

	/*
	 * AND AS THE PAGE MOVES UNDER IT, and as what is in it changes size: the
	 * form opening, a list of matches. A frame later for the size, because
	 * placing the card can change it, and would call this again.
	 */
	$effect(() => {
		if (!popEl) return;
		const grow = new ResizeObserver(() => requestAnimationFrame(place));
		grow.observe(popEl);
		addEventListener('scroll', place, { capture: true, passive: true });
		addEventListener('resize', place);
		return () => {
			grow.disconnect();
			removeEventListener('scroll', place, { capture: true });
			removeEventListener('resize', place);
		};
	});

	/* Escape puts the popup away first, before the board hears it and leaves full view. */
	$effect(() => {
		const onKey = (event: KeyboardEvent) => {
			if (event.key !== 'Escape' || !openId) return;
			event.stopImmediatePropagation();
			close();
		};
		addEventListener('keydown', onKey, true);
		return () => removeEventListener('keydown', onKey, true);
	});

	/*
	 * PLACE THE CARD BY ITS DOT: above it when it fits, below when only that
	 * fits, else on whichever side has more room with the words scrolling. Kept
	 * inside the window, and below the bar. A dot panned or scrolled out of sight
	 * takes its card with it, unless the form is open in it.
	 */
	const MARGIN = 8;
	// A base's dot is 9px across its middle, and the pointer 6px more.
	const REACH = 15;

	function place() {
		if (!popEl || !open || !map || !container) return;
		if (sheet) {
			spot = null;
			return;
		}

		const box = container.getBoundingClientRect();
		const point = map.latLngToContainerPoint([open.at.lat, open.at.lon]);
		const x = box.left + point.x;
		const y = box.top + point.y;
		const bar = document.querySelector('header')?.getBoundingClientRect();
		const ceiling = (bar?.bottom ?? 0) + MARGIN;
		const floor = innerHeight - MARGIN;

		const seen =
			point.x >= 0 &&
			point.x <= box.width &&
			point.y >= 0 &&
			point.y <= box.height &&
			y >= ceiling &&
			y <= floor;
		if (!seen && !editing) return close();

		const body = popEl.querySelector<HTMLElement>('.pop-body');
		const height = body?.scrollHeight ?? popEl.offsetHeight;
		const width = popEl.offsetWidth;
		const above = y - REACH - ceiling;
		const below = floor - y - REACH;
		const side = height <= above || above >= below ? 'above' : 'below';
		const room = side === 'above' ? above : below;
		const left = Math.max(
			MARGIN,
			Math.min(x - width / 2, innerWidth - MARGIN - width),
		);

		spot = {
			left,
			top: side === 'above' ? y - REACH - Math.min(height, room) : y + REACH,
			tip: Math.max(16, Math.min(x - left, width - 16)),
			side,
			room,
		};
	}

	/*
	 * SHOWN WHEN A PIN IS OPEN, and placed once Svelte has drawn what is in it;
	 * an effect runs after the drawing, so the card is measured with its own
	 * words and not the last pin's.
	 */
	$effect(() => {
		if (!popEl) return;
		const shown = popEl.matches(':popover-open');
		if (open && !shown) popEl.showPopover();
		if (!open && shown) {
			popEl.hidePopover();
			spot = null;
		}
		void editing;
		void sheet;
		if (open) place();
	});

	/* In full view there is no page left to scroll, so one finger moves the map. */
	$effect(() => {
		if (!L || !map) return;
		if (full || !L.Browser.mobile) map.dragging.enable();
		else map.dragging.disable();
	});

	/* A thing deleted, or its place cleared, takes its popup with it. */
	$effect(() => {
		if (open) last = open;
		if (openId && !open) close();
	});

	/*
	 * KEPT BY ID AND CHANGED IN PLACE, not rebuilt, so a label does not flicker
	 * and a popup stays open while a friend's change comes in.
	 */
	const drawn = new Map<string, { marker: CircleMarker; key: string }>();

	$effect(() => {
		if (!L || !map || !layer) return;
		const seen = new Set<string>();

		for (const pin of pins) {
			seen.add(pin.id);
			const key = `${pin.at.lat},${pin.at.lon},${pin.base},${pin.title}`;
			const old = drawn.get(pin.id);
			if (old?.key === key) continue;
			if (old) remove(old.marker);

			const marker = L.circleMarker([pin.at.lat, pin.at.lon], {
				radius: pin.base ? 9 : 6,
				className: pin.base ? 'pin base' : 'pin',
				// Not on to the map, whose own click puts the popup away.
				bubblingMouseEvents: false,
			});
			marker.on('click', () => show(pin.id));
			if (pin.base) {
				// Interactive, so a press on the name opens the base as its dot does.
				marker.bindTooltip(pin.title, {
					permanent: true,
					interactive: true,
					direction: 'top',
					offset: [0, -8],
				});
			}
			// Which pin a dot is, for the tests to press the right one. On `add`,
			// because Leaflet draws nothing until the map has a view.
			marker.on('add', () =>
				marker.getElement()?.setAttribute('data-pin', pin.id),
			);
			marker.addTo(layer);
			// Bases on top of anything at the same spot.
			if (pin.base) marker.bringToFront();
			drawn.set(pin.id, { marker, key });
		}

		for (const [id, { marker }] of drawn) {
			if (seen.has(id)) continue;
			remove(marker);
			drawn.delete(id);
		}

		// Framed once, so a friend's change does not yank the view from under you.
		if (!fitted && pins.length) {
			fitted = true;
			fit();
		}
	});

	/* The tooltip first: a permanent one can outlive its marker otherwise. */
	function remove(marker: CircleMarker) {
		marker.unbindTooltip();
		layer?.removeLayer(marker);
	}

	/** Frame every pin. */
	export function fit() {
		if (!L || !map || !pins.length) return;
		const bounds = L.latLngBounds(pins.map((p) => [p.at.lat, p.at.lon]));
		map.fitBounds(bounds, { padding: [32, 32], maxZoom: 14 });
	}
</script>

<div class="map" bind:this={container}></div>

<div
	class="pop"
	class:editing
	class:sheet
	popover="manual"
	aria-label={open?.title}
	data-side={spot?.side}
	style:left={spot ? `${spot.left}px` : undefined}
	style:top={spot ? `${spot.top}px` : undefined}
	style:max-block-size={spot ? `${spot.room}px` : undefined}
	style:--tip-x={spot ? `${spot.tip}px` : undefined}
	bind:this={popEl}
>
	{#if open}
		<div class="pop-body">
			<strong>{open.title}</strong>
			{#if editing && editor}
				{@render editor(open.id, () => (editing = false))}
			{:else}
				{#each open.lines as line, i (i)}
					<p>{line}</p>
				{/each}
			{/if}
		</div>
		<div class="pop-band">
			<button type="button" class="control" aria-label="Close" onclick={close}>
				<X />
			</button>
			{#if open.editable && editor}
				<button
					type="button"
					class="control"
					aria-label="Edit {open.title}"
					aria-expanded={editing}
					data-open={editing || undefined}
					onclick={() => (editing = !editing)}
				>
					<Pencil />
				</button>
			{/if}
		</div>
	{/if}
</div>

<style>
	/* The board says how tall; 20rem reads a coastline and scrolls past on a phone. */
	.map {
		block-size: var(--map-size, 20rem);
		border-radius: var(--radius-s);
		box-shadow: inset 0 0 0 1px var(--edge);
		overflow: hidden;
		/* Below the bar and the drawers, which Leaflet's own z-indexes are not. */
		isolation: isolate;
		z-index: 0;
	}

	/*
	 * THE ZOOM BUTTONS ARE THE SITE'S CONTROLS, on a framed island of the page's
	 * colour: the size, hover and focus ring of `.control` in src/app.css.
	 */
	.map :global(.leaflet-bar) {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		padding: var(--space-2);
		border: none;
		border-radius: var(--radius-s);
		background-color: var(--bg);
		box-shadow: inset 0 0 0 1px var(--edge);
	}

	.map :global(.leaflet-bar a) {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		inline-size: var(--control-block-size);
		block-size: var(--control-block-size);
		border: none;
		border-radius: var(--radius-s);
		background: none;
		color: var(--fg);
		line-height: 1;
	}

	.map :global(.leaflet-bar a:hover) {
		background-color: var(--surface-hover);
	}

	.map :global(.leaflet-bar a:focus-visible) {
		outline: 2px solid var(--fg);
		outline-offset: 2px;
	}

	/* At the nearest or farthest zoom there is nowhere further to go. */
	.map :global(.leaflet-bar a.leaflet-disabled) {
		background: none;
		color: color-mix(in oklab, var(--fg) 30%, transparent);
	}

	.map :global(.leaflet-bar svg) {
		inline-size: 1.125rem;
		block-size: 1.125rem;
	}

	.map :global(.pin) {
		fill: var(--fg);
		fill-opacity: 1;
		stroke: var(--bg);
		stroke-width: 2;
	}

	.map :global(.pin.base) {
		fill: var(--accent);
		stroke: var(--accent-fg);
	}

	/*
	 * THE POPUP IS A CARD IN THE TOP LAYER, a popover, so it can reach past the
	 * map's edges where Leaflet's own, drawn inside the map, would be cut off.
	 * The browser's popover look is taken off and the page's put on.
	 */
	.pop {
		position: fixed;
		inset: auto;
		margin: 0;
		padding: 0;
		border: none;
		overflow: visible;
		display: flex;
		inline-size: max-content;
		max-inline-size: min(24rem, 100vw - var(--space-16) * 2);
		border-radius: var(--radius-l);
		background-color: var(--bg);
		color: var(--fg);
		box-shadow:
			inset 0 0 0 1px var(--edge),
			0 var(--space-4) var(--space-16) rgb(0 0 0 / 12%);
		font-size: var(--text-label1);
		line-height: var(--leading-tight);
	}

	/* Not shown until it has been placed, so it never flashes at the corner. */
	.pop:not(.sheet):not([data-side]) {
		visibility: hidden;
	}

	/* 24rem is the edit form's width and the band beside it. */
	.pop.editing {
		inline-size: min(24rem, 100vw - var(--space-16) * 2);
	}

	/*
	 * THE POINTER TO ITS DOT: a turned square with two of its edges framed, half
	 * under the card, at the dot's distance along it.
	 */
	.pop:not(.sheet)::after {
		content: '';
		position: absolute;
		inset-inline-start: calc(var(--tip-x, 50%) - 6px);
		inline-size: 12px;
		block-size: 12px;
		background-color: var(--bg);
		rotate: 45deg;
	}

	.pop[data-side='above']::after {
		inset-block-start: calc(100% - 6px);
		box-shadow: inset -1px -1px 0 var(--edge);
	}

	.pop[data-side='below']::after {
		inset-block-end: calc(100% - 6px);
		box-shadow: inset 1px 1px 0 var(--edge);
	}

	/*
	 * ON A PHONE, A SHEET from the foot of the screen, a panel gap in from its
	 * edges as the drawers stand, and clear of the button there.
	 */
	.pop.sheet {
		inset: auto var(--gap-panel)
			calc(var(--gap-panel) + var(--fab-reserve, 0px));
		inline-size: auto;
		max-inline-size: none;
		max-block-size: 70dvh;
		transition:
			translate var(--motion-morph) ease-out,
			display var(--motion-morph) allow-discrete,
			overlay var(--motion-morph) allow-discrete;
	}

	@starting-style {
		.pop.sheet:popover-open {
			translate: 0 100%;
		}
	}

	.pop-body {
		flex: 1;
		min-inline-size: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		padding: var(--space-12);
		/* The card has a height limit; the words scroll within it, not the band. */
		overflow-y: auto;
	}

	.pop-body strong {
		font-size: var(--text-body1);
		font-weight: 600;
	}

	/* The popup's buttons, in a band of their own down its end edge. */
	.pop-band {
		flex: none;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		padding: var(--space-4);
		border-start-end-radius: var(--radius-l);
		border-end-end-radius: var(--radius-l);
		background-color: var(--shell);
		box-shadow:
			inset 1px 0 0 var(--edge),
			inset -1px 0 0 var(--edge),
			inset 0 1px 0 var(--edge),
			inset 0 -1px 0 var(--edge);
	}

	.pop-band :global(svg) {
		inline-size: 1rem;
		block-size: 1rem;
	}

	.pop p {
		margin: 0;
		color: color-mix(in oklab, var(--fg) 60%, transparent);
	}

	/* The form's own step between fields, from the title down to the first. */
	.pop.editing .pop-body {
		gap: var(--space-12);
	}

	/* The board's form is a card of its own under a row; in a popup, already a
	 * card, it sheds the frame. */
	.pop :global(.editor) {
		margin: 0;
		padding: 0;
		background: none;
		box-shadow: none;
		outline: none;
	}

	.map :global(.leaflet-tooltip) {
		padding: var(--space-2) var(--space-6);
		border: none;
		border-radius: var(--radius-s);
		background-color: var(--bg);
		color: var(--fg);
		box-shadow: inset 0 0 0 1px var(--edge);
		font: inherit;
		font-size: var(--text-label1);
		font-weight: 600;
	}

	/* No arrow: the label stands just above its dot, and says whose it is. */
	.map :global(.leaflet-tooltip-top::before) {
		display: none;
	}

	/* THE CREDIT OPENSTREETMAP ASKS FOR, kept legible, in the page's colours. */
	.map :global(.leaflet-control-attribution) {
		padding: var(--space-2) var(--space-6);
		border-start-start-radius: var(--radius-s);
		background-color: color-mix(in oklab, var(--bg) 85%, transparent);
		color: color-mix(in oklab, var(--fg) 70%, transparent);
		font: inherit;
		font-size: var(--text-label2);
	}

	.map :global(.leaflet-control-attribution a) {
		color: inherit;
		text-decoration: underline;
		text-underline-offset: 0.2em;
	}

	/* The tiles are drawn for daylight; in dark they are turned over, hues kept. */
	@media (prefers-color-scheme: dark) {
		:global(:root:not([data-mode='light'])) .map :global(.leaflet-tile-pane) {
			filter: invert(1) hue-rotate(180deg) brightness(0.9);
		}
	}

	:global(:root[data-mode='dark']) .map :global(.leaflet-tile-pane) {
		filter: invert(1) hue-rotate(180deg) brightness(0.9);
	}
</style>
