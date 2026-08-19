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
	import { onDestroy } from 'svelte';

	import { probe, type DavConfig } from '$lib/dav';
	import { driveId, toOrigin, toRoot, type Drive } from '$lib/drives';
	import { pollOnce, POLL_EVERY_MS, POLL_FOR_MS, startLogin } from '$lib/login';

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
	let root = $state('');
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
		 */
		const tab = window.open(flow.login, '_blank', 'noopener');
		if (!tab) {
			waitingOnGrant = false;
			said =
				'The sign-in page was blocked from opening. Allow pop-ups for this site, or paste an app password instead.';
			return;
		}

		const until = Date.now() + POLL_FOR_MS;
		while (live && Date.now() < until) {
			await sleep(POLL_EVERY_MS);
			if (!live) return;

			const answer = await pollOnce(flow);
			if (answer === 'pending') continue;

			waitingOnGrant = false;
			if (!answer) {
				said = 'That sign-in did not finish.';
				return;
			}

			/* What comes back IS the credential, so the form is filled in with it and
			 * the ordinary path takes over — the probe still runs before anything is
			 * remembered, because a granted password and a reachable workspace are two
			 * different claims. */
			user = answer.user;
			token = answer.token;
			return;
		}

		if (live) {
			waitingOnGrant = false;
			said = 'That sign-in was not granted in time.';
		}
	}

	const origin = $derived(toOrigin(server));
	const ready = $derived(
		!!origin && !!user.trim() && !!token.trim() && !trying,
	);

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

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		if (!origin || !ready) return;

		trying = true;
		said = null;

		const cleanRoot = toRoot(root);
		const cfg: DavConfig = {
			connection: driveId(origin, user.trim()),
			base: origin,
			user: user.trim(),
			token: token.trim(),
			via,
			root: cleanRoot,
			name: cleanRoot.split('/').pop() || new URL(origin).hostname,
		};

		const answer = await probe(cfg);
		trying = false;

		if (answer !== 'ok') {
			said = wording[answer] ?? wording.failed;
			return;
		}

		onconnect(
			{
				id: cfg.connection,
				name: cfg.name,
				base: cfg.base,
				user: cfg.user,
				via,
				root: cleanRoot,
				keep,
			},
			cfg.token,
		);
	}
</script>

