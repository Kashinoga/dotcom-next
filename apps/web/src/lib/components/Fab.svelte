<script lang="ts" module>
	/*
	 * A PHONE, for the purposes of this button: a finger and nothing that
	 * hovers, on a window too narrow for the rails. Below 64rem the rails have
	 * no column to stand in, and a bar holding switches for panels that cannot
	 * be shown is the bar this replaces.
	 *
	 * The stylesheets say the same thing in their own media queries — src/app.css
	 * and the Text Editor's — because CSS cannot import a string. If this
	 * changes, those three change with it.
	 */
	export const PHONE =
		'(hover: none) and (pointer: coarse) and (width < 64rem)';
</script>

<script lang="ts">
	/*
	 * THE BAR, FOLDED INTO A THUMB'S REACH. On a phone a working surface cannot
	 * spare a row across its top for chrome, and the top is the one place a
	 * thumb cannot get to. So the bar's business comes down to the bottom corner:
	 *
	 *   · the press most people want most — between writing and reading — is the
	 *     big key, one tap as it was in the bar;
	 *   · everything else is one tap further, in a menu over it;
	 *   · what the bar reported, whether the document is saved, is worn on the
	 *     big key as a turning ring or a dot, and said in words in the menu.
	 *
	 * It goes while somebody types, because then it is sitting on the text they
	 * are typing, and comes back when they stop or the keyboard goes.
	 */
	import Ellipsis from '@lucide/svelte/icons/ellipsis';
	import Eye from '@lucide/svelte/icons/eye';
	import FolderTree from '@lucide/svelte/icons/folder-tree';
	import HeartHandshake from '@lucide/svelte/icons/heart-handshake';
	import LayoutGrid from '@lucide/svelte/icons/layout-grid';
	import ListTree from '@lucide/svelte/icons/list-tree';
	import Monitor from '@lucide/svelte/icons/monitor';
	import Moon from '@lucide/svelte/icons/moon';
	import SquarePen from '@lucide/svelte/icons/square-pen';
	import Sun from '@lucide/svelte/icons/sun';
	import X from '@lucide/svelte/icons/x';

	import { MediaQuery } from 'svelte/reactivity';

	import { bar } from '$lib/bar.svelte';
	import { displayMode } from '$lib/display-mode.svelte';
	import { outline, sheet, workspace } from '$lib/panel.svelte';
	import { site } from '$lib/site';
	import { view, VIEWS } from '$lib/view.svelte';

	/* How long a pause in typing is before the button comes back. Long enough
	 * that it does not flicker between words, short enough to be there when a
	 * hand goes looking for it. */
	const PAUSE_MS = 1500;

	const phone = new MediaQuery(PHONE, false);

	/*
	 * SPLIT IS TWO ROWS ON A PHONE HELD UPRIGHT, each half the height of a
	 * window the keyboard has already halved. That is two panes too short to
	 * read, and the big key moving between writing and reading does the same
	 * job better. So below 48rem split is not offered, and a page that arrives
	 * in it — split is where the editor opens — lands on the sheet instead.
	 */
	const upright = new MediaQuery(
		'(hover: none) and (pointer: coarse) and (width < 48rem)',
		false,
	);

	$effect(() => {
		if (upright.current && view.current === 'split') view.show('edit');
	});

	let menuOpen = $state(false);
	let root = $state<HTMLElement | null>(null);

	/*
	 * THE BIG KEY. With a sheet up it puts the sheet away, which is the only
	 * thing a person looking at a list of files wants from the corner. Otherwise
	 * it goes between writing and reading, and wears where it GOES — the eye to
	 * read, the pen to write — as a switch between two places does.
	 */
	const main = $derived(
		sheet.current
			? {
					Icon: X,
					label:
						sheet.current === 'workspace'
							? 'Put the files away'
							: 'Put the outline away',
					run: () => sheet.hide(),
				}
			: view.current === 'edit'
				? { Icon: Eye, label: 'Read it set', run: () => view.show('preview') }
				: {
						Icon: SquarePen,
						label: 'Back to writing',
						run: () => view.show('edit'),
					},
	);

	const ModeIcon = $derived(
		displayMode.mode === 'system'
			? Monitor
			: displayMode.mode === 'dark'
				? Moon
				: Sun,
	);

	const modeName = $derived(
		displayMode.mode === 'system'
			? `System (${displayMode.dark ? 'Dark' : 'Light'})`
			: displayMode.mode === 'dark'
				? 'Dark'
				: 'Light',
	);

	/*
	 * WHILE SOMEBODY TYPES, and the keyboard is where a keyboard is.
	 *
	 * `typing` is set by an input in the page and cleared by a pause or by the
	 * field losing focus, which on a phone is the keyboard going away.
	 *
	 * `lift` is how much of the window the keyboard covers. A phone's keyboard
	 * shrinks the VISUAL viewport and not the layout one, so a thing fixed to
	 * the bottom stays behind it; this is the distance to raise the button so it
	 * comes back above the keys rather than under them.
	 */
	let typing = $state(false);
	let lift = $state(0);

	$effect(() => {
		let timer: ReturnType<typeof setTimeout> | undefined;

		const editable = (target: EventTarget | null) =>
			target instanceof HTMLElement &&
			!!target.closest('main') &&
			(target.isContentEditable || target.matches('textarea, input'));

		const onInput = (event: Event) => {
			if (!editable(event.target)) return;
			typing = true;
			menuOpen = false;
			clearTimeout(timer);
			timer = setTimeout(() => (typing = false), PAUSE_MS);
		};

		const onFocusOut = (event: FocusEvent) => {
			if (!editable(event.target)) return;
			clearTimeout(timer);
			typing = false;
		};

		const viewport = window.visualViewport;
		const onViewport = () => {
			lift = viewport
				? Math.max(
						0,
						Math.round(innerHeight - viewport.height - viewport.offsetTop),
					)
				: 0;
		};

		document.addEventListener('input', onInput, true);
		document.addEventListener('focusout', onFocusOut, true);
		viewport?.addEventListener('resize', onViewport);
		viewport?.addEventListener('scroll', onViewport);
		onViewport();

		return () => {
			clearTimeout(timer);
			document.removeEventListener('input', onInput, true);
			document.removeEventListener('focusout', onFocusOut, true);
			viewport?.removeEventListener('resize', onViewport);
			viewport?.removeEventListener('scroll', onViewport);
		};
	});

	/* A press anywhere else puts the menu away, as a menu does. */
	function onPointerDown(event: PointerEvent) {
		if (menuOpen && !root?.contains(event.target as Node)) menuOpen = false;
	}

	function onKeyDown(event: KeyboardEvent) {
		if (event.key !== 'Escape' || !phone.current) return;
		if (menuOpen) menuOpen = false;
		else if (sheet.current) sheet.hide();
		else return;
		event.preventDefault();
	}

	function openSheet(id: 'workspace' | 'outline') {
		sheet.show(id);
		menuOpen = false;
	}
