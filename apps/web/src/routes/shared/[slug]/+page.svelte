<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import Letter from '$lib/components/Letter.svelte';
	import Seo from '$lib/components/Seo.svelte';
	import TripBoard from '$lib/components/TripBoard.svelte';
	import { NICKNAME_MAX } from '$lib/trip';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	/*
	 * WHAT THE LOCK HAS TO SAY. `form` is the answer of whichever action ran last,
	 * and the actions answer in different shapes, so each is asked for with `in`
	 * rather than assumed.
	 */
	const errors = {
		nickname: `That nickname won’t work. Keep it to ${NICKNAME_MAX} visible characters, or leave it blank.`,
		device: `That device name won’t work. Keep it to ${NICKNAME_MAX} visible characters, or leave it blank.`,
		wrong: 'That isn’t it.',
		'slow-down': 'Too many tries. Wait a minute and try again.',
		unconfigured: 'This page isn’t set up yet.',
	};

	const gateError = $derived(form && 'error' in form ? form.error : undefined);
	const typedNickname = $derived(
		form && 'nickname' in form ? form.nickname : '',
	);
	const typedDevice = $derived(form && 'device' in form ? form.device : '');

	/*
	 * THE NAME AND THE LINE UNDER IT, AS THEY ARE NOW. `data` is the trip when the
	 * page loaded; the board keeps the live one and reports it here, so a rename
	 * shows in the heading and the tab as soon as it is made.
	 */
	let live = $state<{ title: string; tagline: string } | null>(null);
	const heading = $derived(live ?? (data.state === 'open' ? data.trip : null));

	let pending = $state(false);

	/* See the note beside the board's own `ready`: the effect is the hydration. */
	let ready = $state(false);
	$effect(() => {
		ready = true;
	});
</script>

<!--
	THE LOCKED HEAD SAYS NOTHING ABOUT THE TRIP. A link to this page pasted in a
	chat unfurls from these lines, and an unfurl is read by whoever is in the chat
	and by the chat's own servers. Those servers have no cookie, so they are sent
	the lock and its name. Only a browser that has given the passcode gets the
	trip's name in its tab.
-->
<Seo
	title={heading?.title ?? 'For Your Eyes Only'}
	separator=" | "
	description="A private page."
	path={page.url.pathname}
/>
<svelte:head>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

