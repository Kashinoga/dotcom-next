<script lang="ts">
	/*
	 * Inter, hosted by this site and not by anybody else. The package holds the
	 * woff2 files and Vite bundles them with hashed names, so they come from this
	 * origin: no CDN learns who reads this site, and nothing waits on a server we
	 * do not own.
	 *
	 * `opsz` is the cut with the optical size axis as well as weight. The italic
	 * file is declared beside it and fetched only if a page sets italic text —
	 * without it a browser slants the upright letters, which is not the same
	 * thing and looks it.
	 */
	import '@fontsource-variable/inter/opsz.css';
	import '@fontsource-variable/inter/opsz-italic.css';

	// The reset and the display-mode tokens, in front of every page.
	import '../app.css';

	/*
	 * One deep import per icon, for the reason given in DisplayModeButton.
	 *
	 * `heart-handshake` is the SITE MARK, the same drawing as static/favicon.svg
	 * — and it is imported here rather than pointed at that file on purpose. The
	 * favicon carries CSS answering `prefers-color-scheme`, because a browser tab
	 * is painted in the SYSTEM's colours. In the page that rule is wrong: a
	 * visitor reading in light while their machine is set to dark would get a
	 * white mark on a white bar. As a component it inherits `currentColor` and so
	 * follows this site's display mode, which is the thing it sits on.
	 */
	import HeartHandshake from '@lucide/svelte/icons/heart-handshake';
	import LayoutGrid from '@lucide/svelte/icons/layout-grid';

	import { page } from '$app/state';

	import DisplayModeButton from '$lib/components/DisplayModeButton.svelte';
	import { site } from '$lib/site';

	let { children } = $props();

	// `startsWith` and not `===`, so /apps/star-map still counts as being in Apps
	// once those pages exist.
	const onApps = $derived(page.url.pathname.startsWith('/apps'));
</script>

<!--
	<header> and <main> are landmarks, so a screen reader can jump between them.
	The bar is chrome and belongs to the site, so it sits outside the content.

	The link is inside a <nav> and the button is not. One navigates and the other
	changes a setting, and a screen reader offering "navigation" should find only
	the first inside it.

	THE LINK IS A TOGGLE and not a destination: pressing it on Apps comes back
	here. So it carries no `aria-current`, which would be a lie — that attribute
	marks the link POINTING AT the page you are on, and this one points away from
	it. The state is in `data-open`, which the stylesheet fills with the accent,
	and in the name, which says both where you are and what pressing does. The
	icon does not change, because the icon is which control this is and the fill
	is whether it is open.

	Two controls stand in front of the content, which is two presses of Tab. A
	skip link earns its place when that number grows, and not yet.
-->
<header>
	<!--
		THE MARK AND THE NAME, and they are ONE link rather than two beside each
		other. Two would be two tab stops and two announcements to the same place.

		The mark is hidden from the reading: the word next to it already names the
		link, and "heart handshake Kashinoga" is not what anybody wants read out.
		The name is therefore the accessible name, and it comes from $lib/site so
		the bar and the title cannot end up spelling it differently.
	-->
	<a
		class="brand"
		href="/"
		aria-current={page.url.pathname === '/' ? 'page' : undefined}
	>
		<span class="mark" aria-hidden="true"><HeartHandshake /></span>
		{site.name}
	</a>

	<nav aria-label="Site">
		<a
			class="control"
			href={onApps ? '/' : '/apps'}
			data-open={onApps || undefined}
			title={onApps ? 'Apps — back to the home page' : 'Apps'}
			aria-label={onApps ? 'Apps, open. Go back to the home page.' : 'Apps'}
		>
			<LayoutGrid />
		</a>
	</nav>

	<DisplayModeButton />
</header>

<main>
	{@render children()}
</main>

