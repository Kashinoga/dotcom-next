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
	import { probe, type DavConfig } from '$lib/dav';
	import { driveId, toOrigin, toRoot, type Drive } from '$lib/drives';

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
