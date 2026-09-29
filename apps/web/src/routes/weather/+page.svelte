<script lang="ts">
	import { onMount, tick, type Component } from 'svelte';
	import { blur } from 'svelte/transition';
	// One deep import per icon, as everywhere else.
	import Cloud from '@lucide/svelte/icons/cloud';
	import CloudFog from '@lucide/svelte/icons/cloud-fog';
	import CloudLightning from '@lucide/svelte/icons/cloud-lightning';
	import CloudMoon from '@lucide/svelte/icons/cloud-moon';
	import CloudRain from '@lucide/svelte/icons/cloud-rain';
	import CloudSnow from '@lucide/svelte/icons/cloud-snow';
	import CloudSun from '@lucide/svelte/icons/cloud-sun';
	import Moon from '@lucide/svelte/icons/moon';
	import Plus from '@lucide/svelte/icons/plus';
	import Sun from '@lucide/svelte/icons/sun';
	import Wind from '@lucide/svelte/icons/wind';
	import X from '@lucide/svelte/icons/x';
	import Letter from '$lib/components/Letter.svelte';
	import Morph from '$lib/components/Morph.svelte';
	import SearchField from '$lib/components/SearchField.svelte';
	import Seo from '$lib/components/Seo.svelte';
	import { morphDuration, morphIn, morphOut } from '$lib/motion';
	import {
		add,
		close,
		current,
		hourOf,
		kindOf,
		load,
		restore,
		setUnit,
		show,
		weather,
		type Place,
	} from '$lib/weather.svelte';

	/*
	 * THE PAGE IS PRERENDERED, and at build time nobody's cities are known. Until
	 * the browser has read them back, the page names no city at all rather than
	 * naming the default and then swapping it for the one this visitor kept.
	 */
	let ready = $state(false);

	onMount(() => {
		restore();
		ready = true;

		/*
		 * BACK TO A TAB LEFT OPEN, the reading is asked for again. The route keeps
		 * each place's reading until the station's next one is due, so this costs
		 * the National Weather Service nothing when nothing has changed.
		 */
		const onVisible = () => {
			if (document.visibilityState === 'visible') load(current());
		};
		document.addEventListener('visibilitychange', onVisible);
		return () => document.removeEventListener('visibilitychange', onVisible);
	});

	const place = $derived(current());
	const now = $derived(weather.readings[place.id]);
	const status = $derived(weather.status[place.id] ?? 'loading');

	// ── The search ────────────────────────────────────────────────────────────

	let query = $state('');
	let results = $state<Place[]>([]);
	let searching = $state<'idle' | 'busy' | 'done' | 'error'>('idle');

	/*
	 * A QUARTER OF A SECOND AFTER THE LAST KEY, and a search still in flight is
	 * called off when the next one starts. Without the second half, a slow answer
	 * to "Spr" could land after a fast one to "Springfield" and put the wrong
	 * list under the right words.
	 */
	$effect(() => {
		const q = query.trim();
		if (q.length < 2) {
			results = [];
			searching = 'idle';
			return;
		}

		searching = 'busy';
		const abort = new AbortController();
		const timer = setTimeout(async () => {
			try {
				const response = await fetch(`/api/places?q=${encodeURIComponent(q)}`, {
					signal: abort.signal,
				});
				if (!response.ok) throw new Error(String(response.status));
				results = ((await response.json()) as { places: Place[] }).places;
				searching = 'done';
			} catch {
				if (!abort.signal.aborted) searching = 'error';
			}
		}, 250);

		return () => {
			clearTimeout(timer);
			abort.abort();
		};
	});

	/*
	 * THE SEARCH IS A PLUS until it is wanted, standing at the end of the row of
	 * cities. Pressed, it opens into the field in its place and puts the caret
	 * in it; a city picked, or Escape on an empty field, or leaving it empty,
	 * folds it back.
	 */
	let adding = $state(false);

	/*
	 * THE ROOM THE FIELD TAKES, held apart from `adding` because it has to
	 * outlast it. Closing starts the field's morph out, and the field needs its
	 * width until that has finished — the plus morphs in at the far end of the
	 * same room meanwhile — so the room is given back only when the field has
	 * gone. Opening takes it at once, for the field to morph in to.
	 */
	let roomy = $state(false);

	async function openSearch() {
		adding = true;
		roomy = true;
		await tick();
		// SearchField gives its input this id, and there is one on the page.
		document.getElementById('search-field')?.focus();
	}

	function closeSearch() {
		query = '';
		adding = false;
	}

	/*
	 * Escape empties a field that has words in it — SearchField does that, and
	 * says so by preventing the default. Only on an empty one does it close.
	 */
	function onkeydown(event: KeyboardEvent) {
		if (event.key === 'Escape' && !event.defaultPrevented) closeSearch();
	}

	/*
	 * FOCUS LEAVING an empty search closes it. Leaving for one of the cities it
	 * found does not: those are part of the search, and closing on the way to
	 * one would take it away before the click could land.
	 */
	function onfocusout(event: FocusEvent) {
		const to = event.relatedTarget as Element | null;
		if (to?.closest('.search, .results')) return;
		if (!query.trim()) closeSearch();
	}

	// What the line under the search says, or '' for nothing.
	const found = $derived(
		adding && searching === 'done' && !results.length
			? `I found no US city called “${query.trim()}”.`
			: adding && searching === 'error'
				? 'The search is not answering right now. Try again in a minute.'
				: '',
	);

	function pick(p: Place) {
		add(p);
		closeSearch();
	}

	/*
	 * THE CITY BEING READ STAYS IN VIEW. The row scrolls sideways once it holds
	 * more than fits, and a city just added lands at its far end — so whichever
	 * is current is brought into the row, and only as far as it needs to be.
	 */
	let citiesEl: HTMLElement | undefined = $state();

	$effect(() => {
		// Named so the effect runs again when either changes.
		void weather.active;
		void weather.places.length;
		if (!ready || !citiesEl) return;

		tick().then(() => {
			const pill = citiesEl?.querySelector<HTMLElement>('.city.active');
			const row = citiesEl;
			if (!pill || !row) return;
			/*
			 * `scrollTo` on the row and not `scrollIntoView` on the pill. The
			 * second scrolls every box above it too, the page included, and a
			 * city picked must not move the page.
			 */
			// Where the pill sits in the row's own scrolled content, measured on
			// screen, so no offset parent between the two can put it elsewhere —
			// and widened by the row's padding, which is its focus ring's room.
			const pad =
				Number.parseFloat(getComputedStyle(row).paddingInlineEnd) || 0;
			const box = pill.getBoundingClientRect();
			const start =
				box.left - row.getBoundingClientRect().left + row.scrollLeft - pad;
			const end = start + box.width + pad * 2;
			const left =
				start < row.scrollLeft
					? start
					: end > row.scrollLeft + row.clientWidth
						? end - row.clientWidth
						: null;
			if (left !== null) {
				row.scrollTo({
					left,
					behavior: morphDuration() ? 'smooth' : 'auto',
				});
			}
		});
	});

	// Enter takes the first city offered, which is the biggest by that name.
	function onsubmit(event: SubmitEvent) {
		event.preventDefault();
		if (results[0]) pick(results[0]);
	}

	// ── The reading ───────────────────────────────────────────────────────────

	function markOf(text: string, night: boolean): Component {
		switch (kindOf(text)) {
			case 'storm':
				return CloudLightning;
			case 'snow':
				return CloudSnow;
			case 'rain':
				return CloudRain;
			case 'fog':
				return CloudFog;
			case 'wind':
				return Wind;
			case 'clear':
				return night ? Moon : Sun;
			case 'partly':
				return night ? CloudMoon : CloudSun;
			default:
				return Cloud;
		}
	}

	// The forecasts come in Fahrenheit only, so a Celsius reader's are turned here.
	const inUnit = (f: number) => (weather.unit === 'F' ? f : ((f - 32) * 5) / 9);
	const degrees = (f: number | null) =>
		f === null ? '—' : `${Math.round(inUnit(f))}°`;

	const temp = $derived(weather.unit === 'F' ? now?.tempF : now?.tempC);
	const feels = $derived(weather.unit === 'F' ? now?.feelsF : now?.feelsC);
	// A feels-like within a degree of the temperature says nothing new.
	const feelsDiffers = $derived(
		typeof temp === 'number' &&
			typeof feels === 'number' &&
			Math.abs(feels - temp) >= 1,
	);

	// NWS gives where the wind comes FROM, which is how a wind is named.
	const compass = (deg: number) =>
		[
			'north',
			'northeast',
			'east',
			'southeast',
			'south',
			'southwest',
			'west',
			'northwest',
		][Math.round(deg / 45) % 8];

	/*
	 * HOW LONG AGO, and not a clock time. The station's timestamp is in UTC and
	 * the reader may be anywhere; "25 minutes ago" is true in every time zone
	 * without asking which one is meant.
	 */
	function ago(iso: string) {
		const minutes = Math.round((Date.now() - Date.parse(iso)) / 60000);
		if (!Number.isFinite(minutes)) return '';
		if (minutes < 1) return 'just now';
		if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
		const hours = Math.round(minutes / 60);
		return `${hours} hour${hours === 1 ? '' : 's'} ago`;
	}

	/*
	 * WHAT IT MEANS FOR GOING OUT, in a sentence. Read from the feels-like where
	 * there is one, because that is the temperature a person meets at the door.
	 */
	const verdict = $derived.by(() => {
		if (!now) return '';
		const f = now.feelsF ?? now.tempF;
		if (f === null) return '';
		const kind = kindOf(now.conditions);
		const windy = (now.windMph ?? 0) >= 20;
		const pop = now.hours[0]?.pop ?? 0;

		if (kind === 'storm') return 'Storming. Not the hour for a walk.';
		if (kind === 'snow')
			return f <= 20
				? 'Snow on real cold. Bundle up.'
				: 'Snowing. Boots and layers.';
		if (kind === 'rain') return 'Raining. Take a coat with a hood.';
		if (f >= 103) return 'Dangerous heat. Stay somewhere cool.';
		if (f >= 92) return 'Hot out. Keep to the shade and drink water.';
		if (f >= 84) return 'Warm, and on the sticky side.';
		if (pop >= 55) return 'Dry for now, but rain is on the way.';
		if (f >= 62) return windy ? 'Nice out, if blustery.' : 'Lovely out.';
		if (f >= 48)
			return windy
				? 'A brisk wind. Wear layers.'
				: 'Cool. Light-jacket weather.';
		if (f >= 33) return 'Cold. Coat weather.';
		if (f >= 16) return 'Freezing. Bundle up.';
		return 'Bitter cold. Keep it brief.';
	});

	/*
	 * THE DAYS AFTER TODAY. Today is the hours' business, and "today" is the
	 * place's date — read off its first forecast hour, which carries its offset —
	 * and not the reader's.
	 */
	const days = $derived.by(() => {
		if (!now) return [];
		const today = now.hours[0]?.t.slice(0, 10) ?? '';
		return now.days.filter(
			(d) => d.t > today && (d.hiF !== null || d.loF !== null),
		);
	});

	// Noon, so no time zone can push the date onto the day either side of it.
	const dayName = (t: string, i: number) =>
		i === 0
			? 'Tomorrow'
			: new Date(`${t}T12:00:00`).toLocaleDateString('en-US', {
					weekday: 'long',
				});

	/*
	 * THE WEEK'S SPREAD, which every day's bar is drawn against. A bar sits where
	 * its low and high fall between the coldest and warmest of the whole week, so
	 * the eye can run down the column and see the warm spell arrive.
	 */
	const week = $derived.by(() => {
		const temps = days.flatMap((d) => [d.hiF, d.loF]).filter((n) => n !== null);
		if (temps.length < 2) return null;
		const min = Math.min(...temps);
		return { min, span: Math.max(Math.max(...temps) - min, 1) };
	});

	/*
	 * A TEMPERATURE AS A COLOUR: blue at freezing, a yellow-green at 70°F, an
	 * ember at 100°F. In OKLCH at one lightness, so every step of the scale is as
	 * bright as every other and none of them vanishes against either mode.
	 */
	function hue(f: number) {
		if (f <= 32) return 250;
		if (f <= 70) return 250 - ((f - 32) / 38) * 140;
		return 110 - (Math.min(f - 70, 30) / 30) * 80;
	}
	const warmth = (f: number) => `oklch(0.75 0.14 ${hue(f)})`;
