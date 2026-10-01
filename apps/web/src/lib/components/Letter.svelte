<script lang="ts">
	import type { Component, Snippet } from 'svelte';
	import { page } from '$app/state';
	import { apps } from '$lib/apps';
	import Morph from '$lib/components/Morph.svelte';
	import CircleDashedCheck from '@lucide/svelte/icons/circle-dashed-check';
	import HeartHandshake from '@lucide/svelte/icons/heart-handshake';
	import LayoutGrid from '@lucide/svelte/icons/layout-grid';
	import StickyNote from '@lucide/svelte/icons/sticky-note';

	/*
	 * THE LETTER, which is the shape every page on this site takes: a marked
	 * name, a line under it, and a column of text at reading width.
	 *
	 * It became a component when the second page arrived. Before that the rules
	 * lived in +page.svelte, where the only page that used them was the only page
	 * there was.
	 *
	 * `optical` is a MEASUREMENT OF ONE GLYPH and not a constant, which is why
	 * each page brings its own and the default is zero. See the h1 rule below.
	 */
	let {
		title,
		tagline,
		optical = '0em',
		desk = false,
		wide = false,
		panel = false,
		serif = [],
		mark,
		tools,
		children,
	}: {
		title: string;
		tagline?: string;
		/*
		 * THE WORDS OF THE TAGLINE THAT ARE SET IN THE SERIF, and only those —
		 * the nouns that carry its meaning, chosen by whoever wrote it. A list
		 * beside the tagline and not markup inside it, because the tagline is
		 * also a page's <title> and a line in a shared link, where an asterisk
		 * would be printed. A word listed here that the tagline does not hold
		 * marks nothing, which is the harmless way for the two to disagree.
		 */
		serif?: string[];
		optical?: string;
		/*
		 * AN APP'S DESK AND NOT A LETTER: no sheet and no measure, but panes laid
		 * on the shell as the Text Editor's are, the masthead the first of them.
		 * The page's own content brings the rest.
		 */
		desk?: boolean;
		/*
		 * A LETTER THAT OUTGROWS THE MEASURE, for a page whose
		 * content is not lines to be read — a wall of things to pick from. It
		 * takes the window, a panel gap clear of either edge, as a desk does.
		 */
		wide?: boolean;
		/*
		 * A PANEL AND NOT A LETTER: a sheet the height of the window, which does
		 * not grow with what is in it. The page's content gets what is left
		 * under the masthead, and scrolls inside it.
		 *
		 * A LETTER grows and the page scrolls, which suits a page to work
		 * through with room to spare — the Trip Planner. A PANEL suits one to
		 * look things up in, whose controls should stay at its head without
		 * being made to stick — the Emoji Viewer. A panel app in $lib/apps is
		 * one without passing this.
		 */
		panel?: boolean;
		/*
		 * A MARK THE ADDRESS CANNOT GIVE: a page whose one address shows two
		 * things, as a shared trip does when it is locked.
		 */
		mark?: Component;
		/* Controls for the whole page, at the masthead's far end. */
		tools?: Snippet;
		children: Snippet;
	} = $props();

	/*
	 * AN APP WEARS ITS MARK beside its name, in a tile of the accent, as an
	 * extension's page does in Modern UI. The mark is looked up in $lib/apps by
	 * the page's address, which is how the bar finds it too, so an app page
	 * passes none and cannot pass the wrong one.
	 *
	 * The home page wears the site mark, the favicon's drawing, and Apps the
	 * grid the bar shows for it. A page with none of its own wears a sticky
	 * note. All were a highlighter's stroke under the name, until dark mode put
	 * light letters over the yellow at 1.3:1.
	 */
	const marks: Record<string, Component> = {
		'/': HeartHandshake,
		'/apps': LayoutGrid,
		'/media-requests': CircleDashedCheck,
	};

	const app = $derived(apps.find((a) => a.href === page.url.pathname));

	const Icon = $derived(
		mark ?? marks[page.url.pathname] ?? app?.icon ?? StickyNote,
	);

	// A panel app is one without being told; see $lib/apps.
	const isPanel = $derived(panel || !!app?.panel);

	/*
	 * THE TAGLINE CUT AT THE MARKED WORDS. A split on a pattern with one
	 * capturing group keeps what it cut on, so the odd parts are the marked
	 * words and the even parts are everything between them. Whole words only,
	 * so marking "art" leaves "start" alone.
	 */
	const words = $derived.by(() => {
		if (!tagline) return [];
		if (!serif.length) return [tagline];
		const escaped = serif.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
		return tagline.split(new RegExp(`\\b(${escaped.join('|')})\\b`));
	});
</script>

