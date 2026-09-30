<script lang="ts" module>
	import type { Coords } from '$lib/trip';

	export interface Pin {
		id: string;
		title: string;
		at: Coords;
		base: boolean;
		/* Lines under the title in its popup: the day, then the distances. */
		lines: string[];
	}
</script>

<script lang="ts">
	import 'leaflet/dist/leaflet.css';
	import type { CircleMarker, LayerGroup, Map as LeafletMap } from 'leaflet';

	let { pins, full = false }: { pins: Pin[]; full?: boolean } = $props();

	let container = $state<HTMLDivElement>();
	let L = $state<typeof import('leaflet')>();
	let map: LeafletMap | undefined;
	let layer: LayerGroup | undefined;
	let fitted = false;

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
			});
			leaflet
				.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
					maxZoom: 19,
					attribution:
						'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
				})
				.addTo(map);
			map.attributionControl.setPrefix(false);
			layer = leaflet.layerGroup().addTo(map);
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

	/* In full view there is no page left to scroll, so one finger moves the map. */
	$effect(() => {
		if (!L || !map) return;
		if (full || !L.Browser.mobile) map.dragging.enable();
		else map.dragging.disable();
	});

	/* Titles are anybody's typing, so they go in as text and never as HTML. */
	function popup(pin: Pin) {
		const box = document.createElement('div');
		const title = box.appendChild(document.createElement('strong'));
		title.textContent = pin.title;
		for (const line of pin.lines) {
			box.appendChild(document.createElement('div')).textContent = line;
		}
		return box;
	}

	/*
	 * KEPT BY ID AND CHANGED IN PLACE, not rebuilt, so a popup somebody is
	 * reading stays open while a friend's change comes in.
	 */
	const drawn = new Map<string, { marker: CircleMarker; key: string }>();

	$effect(() => {
		if (!L || !map || !layer) return;
		const seen = new Set<string>();

		for (const pin of pins) {
			seen.add(pin.id);
			const key = `${pin.at.lat},${pin.at.lon},${pin.base},${pin.title}`;
			const old = drawn.get(pin.id);
			if (old?.key === key) {
				old.marker.setPopupContent(popup(pin));
				continue;
			}
			if (old) remove(old.marker);

			const marker = L.circleMarker([pin.at.lat, pin.at.lon], {
				radius: pin.base ? 9 : 6,
				className: pin.base ? 'pin base' : 'pin',
			}).bindPopup(popup(pin));
			if (pin.base) {
				marker.bindTooltip(pin.title, {
					permanent: true,
					direction: 'top',
					offset: [0, -8],
				});
			}
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

	.map :global(.leaflet-popup-content-wrapper),
	.map :global(.leaflet-popup-tip),
	.map :global(.leaflet-tooltip) {
		background: var(--bg);
		color: var(--fg);
		border-color: var(--edge);
		font: inherit;
		font-size: var(--text-label1);
	}

	.map :global(.leaflet-tooltip-top::before) {
		border-top-color: var(--bg);
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
