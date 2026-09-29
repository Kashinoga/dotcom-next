<script lang="ts">
	import type { Snippet } from 'svelte';
	import { page } from '$app/state';
	import { apps } from '$lib/apps';

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
		wide = false,
		serif = [],
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
		 * A LETTER THAT IS NOT MOSTLY PROSE. The measure exists to keep a line of
		 * reading short; a page laid out as a grid of short columns has no long
		 * line to protect, and its name belongs at the grid's edge rather than
		 * centred over a narrower column than the page actually uses.
		 */
		wide?: boolean;
		children: Snippet;
	} = $props();

	/*
	 * AN APP WEARS ITS MARK beside its name, in a tile of the accent, as an
	 * extension's page does in Modern UI. The mark is looked up in $lib/apps by
	 * the page's address, which is how the bar finds it too, so no page passes
	 * one and none can pass the wrong one.
	 *
	 * A page with no mark has its name underlined in the accent instead. Either way the yellow sits on one thing per masthead, and never
	 * as a block behind the words — which is what the accent means everywhere
	 * else on the site: this one is selected.
	 */
	const Icon = $derived(
		apps.find((app) => app.href === page.url.pathname)?.icon,
	);

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
<div class="sheet" class:wide>
	<section class="hero" style="--title-optical: {optical}">
		<!--
		A <span> and NOT a <mark>, which is what this started as. <mark> means
		"relevant to what the reader is doing right now" — a search hit, the
		passage under discussion — and a name is not that. Some screen readers
		announce "highlight" around it, which would put a word with no meaning
		into the reading of the title. The underline here is decoration, and
		decoration belongs in an element that claims nothing.
	-->
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
		<div class="masthead" class:marked={Icon}>
			{#if Icon}
				<span class="tile" aria-hidden="true"><Icon /></span>
			{/if}
			<div class="words">
				<h1 data-page-title><span class="name">{title}</span></h1>
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
	.sheet.wide {
		inline-size: min(90rem, 100% - var(--gap-panel) * 2);
	}

	.sheet {
		min-block-size: calc(100dvh - var(--bar-block-size) - var(--gap-panel) * 2);
		/* The measure caps the line; a wide page's grid stops at 90rem, past
		 * which a row of cards is too long a glance. */
		inline-size: min(var(--measure), 100% - var(--gap-panel) * 2);
		margin: var(--gap-panel) auto;
		border-radius: var(--radius-l);
		background-color: var(--bg);
		box-shadow: inset 0 0 0 1px var(--frame);
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

	.words {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		min-inline-size: 0;
	}

	/*
	 * THE TILE: the app's mark on the accent, square with the large radius, as
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
	 * Every app page has a tagline. One without would get a tile taller than
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
	 * A NAME WITH NO MARK BESIDE IT has the accent under it rather than
	 * behind it. The underline is thick and pulled up into the
	 * letters' feet, so it reads as a highlighter's stroke along the baseline —
	 * the pen-and-paper the site began with, drawn at a weight that leaves the
	 * words themselves in plain ink.
	 *
	 * `skip-ink: none`, because a stroke of ink does not lift for descenders.
	 * In `em`, so it keeps its proportion as the heading size moves.
	 */
	.masthead:not(.marked) .name {
		text-decoration-line: underline;
		text-decoration-color: var(--accent);
		text-decoration-thickness: 0.3em;
		text-underline-offset: -0.08em;
		text-decoration-skip-ink: none;
	}

	/*
	 * STEPPED BACK, because the line under a name reads second, so it is drawn
	 * second. Mixed from --fg, so it flips with the display mode.
	 */
	.tagline {
		font-size: var(--text-heading2);
		line-height: var(--leading-tight);
		color: color-mix(in oklab, var(--fg) 60%, transparent);
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
		 * NOT DECORATION, and not spare. A page can hang something in the margin
		 * beside the letter by positioning it against this box — the Emoji Viewer's
		 * group list does exactly that, with `inset-inline-start: 100%`. Take this
		 * line out and that rail goes and stands against the viewport instead,
		 * which is a long way from where it belongs.
		 */
		position: relative;
	}
</style>
