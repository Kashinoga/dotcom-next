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

	// One deep import per icon, for the reason given in DisplayModeButton.
	import LayoutGrid from '@lucide/svelte/icons/layout-grid';

	import { page } from '$app/state';

	import DisplayModeButton from '$lib/components/DisplayModeButton.svelte';

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
		/* `flex-end` and not `right`, so the bar follows the writing direction of
		 * the document rather than assuming the world reads left to right. */
		justify-content: flex-end;
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

	/* The <nav> is a landmark and not a layout, so it must not add a line box of
	 * its own between the bar and the control inside it. */
	nav {
		display: flex;
	}
</style>
