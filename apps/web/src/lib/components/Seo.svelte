<script lang="ts">
	import { site } from '$lib/site';

	/*
	 * The head of one page. `title` is the page's own name and the site's name is
	 * added to it; the home page passes nothing and gets the site title alone.
	 */
	let {
		title = '',
		description = site.description,
		path = '/',
	}: { title?: string; description?: string; path?: string } = $props();

	const full = $derived(title ? `${title} — ${site.name}` : site.title);
	const url = $derived(new URL(path, site.url).href);
</script>

<svelte:head>
	<title>{full}</title>
	<meta name="description" content={description} />
	<link rel="canonical" href={url} />

	<!-- What a link to this page looks like when somebody shares it. There is no
	     `og:image` yet: it wants a real 1200×630 file, and inventing one here
	     would only put a broken URL in front of a reader. -->
	<meta property="og:site_name" content={site.name} />
	<meta property="og:type" content="website" />
	<meta property="og:title" content={full} />
	<meta property="og:description" content={description} />
	<meta property="og:url" content={url} />
	<meta name="twitter:card" content="summary" />
</svelte:head>