{#if data.state === 'open'}
	<!--
		KEYED ON NOTHING THAT CHANGES, on purpose. The board owns the trip once it
		has it and keeps it in step itself; a fresh `data` from a navigation is not
		allowed to reset a page somebody is halfway through dragging on.
	-->
	<Letter
		title={heading?.title ?? data.trip.title}
		tagline={heading?.tagline || undefined}
		wide
	>
		<!--
			The API sits under this page's own address — see api/+server.ts — so it is
			found from where the page is, and the address is written nowhere in code.
		-->
		<TripBoard
			stored={{
				trip: data.trip,
				version: data.version,
				history: data.history,
			}}
			nickname={data.nickname}
			device={data.device}
			ontrip={(trip) => (live = { title: trip.title, tagline: trip.tagline })}
			endpoint="{page.url.pathname.replace(/\/$/, '')}/api"
		/>
	</Letter>
{:else}
	<Letter title="For Your Eyes Only" tagline="Are you a Gorly Gorl?">
		{#if data.state === 'unconfigured'}
			<p>
				This page has no passcode or no database yet, so it stays locked. Set
				<code>TRIP_PASSCODE</code> on the Worker and check the
				<code>TRIP_DB</code> binding.
			</p>
		{:else}
			<!--
				A REAL FORM, posted to the server, so it works before any script has
				arrived and on a phone that never runs one. `enhance` only keeps the
				page from reloading when it does.

				`autocomplete="current-password"`, so a password manager offers to
				keep it — which is how a group passcode actually survives two weeks
				on six phones.
			-->
			<form
				method="POST"
				action="?/unlock"
				data-ready={ready || undefined}
				use:enhance={() => {
					pending = true;
					return async ({ update }) => {
						await update();
						pending = false;
					};
				}}
			>
				<!--
					THE NICKNAME, NEXT TO THE PASSCODE. It is what the history calls this
					person, and it is asked for here because this is the one moment every
					friend passes through. The two stand side by side where there is room
					and one over the other where there is not.

					`autocomplete="nickname"` so a browser that has been told a name before
					offers it, and the value comes back after a refusal so a wrong passcode
					does not cost the name too.
				-->
				<div class="gate-fields">
					<div class="gate-field">
						<label for="nickname">Nickname (Optional)</label>
						<div class="gate">
							<input
								id="nickname"
								name="nickname"
								autocomplete="nickname"
								maxlength={NICKNAME_MAX}
								placeholder="Used to help keep track of edits"
								value={typedNickname}
								aria-invalid={gateError === 'nickname' ? 'true' : undefined}
								aria-describedby="gate-error"
							/>
						</div>
					</div>

					<!--
						WHICH PHONE OR COMPUTER, for somebody on the trip from more than one,
						so the history can tell "Kashinoga on Artemis" from "Kashinoga on
						Apollo". No `autocomplete`: no browser keeps a name for itself.
					-->
					<div class="gate-field">
						<label for="device">Device Name (Optional)</label>
						<div class="gate">
							<input
								id="device"
								name="device"
								autocomplete="off"
								maxlength={NICKNAME_MAX}
								placeholder="Tells your devices apart"
								value={typedDevice}
								aria-invalid={gateError === 'device' ? 'true' : undefined}
								aria-describedby="gate-error"
							/>
						</div>
					</div>

					<div class="gate-field">
						<label for="passcode">Passcode</label>
						<div class="gate">
							<input
								id="passcode"
								name="passcode"
								type="password"
								autocomplete="current-password"
								required
								aria-invalid={gateError === 'wrong' ? 'true' : undefined}
								aria-describedby="gate-error"
							/>
							<button class="unlock" disabled={pending}>Unlock</button>
						</div>
					</div>
				</div>

				<!-- Always here, holding its line, so the fields do not jump when it speaks. -->
				<p id="gate-error" class="error" role="alert">
					{gateError ? errors[gateError] : ''}
				</p>
			</form>
		{/if}
	</Letter>
{/if}

<style>
	/*
	 * THREE FIELDS ON A GRID OF EQUAL COLUMNS, each at least 14rem: a phone stacks
	 * them, and anything wider sets the two names side by side with the passcode
	 * under the first, one column wide like them — no breakpoint deciding. A grid
	 * and not a wrapping row, which stretched the passcode alone across both.
	 */
	.gate-fields {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(14rem, 100%), 1fr));
		gap: var(--space-s) var(--space-m);
		max-inline-size: 40rem;
	}

	.gate-field {
		min-inline-size: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-2xs);
	}

	.gate-field label {
		font-size: var(--text-s);
	}

	/*
	 * THE SEARCH FIELD'S SHAPE, holding a button at its end rather than a clear
	 * mark: the pill, the hairline, the ring drawn on the whole box when anything
	 * in it has focus.
	 */
	.gate {
		display: flex;
		align-items: center;
		gap: var(--space-xs);
		block-size: var(--control-block-size);
		padding-inline-start: var(--space-s);
		border: 1px solid var(--edge);
		border-radius: var(--radius-round);
	}

	/*
	 * A field alone in its pill still wants the pill's inner air at its end, where
	 * the passcode's has its button.
	 */
	.gate:not(:has(.unlock)) {
		padding-inline-end: var(--space-s);
	}

	.gate:focus-within {
		outline: 2px solid var(--fg);
		outline-offset: 2px;
	}

	input {
		flex: 1;
		min-inline-size: 0;
		border: none;
		background: none;
		color: inherit;
		outline: none;
	}

	/*
	 * FILLED WITH THE ACCENT, and inset from the field's edge by a pixel so the
	 * hairline still goes all the way round — the same one-shape-inside-another
	 * the view keys in the bar draw.
	 */
	.unlock {
		appearance: none;
		align-self: stretch;
		margin: 2px;
		padding-inline: var(--space-s);
		border: none;
		border-radius: var(--radius-round);
		background-color: var(--accent);
		color: var(--accent-fg);
		font-weight: 600;
		font-size: var(--text-s);
		cursor: pointer;
	}

	.unlock:disabled {
		cursor: progress;
	}

	.error {
		block-size: 1lh;
		margin-block-start: var(--space-xs);
		font-size: var(--text-s);
		font-weight: 600;
	}
</style>