<form class="connect" onsubmit={submit}>
	<h3>Connect a drive</h3>

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

	<!--
		AN APP PASSWORD, AND THE LABEL SAYS SO. Nextcloud's are per-device and
		revocable, and that list is the control somebody actually has over this — so
		the form asks for one by name rather than for "your password", which is the
		thing it must never be given.
	-->
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

	<!--
		OR HAVE THE SERVER MAKE ONE. The password is never typed here: they log in on
		their own server, with their own second factor, and press Grant — and what
		arrives is an app password named for this app and revocable like any other.

		Offered only in the relayed mode, and the note beside it says so rather than
		leaving somebody wondering where the button went. See $lib/login.ts.
	-->
	{#if via === 'proxy'}
		<div class="signin">
			<button
				type="button"
				onclick={signIn}
				disabled={!origin || waitingOnGrant || trying}
			>
				{waitingOnGrant ? 'Waiting for you to grant it…' : 'Sign in instead'}
			</button>
			<p>
				{waitingOnGrant
					? 'Finish signing in on the tab that opened, then press Grant.'
					: 'Opens your server in a tab. It makes the app password for you.'}
			</p>
		</div>
	{/if}

	<label>
		<span>Folder</span>
		<input
			bind:value={root}
			type="text"
			autocomplete="off"
			autocapitalize="off"
			spellcheck="false"
			placeholder="Notes — or leave it empty for the whole drive"
		/>
	</label>

	<!--
		WHICH WAY THE REQUESTS GO, and it is a choice rather than something this
		works out. There is no fallback between the two and there must never be one:
		a blocked preflight is indistinguishable from a dead network, so guessing
		would be guessing about where a password goes. See `via` in $lib/dav.
	-->
	<fieldset>
		<legend>How to reach it</legend>

		<label class="choice">
			<input type="radio" bind:group={via} value="proxy" />
			<span>
				Through this site. Works anywhere, and the password and the documents
				pass through this site's server on the way.
			</span>
		</label>

		<label class="choice">
			<input type="radio" bind:group={via} value="direct" />
			<span>
				Straight to the server. Nothing touches this site, and it only works if
				that server allows this one.
			</span>
		</label>
	</fieldset>

	<label class="choice">
		<input type="checkbox" bind:checked={keep} />
		<span>Keep the app password in this browser, so it opens next visit.</span>
	</label>

	{#if said}
		<p class="said" role="alert">{said}</p>
	{/if}

	<div class="keys">
		<button type="submit" disabled={!ready}>
			{trying ? 'Trying it…' : 'Connect'}
		</button>
		<button type="button" onclick={oncancel}>Cancel</button>
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
		gap: var(--space-s);

		max-inline-size: 28rem;
		padding: var(--space-m);
		border-radius: var(--space-2xs);
		background-color: var(--bg);
	}

	h3 {
		font-size: var(--text-m);
		line-height: var(--leading-tight);
	}

	label {
		display: flex;
		flex-direction: column;
		gap: var(--space-2xs);

		font-size: var(--text-s);
		line-height: var(--leading-tight);
	}

	label > span {
		color: color-mix(in oklab, var(--fg) 60%, transparent);
	}

	input[type='text'],
	input[type='password'] {
		block-size: var(--control-block-size);
		padding-inline: var(--space-xs);
		border: 1px solid var(--edge);
		border-radius: var(--radius-round);
		background: none;
		color: inherit;
		font-size: var(--text-s);
	}

	input:focus-visible {
		outline: 2px solid var(--fg);
		outline-offset: 2px;
	}

	fieldset {
		display: flex;
		flex-direction: column;
		gap: var(--space-xs);

		padding: var(--space-s);
		border: 1px solid var(--edge);
		border-radius: var(--space-2xs);
	}

	legend {
		padding-inline: var(--space-2xs);
		font-size: var(--text-s);
		color: color-mix(in oklab, var(--fg) 60%, transparent);
	}

	/* A radio or a checkbox sits BESIDE its words rather than above them, which is
	 * the one place the column above is the wrong arrangement. */
	.choice {
		flex-direction: row;
		align-items: start;
		gap: var(--space-xs);
	}

	.choice input {
		/* On its own line's centre, not on the paragraph's. */
		margin-block-start: 0.15em;
		flex: none;
	}

	/* Under the field it stands in for, and quieter than it: it is an alternative
	 * to the thing above rather than a second thing to fill in. */
	.signin {
		display: flex;
		flex-direction: column;
		gap: var(--space-2xs);
	}

	.signin button {
		align-self: start;

		block-size: var(--control-block-size);
		padding-inline: var(--space-s);
		border: 1px solid var(--edge);
		border-radius: var(--radius-round);
		background: none;
		color: inherit;
		font-size: var(--text-s);
		cursor: pointer;
	}

	.signin button:disabled {
		opacity: 0.5;
		cursor: default;
	}

	.signin button:focus-visible {
		outline: 2px solid var(--fg);
		outline-offset: 2px;
	}

	.signin p {
		font-size: var(--text-s);
		line-height: var(--leading-tight);
		color: color-mix(in oklab, var(--fg) 60%, transparent);
		text-wrap: pretty;
	}

	.said {
		font-size: var(--text-s);
		line-height: var(--leading-tight);
		text-wrap: pretty;
	}

	.keys {
		display: flex;
		gap: var(--space-2xs);
	}

	.keys button {
		block-size: var(--control-block-size);
		padding-inline: var(--space-s);
		border: 1px solid var(--edge);
		border-radius: var(--radius-round);
		background: none;
		color: inherit;
		font-size: var(--text-s);
		cursor: pointer;
	}

	.keys button[type='submit'] {
		border-color: transparent;
		background-color: var(--accent);
		color: var(--accent-fg);
	}

	.keys button:disabled {
		opacity: 0.5;
		cursor: default;
	}

	.keys button:focus-visible {
		outline: 2px solid var(--fg);
		outline-offset: 2px;
	}
</style>
