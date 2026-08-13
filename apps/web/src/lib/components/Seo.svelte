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
		icon = '',
	}: {
		title?: string;
		description?: string;
		path?: string;
		/*
		 * A MARK OF THIS PAGE'S OWN, as a path under `static`. Empty means the
		 * site's, which is the one already declared in app.html — so a page says
		 * nothing here unless it has something else to be.
		 */
		icon?: string;
	} = $props();

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

	{#if icon}
		<!--
			THIS PAGE'S OWN MARK, and it does not remove the site's — it comes after
			it. Where two icons are declared with the same type, a browser takes the
			LAST, and `%sveltekit.head%` is rendered below the link in app.html. So
			the site's mark stays the floor for every page that asks for nothing,
			and no page can lose its icon by forgetting to name one.
		-->
		<link rel="icon" href={icon} type="image/svg+xml" />
	{/if}
</svelte:head>
