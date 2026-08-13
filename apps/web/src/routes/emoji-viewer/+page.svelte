<script lang="ts">
	import Letter from '$lib/components/Letter.svelte';
	import SearchField from '$lib/components/SearchField.svelte';
	import Seo from '$lib/components/Seo.svelte';
	import { EMOJI_GROUPS } from '$lib/emoji';

	let query = $state('');

	// The emoji just copied, echoed back for a moment. '' means nothing to say.
	let copied = $state('');
	let clearCopied: ReturnType<typeof setTimeout>;

	/*
	 * Filter INSIDE each group, then drop the groups the query emptied — so a
	 * search collapses the wall to the groups that still have something in them,
	 * headings and all, rather than leaving a column of empty titles.
	 *
	 * Matching on the name only. The characters themselves are not searchable
	 * text: nobody types 🫠 to look for 🫠.
	 */
	const groups = $derived.by(() => {
		const q = query.trim().toLowerCase();
		if (!q) return EMOJI_GROUPS;
		return EMOJI_GROUPS.map((group) => ({
			name: group.name,
			emojis: group.emojis.filter(([, name]) => name.toLowerCase().includes(q)),
		})).filter((group) => group.emojis.length > 0);
	});

	const total = $derived(
		groups.reduce((n, group) => n + group.emojis.length, 0),
	);

	// "Smileys & Emotion" becomes "smileys-emotion". The group's name is the only
	// thing that identifies it, so the anchor is made from the name rather than
	// kept beside it as a second field that could disagree.
	const slug = (name: string) =>
		name
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-|-$/g, '');

	/*
	 * THE GROUP THE READER IS IN, for the list beside the wall.
	 *
	 * Measured from the scroll position rather than watched with an
	 * IntersectionObserver. An observer only reports the crossings it samples, and
	 * a jump can carry a heading from below the line to above it between two
	 * frames without ever being seen on it. Asking "which is the last heading
	 * above the line" cannot miss, because it does not depend on having watched
	 * the journey.
	 */
	let active = $state('');

	$effect(() => {
		// Named so the effect re-runs when a search changes the list.
		const current = groups;

		let frame = 0;

		const update = () => {
			frame = 0;

			/*
			 * THE LINE IS THE ONE THE BROWSER ALREADY USES.
			 *
			 * It was the bar's lower edge, and that was a second number: following a
			 * link put the heading at `scroll-padding-block-start`, 92px, while this
			 * asked which heading had passed 77px. The heading a reader had just
			 * jumped to therefore sat BELOW the deciding line, and the mark stayed on
			 * the group above it — the list pointing at the wrong place at the exact
			 * moment it had been asked to point somewhere.
			 *
			 * Reading the scroll padding means the jump and the mark cannot disagree,
			 * because there is no longer a second value for them to disagree about.
			 */
			const root = getComputedStyle(document.documentElement);
			const padding = Number.parseFloat(root.scrollPaddingTop);
			const bar =
				document.querySelector('header')?.getBoundingClientRect().bottom ?? 0;
			/*
			 * `auto` parses to NaN, which is what a page with no padding set reports.
			 *
			 * Two pixels of slack, and they are needed: a jump lands the heading on
			 * 92.39 against a padding of 92, because the wall's rows do not fall on
			 * whole pixels. One pixel left six tenths of a pixel between working and
			 * not, which is not a margin, it is a coincidence. The next heading is
			 * five hundred pixels away, so there is nothing for the slack to catch.
			 */
			const line = (Number.isFinite(padding) ? padding : bar) + 2;

			let found = '';
			for (const group of current) {
				const el = document.getElementById(slug(group.name));
				if (el && el.getBoundingClientRect().top <= line)
					found = slug(group.name);
			}

			// Before the first heading has reached the line there is no group above
			// it, and the first one is still the one being read towards.
			active = found || (current[0] ? slug(current[0].name) : '');
		};

		// The handler runs on every scroll event; the work waits for a frame, so a
		// fast scroll measures once per paint instead of once per event.
		const onScroll = () => {
			if (!frame) frame = requestAnimationFrame(update);
		};

		update();
		addEventListener('scroll', onScroll, { passive: true });
		addEventListener('resize', onScroll, { passive: true });

		return () => {
			cancelAnimationFrame(frame);
			removeEventListener('scroll', onScroll);
			removeEventListener('resize', onScroll);
		};
	});

	/*
	 * `writeText` needs a secure context and a permission, and it has neither over
	 * plain http or inside some embedded browsers. The old `execCommand` path
	 * still works in all of them, so it stands behind this one as the fallback.
	 *
	 * Nothing is confirmed unless a copy actually happened. A page that says
	 * "copied" when it did not is worse than one that says nothing, because the
	 * reader finds out at the paste.
	 */
	async function copy(char: string) {
		try {
			await navigator.clipboard.writeText(char);
		} catch {
			if (!copyByTextarea(char)) return;
		}

		copied = char;
		clearTimeout(clearCopied);
		clearCopied = setTimeout(() => (copied = ''), 1400);
	}

	function copyByTextarea(char: string) {
		const area = document.createElement('textarea');
		area.value = char;
		// Off-screen but focusable. `display: none` cannot be selected from.
		area.setAttribute('style', 'position:fixed;top:-100vh;opacity:0');
		// `appendChild` and not `append`. The Worker types in scope here carry an
		// `append` of their own, and it wins the overload and fails the build.
		document.body.appendChild(area);
		area.select();

		try {
			return document.execCommand('copy');
		} catch {
			return false;
		} finally {
			area.remove();
		}
	}
