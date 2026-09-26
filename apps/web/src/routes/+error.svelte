<script lang="ts">
	import { page } from '$app/state';
	import Letter from '$lib/components/Letter.svelte';
	import Seo from '$lib/components/Seo.svelte';
</script>

<Seo title={String(page.status)} description="This page could not be found." />

<!--
	A letter like every other page, so it lies on the same sheet. The status is
	the title and SvelteKit's short message the tagline; the link is the part
	that matters.
-->
<Letter
	title={String(page.status)}
	tagline={page.error?.message ?? 'Something went wrong.'}
>
	<p><a href="/">Back to the home page</a></p>
</Letter>
