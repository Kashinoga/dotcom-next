<svelte:head>
	<title>Kashinoga — So Alive, No Disguise</title>
	<meta
		name="description"
		content="The corner of the Internet of Andrew Nguyen. Things made to be shared, for a better digital well-being."
	/>
</svelte:head>

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
		<h1>Kashinoga</h1>
		<p class="tagline">So Alive, No Disguise</p>
	</div>

	<div class="prose">
		<p>Hi, my name is Andrew Nguyen.</p>

		<p>
			This is my corner of the Internet. Here, you'll find the things that I've created. These
			things are meant to be shared with you and your community for a better digital well-being.
		</p>

		<p>
			I hope that you find that these things are indeed helpful, and if so, please do share them
			with your friends!
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
		 * OPTICAL ALIGNMENT, and the reason this number is not round.
		 *
		 * Every glyph carries built-in space to its LEFT — its side bearing — and
		 * that space is part of the letter, so it grows with the font size. The
		 * box of this title and the box of the tagline start at the same x, and
		 * the letters do not: measured in the browser, Inter's bold K at 72px
		 * carries 3px of bearing and its regular S at 32px carries 1px. The eye
		 * sees the ink, so it sees the title indented by 2px.
		 *
		 * 2px at 72px is 0.028em, and `em` is what makes this hold: --text-display
		 * is fluid, so a pixel value would be right at one window width and wrong
		 * at every other.
		 *
		 * CSS has no property for this. `text-box-trim` answers the same problem
		 * on the vertical axis and there is no horizontal equal.
		 *
		 * THIS FIGURE BELONGS TO INTER. It was -0.07em while the site used
		 * `system-ui`, because that resolved to Noto Sans here and Noto's K
		 * carries twice the bearing. That is the hidden cost of a system font,
		 * and paying a self-hosted file is what makes one measurement true on
		 * every machine. Measure again if the typeface ever changes.
		 */
		margin-left: -0.028em;
	}

	.tagline {
		font-size: var(--text-tagline);
		line-height: var(--leading-tight);
	}

	.prose {
		display: flex;
		flex-direction: column;
		gap: var(--space-m);
	}
</style>