</script>

<svelte:window onpointerdown={onPointerDown} onkeydown={onKeyDown} />

<!--
	Drawn on every width and shown only on a phone, by the stylesheet, so the
	prerendered page and the hydrated one agree and nothing appears late. The
	bar is the same the other way round: src/app.css takes it away where this
	stands in for it.
-->
<div
	bind:this={root}
	class="fab"
	data-typing={typing || undefined}
	style="--lift: {lift}px"
>
	<!--
		NOT `role="menu"`. A menu role promises arrow keys between the items and
		a focus that moves into it, and this is a handful of buttons and links
		that Tab already walks. A disclosure is what it is: a button that shows a
		region, and says so with `aria-expanded`.
	-->
	{#if menuOpen}
		<div id="fab-menu" class="menu">
			{#if bar.status}
				<p class="said" data-tone={bar.status.tone}>{bar.status.text}</p>
			{/if}

			<div class="views" role="group" aria-label="How to look at the document">
				{#each VIEWS as { id, name, Icon } (id)}
					<button
						type="button"
						class="view"
						data-view={id}
						aria-pressed={view.current === id}
						onclick={() => {
							view.show(id);
							menuOpen = false;
						}}
					>
						<Icon aria-hidden="true" />
						{name}
					</button>
				{/each}
			</div>

			<ul>
				{#if workspace.present}
					<li>
						<button
							type="button"
							class="item"
							onclick={() => openSheet('workspace')}
						>
							<FolderTree aria-hidden="true" />Files
						</button>
					</li>
				{/if}
				{#if outline.present}
					<li>
						<button
							type="button"
							class="item"
							onclick={() => openSheet('outline')}
						>
							<ListTree aria-hidden="true" />Outline
						</button>
					</li>
				{/if}
				<li>
					<a class="item" href="/apps"><LayoutGrid aria-hidden="true" />Apps</a>
				</li>
				<!-- Stays open, so the modes can be stepped through and seen. -->
				<li>
					<button
						type="button"
						class="item"
						aria-label="Display mode: {modeName}. Change it."
						onclick={() => displayMode.cycle()}
					>
						<ModeIcon aria-hidden="true" />Display: {modeName}
					</button>
				</li>
				<li>
					<a class="item" href="/"
						><HeartHandshake aria-hidden="true" />{site.name}</a
					>
				</li>
			</ul>
		</div>
	{/if}

	<!--
		WHAT THE BAR WOULD HAVE SAID, read out from here where the bar is gone.
		Always in the markup, because a live region announces only the changes
		after it exists. On a wide window the whole button is `display: none`,
		which takes this out of the reading and leaves the bar's own.
	-->
	<p class="visually-hidden" role="status">{bar.status?.text ?? ''}</p>

	<div class="keys">
		<button
			type="button"
			class="key"
			aria-expanded={menuOpen}
			aria-controls="fab-menu"
			aria-label="More"
			onclick={() => (menuOpen = !menuOpen)}
		>
			<Ellipsis aria-hidden="true" />
		</button>

		<button
			type="button"
			class="key main"
			data-tone={sheet.current ? undefined : bar.status?.tone}
			aria-label={main.label}
			onclick={() => {
				menuOpen = false;
				main.run();
			}}
		>
			<main.Icon aria-hidden="true" />
			<span class="mark" aria-hidden="true"></span>
		</button>
	</div>
</div>

<style>
	/*
	 * THE CORNER. `--space-12` off the window's end and bottom, and `--lift`
	 * more when a keyboard is up. The panes keep a strip of that height clear at
	 * their foot — `--fab-reserve`, in src/app.css — so the last line of a
	 * document can always be scrolled out from under this.
	 */
	.fab {
		display: none;

		position: fixed;
		inset-inline-end: var(--space-12);
		inset-block-end: calc(var(--space-12) + var(--lift));
		/* Over the sheets the rails become, which are over the desk. */
		z-index: 3;

		flex-direction: column;
		align-items: flex-end;
		gap: var(--space-8);

		transition:
			opacity var(--motion-morph),
			translate var(--motion-morph),
			visibility var(--motion-morph);
	}

	/* Keep in step with PHONE, above. */
	@media (hover: none) and (pointer: coarse) and (width < 64rem) {
		.fab {
			display: flex;
		}
	}

	/*
	 * OUT OF THE WAY AND OUT OF REACH. `visibility` with the fade, so a finger
	 * landing where the button was reaches the text under it and not a button
	 * nobody can see.
	 */
	.fab[data-typing] {
		opacity: 0;
		translate: 0 var(--space-8);
		visibility: hidden;
	}

	/*
	 * ONE ISLAND, two keys: the bar's view keys had the same arrangement, a set
	 * cut from one stock. It stands on the document rather than on the desk, so
	 * it takes the frame and a shadow to be found there.
	 */
	.keys {
		display: flex;
		gap: var(--space-4);
		padding: var(--space-4);

		border-radius: calc(var(--radius-l) + var(--space-4));
		background-color: var(--shell);
		box-shadow:
			0 0 0 1px var(--frame),
			0 var(--space-4) var(--space-16) rgb(0 0 0 / 16%);
	}

	.key {
		position: relative;

		display: grid;
		place-items: center;
		inline-size: var(--control-block-size);
		block-size: var(--control-block-size);

		border: none;
		border-radius: var(--radius-l);
		background: none;
		color: var(--fg);
		cursor: pointer;
	}

	.key :global(svg) {
		inline-size: 1.25rem;
		block-size: 1.25rem;
	}

	.key[aria-expanded='true'] {
		background-color: var(--surface-hover);
	}

	/* The press that matters most wears the site's one colour. */
	.main {
		background-color: var(--accent);
		color: var(--accent-fg);
	}

	/*
	 * THE BAR'S REPORT, WORN. Nothing while all is kept, because a saved
	 * document is the ordinary case and needs no mark. Saving turns a ring round
	 * the key; a problem puts a dot on its corner, and the menu says what it is.
	 */
	.mark {
		position: absolute;
		pointer-events: none;
	}

	.main[data-tone='busy'] .mark {
		inset: calc(var(--space-4) * -1 + 1px);
		border: 2px solid transparent;
		border-block-start-color: var(--fg);
		border-radius: calc(var(--radius-l) + var(--space-4) - 1px);
		animation: turn var(--motion-turn) linear infinite;
	}

	.main[data-tone='alert'] .mark {
		inset-block-start: calc(var(--space-4) * -1);
		inset-inline-end: calc(var(--space-4) * -1);
		inline-size: var(--space-12);
		block-size: var(--space-12);
		border: 2px solid var(--shell);
		border-radius: var(--radius-round);
		background-color: var(--fg);
	}

	@keyframes turn {
		to {
			rotate: 1turn;
		}
	}

	/*
	 * THE MENU, over the keys and flush with their end, so the thumb that opened
	 * it travels straight up. The same sheet QuickOpen is drawn as.
	 */
	.menu {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		min-inline-size: 15rem;
		padding: var(--space-4);

		border-radius: var(--radius-l);
		background-color: var(--bg);
		color: var(--fg);
		box-shadow:
			0 0 0 1px var(--frame),
			0 var(--space-4) var(--space-16) rgb(0 0 0 / 16%);
		font-size: var(--text-label1);
	}

	.said {
		margin: 0;
		padding: var(--space-4) var(--space-8);
		opacity: 0.7;
	}

	.said[data-tone='alert'] {
		opacity: 1;
		font-weight: var(--weight-semibold);
	}

	/*
	 * THE THREE VIEWS, as the bar had them: one island, the pressed one on the
	 * accent. With their names, because there is room here that the bar did
	 * not have.
	 */
	.views {
		display: grid;
		grid-auto-flow: column;
		grid-auto-columns: 1fr;
		gap: var(--space-4);
		padding: var(--space-4);

		border-radius: var(--radius-l);
		background-color: var(--rail);
	}

	.view {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-4);
		block-size: calc(var(--control-block-size) - var(--space-8));

		border: none;
		border-radius: var(--radius-s);
		background: none;
		color: inherit;
		font: inherit;
		cursor: pointer;
	}

	.view[aria-pressed='true'] {
		background-color: var(--accent);
		color: var(--accent-fg);
	}

	/* See the note on `upright`, in the script. */
	@media (width < 48rem) {
		.view[data-view='split'] {
			display: none;
		}
	}

	.view :global(svg),
	.item :global(svg) {
		flex: none;
		inline-size: 1rem;
		block-size: 1rem;
	}

	ul {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.item {
		display: flex;
		align-items: center;
		gap: var(--space-12);
		inline-size: 100%;
		block-size: var(--control-block-size);
		padding-inline: var(--space-8);

		border: none;
		border-radius: var(--radius-s);
		background: none;
		color: inherit;
		font: inherit;
		text-align: start;
		text-decoration: none;
		cursor: pointer;
	}

	.item:active,
	.view:active {
		background-color: var(--surface-hover);
	}
</style>
