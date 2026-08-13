<script lang="ts">
	import Seo from '$lib/components/Seo.svelte';
</script>

<!-- No title given, so this page takes the site's own. -->
<Seo />

<!--
	THE HERO, and at the moment the whole page.

	The tagline is a <p> and not an <h2>, though the note it came from writes it
	as one. A heading opens a SECTION, and this opens nothing: a visitor moving
	through the page by heading would be sent into a section that does not exist.
	It reads as a heading because of its size, which is a matter for the
	stylesheet and not for the markup.

	The signoff uses <br> rather than two paragraphs, because "Take care," and the
	name are one closing and not two thoughts.
-->
<section class="hero">
	<div class="masthead">
		<!--
			A <span> and NOT a <mark>, which is what this started as. <mark> means
			"relevant to what the reader is doing right now" — a search hit, the
			passage under discussion — and a name is not that. Some screen readers
			announce "highlight" around it, which would put a word with no meaning
			into the reading of the title. The highlight here is decoration, and
			decoration belongs in an element that claims nothing.
		-->
		<h1><span class="highlight">Kashinoga</span></h1>
		<p class="tagline">So Alive, No Disguise</p>
	</div>

	<div class="prose">
		<!--
			An em dash, and not the two hyphens a keyboard offers. `--` is what a
			typewriter did when it had no dash key. A browser has the character, so
			it should print it.
		-->
		<p>Hi, my name is Andrew Nguyen — aka Kashinoga.</p>

		<p>
			This is my corner of the Internet. Here, you'll find the things that I've
			created. These things are meant to be shared with you and your community
			for a better digital well-being.
		</p>

		<p>
			I hope that you find that these things are indeed helpful, and if so,
			please do share them with your friends!
		</p>

		<p>
			If you have any questions, comments, or concerns, please contact me at
			<a href="mailto:contact@kashinoga.com">contact@kashinoga.com</a>.
		</p>

		<p>
			Take care,<br />
			Andrew Nguyen
		</p>
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
		 * last, and the WORDS stay where the words were. So the K meets the S of
		 * the tagline, and the yellow runs out past both — which is the whole
		 * effect: a real stroke, drawn by a machine that never wobbles.
		 *
		 * -0.028em is the old correction, and it is still doing the same job: the K
		 * carries 3px of side bearing at 72px against the tagline's 1px, so the
		 * title has to come left by the 2px difference to sit level.
		 *
		 * The box then adds its own padding in front of the K, and the calc takes it
		 * back. Written against the SAME property the box uses, so changing the
		 * padding moves the alignment with it instead of leaving a number behind
		 * that used to be right.
		 *
		 * CSS has no property for any of this. `text-box-trim` answers the same
		 * problem on the vertical axis and there is no horizontal equal.
		 */
		--highlight-pad: 0.11em;
		margin-left: calc(-0.028em - var(--highlight-pad));
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
	 * the yellow has to reach as far past the K as it did before — that overhang
	 * IS the stroke. In `em`, so it holds its proportion to the letters as
	 * --text-display moves between 40px and 72px.
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
	 * The title now wears the same yellow the selection does, so a selection over
	 * it would be a change of nothing at all. This inverts instead — the page's
	 * own foreground and background, swapped — which reads against yellow in
	 * either display mode and still says "these letters are caught".
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
	}
</style>
