<script lang="ts">
	import Letter from '$lib/components/Letter.svelte';
	import Seo from '$lib/components/Seo.svelte';
	import { apps } from '$lib/apps';
</script>

<Seo
	title="Apps"
	description="The apps made at this corner of the Internet, to be shared with you and your community."
	path="/apps"
/>

<!--
	THE APPS PAGE, and it is a promise rather than an index: none of these are
	built. The names and the words come from $lib/apps.ts, which says where they
	came from and why nothing here is a link.

	No `optical` is passed. The correction is a measurement of one letter against
	another and no one has measured the A of "Apps" against the M of "Making", so
	this title takes zero until somebody looks at it.
-->
<Letter title="Apps" tagline="Making data fun to use.">
	<p>A collection of apps that I've built for personal use, shared with you.</p>

	<!--
		A <ul> and not a stack of <div>s, because this IS a list and the count of
		it is worth announcing. Each card carries an <h2>, so the page can also be
		walked by heading.
	-->
	<ul class="apps">
		{#each apps as app (app.slug)}
			<li class="app" class:built={app.href}>
				<h2>
					<!--
						The LINK IS THE NAME, and not the whole card. A card-sized link
						reads its entire contents as the link text, so a screen reader
						announces the name and the description as one long name. The card
						still answers to a click through the ::after in the stylesheet.

						AN UNBUILT CARD SAYS SO IN WORDS as well as in grey. The grey is for
						the eye; a screen reader walking the headings would otherwise hear
						nine apps and have no way to know that one of them can be opened.
					-->
					{#if app.href}<a href={app.href}>{app.name}</a>{:else}{app.name}<span
							class="visually-hidden">, not built yet</span
						>{/if}
				</h2>
				<p>{app.description}</p>
			</li>
		{/each}
	</ul>
</Letter>

<style>
	/*
	 * `auto-fill` and a minimum in `rem`, so the number of columns is decided by
	 * how much room there is and not by a guess at a device. On a phone it is one
	 * column, and inside the 65ch measure it settles at two.
	 */
	.apps {
		list-style: none;
		padding: 0;

		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(13rem, 1fr));
		gap: var(--space-s);
	}

	/*
	 * A hairline and no radius. The corner is square because everything else on
	 * this site that draws a shape is square.
	 *
	 * The mix used to be written out here, with a note saying to promote it the
	 * moment a second rule wanted the same value. Two did — the search field's
	 * border and the ring around a hovered thing — so it is `--edge` now, and
	 * this reads it like the others.
	 */
	.app {
		display: flex;
		flex-direction: column;
		gap: var(--space-2xs);

		padding: var(--space-m);
		border: 1px solid var(--edge);
	}

	.app h2 {
		font-size: var(--text-m);
		line-height: var(--leading-tight);
	}

	.app p {
		font-size: var(--text-s);
	}

	/*
	 * NOT BUILT YET, AND IT LOOKS IT. The words step back to the site's dimmed
	 * text and the hairline to half of itself, so a card that leads nowhere reads
	 * as a placeholder before anybody points at it — rather than looking exactly
	 * like the card beside it and then failing to answer.
	 *
	 * NOTHING ANSWERS THE POINTER, and it is written down rather than left to the
	 * absence of a rule: `cursor: default` so the text cursor does not suggest
	 * there is something here to select into, and the selector names what this is
	 * so a hover added to `.app` later cannot reach it by accident.
	 */
	.app:not(.built) {
		color: color-mix(in oklab, var(--fg) 60%, transparent);
		border-color: color-mix(in oklab, var(--fg) 8%, transparent);
		cursor: default;
	}

	.app:not(.built):hover {
		background-color: transparent;
	}

	/*
	 * A BUILT app's whole card is pressable, without the card being a link. The
	 * ::after is a transparent sheet stretched over the card from the anchor
	 * inside it, so a pointer can hit anywhere while the accessible name stays
	 * just the app's name. `position: relative` on the card is what it measures
	 * itself against.
	 */
	.built {
		position: relative;
	}

	.built h2 a {
		color: inherit;
		text-decoration: none;
	}

	.built h2 a::after {
		content: '';
		position: absolute;
		inset: 0;
	}

	/* The card answers the pointer, so it has to look like it will. The name takes
	 * its underline back at the same moment, for anyone who cannot see the wash. */
	.built:hover {
		background-color: var(--surface-hover);
	}

	.built:hover h2 a {
		text-decoration: underline;
	}

	/* The ring belongs on the CARD and not on the name, because the card is what
	 * the pointer gets. `:focus-within` puts it there when the name is tabbed to. */
	.built:focus-within {
		outline: 2px solid var(--fg);
		outline-offset: 2px;
	}

	.built h2 a:focus-visible {
		outline: none;
	}
</style>