<style>
	header {
		display: flex;
		align-items: center;
		gap: var(--space-2xs);
		padding: var(--space-m);

		/* Asserted, not left to add up. --bar-block-size is this same sum, and the
		 * page and the emoji TOC both measure themselves against it — so the bar
		 * states the number rather than happening to reach it. */
		block-size: var(--bar-block-size);

		/*
		 * STICKY, so the controls are reachable from anywhere in a long page
		 * without a journey back to the top.
		 *
		 * `sticky` and not `fixed`. A fixed bar leaves the flow, and the first
		 * line of every page would then start underneath it; this one holds its
		 * place until the page scrolls out from under it, and nothing has to be
		 * pushed down to make room.
		 *
		 * `inset-block-start` and not `top`, for the same reason `flex-end` is not
		 * `right`.
		 *
		 * The background is NOT decoration. Without it the letter would scroll
		 * through the icons and the two would be read together. This opaque one is
		 * the floor: the frost below replaces it where a browser can draw frost,
		 * and where it cannot the bar stays solid and the words stay readable.
		 *
		 * `z-index` because the rule beside the prose is positioned too, and comes
		 * later in the document. Positioned things with no z-index paint in
		 * document order, so without this the yellow line would slide over the
		 * bar rather than under it.
		 */
		position: sticky;
		inset-block-start: 0;
		z-index: 1;
		background-color: var(--bg);
	}

	/*
	 * THE FROST. The letter goes soft as it passes under the bar rather than
	 * being cut off by it, which will matter more once a page of apps is long
	 * enough to scroll a long way.
	 *
	 * NO JAVASCRIPT, and no `.scrolled` class to turn this on. The frost is
	 * always on and it does not need to be switched, because at the top of the
	 * page the only thing behind the bar IS the page: blurring one flat colour
	 * returns that colour, and half of --bg over --bg is --bg. The bar is
	 * therefore already invisible at rest, and reveals itself by having
	 * something to hide. A bar that has to be told when it has been scrolled
	 * under needs a listener, a measured height and a piece of state; this one
	 * needs a declaration.
	 *
	 * 50% and not the 78% the first site uses. More of what passes underneath
	 * survives the crossing, so the frost reads as glass rather than as a lid —
	 * which is the point of having it at all, and matters more the longer the
	 * page gets.
	 *
	 * Behind `@supports`, and this is the whole reason the rule is split out. A
	 * browser without `backdrop-filter` would take the 50% and skip the blur,
	 * and the letter would then read straight through the icons — worse than no
	 * frost at all. Without support the opaque floor above stands.
	 */
	@supports (backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px)) {
		header {
			background-color: color-mix(in oklab, var(--bg) 50%, transparent);
			-webkit-backdrop-filter: blur(8px);
			backdrop-filter: blur(8px);
		}
	}

	/*
	 * THE MARK AND THE NAME, on one line and centred against each other. The
	 * `align-items: center` is what does that: the two are flex items in the same
	 * row, so their centres are put on the same axis whatever either one's height
	 * turns out to be. `line-height: 1` makes the word's box the height of its
	 * letters rather than a leaded line, so the centre being matched is the
	 * centre of the WORD and not of the space around it.
	 *
	 * `block-size` gives the pair a 44px target even though the word is 16px
	 * tall, which is the smallest a finger hits reliably — the same measure every
	 * other control in this bar takes.
	 */
	.brand {
		display: inline-flex;
		align-items: center;
		gap: var(--space-xs);

		block-size: var(--control-block-size);
		font-size: var(--text-m);
		font-weight: 600;
		line-height: 1;
		color: inherit;
		text-decoration: none;

		/*
		 * THE WASH NEEDS ROOM, and the mark must not move to give it any. The
		 * padding opens the box out; the negative margin takes exactly that back
		 * off the start edge, so the drawing still begins on the bar's own 16px
		 * line and only the highlight reaches further out.
		 *
		 * `--radius-round` draws a PILL here and a circle on the controls, from
		 * one value — see the note beside the token. That is the shape a wash
		 * around a word wants.
		 */
		padding-inline: var(--space-xs);
		margin-inline-start: calc(-1 * var(--space-xs));
		border-radius: var(--radius-round);
	}

	/* The same wash the circular controls take, so everything in the bar answers
	 * a pointer the same way. */
	.brand:hover {
		background-color: var(--surface-hover);
	}

	.brand:focus-visible {
		outline: 2px solid var(--fg);
		outline-offset: 2px;
	}

	.mark {
		display: inline-flex;
	}

	/* `:global`, because the drawing comes from a component of its own and
	 * Svelte's scoping does not reach into one. In rem, so the mark grows with
	 * the word when a visitor sets a larger text size. */
	.mark :global(svg) {
		inline-size: 1.25rem;
		block-size: 1.25rem;
	}

	/*
	 * The <nav> is a landmark and not a layout, so it must not add a line box of
	 * its own between the bar and the control inside it.
	 *
	 * `margin-inline-start: auto` is what splits the bar: the mark stays at the
	 * start edge and everything from here on is pushed to the end. Logical, so it
	 * follows the writing direction rather than assuming the world reads left to
	 * right — which is what the `flex-end` it replaced was for.
	 */
	nav {
		display: flex;
		margin-inline-start: auto;
	}
</style>