</script>

<Seo
	title="Emoji Viewer"
	description="Browse and copy the system emojis, drawn by your own device."
	path="/emoji-viewer"
/>

<Letter title="Emoji Viewer" tagline="Drawn by your own device.">
	<p>
		These are your emojis, and not pictures of them. Nothing here is an image
		this site sent you — each one is a character your own machine draws, so what
		you see is what will arrive when you paste it somewhere else.
	</p>

	<SearchField
		bind:value={query}
		label="Search the emojis by name"
		placeholder="Search by name"
	/>

	<!--
		The line is announced when it changes, and it is ALWAYS here, holding its
		height whether or not it has anything to say. A line that appears on copy
		would shove the whole wall down by its own height at the moment a reader is
		looking at what they just pressed.

		`role="status"` is polite: it waits for a screen reader to finish its
		sentence rather than cutting in.
	-->
	<p class="note" role="status">
		{#if copied}
			<span class="note-char">{copied}</span> copied.
		{:else}
			<span class="note-dim">Choose one to copy it.</span>
		{/if}
	</p>

	{#if total === 0}
		<p>
			Nothing here is named “{query}”. A plainer word may find it — the names
			are the ordinary ones, so “cat” and not “feline”.
		</p>
	{:else}
		<!--
			THE GROUPS, LISTED, standing in the margin beside the wall.

			It is inside the letter and not in the layout, because it belongs to
			this page and knows what is in it — a search narrows the wall, and the
			list narrows with it rather than offering a jump to a group that is no
			longer on the page.

			`aria-current="location"` and not `"page"`: the reader is not on another
			page, they are at a place within this one, which is the word that means.
		-->
		<nav class="rail" aria-label="Emoji groups">
			<ol class="toc">
				{#each groups as group (group.name)}
					<li>
						<a
							href="#{slug(group.name)}"
							aria-current={active === slug(group.name)
								? 'location'
								: undefined}
						>
							{group.name}
						</a>
					</li>
				{/each}
			</ol>
		</nav>

		{#each groups as group (group.name)}
			<section class="group" id={slug(group.name)}>
				<h2>{group.name}</h2>

				<div class="wall">
					{#each group.emojis as [char, name] (char)}
						<!--
							A <button> and not a <div> with a click on it. This does
							something, so it has to be reachable by Tab, pressable by
							Enter and Space, and announced as a button — all of which a
							button is given and a div has to be taught.

							The character is hidden from the reading, and the NAME is the
							button's label. A screen reader saying "smiling face with
							sunglasses" is useful; one attempting the glyph is not.
						-->
						<button
							type="button"
							class:copied={copied === char}
							onclick={() => copy(char)}
							title={name}
							aria-label={name}
						>
							<span aria-hidden="true">{char}</span>
						</button>
					{/each}
				</div>
			</section>
		{/each}
	{/if}
</Letter>

<style>
	/*
	 * THE RAIL, standing in the margin OUTSIDE the letter, on the end side — the
	 * right where the writing runs left to right, and the left where it does not.
	 *
	 * `inset-inline-start: 100%` puts its start edge on the prose's end edge, and
	 * mirrors by itself: in a right-to-left document that resolves to `right:
	 * 100%`, which lays it out from the prose's other side. Nothing here names a
	 * physical direction.
	 *
	 * The rail is absolute and runs the FULL HEIGHT of the prose; the list inside
	 * it is what sticks. That is the division that makes this work — sticky needs
	 * a box to travel inside, and an absolutely positioned element cannot be
	 * sticky itself. `.prose` is already `position: relative`, for the yellow rule
	 * on the other side.
	 */
	.rail {
		position: absolute;
		inset-block: 0;
		inset-inline-start: 100%;
		margin-inline-start: var(--space-l);
		inline-size: 11rem;

		/*
		 * HIDDEN UNTIL THERE IS A MARGIN TO STAND IN. The letter is 654px and
		 * centred, so at 70rem the space either side is 233px and the rail plus its
		 * gap wants 200 of them. Below that it would sit on top of the wall.
		 *
		 * The wall is still reachable without it: every group is a heading, so a
		 * screen reader and a find-in-page both still work. Hiding this is losing a
		 * shortcut, not losing the way through.
		 */
		display: none;
	}

	@media (min-width: 70rem) {
		.rail {
			display: block;
		}
	}

	/*
	 * The list stops short of the bar rather than sliding under it, by the bar's
	 * own published height plus a step of air.
	 */
	.toc {
		position: sticky;
		inset-block-start: calc(var(--bar-block-size) + var(--space-m));

		list-style: none;
		padding: 0;
		display: flex;
		flex-direction: column;
	}

	.toc a {
		display: block;
		padding: var(--space-2xs) var(--space-xs);
		font-size: var(--text-s);
		line-height: var(--leading-tight);
		text-decoration: none;

		/*
		 * A group not being read steps back, and the mark beside it is drawn but
		 * transparent. EVERY item carries the border, so the one that lights up
		 * does not shove its own text sideways.
		 */
		color: color-mix(in oklab, var(--fg) 60%, transparent);
		border-inline-start: 2px solid transparent;
	}

	.toc a:hover {
		color: var(--fg);
		text-decoration: underline;
	}

	.toc a:focus-visible {
		outline: 2px solid var(--fg);
		outline-offset: -2px;
	}

	/* WHERE THE READER IS. The accent marks it, and the words come back to full
	 * strength — the colour alone would be the only signal, and the yellow is not
	 * legible enough on white to be asked to carry it by itself. */
	.toc a[aria-current='location'] {
		color: var(--fg);
		border-inline-start-color: var(--accent);
	}

	.group {
		display: flex;
		flex-direction: column;
		gap: var(--space-xs);
	}

	h2 {
		font-size: var(--text-m);
		line-height: var(--leading-tight);
	}

	/*
	 * `auto-fill` against a 2.75rem minimum, so the wall gives back as many
	 * columns as the measure can hold and every cell stays at least 44px — the
	 * smallest target a finger hits reliably. No breakpoint decides this.
	 */
	.wall {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(2.75rem, 1fr));
		gap: var(--space-2xs);
	}

	.wall button {
		aspect-ratio: 1;
		display: inline-flex;
		align-items: center;
		justify-content: center;

		appearance: none;
		border: none;
		background: none;
		padding: 0;
		cursor: pointer;

		/* The glyph is the content, so it is sized here rather than inherited from
		 * the prose around it. */
		font-size: var(--text-l);
		/* Emoji are drawn by a font the page does not control, and some of them
		 * sit on a taller line than others. Fixing the line box keeps the wall's
		 * rows even whatever the platform hands over. */
		line-height: 1;
	}

	.wall button:hover {
		background-color: var(--surface-hover);
	}

	.wall button:focus-visible {
		outline: 2px solid var(--fg);
		outline-offset: 2px;
	}

	/*
	 * The confirmation, on the cell itself. The line above says it in words for
	 * anyone who cannot see this, and this says it where the eye already is — on
	 * the thing that was just pressed.
	 *
	 * It follows `:hover`, because the pointer is still on the cell at the moment
	 * of the copy and the hover wash would otherwise win.
	 */
	.wall button.copied,
	.wall button.copied:hover {
		background-color: var(--accent);
	}

	.note {
		font-size: var(--text-s);
		/* Held at one line, so the wall does not move when the words change. */
		block-size: 1lh;
	}

	.note-char {
		font-size: var(--text-m);
	}

	.note-dim {
		/* The hint is not the page, so it steps back. Mixed from --fg, so it flips
		 * with the display mode by itself. */
		color: color-mix(in oklab, var(--fg) 60%, transparent);
	}
</style>