</script>

<Seo
	title="Weather"
	description="The weather over any US city, from the National Weather Service."
	path="/weather"
	icon="/favicon-weather.svg"
/>

<Letter
	title="Weather"
	tagline="From the National Weather Service."
	serif={['National Weather Service']}
>
	<!--
		THE CITIES, side by side, with the way to add one at the end of them.

		A list of buttons and not a tablist: a tablist promises arrow keys between
		its tabs and a panel for each, and what is here is simpler than that — a
		row of places, one of them being read.

		The list scrolls SIDEWAYS once it holds more than the row, as the hours do,
		and the plus stands outside it, so however many cities there are, adding
		another is never scrolled out of reach.

		Held at one control's height before the browser has said which cities
		they are, so nothing below moves when they arrive.
	-->
	<div class="places">
		<ul class="cities" aria-label="Your cities" bind:this={citiesEl}>
			{#if ready}
				{#each weather.places as p, i (p.id)}
					<li class="city" class:active={i === weather.active}>
						<button
							type="button"
							class="city-name"
							aria-current={i === weather.active ? 'true' : undefined}
							onclick={() => show(i)}
						>
							{p.name}
						</button>
						{#if weather.places.length > 1}
							<button
								type="button"
								class="control city-close"
								aria-label="Close {p.name}"
								title="Close {p.name}"
								onclick={() => close(i)}
							>
								<X />
							</button>
						{/if}
					</li>
				{/each}
			{/if}
		</ul>

		<!--
			THE PLUS AND THE FIELD, MORPHING ONE INTO THE OTHER in one cell at the
			row's end, as Morph's words do: the one leaving blurs out, the one
			arriving blurs in half a beat behind. The cell's width follows `roomy`,
			and eases as it changes, so the cities give the field its room and
			take it back rather than jumping.
		-->
		<div class="add-cell" class:roomy>
			{#if adding}
				<!--
				A <form>, so Enter takes the first city offered without this page
				having to listen for the key. `role="search"` names the region for
				anyone moving through the page by landmark.

				The key handler is the field's, heard as it bubbles: the form is not
				made interactive by it, it only learns of an Escape the input inside
				did not use. The rule cannot see that the input is what is focused.
			-->
				<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
				<form
					class="search"
					role="search"
					{onsubmit}
					{onkeydown}
					{onfocusout}
					in:blur={morphIn()}
					out:blur={morphOut()}
					onoutroend={() => {
						if (!adding) roomy = false;
					}}
				>
					<SearchField
						bind:value={query}
						label="Add a US city"
						placeholder="Add a US city"
					/>
				</form>
			{:else}
				<button
					type="button"
					class="control add"
					aria-label="Add a city"
					title="Add a city"
					onclick={openSearch}
					in:blur={morphIn()}
					out:blur={morphOut()}
				>
					<Plus />
				</button>
			{/if}
		</div>
	</div>

	{#if adding && results.length}
		<!--
			The list morphs in and out as a whole, and a city new to it as the
			words change morphs in on its own. Only in: a city leaving goes at
			once, or the list would stand the old and the new together, twice as
			long, for the length of the morph.
		-->
		<ul
			class="results"
			aria-label="Cities found"
			{onfocusout}
			in:blur={morphIn()}
			out:blur={morphOut()}
		>
			{#each results as p (p.id)}
				<li in:blur={morphIn()}>
					<button type="button" onclick={() => pick(p)}>
						{p.name}{#if p.state}<span class="dim">, {p.state}</span>{/if}
					</button>
				</li>
			{/each}
		</ul>
	{/if}

	<!--
		ALWAYS ON THE PAGE, as Emoji Viewer's line is, so what it says can be
		announced when it changes. It holds a line's room while the search is
		open, so its words can morph in and out of nothing without the page
		moving under them, and takes none while it is shut.
	-->
	<p class="found dim" role="status" class:open={adding}>
		<Morph key={found}>{found}</Morph>
	</p>

	<!--
		KEYED ON THE PLACE, so showing another city is a new block that arrives,
		rather than the old numbers ticking over into new ones in place.
	-->
	{#key place.id}
		<div
			class="reading"
			in:blur={{ duration: morphDuration(), amount: '0.25rem' }}
		>
			{#if !ready || (status === 'loading' && !now)}
				<p class="dim">
					{ready ? `Reading the sky over ${place.name}.` : 'Reading the sky.'}
				</p>
			{:else if status === 'error' && !now}
				<p>
					The National Weather Service is not answering right now. It is a free
					public service, and this happens now and then.
				</p>
				<p>
					<button type="button" class="retry" onclick={() => load(place)}>
						Try again.
					</button>
				</p>
			{:else if now}
				{@const Mark = markOf(now.conditions, now.night)}

				<section class="now" aria-label="Now">
					<span class="mark" aria-hidden="true"><Mark /></span>

					<div class="now-words">
						<!--
							EVERY TEMPERATURE MORPHS when the unit changes, the switch's
							ground sliding across on the same beat, so the numbers read as
							the same readings said another way rather than new ones.
						-->
						<p class="temp">
							<Morph key={weather.unit}
								>{typeof temp === 'number' ? Math.round(temp) : '—'}<span
									class="unit">°{weather.unit}</span
								></Morph
							>
						</p>
						<p class="conditions">
							{now.conditions || 'No conditions reported.'}
						</p>
						{#if feelsDiffers}
							<p class="dim">
								Feels like <Morph key={weather.unit}
									>{Math.round(feels as number)}°{weather.unit}</Morph
								>.
							</p>
						{/if}
					</div>

					<!--
						TWO BUTTONS AND ONE OF THEM PRESSED, which is what a choice of
						two looks like to a screen reader as much as to the eye.

						THE ISLAND THE BAR'S VIEW KEYS STAND ON, to the same recipe: a
						rail, and one ground of the accent that slides under the pressed
						key. See `.views` in src/routes/+layout.svelte for why each part
						is drawn the way it is; this copies it rather than sharing it,
						because a component's styles are its own.
					-->
					<div
						class="units"
						role="group"
						aria-label="Temperature unit"
						style="--slot: {weather.unit === 'F' ? 0 : 1}"
					>
						<span class="thumb" aria-hidden="true"></span>
						<button
							type="button"
							aria-pressed={weather.unit === 'F'}
							aria-label="Fahrenheit"
							onclick={() => setUnit('F')}>°F</button
						>
						<button
							type="button"
							aria-pressed={weather.unit === 'C'}
							aria-label="Celsius"
							onclick={() => setUnit('C')}>°C</button
						>
					</div>
				</section>

				{#if verdict}
					<p class="verdict">{verdict}</p>
				{/if}

				<!--
					A figure left out is left out, and not shown as a dash. Plenty of
					stations measure no humidity, and a row saying so tells nobody
					anything.
				-->
				<dl class="stats">
					{#if now.humidity !== null}
						<div>
							<dt>Humidity</dt>
							<dd>{Math.round(now.humidity)}%</dd>
						</div>
					{/if}
					{#if now.windMph !== null}
						<div>
							<dt>Wind</dt>
							<dd>
								{#if Math.round(now.windMph) === 0}
									Calm
								{:else}
									{Math.round(now.windMph)} mph{now.windDir !== null
										? ` from the ${compass(now.windDir)}`
										: ''}
								{/if}
							</dd>
						</div>
					{/if}
					{#if now.observedAt}
						<div>
							<dt>Observed</dt>
							<dd>{ago(now.observedAt)}</dd>
						</div>
					{/if}
				</dl>

				{#if now.hours.length}
					<section class="section">
						<h2>The next hours</h2>
						<!--
							A RAIL, which scrolls sideways where the measure cannot hold
							twelve hours. The feels-like shows where it parts from the
							temperature by enough to dress for, and the chance of rain once
							it is worth an umbrella.
						-->
						<ol class="hours">
							{#each now.hours as h (h.t)}
								{@const HourMark = markOf(h.label, h.night)}
								<li class="hour">
									<span class="dim">{hourOf(h.t)}</span>
									<span class="hour-mark" title={h.label}>
										<HourMark aria-hidden="true" />
										<span class="visually-hidden">{h.label}</span>
									</span>
									<span class="hour-temp"
										><Morph key={weather.unit} align="center"
											>{degrees(h.tempF)}</Morph
										></span
									>
									{#if h.feelsF !== null && h.tempF !== null && Math.abs(h.feelsF - h.tempF) >= 3}
										<span class="small dim"
											>feels <Morph key={weather.unit}
												>{degrees(h.feelsF)}</Morph
											></span
										>
									{/if}
									{#if h.pop >= 15}
										<span class="small rain"
											>{h.pop}%<span class="visually-hidden">
												chance of rain</span
											></span
										>
									{/if}
								</li>
							{/each}
						</ol>
					</section>
				{/if}

				{#if days.length}
					<section class="section">
						<h2>The days ahead</h2>
						<!--
							ROWS AND NOT A RAIL. A week is read and not glanced at, and rows
							keep the temperatures in columns the eye can run down.
						-->
						<ol class="days">
							{#each days as d, i (d.t)}
								{@const DayMark = markOf(d.label, false)}
								<li class="day">
									<span class="day-name">{dayName(d.t, i)}</span>
									<span class="day-mark" title={d.label}>
										<DayMark aria-hidden="true" />
										<span class="visually-hidden">{d.label}</span>
									</span>
									<span class="small rain"
										>{#if d.pop >= 15}{d.pop}%<span class="visually-hidden">
												chance of rain</span
											>{/if}</span
									>
									<span class="day-lo dim"
										><span class="visually-hidden">Low </span><Morph
											key={weather.unit}
											align="end">{degrees(d.loF)}</Morph
										></span
									>
									<span class="range" aria-hidden="true">
										{#if week && d.hiF !== null && d.loF !== null}
											<span
												class="range-fill"
												style:inset-inline-start="{((d.loF - week.min) /
													week.span) *
													100}%"
												style:inline-size="{(Math.max(d.hiF - d.loF, 1) /
													week.span) *
													100}%"
												style:background-image="linear-gradient(to right, {warmth(
													d.loF,
												)}, {warmth(d.hiF)})"
											></span>
										{/if}
									</span>
									<span class="day-hi"
										><span class="visually-hidden">High </span><Morph
											key={weather.unit}
											align="end">{degrees(d.hiF)}</Morph
										></span
									>
								</li>
							{/each}
						</ol>
					</section>
				{/if}

				<p class="source dim">
					Measured at {now.station.name || now.station.id}{now.place
						? `, near ${now.place}`
						: ''}.
					<a
						href="https://forecast.weather.gov/MapClick.php?lat={place.lat}&lon={place.lon}"
						>See the full forecast at weather.gov.</a
					>
				</p>
			{/if}
		</div>
	{/key}
</Letter>

<style>
	.dim {
		/* Mixed from --fg, so it flips with the display mode by itself. */
		color: color-mix(in oklab, var(--fg) 60%, transparent);
	}

	.small {
		font-size: var(--text-label2);
	}

	/* Every list here is a row or a column of things, and none wants a bullet's
	 * indent. */
	.results,
	.cities,
	.hours,
	.days {
		list-style: none;
		padding: 0;
		margin: 0;
	}

	/* ── The search ─────────────────────────────────────────────────────────── */

	/*
	 * THE ROW: the cities take what is left, and the plus or the field keeps
	 * its own width at the end. `min-inline-size: 0` is what lets the list be
	 * narrower than its contents, and so scroll, rather than push the plus out
	 * of the row.
	 */
	.places {
		display: flex;
		align-items: center;
		gap: var(--space-4);
	}

	.add {
		flex: none;
		box-shadow: inset 0 0 0 1px var(--frame);
	}

	/*
	 * THE CELL AT THE ROW'S END: a plus's width, or the field's when it is
	 * roomy — half the row at most, leaving the cities the rest. Both stand in
	 * its one grid cell at the end, so a plus morphing in over a field going
	 * out lands where it will stay.
	 *
	 * The width eases on the morph's beat. `flex-basis` and the minimum both,
	 * because the field's floor would otherwise snap the row at the moment the
	 * basis began to move.
	 */
	.add-cell {
		display: grid;
		/*
		 * ONE COLUMN, AND ONLY AS WIDE AS THE CELL. An auto column grows to its
		 * widest item, and the field arrives at full width while the cell is
		 * still a plus wide — so the column ran past the cell's end, carried the
		 * plus with it, and the plus flew in from the right as the cell caught
		 * up. `minmax(0, 1fr)` holds the column to the cell; the field grows
		 * with it instead.
		 */
		grid-template-columns: minmax(0, 1fr);
		justify-items: end;
		align-items: center;

		flex: 0 1 var(--control-block-size);
		min-inline-size: var(--control-block-size);
		transition:
			flex-basis var(--motion-morph),
			min-inline-size var(--motion-morph);
	}

	.add-cell.roomy {
		flex-basis: 16rem;
		min-inline-size: 10rem;
	}

	.add-cell > * {
		grid-area: 1 / 1;
	}

	.search {
		inline-size: 100%;
		min-inline-size: 0;
	}

	.results {
		padding: var(--space-4);
		display: flex;
		flex-direction: column;
		border-radius: var(--radius-s);
		box-shadow: inset 0 0 0 1px var(--frame);
	}

	.results button {
		inline-size: 100%;
		min-block-size: var(--control-block-size);
		padding-inline: var(--space-8);
		text-align: start;

		appearance: none;
		border: none;
		background: none;
		color: inherit;
		font: inherit;
		cursor: pointer;
		border-radius: var(--radius-s);
	}

	.results button:hover {
		background-color: var(--surface-hover);
	}

	.results button:focus-visible {
		outline: 2px solid var(--fg);
		outline-offset: -2px;
	}

	.found {
		font-size: var(--text-label1);
	}

	.found:not(.open) {
		display: none;
	}

	.found.open {
		min-block-size: 1lh;
	}

	/* ── The cities ─────────────────────────────────────────────────────────── */

	/*
	 * THE CITIES SCROLL SIDEWAYS, with the same thin bar the hours wear.
	 *
	 * NOT SNAPPED, as the hours are. The last city ends short of the row's
	 * end by less than a city, so the row's far end is no city's start, and a
	 * snap pulled the row back off it — hiding the half of the newest city
	 * that scrolling had just brought into view.
	 *
	 * A scroller clips what is drawn outside it, and a focus ring is drawn 2px
	 * outside a pill. The padding gives the rings that room, and the negative
	 * margin takes it back, so the pills still line up with everything else —
	 * on every side but the end, where taking it back would close the gap to
	 * the plus.
	 */
	.cities {
		flex: 1;
		min-inline-size: 0;
		display: flex;
		gap: var(--space-4);
		min-block-size: var(--control-block-size);

		overflow-x: auto;
		scrollbar-width: thin;
		/* Positioned for the reason the hours are; see there. */
		position: relative;
		padding: var(--space-4);
		margin: calc(var(--space-4) * -1);
		margin-inline-end: 0;
	}

	/*
	 * A CITY IS A PILL, with its close inside it. The one being read wears the
	 * site's one colour, as an open control in the bar does, and its words go to
	 * `--accent-fg` because yellow under grey text is not legible.
	 */
	.city {
		flex: none;
		display: inline-flex;
		align-items: center;
		border-radius: var(--radius-s);
		box-shadow: inset 0 0 0 1px var(--frame);
	}

	.city.active {
		background-color: var(--accent);
		color: var(--accent-fg);
		box-shadow: none;
	}

	.city-name {
		block-size: var(--control-block-size);
		padding-inline: var(--space-12);

		appearance: none;
		border: none;
		background: none;
		color: inherit;
		font: inherit;
		cursor: pointer;
		border-radius: var(--radius-s);
	}

	/*
	 * THE WHOLE PILL ANSWERS THE POINTER, as an editor tab does in VS Code, and
	 * not its name and its close separately. Two washes side by side met in
	 * the middle and overlapped there; one wash on the pill has no seam.
	 */
	.city:not(.active):hover {
		background-color: var(--surface-hover);
	}

	/* With a close beside it, the name gives up the end of its padding to it. */
	.city-name:not(:last-child) {
		padding-inline-end: var(--space-4);
	}

	.city-name:focus-visible {
		outline: 2px solid var(--fg);
		outline-offset: 2px;
	}

	/*
	 * THE CLOSE IS A KEY INSIDE THE PILL, a step in from its edges, so its own
	 * hover is a smaller square within the pill's wash — darker where the two
	 * lie over each other — rather than a second wash beside the name's.
	 */
	.city-close {
		inline-size: calc(var(--control-block-size) - var(--space-4) * 2);
		block-size: calc(var(--control-block-size) - var(--space-4) * 2);
		margin-inline-end: var(--space-4);
	}

	.city-close :global(svg) {
		inline-size: 0.875rem;
		block-size: 0.875rem;
	}

	/* ── The reading ────────────────────────────────────────────────────────── */

	.reading {
		display: flex;
		flex-direction: column;
		gap: var(--space-16);
	}

	.now {
		display: flex;
		align-items: center;
		gap: var(--space-16);
	}

	.mark {
		display: inline-flex;
		flex: none;
	}

	/* In rem and not Lucide's `size`, so it grows with a visitor's text size. */
	.mark :global(svg) {
		inline-size: 3.5rem;
		block-size: 3.5rem;
		stroke-width: 1.5;
	}

	.now-words {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		flex: 1;
		min-inline-size: 0;
	}

	.temp {
		font-size: calc(var(--text-heading1) * 2);
		line-height: 1;
		letter-spacing: var(--tracking-tight);
		font-variant-numeric: tabular-nums;
	}

	.unit {
		font-size: var(--text-heading2);
		vertical-align: top;
	}

	.conditions {
		font-size: var(--text-heading2);
		line-height: var(--leading-tight);
	}

	/*
	 * THE UNIT, on an island: the rail, and the accent's ground under the key
	 * that is pressed, moving between the two rather than two keys taking turns
	 * being coloured.
	 */
	.units {
		position: relative;
		align-self: flex-start;
		flex: none;

		display: grid;
		grid-auto-flow: column;
		grid-auto-columns: 1fr;
		gap: var(--space-4);

		padding-inline: var(--space-4);
		border-radius: var(--radius-l);
		background-color: var(--rail);
	}

	/*
	 * One key wide and a step shorter than the island, centred on the key it
	 * stands under. Two keys, so the width is half of what is left once the
	 * island's padding and the one gap are taken out.
	 */
	.thumb {
		position: absolute;
		inset-block: var(--space-4);
		inset-inline-start: var(--space-4);
		inline-size: calc((100% - var(--space-4) * 3) / 2);
		translate: calc(var(--slot) * (100% + var(--space-4))) 0;

		border-radius: var(--radius-s);
		background-color: var(--accent);

		transition: translate var(--motion-morph);
	}

	.units button {
		position: relative;
		isolation: isolate;

		block-size: var(--control-block-size);
		min-inline-size: var(--control-block-size);
		padding-inline: var(--space-8);

		appearance: none;
		border: none;
		background: none;
		color: inherit;
		font: inherit;
		font-size: var(--text-label1);
		cursor: pointer;

		transition: color var(--motion-morph);
	}

	/*
	 * The hover's wash and the focus ring are drawn on a ground of the key's
	 * own, inset as the thumb is, so neither is flush with the island's edge.
	 */
	.units button::before {
		content: '';
		position: absolute;
		z-index: -1;
		inset-block: var(--space-4);
		inset-inline: 0;
		border-radius: var(--radius-s);
	}

	.units button:hover::before {
		background-color: var(--surface-hover);
	}

	.units button[aria-pressed='true'] {
		color: var(--accent-fg);
	}

	/* The thumb is under the pressed key already; a wash over it would grey it. */
	.units button[aria-pressed='true']:hover::before {
		background-color: transparent;
	}

	.units button:focus-visible {
		outline: none;
	}

	.units button:focus-visible::before {
		outline: 2px solid var(--fg);
	}

	.verdict {
		font-style: italic;
	}

	.stats {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-8) var(--space-24);
	}

	.stats dt {
		font-size: var(--text-label2);
		color: color-mix(in oklab, var(--fg) 60%, transparent);
	}

	.stats dd {
		margin: 0;
	}

	.section {
		display: flex;
		flex-direction: column;
		gap: var(--space-8);
	}

	h2 {
		font-size: var(--text-body1);
		line-height: var(--leading-tight);
	}

	/*
	 * THE HOURS, scrolling sideways inside the sheet. Snapped to an hour, so a
	 * swipe never comes to rest on half of one.
	 */
	.hours {
		list-style: none;
		display: grid;
		grid-auto-flow: column;
		grid-auto-columns: 3.5rem;
		gap: var(--space-4);
		overflow-x: auto;
		scroll-snap-type: x mandatory;
		scrollbar-width: thin;
		padding-block-end: var(--space-8);

		/*
		 * THE BOX THE HIDDEN WORDS ARE PLACED AGAINST. Each hour carries words
		 * for a screen reader, and `.visually-hidden` takes them out of the flow
		 * with `position: absolute`. A scroller clips only what it contains, and
		 * an absolute box is contained by its nearest POSITIONED ancestor, which
		 * without this was the letter's prose — so the words of the twelfth hour
		 * stood outside the rail, 700px out, and a phone zoomed the whole page
		 * out to show them.
		 */
		position: relative;
	}

	.hour {
		scroll-snap-align: start;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-4);
		padding-block: var(--space-8);
		border-radius: var(--radius-s);
		box-shadow: inset 0 0 0 1px var(--frame);
		font-size: var(--text-label1);
	}

	.hour-mark,
	.day-mark {
		display: inline-flex;
	}

	.hour-mark :global(svg),
	.day-mark :global(svg) {
		inline-size: 1.25rem;
		block-size: 1.25rem;
	}

	.hour-temp {
		font-size: var(--text-body1);
		font-variant-numeric: tabular-nums;
	}

	/*
	 * The chance of rain in a blue, from the warmth scale's cold end. Mixed with
	 * the text colour so it stays legible on either ground.
	 */
	.rain {
		color: color-mix(in oklab, oklch(0.6 0.14 250) 70%, var(--fg));
	}

	.days {
		list-style: none;
		display: flex;
		flex-direction: column;
	}

	/*
	 * SIX COLUMNS THAT MUST FIT THE SMALLEST PHONE: 280px inside the sheet on
	 * a 320px screen. Their floor adds to about 258px — "Wednesday", a mark,
	 * the rain odds, "100°" twice and a bar of at least 2rem — and everything
	 * past the floor goes to the name and the bar. It added to 320 before, and
	 * a phone zoomed the page out to fit it.
	 */
	.day {
		display: grid;
		grid-template-columns:
			minmax(4.5rem, 1fr) 1.25rem 2rem 2.25rem minmax(2rem, 2fr)
			2.25rem;
		align-items: center;
		gap: var(--space-6);
		min-block-size: var(--control-block-size);
		font-variant-numeric: tabular-nums;
	}

	.day + .day {
		border-block-start: 1px solid var(--frame);
	}

	.day-lo,
	.day-hi {
		text-align: end;
	}

	.range {
		position: relative;
		block-size: 0.25rem;
		border-radius: var(--radius-round);
		background-color: var(--raised);
	}

	.range-fill {
		position: absolute;
		inset-block: 0;
		border-radius: inherit;
	}

	.source {
		font-size: var(--text-label1);
	}

	.retry {
		appearance: none;
		border: none;
		background: none;
		padding: 0;
		color: inherit;
		font: inherit;
		text-decoration: underline;
		cursor: pointer;
	}
</style>
