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

	import DisplayModeButton from '$lib/components/DisplayModeButton.svelte';

	let { children } = $props();
</script>

<!--
	<header> and <main> are landmarks, so a screen reader can jump between them.
	The button is chrome and belongs to the site, so it sits outside the content.

	One control stands in front of the content today, which is one press of Tab.
	A skip link earns its place when navigation lands here, and not before.
-->
<header>
	<DisplayModeButton />
</header>

<main>
	{@render children()}
</main>

<style>
	header {
		display: flex;
		/* `flex-end` and not `right`, so the bar follows the writing direction of
		 * the document rather than assuming the world reads left to right. */
		justify-content: flex-end;
		padding: var(--space-m);
	}
</style>
