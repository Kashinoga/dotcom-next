<script lang="ts">
	/*
	 * CONNECTING A DRIVE — the small amount somebody has to say once.
	 *
	 * A COMPONENT AND NOT PART OF THE RAIL, because it is a form and the rail is a
	 * list. It is also the only place on this site that asks anybody for a
	 * password, which is a good reason for it to be one file somebody can read end
	 * to end.
	 *
	 * IT PROBES BEFORE IT COMMITS. Nothing is remembered until one PROPFIND has
	 * come back 207 — a drive that is written down and does not work is worse than
	 * no drive, because it looks like it should work every time it is opened.
	 */
	import { onDestroy, tick } from 'svelte';

	import ChevronRight from '@lucide/svelte/icons/chevron-right';

	import { folders, type DavConfig } from '$lib/dav';
	import { driveId, toOrigin, type Drive } from '$lib/drives';
	import {
		pollOnce,
		POLL_EVERY_MS,
		POLL_FOR_MS,
		POLL_SLOWLY_MS,
		startLogin,
	} from '$lib/login';

	let {
		onconnect,
		oncancel,
	}: {
		onconnect: (drive: Drive, token: string) => void;
		oncancel: () => void;
	} = $props();

	let server = $state('');
	let user = $state('');
	let token = $state('');
	/*
	 * RELAYED IS THE DEFAULT, because it is the one that works without asking
	 * anything of whoever runs the server — and the form says plainly what it
	 * costs, which is that the password and the documents pass through this site.
	 */
	let via = $state<'direct' | 'proxy'>('proxy');
	let keep = $state(true);

	let trying = $state(false);
	let said = $state<string | null>(null);

	/*
	 * SIGNING IN ON THEIR OWN SERVER. Only offered where the requests are certain
	 * to work — see the head of $lib/login.ts for why that is the relayed mode and
	 * only the relayed mode, and why direct mode keeping the paste is the right
	 * answer rather than a gap.
	 */
	let waitingOnGrant = $state(false);

	/* The poll has to stop when this form goes, or it keeps asking a server about a
	 * login nobody is completing until the deadline runs out. */
	let live = true;
	onDestroy(() => {
		live = false;
	});

	const sleep = (ms: number) =>
		new Promise((resolve) => setTimeout(resolve, ms));

	async function signIn() {
		if (!origin) return;

		waitingOnGrant = true;
		said = null;

		const flow = await startLogin(origin);
		if (!flow) {
			waitingOnGrant = false;
			said =
				'That server would not start a sign-in. Check the address, or paste an app password instead.';
			return;
		}

		/*
		 * OPENED FROM THE PRESS, so a browser lets it through. A blocked pop-up is
		 * the one failure that would otherwise leave this polling for five minutes
		 * on a page nobody has been sent to, so it is said rather than waited out.
		 *
		 * NOT `noopener` IN THE FEATURES, and that is the whole reason this works.
		 * `window.open` with `noopener` returns NULL BY SPEC — the browser disowns
		 * the window and so has no reference to give back — so the check below read
		 * every successful open as a blocked one. The tab opened, somebody signed in
		 * and granted it, and nothing here ever polled.
		 *
		 * The window is disowned on the next line instead, which is the same
		 * protection reached the other way round: it cannot reach back through
		 * `window.opener` and navigate this page out from under a form that is
		 * holding an app password.
		 */
		const tab = window.open(flow.login, '_blank');
		if (!tab) {
			waitingOnGrant = false;
			said =
				'The sign-in page was blocked from opening. Allow pop-ups for this site, or paste an app password instead.';
			return;
		}
		tab.opener = null;

		const until = Date.now() + POLL_FOR_MS;
		/* Slowed the first time the server asks for it, and never sped up again: it
		 * counts every ask, so returning to the fast rate spends the allowance it
		 * has just been asked to stop spending. */
		let every = POLL_EVERY_MS;

		while (live && Date.now() < until) {
			await sleep(every);
			if (!live) return;

			const answer = await pollOnce(flow);

			if (answer.state === 'pending') {
				if (answer.status === 429) every = POLL_SLOWLY_MS;
				continue;
			}

			waitingOnGrant = false;

			if (answer.state === 'failed') {
				/*
				 * THE STATUS IS IN THE SENTENCE. "That sign-in did not finish" was true
				 * of every way this can fail and told nobody anything — including the
				 * case where somebody DID finish it and the server answered in a way
				 * this did not expect, which is exactly when a person needs to know
				 * what was said rather than what was concluded.
				 */
				said = answer.status
					? `That server answered the sign-in with ${answer.status}, and handed over no app password. Paste one instead, or try again.`
					: 'That sign-in did not finish.';
				return;
			}

			/* What comes back IS the credential, so the form is filled in with it and
			 * the ordinary path takes over — Next still tries it before anything is
			 * remembered, because a granted password and a reachable workspace are two
			 * different claims. */
			user = answer.granted.user;
			token = answer.granted.token;
			byHand = true;
			await next();
			return;
		}

		if (live) {
			waitingOnGrant = false;
			said = 'That sign-in was not granted in time.';
		}
	}

	const origin = $derived(toOrigin(server));

	/* This site's own address, which is what a server allowing it is told. */
	const thisSite =
		typeof location === 'undefined' ? 'this site' : location.origin;
	const ready = $derived(
		!!origin && !!user.trim() && !!token.trim() && !trying,
	);

	/*
	 * TWO STEPS, in the order each thing depends on the last. The first is the
	 * server, the way to it and who is signing in; NEXT is where that is tried,
	 * because the folders cannot be listed until it works. The second is the
	 * folder, chosen from the drive rather than typed from memory, and Connect.
	 */
	let step = $state<1 | 2>(1);
	let heading = $state<HTMLElement | null>(null);

	/*
	 * THE OTHER WAYS — an app password by hand, and the direct route — are
	 * folded away, since signing in is what most people want. A sign-in that
	 * fills the password in, or fails, opens them.
	 */
	let byHand = $state(false);

	/* Where the folder list is, from the top of their files. '' is all of it. */
	let browsing = $state('');
	let inside = $state<string[] | null>(null);
	const where = $derived(browsing ? browsing.split('/') : []);
	const here = $derived(where.at(-1) ?? null);

	function config(at: string): DavConfig | null {
		if (!origin) return null;
		return {
			connection: driveId(origin, user.trim(), at),
			base: origin,
			user: user.trim(),
			token: token.trim(),
			via,
			root: at,
			name: at.split('/').pop() || new URL(origin).hostname,
		};
	}

	/* What each answer means, in the words somebody filling in a form needs — which
	 * are not the words a row needs. See `Probe`. */
	const wording: Record<string, string> = {
		refused: 'That user and app password were not accepted.',
		'no-such-user':
			'That user has no files on that server. Check the username.',
		blocked:
			'The browser could not reach that server. In Direct mode the usual cause is that it does not allow this site — try Through this site.',
		failed: 'That server answered, but not in a way this understands.',
	};

	/* The heading of the step that has just come up, so a keyboard and a reader
	 * both start at its top rather than on a button that has gone. */
	async function show(next: 1 | 2) {
		step = next;
		said = null;
		await tick();
		heading?.focus();
	}

	/* A sign-in that did not work leaves the paste open, as the way that does. */
	async function signInHere() {
		await signIn();
		if (said) byHand = true;
	}

	/*
	 * TRY IT, by listing the top of the drive: one request that says whether the
	 * server, the way to it and the password all work, and hands over the first
	 * page of step two while it is at it. Nothing is remembered yet.
	 */
	async function next() {
		const cfg = config('');
		if (!cfg || !ready) return;

		trying = true;
		said = null;
		const answer = await folders(cfg, '');
		trying = false;

		if (!Array.isArray(answer)) {
			said = wording[answer] ?? wording.failed;
			return;
		}
		browsing = '';
		inside = answer;
		await show(2);
	}

	async function look(at: string) {
		const cfg = config(at);
		if (!cfg) return;

		browsing = at;
		inside = null;
		said = null;

		const answer = await folders(cfg, at);
		/* Moved on while that was in flight. */
		if (browsing !== at) return;

		if (Array.isArray(answer)) inside = answer;
		else said = wording[answer] ?? wording.failed;
	}

	/*
	 * CONNECT, with no second probe: the folder being connected is the one whose
	 * list is on the screen, so it has just answered.
	 */
	function connect() {
		const cfg = config(browsing);
		if (!cfg) return;

		onconnect(
			{
				id: cfg.connection,
				name: cfg.name,
				base: cfg.base,
				user: cfg.user,
				via,
				root: browsing,
				keep,
			},
			cfg.token,
		);
	}

	function submit(event: SubmitEvent) {
		event.preventDefault();
		if (step === 1) void next();
		else if (inside !== null) connect();
	}
