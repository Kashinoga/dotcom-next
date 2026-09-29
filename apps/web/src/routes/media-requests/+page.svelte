<script lang="ts">
	import Letter from '$lib/components/Letter.svelte';
	import Seo from '$lib/components/Seo.svelte';

	/*
	 * The two Seerr instances on the home server. One Seerr serves one kind of
	 * media server, which is why there are two, and each has its own accounts.
	 */
	const servers = [
		{
			name: 'Plex',
			href: 'https://plex-requests.kashinoga.com',
			description: 'Sign in with your Plex account.',
		},
		{
			name: 'Jellyfin',
			href: 'https://jellyfin-requests.kashinoga.com',
			description: 'Sign in with your Jellyfin username and password.',
		},
	];
</script>

<Seo
	title="Media Requests"
	description="Ask for something to watch, on Plex or Jellyfin."
	path="/media-requests"
/>

<svelte:head>
	<!--
		INVITE ONLY, so there is nothing here for a search engine to send anyone
		to. requests.kashinoga.com redirects here; this page is not in the bar or
		the footer.
	-->
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<!--
	No `optical` is passed: the R of "Requests" has not been measured against the
	A of "Ask", so this title takes zero until somebody looks at it.
-->
<Letter
	title="Requests"
	tagline="Ask for something to watch."
	serif={['something to watch']}
>
	<p>Pick the server you watch on and sign in with the same account.</p>

	<ul class="servers">
		{#each servers as server (server.name)}
			<li class="server">
				<!-- The link is the name and not the whole card; see routes/apps. -->
				<h2><a href={server.href}>{server.name}</a></h2>
				<p>{server.description}</p>
			</li>
		{/each}
	</ul>

	<p class="note">
		Invite only. If you can't sign in, ask Andrew via DM or at
		<a href="mailto:contact@kashinoga.com">contact@kashinoga.com</a>.
	</p>
</Letter>

<style>
	/* The cards of routes/apps/+page.svelte, where every one here is built. */
	.servers {
		list-style: none;
		padding: 0;

		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(13rem, 1fr));
		gap: var(--space-12);
	}

	.server {
		position: relative;

		display: flex;
		flex-direction: column;
		gap: var(--space-4);

		padding: var(--space-16);
		border: 1px solid var(--edge);
		border-radius: var(--radius-l);
	}

	.server h2 {
		font-size: var(--text-body1);
		line-height: var(--leading-tight);
	}

	.server h2 a {
		color: inherit;
		text-decoration: none;
	}

	.server h2 a::after {
		content: '';
		position: absolute;
		inset: 0;
	}

	.server p {
		font-size: var(--text-label1);
	}

	.server:hover {
		background-color: var(--surface-hover);
	}

	.server:hover h2 a {
		text-decoration: underline;
	}

	.server:focus-within {
		outline: 2px solid var(--fg);
		outline-offset: 2px;
	}

	.server h2 a:focus-visible {
		outline: none;
	}

	.note {
		color: color-mix(in oklab, var(--fg) 60%, transparent);
	}
</style>
