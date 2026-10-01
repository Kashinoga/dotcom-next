<script lang="ts">
	import Letter from '$lib/components/Letter.svelte';
	import Seo from '$lib/components/Seo.svelte';
</script>

<Seo
	title="Trip Planner"
	description="A trip, planned together: the days, the places, and the miles between them."
	path="/trip-planner"
/>

<!--
	THE PAGE ABOUT IT, and the only one here anybody can open. Each trip lives
	under it at an address of its own, which is shared with the people on the
	trip and nobody else, so nothing here lists or links to one.
-->
<Letter
	title="Trip Planner"
	tagline="The days, the places, and the miles between them."
	serif={['days', 'places', 'miles']}
>
	<p>
		A trip, planned together. The days and what is on them, the ideas still
		waiting for a day, and how far each place is from where you are staying,
		kept in one spot for you and your group, and saved for everyone as anybody
		changes it.
	</p>
	<p>
		Each trip has an address of its own and a passcode shared among the people
		on it, so there is nothing to sign up for. If you were sent a link, that is
		the way in. I hope that the trip is a good one.
	</p>
	<p>Take care.</p>
</Letter>