<!--
	THE SHEET: the document panel, as in VS Code's Modern UI. As wide as what
	it holds — the reading measure, or a wide page's grid — and centred on the
	shell, a panel gap clear of the window's edges.
-->
<div class="sheet" class:desk class:wide class:panel={isPanel}>
	<section class="hero" style="--title-optical: {optical}">
		<!--
		`data-page-title` IS A CONTRACT WITH THE BAR. The bar wears a page's name
		once the page has stopped saying it, and it needs to know which element is
		the page saying it — which is this one, and not any <h1>.

		It was `document.querySelector('h1')`, and that was a guess that held only
		while every page was a letter. A page with no masthead has no h1 and the
		bar must carry its name from the first paint; a page whose CONTENT has an
		h1 in it — a rendered document in a preview, say — must not have that
		mistaken for its masthead. Marking the real one answers both.
	-->
		<div class="masthead">
			<span class="tile" aria-hidden="true"
				><Morph key={Icon} align="center"><Icon /></Morph></span
			>
			<div class="words">
				<h1 data-page-title><Morph key={title}>{title}</Morph></h1>
				{#if tagline}
					<!--
				A <p> and not an <h2>. A heading opens a SECTION, and this opens
				nothing: a visitor moving through the page by heading would be sent
				into a section that does not exist. It reads as a heading because of
				its size, which is a matter for the stylesheet and not for the markup.
			-->
					<p class="tagline">
						{#each words as part, i (i)}{#if i % 2}<span class="serif"
									>{part}</span
								>{:else}{part}{/if}{/each}
					</p>
				{/if}
			</div>
			{#if tools}
				<div class="tools">{@render tools()}</div>
			{/if}
		</div>

		<div class="prose">
			{@render children()}
		</div>
	</section>
</div>

<style>
	/*
	 * Every value here comes from a token in app.css. That is the point of the
	 * scales: the next component reaches for the same seven spaces and the same
	 * five sizes, and the two look related without either knowing about the
	 * other.
	 */
	.hero {
		/*
		 * THE SPACE EACH SIDE OF THE HEADER'S RULE, written once. It is the gap
		 * below the rule and the padding above it, and the two must match — so
		 * neither holds its own number to drift from the other.
		 */
		--rule-space: var(--space-32);

		display: flex;
		flex-direction: column;
		gap: var(--rule-space);

		/*
		 * The top takes the rule's space too, so the sheet's edge, the header and
		 * the rule under it stand the same distance apart all the way down.
		 */
		padding: var(--rule-space) var(--space-16) var(--space-36);
	}

	/*
	 * A frame and not a border: a border is a pixel of the box. The height fills
	 * the window under the bar, so the footer waits below the fold.
	 */
	/*
	 * A DESK IS SET AS THE TEXT EDITOR IS: the window's width less the panel
	 * gap, with no sheet of its own, and panes 4px apart that hold their
	 * content 12px in. The masthead is the first pane, so its rule goes.
	 */
	.sheet.desk {
		inline-size: calc(100% - var(--gap-panel) * 2);
		background: none;
		box-shadow: none;
	}

	.sheet.desk .hero {
		padding: 0;
		gap: var(--gap-panel);
	}

	.sheet.desk .masthead {
		padding: var(--space-16) var(--space-12);
		border: none;
		border-radius: var(--radius-l);
		background-color: var(--bg);
		box-shadow: inset 0 0 0 1px var(--frame);
	}

	.sheet {
		min-block-size: calc(100dvh - var(--bar-block-size) - var(--gap-panel));
		/* The measure caps the line. */
		inline-size: min(var(--measure), 100% - var(--gap-panel) * 2);
		/*
		 * ONE GAP ON EVERY SIDE, and the top one is the bar's to draw: the bar is
		 * a control between two `--gap-panel` paddings, so its lower one is
		 * already this step. A margin here as well made two at the top against
		 * one at the sides, as the Text Editor's desk had worked out already.
		 */
		margin: 0 auto var(--gap-panel);
		border-radius: var(--radius-l);
		background-color: var(--bg);
		box-shadow: inset 0 0 0 1px var(--frame);
	}

	/*
	 * WIDE AT EVERY SIZE, and not only past a desktop's. On a phone the measure
	 * is the window already; between that and a desktop a wall of things would
	 * otherwise sit in a reading column with the window's sides left empty.
	 * It also means a wide sheet is always the window less a panel gap, which
	 * is what lets the Emoji Viewer's dock reach the window's edges.
	 */
	.sheet.wide {
		inline-size: calc(100% - var(--gap-panel) * 2);
	}

	/*
	 * EXACTLY THE WINDOW, less the bar and the panel gap below, which is the
	 * least an ordinary sheet is. The hero and the prose pass the height
	 * down, and the prose's `min-block-size: 0` is what lets the page's own
	 * scroller inside it be shorter than what it holds.
	 */
	.sheet.panel {
		display: flex;
		flex-direction: column;
		block-size: calc(100dvh - var(--bar-block-size) - var(--gap-panel));
	}

	.sheet.panel .hero {
		flex: 1;
		min-block-size: 0;
	}

	.sheet.panel .prose {
		flex: 1;
		min-block-size: 0;
	}

	/*
	 * The mark and the words are one unit, and the name and the tagline are one
	 * unit inside it, so each sits closer to its partner than to anything else.
	 * Proximity is what says "these belong together" — it needs no line, no box
	 * and no colour.
	 */
	.masthead {
		display: flex;
		align-items: center;
		gap: var(--space-12);

		/*
		 * THE HEADER IS AN AREA, ruled off from the page under it, as the header
		 * of an extension's page is in VS Code. The rule stops where the text
		 * does, inside the hero's padding, so it keeps the same margin from the
		 * frame on both sides as every line of the page below it.
		 *
		 * EVEN SPACE EACH SIDE: this padding above the rule and the hero's gap
		 * below it are one token, `--rule-space`, set on the hero.
		 */
		padding-block-end: var(--rule-space);
		border-block-end: 1px solid var(--frame);
	}

	/* Pushed to the far end, on one line; the words give way to them. */
	.tools {
		display: flex;
		flex: none;
		gap: var(--space-4);
		margin-inline-start: auto;
	}

	.words {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		min-inline-size: 0;
	}

	/*
	 * THE TILE: the page's mark on the accent, square with the large radius, as
	 * Modern UI draws an extension's icon. The icon takes `--accent-fg` for the
	 * reason the pressed controls do — yellow is too light to carry a line drawn
	 * in it, so the yellow is the ground and the line is black.
	 *
	 * EXACTLY AS TALL AS THE WORDS BESIDE IT: the title's line, the gap, and
	 * the tagline's line, from the same tokens the words are set with. A round
	 * 3rem stood a couple of pixels short of them, centred, and so sat a
	 * couple of pixels in from both — which made the space above the header
	 * and the space below it each read wider than the rule's. Written from the
	 * tokens, it follows the words to a phone's larger sizes by itself.
	 *
	 * A shared trip may have no tagline, and would get a tile taller than
	 * its title, centred on it, which is the lesser fault.
	 */
	.tile {
		--tile-size: calc(
			var(--text-heading1) * var(--leading-tight) + var(--space-4) +
				var(--text-heading2) * var(--leading-tight)
		);

		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex: none;
		inline-size: var(--tile-size);
		block-size: var(--tile-size);
		border-radius: var(--radius-l);
		background-color: var(--accent);
		color: var(--accent-fg);
	}

	.tile :global(svg) {
		inline-size: 1.75rem;
		block-size: 1.75rem;
	}

	h1 {
		font-size: var(--text-heading1);
		line-height: var(--leading-tight);
		letter-spacing: var(--tracking-tight);

		/*
		 * OPTICAL ALIGNMENT. `--title-optical` is the correction for THIS page's
		 * title against its tagline, and it is a measurement rather than a rule:
		 * a letter's side bearing differs by face and by size, so another word
		 * wants another number, and a page that has not been measured passes
		 * nothing and gets zero.
		 *
		 * CSS has no property for this. `text-box-trim` answers the same problem
		 * on the vertical axis and there is no horizontal equal.
		 */
		margin-inline-start: var(--title-optical);
	}

	/*
	 * STEPPED BACK, because the line under a name reads second, so it is drawn
	 * second. Mixed from --fg, so it flips with the display mode. 75% and not
	 * 60%: at 18px the line needs 4.5:1, and 60% gave 4.3 in either mode. This
	 * is 7.1 in light and 6.0 in dark.
	 */
	.tagline {
		font-size: var(--text-heading2);
		line-height: var(--leading-tight);
		color: color-mix(in oklab, var(--fg) 75%, transparent);
	}

	/*
	 * THE MARKED WORDS, in the serif's italic: the pen-and-paper the site
	 * began with, kept to the words that carry the line — the italic is the
	 * hand, and the serif is the ink. Everything around them stays upright in
	 * the interface's own face, so the tagline still reads as part of it.
	 */
	.serif {
		font-family: var(--font-tagline);
		font-style: italic;
	}

	.prose {
		display: flex;
		flex-direction: column;
		gap: var(--space-16);

		/*
		 * NOT DECORATION. A page can position something against this box, and
		 * without this line it would be placed against the viewport instead,
		 * which is a long way from where it belongs.
		 */
		position: relative;
	}
</style>
