<script lang="ts">
	import Letter from '$lib/components/Letter.svelte';
	import Morph from '$lib/components/Morph.svelte';
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

	/*
	 * THE GROUP ON SHOW, chosen in the strip. '' is All.
	 *
	 * It is kept through a search that empties it, and the strip shows All for
	 * as long as it is gone, so clearing the search puts the reader back in the
	 * group they had chosen rather than in All.
	 */
	let chosen = $state('');

	const showing = $derived(
		groups.some((group) => group.name === chosen) ? chosen : '',
	);

	const shown = $derived(
		showing ? groups.filter((group) => group.name === showing) : groups,
	);

	const total = $derived(
		groups.reduce((n, group) => n + group.emojis.length, 0),
	);

	// "Smileys & Emotion" becomes "smileys-emotion", for the section's id.
	const slug = (name: string) =>
		name
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-|-$/g, '');

	/*
	 * CHOOSING A GROUP STARTS IT FROM THE TOP. The wall is a different wall
	 * now, and a scroll position left over from the old one would land the
	 * reader somewhere in the middle of it, or past its end.
	 */
	let scroller = $state<HTMLElement>();

	function choose(name: string) {
		chosen = name;
		scroller?.scrollTo({ top: 0 });
	}

	/*
	 * THE CHOSEN TAB STAYS IN SIGHT. On a phone the strip is wider than the
	 * window and scrolls sideways, and a tab scrolled out of it is a choice the
	 * reader cannot see. The STRIP is scrolled, by hand, and not the tab into
	 * view: that would scroll the page too, out from under the reader.
	 */
	let strip = $state<HTMLElement>();

	/*
	 * TRUE ONCE THE PAGE IS LIVE. Every button here is in the prerendered HTML
	 * and can be pressed before a handler is attached, to no effect; the strip
	 * says when that is over, for whatever needs to know — the tests first.
	 */
	let live = $state(false);
	$effect(() => {
		live = true;
	});

	$effect(() => {
		const tab = strip?.querySelector<HTMLElement>(
			`[data-group="${CSS.escape(showing)}"]`,
		);
		if (!strip || !tab) return;

		const start = tab.offsetLeft - strip.offsetLeft;
		const end = start + tab.offsetWidth;
		if (start < strip.scrollLeft) strip.scrollLeft = start;
		else if (end > strip.scrollLeft + strip.clientWidth)
			strip.scrollLeft = end - strip.clientWidth;
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
	icon="/favicon-emoji-viewer.svg"
/>

<Letter
	wide
	title="Emoji Viewer"
	tagline="Drawn by your own device."
	serif={['your own device']}
>
	<!--
		THE PANEL STANDS STILL and the wall scrolls inside it, as the Text
		Editor's document does: the frame is always drawn, and the search and
		the strip are always at its head, because nothing moves them. The page
		itself still scrolls, by the footer's height, so the footer is there to
		be found past the end; a wall scrolled to its foot hands the scroll on
		to the page by itself.

		THE STRIP FILTERS; it does not jump. A tab shows its group alone, and All
		shows the lot. A search narrows the strip with the wall, rather than
		offering a group that has nothing left in it.

		Buttons that are pressed, and not a tablist. A tablist promises arrow keys
		between its tabs and a panel for each; this is a set of choices of what
		the one wall shows, which is what `aria-pressed` says.
	-->
	<div class="dock">
		<div class="search">
			<SearchField
				bind:value={query}
				label="Search the emojis by name"
				placeholder="Search by name"
			/>
		</div>

		{#if total > 0}
			<span class="divider" aria-hidden="true"></span>
			<div
				class="tabs"
				role="group"
				aria-label="Show emoji group"
				data-live={live || undefined}
				bind:this={strip}
			>
				<button
					type="button"
					data-group=""
					aria-pressed={showing === ''}
					onclick={() => choose('')}
				>
					All
				</button>
				{#each groups as group (group.name)}
					<button
						type="button"
						data-group={group.name}
						aria-pressed={showing === group.name}
						onclick={() => choose(group.name)}
					>
						{group.name}
					</button>
				{/each}
			</div>
		{/if}
	</div>

	<!--
		The line is announced when it changes, and it is ALWAYS here, holding its
		height whether or not it has anything to say. A line that appears on copy
		would shove the whole wall down by its own height at the moment a reader is
		looking at what they just pressed.

		`role="status"` is polite: it waits for a screen reader to finish its
		sentence rather than cutting in. The two lines overlapping for a moment
		does not reach it: a live region announces what was ADDED, and the line on
		its way out is a removal, which `aria-relevant` ignores by default.

		The words MORPH as they change; see $lib/components/Morph for how. Keyed
		on the character, so one emoji following another morphs too, and not
		only the swap between the hint and a copy.
	-->
	<p class="note" role="status">
		<Morph key={copied}>
			{#if copied}
				<span class="note-char">{copied}</span> copied.
			{:else}
				<span class="note-dim">Select an emoji to copy it.</span>
			{/if}
		</Morph>
	</p>

	<!--
		THE WALL'S OWN SCROLL, and its own scrollbar, which starts at the wall's
		top edge and so never runs under anything.
	-->
	<div class="scroller scrolls" bind:this={scroller}>
		{#if total === 0}
			<p>
				I found nothing for “{query}”.
			</p>
		{:else}
			<!--
				THE GROUPS IN COLUMNS, as many as the sheet has room for, each group
				kept whole in one of them. A desktop sees most of the wall at once
				instead of one long column of it; a phone has room for one column and
				gets the page it had. One group on its own takes the whole width.
			-->
			<div class="groups" class:single={shown.length === 1}>
				{#each shown as group (group.name)}
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
			</div>
		{/if}
	</div>
</Letter>

<style>
	/*
	 * THE DOCK: the search field, and the strip of groups beside it where the
	 * sheet is wide enough, under it where not. It does not move — the wall
	 * scrolls below it — so it needs no glass and no stickiness.
	 *
	 * 76rem, because the strip is some 850px of tabs and the field keeps 18rem
	 * beside it; narrower than that and the tabs would be scrolling sideways on
	 * a desktop. The strip scrolls rather than breaks if they ever do.
	 *
	 * The gap between the two rows is room for the field's focus ring, which
	 * stands 4px outside its edge and touched the strip when the gap was 4px.
	 */
	.dock {
		flex: none;
		display: grid;
		gap: var(--space-12);
	}

	/*
	 * THE DIVIDER between the field and the strip, where they share a row: a
	 * short rule, not the row's full height, in the field's own edge colour, so
	 * it reads as a pause between two kinds of control rather than a wall.
	 * Stacked, the two rows already part them, and it is not drawn.
	 */
	.divider {
		display: none;
		align-self: center;
		inline-size: 1px;
		block-size: var(--space-16);
		background-color: var(--edge);
	}

	@media (min-width: 76rem) {
		.dock {
			grid-template-columns: 18rem auto minmax(0, 1fr);
		}

		.divider {
			display: block;
		}
	}

	/*
	 * THE STRIP: one line of tabs, as an editor's are. Where the groups do not
	 * fit across — a phone — it scrolls sideways rather than wrapping onto a
	 * second line.
	 */
	.tabs {
		display: flex;
		gap: var(--space-4);
		block-size: var(--control-block-size);
		overflow-x: auto;
		overscroll-behavior-x: contain;
		scrollbar-width: none;
	}

	.tabs::-webkit-scrollbar {
		display: none;
	}

	.tabs button {
		display: inline-flex;
		align-items: center;
		flex: none;
		padding-inline: var(--space-8);
		font: inherit;
		font-size: var(--text-label1);
		line-height: var(--leading-tight);
		white-space: nowrap;
		cursor: pointer;
		border: none;
		border-radius: var(--radius-s);
		background: none;

		/* A group not on show steps back. */
		color: color-mix(in oklab, var(--fg) 60%, transparent);
	}

	.tabs button:hover {
		color: var(--fg);
		background-color: var(--surface-hover);
	}

	.tabs button:focus-visible {
		outline: 2px solid var(--fg);
		outline-offset: -2px;
	}

	/*
	 * WHAT IS ON SHOW: the whole tab in the accent, as a copied cell is.
	 * `--accent-fg` on it in either mode, because light letters on the yellow
	 * are 1.3:1. It follows `:hover`, so a pointer resting on the chosen tab
	 * does not wash the yellow out.
	 */
	.tabs button[aria-pressed='true'],
	.tabs button[aria-pressed='true']:hover {
		color: var(--accent-fg);
		background-color: var(--accent);
	}

	/*
	 * COLUMNS, and not a grid of rows. Groups run from 54 emojis to over a
	 * hundred, and in rows each row would be as tall as its tallest group with
	 * the rest standing over empty space. Columns let each group sit straight
	 * under the one before it, so the wall packs like masonry.
	 *
	 * `column-width` and not a count: the sheet decides how many fit, and a
	 * phone's measure fits one, which is the page it already had.
	 */
	/*
	 * THE SCROLLER takes what the panel has left under the dock and the note.
	 * `min-block-size: 0` is what lets it be shorter than the wall in it — a
	 * flex item will not otherwise shrink below its content — and so scroll.
	 *
	 * `stable`, so a wall that stops needing to scroll, a short group or a
	 * narrow search, does not take the gutter back and shove every column
	 * sideways by a scrollbar's width.
	 */
	.scroller {
		flex: 1;
		min-block-size: 0;
		overflow-y: auto;
		scrollbar-gutter: stable;
	}

	.groups {
		column-width: 24rem;
		column-gap: var(--space-32);
	}

	/* One group fills the sheet, rather than standing in a column of it. */
	.groups.single {
		columns: auto;
	}

	.group {
		display: flex;
		flex-direction: column;
		gap: var(--space-8);
		/* A group is never split across two columns, and the space under it is
		 * padding rather than margin, which a column would swallow at its foot. */
		break-inside: avoid;
		padding-block-end: var(--space-16);
	}

	h2 {
		font-size: var(--text-body1);
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
		gap: var(--space-4);
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
		border-radius: var(--radius-s);

		/* The glyph is the content, so it is sized here rather than inherited from
		 * the prose around it. */
		font-size: var(--text-heading2);
		/* Emoji are drawn by a font the page does not control, and some of them
		 * sit on a taller line than others. Fixing the line box keeps the wall's
		 * rows even whatever the platform hands over. */
		line-height: 1;
	}

	/*
	 * ROUND, and the same token the bar's controls take — which on a square box
	 * draws a circle, exactly as it does on them. The wash used to be a hard grey
	 * square, which read as a block dropped on the wall rather than as something
	 * answering the pointer.
	 *
	 * The hairline inside it is what the search field wears, and it is the part
	 * that reads as glass. It cannot be actual frost: a cell's emoji is its
	 * content and not its backdrop, and a `backdrop-filter` here was measured
	 * byte-for-byte inert.
	 */
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
		/* The hairline goes with it. The accent is a solid fill and says what it
		 * has to say; an edge drawn over it would be the hover still showing
		 * through the confirmation. */
		box-shadow: none;
	}

	.note {
		font-size: var(--text-label1);
		/* Held at one line, so the wall does not move when the words change. */
		block-size: 1lh;
	}

	.note-char {
		font-size: var(--text-body1);
	}

	.note-dim {
		/* The hint is not the page, so it steps back. Mixed from --fg, so it flips
		 * with the display mode by itself. */
		color: color-mix(in oklab, var(--fg) 60%, transparent);
	}
</style>
