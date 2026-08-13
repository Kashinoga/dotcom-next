<script lang="ts">
	import { page } from '$app/state';
	import Seo from '$lib/components/Seo.svelte';
</script>

<Seo title={String(page.status)} description="This page could not be found." />

<!--
	The status is the heading, so the page says what happened before it says
	anything else. The message under it comes from SvelteKit and is short; the
	link is the part that matters.
-->
<section>
	<h1>{page.status}</h1>
	<p>{page.error?.message ?? 'Something went wrong.'}</p>
	<p><a href="/">Back to the home page</a></p>
</section>

<style>
	section {
		display: flex;
		flex-direction: column;
		gap: var(--space-m);

		max-width: var(--measure);
		margin-inline: auto;
		padding: var(--space-2xl) var(--space-m);
	}

	h1 {
		font-size: var(--text-2xl);
		line-height: var(--leading-tight);
		letter-spacing: var(--tracking-tight);
	}
</style>
