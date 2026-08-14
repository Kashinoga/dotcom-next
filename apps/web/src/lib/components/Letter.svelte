<script lang="ts">
	import type { Snippet } from 'svelte';

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
		children,
	}: {
		title: string;
		tagline?: string;
		optical?: string;
		children: Snippet;
	} = $props();
</script>

<section class="hero" style="--title-optical: {optical}">
	<!--
		A <span> and NOT a <mark>, which is what this started as. <mark> means
		"relevant to what the reader is doing right now" — a search hit, the
		passage under discussion — and a name is not that. Some screen readers
		announce "highlight" around it, which would put a word with no meaning
		into the reading of the title. The highlight here is decoration, and
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
	<div class="masthead">
		<h1 data-page-title><span class="highlight">{title}</span></h1>
		{#if tagline}
			<!--
				A <p> and not an <h2>. A heading opens a SECTION, and this opens
				nothing: a visitor moving through the page by heading would be sent
				into a section that does not exist. It reads as a heading because of
				its size, which is a matter for the stylesheet and not for the markup.
			-->
			<p class="tagline">{tagline}</p>
		{/if}
	</div>

	<div class="prose">
		{@render children()}
	</div>
</section>

<style>
	/*
	 * Every value here comes from a token in app.css. That is the point of the
	 * scales: the next component reaches for the same seven spaces and the same
	 * five sizes, and the two look related without either knowing about the
	 * other.
	 */
	.hero {
		display: flex;
		flex-direction: column;
		gap: var(--space-xl);

		/* `--measure` caps the LINE, and the padding keeps the text off the edge of
		 * a phone. `margin-inline: auto` then centres the column in a wide window. */
		max-width: var(--measure);
		margin-inline: auto;
		padding: var(--space-2xl) var(--space-m);
	}

	/* The name and the tagline are one unit, so they sit closer to each other than
	 * to anything else. Proximity is what says "these two belong together" — it
	 * needs no line, no box and no colour. */
	.masthead {
		display: flex;
		flex-direction: column;
		gap: var(--space-2xs);
	}

	h1 {
		font-size: var(--text-display);
		line-height: var(--leading-tight);
		letter-spacing: var(--tracking-tight);

		/*
		 * OPTICAL ALIGNMENT. THE TEXT IS THE EDGE, and the highlight hangs off it.
		 *
		 * A highlighter does not respect a margin. Someone drawing one over a word
		 * starts a little before the first letter and stops a little after the
		 * last, and the WORDS stay where the words were. So the first letter meets
		 * the first letter of the tagline, and the yellow runs out past both —
		 * which is the whole effect: a real stroke, drawn by a machine that never
		 * wobbles.
		 *
		 * `--title-optical` is the correction for THIS page's title, and it is a
		 * measurement rather than a rule: on the home page the K carries 3px of
		 * side bearing at 72px against the tagline's 1px, so that title comes left
		 * by the 2px difference. Another word begins with another letter and wants
		 * another number, and a page that has not been measured passes nothing and
		 * gets zero.
		 *
		 * The box then adds its own padding in front of the first letter, and the
		 * calc takes it back. Written against the SAME property the box uses, so
		 * changing the padding moves the alignment with it instead of leaving a
		 * number behind that used to be right.
		 *
		 * CSS has no property for any of this. `text-box-trim` answers the same
		 * problem on the vertical axis and there is no horizontal equal.
		 */
		--highlight-pad: 0.11em;
		margin-left: calc(var(--title-optical) - var(--highlight-pad));
	}

	/*
	 * THE HIGHLIGHT. Solid accent, the way a real highlighter lays down ink, and
	 * the same thing a selection does on this site.
	 *
	 * There was a rule of accent around a wash of it, and this replaces both. A
	 * border is a frame and says "a box is here"; a highlighter says "read this",
	 * and leaves no edge behind. The second is what the title wanted.
	 *
	 * 0.11em of padding and not 0.08em. The border it replaces was 0.03em, and
	 * the yellow has to reach as far past the first letter as it did before —
	 * that overhang IS the stroke. In `em`, so it holds its proportion to the
	 * letters as --text-display moves between 40px and 72px.
	 *
	 * The padding is declared on the h1 above rather than here, because the
	 * alignment of the title has to subtract it and a value that two rules depend
	 * on should be written once.
	 */
	.highlight {
		background-color: var(--accent);
		color: var(--accent-fg);
		padding-inline: var(--highlight-pad);
	}

	/*
	 * The title wears the same yellow the selection does, so a selection over it
	 * would be a change of nothing at all. This inverts instead — the page's own
	 * foreground and background, swapped — which reads against yellow in either
	 * display mode and still says "these letters are caught".
	 *
	 * The padding stays yellow at each end, because a selection covers the TEXT
	 * and not the box around it. That is kept and not worked around: the two ends
	 * are what separate the mark from the title still lying under it.
	 */
	.highlight::selection {
		background-color: var(--fg);
		color: var(--bg);
	}

	.tagline {
		font-size: var(--text-tagline);
		font-style: italic;
		line-height: var(--leading-tight);
	}

	.prose {
		display: flex;
		flex-direction: column;
		gap: var(--space-m);

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