</script>

<!--
	THE APP PASSWORD, AND THE LABEL SAYS SO. Nextcloud's are per-device and
	revocable, and that list is the control somebody actually has over this — so
	the form asks for one by name rather than for "your password", which is the
	thing it must never be given.
-->
{#snippet credentials()}
	<p class="quiet">
		You can make an app password in your server's security settings.
	</p>
	<label>
		<span>User</span>
		<input
			bind:value={user}
			type="text"
			autocomplete="username"
			autocapitalize="off"
			spellcheck="false"
			required
		/>
	</label>

	<label>
		<span>App password</span>
		<input
			bind:value={token}
			type="password"
			autocomplete="off"
			spellcheck="false"
			required
		/>
	</label>
{/snippet}

<form class="connect" onsubmit={submit}>
	<!-- A div and not a <header>: the site's bar styles every header it sees. -->
	<div class="top">
		<h3 bind:this={heading} tabindex="-1">
			{step === 1 ? 'Connect a drive' : 'Choose a folder'}
		</h3>
		<p class="quiet">Step {step} of 2</p>
	</div>

	{#if step === 1}
		<!-- What can be connected, before anybody is asked for an address. -->
		<p class="intro">Open a folder from a Nextcloud or ownCloud server.</p>

		<label>
			<span>Server</span>
			<input
				bind:value={server}
				type="text"
				inputmode="url"
				autocomplete="off"
				autocapitalize="off"
				spellcheck="false"
				placeholder="cloud.example.com"
				required
			/>
		</label>

		<!--
			SIGNING IN IS THE WAY, and the only thing on this step most people need.
			The password is never typed here: they log in on their own server, with
			their own second factor, and what arrives is an app password named for this
			app and revocable like any other. It goes through this site because the
			login requests have to — see $lib/login.ts — so it is not offered when
			somebody has chosen the direct way below.
		-->
		{#if via === 'proxy'}
			<div class="signin">
				<button
					type="button"
					class="primary"
					onclick={signInHere}
					disabled={!origin || waitingOnGrant || trying}
				>
					{waitingOnGrant ? 'Waiting for your server…' : 'Sign in'}
				</button>
				<!-- Said only while there is a tab somewhere else to finish in. -->
				{#if waitingOnGrant}
					<p class="quiet">
						Finish signing in on the tab that opened. This form fills itself in
						when your server allows it.
					</p>
				{/if}
			</div>
		{/if}

		<!--
			THE FOLDS, set apart from the sign-in as one quieter group: they are
			for the few, and close together so they read as the small print.
		-->
		<div class="folds">
			<!--
				EVERYTHING ELSE, folded: an app password made by hand, and which way the
				requests go. They belong together — the direct way cannot sign in, so it
				always needs the paste — and whoever opens this is who can make the choice.

				WHICH WAY is a choice rather than something this works out. There is no
				fallback between the two and there must never be one: a blocked preflight
				is indistinguishable from a dead network, so guessing would be guessing
				about where a password goes. See `via` in $lib/dav.
			-->
			<details class="by-hand" bind:open={byHand}>
				<summary>
					<ChevronRight aria-hidden="true" />
					Other ways to connect
				</summary>
				<div class="fields">
					{@render credentials()}

					<fieldset class="via">
						<legend>How to reach it</legend>
						<div class="options">
							<label class="choice">
								<input type="radio" bind:group={via} value="proxy" />
								<span>Through this site</span>
							</label>
							<label class="choice">
								<input type="radio" bind:group={via} value="direct" />
								<span>Straight to the server</span>
							</label>
						</div>
						<!--
							WHERE TO SET IT UP, as a link and not as steps: the pages it leads
							to are the servers' own, and theirs to change. The address is this
							site's own, since that is what the server has to be told.
						-->
						{#if via === 'proxy'}
							<p class="quiet">Works with any server.</p>
							<!-- HTTPS both ways is the relay's own rule; see $lib/relay. -->
							<p class="quiet">
								Your app password and files pass through this site's server each
								time. The connection is encrypted on both sides of it, and
								nothing is kept, but you are trusting this site with them on the
								way.
							</p>
						{:else}
							<p class="quiet">
								Only works if your server allows this site, <code
									>{thisSite}</code
								>. On Nextcloud that takes the
								<a
									href="https://apps.nextcloud.com/apps/webapppassword"
									target="_blank"
									rel="noopener noreferrer">WebAppPassword app</a
								>; on ownCloud, see its
								<a
									href="https://doc.owncloud.com/server/11.0/classic_ui/personal_settings/security.html#cors-white-listed-domains"
									target="_blank"
									rel="noopener noreferrer">CORS settings</a
								>. Signing in is not offered this way.
							</p>
							<p class="quiet">
								Your app password and files go only between your browser and
								your server, and this site never sees them. Allowing this site
								only lets it ask your server for things from your browser, and
								without your app password your server still says no.
							</p>
						{/if}
					</fieldset>
				</div>
			</details>

			<!--
				THE LONGER ANSWER, folded under the short one. The notes above say what
				each choice means for somebody; this says how, for somebody who wants to
				know before handing over a password. No steps on the server's own pages:
				those are the server's to change.
			-->
			<details class="more">
				<summary>
					<ChevronRight aria-hidden="true" />
					How this works
				</summary>
				<div class="fields">
					<p class="quiet">
						<strong>Through this site.</strong> A browser can only reach a server
						that allows this site, and most do not. So this site's server makes the
						requests for you and passes the answers back. Your files and app password
						go through it on the way, and nothing is kept.
					</p>
					<p class="quiet">
						<strong>Straight to the server.</strong> Your browser makes the requests
						itself, and nothing goes through this site. The server has to allow requests
						from this site (CORS), which usually means whoever runs it turning that
						on.
					</p>
					<p class="quiet">
						<strong>Signing in</strong> uses your server's own sign-in page, with
						two-factor if you use it. Your server then makes an app password just
						for this site. You can see and revoke it in your server's security settings,
						as you can one you make yourself.
					</p>
				</div>
			</details>
		</div>
	{:else}
		<!-- Who and where, and the way back to change it. -->
		<p class="who">
			<span>{user.trim()} at {origin ? new URL(origin).hostname : server}</span>
			<button type="button" class="link" onclick={() => show(1)}>Change</button>
		</p>

		<div class="browse" role="group" aria-label="Folders on the drive">
			<!-- Where it is, each step back up a press away. -->
			<nav class="steps" aria-label="Where">
				<button
					type="button"
					aria-current={browsing === '' ? 'location' : undefined}
					onclick={() => look('')}
				>
					All files
				</button>
				{#each where as name, i (i)}
					<span aria-hidden="true">/</span>
					<button
						type="button"
						aria-current={i === where.length - 1 ? 'location' : undefined}
						onclick={() => look(where.slice(0, i + 1).join('/'))}
					>
						{name}
					</button>
				{/each}
			</nav>

			{#if inside === null}
				<p class="quiet">Reading it.</p>
			{:else if inside.length}
				<ul>
					{#each inside as name (name)}
						<li>
							<button
								type="button"
								onclick={() => look(browsing ? `${browsing}/${name}` : name)}
							>
								<span>{name}</span>
								<ChevronRight aria-hidden="true" />
							</button>
						</li>
					{/each}
				</ul>
			{:else}
				<p class="quiet">No folders in here.</p>
			{/if}
		</div>

		<label class="choice">
			<input type="checkbox" bind:checked={keep} />
			<span>Keep the app password in this browser, so it opens next visit.</span
			>
		</label>
	{/if}

	{#if said}
		<p class="said" role="alert">{said}</p>
	{/if}

	<!-- The way out first and the way on last, where the eye ends up. -->
	<div class="keys">
		{#if step === 1}
			<button type="button" onclick={oncancel}>Cancel</button>
			<!-- Signing in moves on by itself; Next is for the paste. -->
			{#if byHand}
				<button type="submit" disabled={!ready}>
					{trying ? 'Trying it…' : 'Next'}
				</button>
			{/if}
		{:else}
			<button type="button" onclick={() => show(1)}>Back</button>
			<button type="submit" disabled={inside === null}>
				{here ? `Connect to ${here}` : 'Connect to the whole drive'}
			</button>
		{/if}
	</div>
</form>

<style>
	/*
	 * A FORM ON THE DESK, not in the rail. It is wider than a 12rem column and it
	 * is a thing somebody does once, so it takes the room the document usually has
	 * and gives it straight back.
	 */
	.connect {
		display: flex;
		flex-direction: column;
		gap: var(--space-16);

		max-inline-size: 28rem;
		padding: var(--space-16);
		border-radius: var(--radius-l);
		background-color: var(--bg);
	}

	.top {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--space-8);
	}

	h3 {
		font-size: var(--text-body1);
		line-height: var(--leading-tight);
	}

	/* Focused by script when a step comes up, and not a control: no ring. */
	h3:focus {
		outline: none;
	}

	label {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);

		font-size: var(--text-label1);
		line-height: var(--leading-tight);
	}

	label > span {
		color: color-mix(in oklab, var(--fg) 60%, transparent);
	}

	input[type='text'],
	input[type='password'] {
		block-size: var(--control-block-size);
		padding-inline: var(--space-8);
		border: 1px solid var(--edge);
		border-radius: var(--radius-s);
		background: none;
		color: inherit;
		font-size: var(--text-label1);
	}

	input:focus-visible {
		outline: 2px solid var(--fg);
		outline-offset: 2px;
	}

	.intro {
		font-size: var(--text-label1);
		line-height: var(--leading-tight);
		text-wrap: pretty;
	}

	.quiet a {
		color: var(--fg);
		text-underline-offset: 0.2em;
	}

	.quiet a:focus-visible {
		outline: 2px solid var(--fg);
		outline-offset: 2px;
	}

	/* An address to copy, drawn as the preview draws inline code. */
	.quiet code {
		padding: 0.1em 0.3em;
		border-radius: var(--radius-s);
		background-color: var(--surface-hover);
		color: var(--fg);
		font-family: ui-monospace, monospace;
		font-size: 0.9em;
	}

	.quiet strong {
		color: var(--fg);
		font-weight: 600;
	}

	.quiet {
		font-size: var(--text-label1);
		line-height: var(--leading-tight);
		color: color-mix(in oklab, var(--fg) 60%, transparent);
		text-wrap: pretty;
	}

	/* The way to the server: a legend, the two side by side, and what the one
	 * chosen costs underneath. No box — it is one question, not a section. */
	.via {
		display: flex;
		flex-direction: column;
		gap: var(--space-8);
		padding: 0;
		border: none;
	}

	legend {
		margin-block-end: var(--space-4);
		padding: 0;
		font-size: var(--text-label1);
		color: color-mix(in oklab, var(--fg) 60%, transparent);
	}

	.options {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-8) var(--space-16);
	}

	/* A radio or a checkbox sits BESIDE its words rather than above them, which is
	 * the one place the column above is the wrong arrangement. */
	.choice {
		flex-direction: row;
		align-items: start;
		gap: var(--space-8);
	}

	.choice > span {
		color: inherit;
	}

	.choice input {
		/* On its own line's centre, not on the paragraph's. */
		margin-block-start: 0.15em;
		flex: none;
	}

	.signin {
		display: flex;
		flex-direction: column;
		align-items: start;
		gap: var(--space-8);
	}

	/* Parted from the sign-in by a hairline rather than by more space, with the
	 * form's own gap on either side of it, and closer to each other than to
	 * anything else. */
	.folds {
		display: flex;
		flex-direction: column;
		gap: var(--space-8);
		padding-block-start: var(--space-16);
		border-block-start: 1px solid var(--edge);
	}

	/* The paste, folded: a quiet line that opens into the two fields. */
	.by-hand summary,
	.more summary {
		display: inline-flex;
		align-items: center;
		gap: var(--space-4);

		font-size: var(--text-label1);
		color: color-mix(in oklab, var(--fg) 60%, transparent);
		list-style: none;
		cursor: pointer;
	}

	.by-hand summary::-webkit-details-marker,
	.more summary::-webkit-details-marker {
		display: none;
	}

	.by-hand summary :global(svg),
	.more summary :global(svg) {
		inline-size: 1rem;
		block-size: 1rem;
		transition: rotate 120ms;
	}

	.by-hand[open] summary :global(svg),
	.more[open] summary :global(svg) {
		rotate: 90deg;
	}

	.by-hand summary:hover,
	.more summary:hover {
		color: var(--fg);
	}

	.by-hand summary:focus-visible,
	.more summary:focus-visible {
		outline: 2px solid var(--fg);
		outline-offset: 2px;
		border-radius: var(--radius-s);
	}

	.fields {
		display: flex;
		flex-direction: column;
		gap: var(--space-12);
		margin-block-start: var(--space-12);
	}

	/* Who is connecting, and a way back that reads as a word, not a key. */
	.who {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: var(--space-8);
		font-size: var(--text-label1);
	}

	.link {
		padding: 0;
		border: none;
		background: none;
		color: inherit;
		font-size: inherit;
		text-decoration: underline;
		text-underline-offset: 0.2em;
		cursor: pointer;
	}

	.link:hover {
		text-decoration-thickness: 2px;
	}

	/* The drive's folders, framed: the one part of the step that scrolls. */
	.browse {
		display: flex;
		flex-direction: column;
		gap: var(--space-8);

		padding: var(--space-12);
		border: 1px solid var(--edge);
		border-radius: var(--radius-l);
	}

	/* The slash stands clear of the boxed step on either side of it, so it reads
	 * as the break between two places and not as part of either. */
	.steps {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-4) var(--space-8);
		font-size: var(--text-label1);
	}

	.steps button,
	.keys button,
	.signin button {
		block-size: var(--control-block-size);
		padding-inline: var(--space-12);
		border: 1px solid var(--edge);
		border-radius: var(--radius-s);
		background: none;
		color: inherit;
		font-size: var(--text-label1);
		cursor: pointer;
	}

	/*
	 * WHERE IT IS NOW, in the yellow of the Connect key under the list, so the
	 * folder that key names is the one that is marked. FILLED and not outlined:
	 * a yellow edge on white is 1.4:1 and would all but vanish in the light
	 * theme — see `.control[data-open]` in app.css for the same choice. The box
	 * is drawn, so it keeps the padding the other steps have.
	 */
	.steps button[aria-current] {
		border-color: transparent;
		background-color: var(--accent);
		color: var(--accent-fg);
		font-weight: 600;
		cursor: default;
	}

	.browse ul {
		display: flex;
		flex-direction: column;

		max-block-size: 16rem;
		overflow-y: auto;
		padding: 0;
		list-style: none;
	}

	.browse li button {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-8);

		inline-size: 100%;
		block-size: var(--control-block-size);
		padding-inline: var(--space-12) var(--space-8);
		border: none;
		border-radius: var(--radius-s);
		background: none;
		color: inherit;
		font-size: var(--text-label1);
		text-align: start;
		cursor: pointer;
	}

	.browse li button :global(svg) {
		flex: none;
		inline-size: 1rem;
		block-size: 1rem;
		color: color-mix(in oklab, var(--fg) 60%, transparent);
	}

	.said {
		font-size: var(--text-label1);
		line-height: var(--leading-tight);
		text-wrap: pretty;
	}

	.keys {
		display: flex;
		justify-content: end;
		gap: var(--space-4);
	}

	.keys button[type='submit'],
	.signin button.primary {
		border-color: transparent;
		background-color: var(--accent);
		color: var(--accent-fg);
	}

	/*
	 * POINTED AT, with the rail's own wash, so a press is expected before it is
	 * made. Not on the step that is where the list already is, and not on a key
	 * that would not do anything.
	 */
	.steps button:hover:not([aria-current]),
	.browse li button:hover,
	.keys button:hover:not(:disabled) {
		background-color: var(--surface-hover);
	}

	/* The yellow keys darken toward their own ink instead: a wash of 8% white is
	 * lost on yellow in the dark theme. */
	.keys button[type='submit']:hover:not(:disabled),
	.signin button.primary:hover:not(:disabled) {
		background-color: color-mix(in oklab, var(--accent) 85%, var(--accent-fg));
	}

	.keys button:disabled,
	.signin button:disabled {
		opacity: 0.5;
		cursor: default;
	}

	.steps button:focus-visible,
	.keys button:focus-visible,
	.signin button:focus-visible,
	.browse li button:focus-visible,
	.link:focus-visible {
		outline: 2px solid var(--fg);
		outline-offset: 2px;
	}
</style>
