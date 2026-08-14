<script lang="ts">
	/*
	 * THE TEXT EDITOR, and this is its FURNITURE and nothing else yet. Every
	 * thing in the three regions below is standing in for something real: the
	 * workspace lists names that are not files, the sheet holds text nobody
	 * typed, and the outline points at headings it did not find.
	 *
	 * It is built in this order on purpose. The hard parts — an editor, a
	 * backing store, a renderer — each want to know where they will live before
	 * they are written, and a shape agreed on with real furniture in it is a
	 * cheaper thing to change than one agreed on after an editor is in it.
	 *
	 * Nothing here is imported from the first site's editor. That one is worth
	 * reading and is not worth copying: its answers were reached against a
	 * different set of constraints, and the ones that still hold will hold again
	 * when the questions are asked here.
	 */
	import Columns2 from '@lucide/svelte/icons/columns-2';
	import Eye from '@lucide/svelte/icons/eye';
	import File from '@lucide/svelte/icons/file';
	import FileText from '@lucide/svelte/icons/file-text';
	import NotepadText from '@lucide/svelte/icons/notepad-text';
	import Plus from '@lucide/svelte/icons/plus';
	import SquarePen from '@lucide/svelte/icons/square-pen';
	import X from '@lucide/svelte/icons/x';

	import Seo from '$lib/components/Seo.svelte';
	import { outline as outlinePanel, workspace } from '$lib/panel.svelte';
	import { name as scratchName, PERMANENT, scratch } from '$lib/scratch.svelte';

	/*
	 * THE THREE WAYS TO LOOK AT A DOCUMENT. `split` is the one that costs a
	 * decision later — it needs a window wide enough to hold two columns of
	 * readable text, and below that width it is not offered rather than being
	 * offered and disappointing.
	 */
	const VIEWS = [
		{ id: 'edit', name: 'Edit', hint: 'Type on the sheet', Icon: SquarePen },
		{ id: 'preview', name: 'Preview', hint: 'Read it set', Icon: Eye },
		{ id: 'split', name: 'Split', hint: 'Both at once', Icon: Columns2 },
	] as const;

	type View = (typeof VIEWS)[number]['id'];

	/*
	 * SPLIT IS WHERE IT OPENS. The source and the setting are the two halves of
	 * what this app is for, and showing one of them first would be a claim about
	 * which half matters — made on a visitor's behalf, before they have said
	 * anything.
	 *
	 * On a narrow window the two stack rather than standing side by side, so this
	 * is a sensible thing to open with at any size. See the rule on `.area`.
	 */
	let view = $state<View>('split');

	/*
	 * STANDING IN FOR A WORKSPACE. A real one comes from one of three places —
	 * a folder on the disk, a folder the browser keeps privately, or a server —
	 * and none of them exists yet. The shape is what is being agreed here: a
	 * name, and whether this editor can open it.
	 *
	 * `openable: false` is not decoration. A workspace that hides what it cannot
	 * open shows a folder of six things as a folder of four, and leaves the
	 * reader wondering whether the walk missed them or they were never there.
	 */
	const WORKSPACE = [
		{ name: 'The Curriculum.md', openable: true },
		{ name: 'Library 101.md', openable: true },
		{ name: 'Notes.txt', openable: true },
		{ name: 'The Peaks.md', openable: true },
		{ name: 'crest.png', openable: false },
		{ name: 'handbook.pdf', openable: false },
	];

	/*
	 * WHAT IS ON THE DESK. A scratch note and a file are not the same kind of
	 * thing — one is a number in this browser and the other is a path somewhere
	 * — so what is open is a KIND and a handle rather than a name, and nothing
	 * has to guess which sort of thing a string was.
	 */
	type Open = { kind: 'scratch'; id: number } | { kind: 'file'; name: string };

	let open = $state<Open>({ kind: 'scratch', id: PERMANENT });

	const openScratch = $derived(open.kind === 'scratch' ? open.id : null);

	// The stored notes arrive a tick after the first paint, which is what keeps
	// the prerendered HTML and the hydrated page agreeing about what is there.
	$effect(() => scratch.watch());

	// The bar draws each panel's switch while this page is the one showing.
	$effect(() => workspace.claim());
	$effect(() => outlinePanel.claim());

	function closeScratch(id: number) {
		scratch.close(id);

		// Closing the note you were looking at has to leave you somewhere. The
		// permanent one is still there — emptied — so it is where you land.
		if (openScratch === id && id !== PERMANENT) {
			open = { kind: 'scratch', id: PERMANENT };
		}
	}

	// Standing in for the outline a parser will find. Depth is here from the
	// start because a flat list of headings is a different component.
	const OUTLINE = [
		{ text: 'The Curriculum', depth: 1 },
		{ text: 'A Foreword', depth: 2 },
		{ text: 'The Year is 2172', depth: 2 },
		{ text: 'The Wand is It', depth: 3 },
		{ text: 'The Path You Choose', depth: 2 },
	];

	const SHEET = `# The Curriculum

Welcome to adventure. There was always bad and good rolls. There was always
scheduling conflicts and snack duties.

## The Year is 2172

The terrain is unforgiving by design.
`;
</script>

<Seo
	title="Text Editor"
	description="A Markdown editor, set as a page of the manual it renders."
	path="/text-editor"
	icon="/favicon-text-editor.svg"
/>

<!--
	NO LETTER HERE, AND NO MASTHEAD. Every other page on this site is a letter —
	a marked name, a line under it, a column of text at reading width — and this
	is none of those three. A working surface with a title above it is a surface
	with less room to work on, and the measure that makes a letter readable is
	exactly what makes an editor too small.

	The name is not lost. The bar carries it, from the first paint, because the
	page has no `[data-page-title]` for the bar to wait on — see the effect in
	+layout.svelte. That is the same rule every other page follows, arriving at a
	different answer because this page never says its own name.
-->
<div class="app">
	<div
		class="workbench"
		data-workspace={workspace.open ? 'open' : 'closed'}
		data-outline={outlinePanel.open ? 'open' : 'closed'}
	>
		<!--
			THE WORKSPACE AND THE OUTLINE ARE COLUMNS NOW, not things hung in the
			margin. There is no margin on a full-width page — that was the whole
			point of taking the cap off — so the three regions share one grid and
			the middle one takes whatever the other two do not.
		-->
		<!--
			`data-ready` says storage has been read. Until it has, the notes listed
			are the DEFAULT one in the prerendered markup and not necessarily what
			this browser is keeping — see the note on `ready`.
		-->
		<nav
			id="workspace"
			class="rail workspace"
			aria-label="Workspace"
			data-ready={scratch.ready || undefined}
		>
			<!--
				NO HEADING OF ITS OWN. "Workspace" sat here, directly above
				"Scratch" — two dimmed lines of the same size, reading as one
				two-line heading rather than a panel and its first section. The word
				is in the bar now, on the control that puts this panel away, which is
				what it was describing all along.

				The nav keeps `aria-label="Workspace"`, so nothing is lost to a
				reader who cannot see the bar: the landmark is still named.
			-->

			<!--
				SCRATCH IS FIRST, because it is the only part of this workspace that
				is real: a note here is in this browser and can be typed in now,
				where every row below is standing in for a file that does not exist
				yet. Putting it at the top is not a ranking of importance so much as
				an answer to "where do I start" — the top of the list is where.
			-->
			<section class="section">
				<h2>
					Scratch
					<button
						type="button"
						class="add"
						title="A new ephemeral note"
						aria-label="Open a new ephemeral note"
						onclick={() => (open = { kind: 'scratch', id: scratch.open() })}
					>
						<Plus aria-hidden="true" />
					</button>
				</h2>

				<ol>
					{#each scratch.notes as note (note.id)}
						<li class="row">
							<button
								type="button"
								class="file"
								aria-current={openScratch === note.id ? 'true' : undefined}
								onclick={() => (open = { kind: 'scratch', id: note.id })}
							>
								<NotepadText aria-hidden="true" />
								<span class="name">{scratchName(note.id)}</span>
							</button>

							<!--
								THE LABEL SAYS WHICH OF THE TWO THINGS THIS DOES. Closing
								Ephemeral 0 empties it and leaves the row; closing any other
								takes the row with it. Both are "close" to the hand doing it,
								and a screen reader should not have to find that out by
								pressing.
							-->
							<button
								type="button"
								class="close"
								title={note.id === PERMANENT ? 'Clear it' : 'Close it'}
								aria-label={note.id === PERMANENT
									? `Clear ${scratchName(note.id)}`
									: `Close ${scratchName(note.id)}`}
								onclick={() => closeScratch(note.id)}
							>
								<X aria-hidden="true" />
							</button>
						</li>
					{/each}
				</ol>
			</section>

			<section class="section">
				<h2>Files</h2>
				<ol>
					{#each WORKSPACE as file (file.name)}
						<li>
							<button
								type="button"
								class="file"
								class:inert={!file.openable}
								aria-current={open.kind === 'file' && open.name === file.name
									? 'true'
									: undefined}
								disabled={!file.openable}
								onclick={() => (open = { kind: 'file', name: file.name })}
							>
								<!--
								A PAGE WITH WRITING ON IT, or a page without. The inert
								mark was a closed FOLDER, which said the wrong thing
								entirely: `crest.png` is not a folder, and a reader
								scanning the column would have counted two folders that
								are not there. What these rows have in common is being
								files this editor cannot read, so they get the file with
								nothing written on it.
							-->
								{#if file.openable}
									<FileText aria-hidden="true" />
								{:else}
									<File aria-hidden="true" />
								{/if}
								<span class="name">{file.name}</span>
							</button>
						</li>
					{/each}
				</ol>
			</section>
		</nav>

		<div class="desk">
			<!--
				THE VIEW KEYS, above the sheet rather than in the bar. The bar belongs
				to the site and says where you are; these belong to the document and
				say how you are looking at it, and a control that changes with the
				page should not sit among controls that do not.
			-->
			<div class="views" role="group" aria-label="How to look at the document">
				{#each VIEWS as { id, name, hint, Icon } (id)}
					<button
						type="button"
						class="view"
						aria-pressed={view === id}
						title={hint}
						onclick={() => (view = id)}
					>
						<Icon aria-hidden="true" />
						{name}
					</button>
				{/each}
			</div>

			<!--
		THE SHEET AND THE PROOF. In `split` both are drawn; otherwise one is. They
		are siblings in a grid rather than one element that changes what it is,
		because in `split` they are genuinely two things and a component that
		becomes two under a flag is harder to reason about than two that are
		sometimes one.
	-->
			<div class="area" data-view={view}>
				{#if view !== 'preview'}
					<!--
						A SCRATCH NOTE CAN BE TYPED IN and a placeholder file cannot,
						because one of them exists. The textarea is deliberately plain
						and deliberately temporary — it is standing in for an editor, and
						the whole reason for the scratch notes is to have somewhere real
						to put one when it arrives.
					-->
					{#if openScratch !== null}
						<textarea
							class="sheet"
							aria-label="{scratchName(openScratch)}, the document"
							placeholder="Type something."
							value={scratch.text(openScratch)}
							oninput={(event) =>
								scratch.write(openScratch, event.currentTarget.value)}
						></textarea>
					{:else}
						<div class="sheet" aria-label="The document">
							<pre>{SHEET}</pre>
						</div>
					{/if}
				{/if}

				{#if view !== 'edit'}
					<div class="proof" aria-label="The document, set">
						{#if openScratch !== null}
							<!--
								NOTHING SETS A DOCUMENT YET. The proof says so rather than
								showing the source in prose type, which is what a broken
								renderer looks like — and a placeholder that looks like a
								bug is worse than one that says what it is.
							-->
							<p class="pending">
								There is no setting yet. What you type is on the sheet, and
								kept.
							</p>
						{:else}
							<h2>The Curriculum</h2>
							<p>
								Welcome to adventure. There was always bad and good rolls. There
								was always scheduling conflicts and snack duties.
							</p>
							<h3>The Year is 2172</h3>
							<p>The terrain is unforgiving by design.</p>
						{/if}
					</div>
				{/if}
			</div>
		</div>

		<!--
		BUTTONS AND NOT LINKS, and the build is what settled it: an anchor needs
		something with that id on the page, and in `edit` there is no rendered
		document to carry one — the prerender refused the page rather than ship
		five links to nowhere, which is the same rule the Apps cards keep.

		It is not a workaround. Going to a heading means two different things
		here: on the sheet it means "put the caret there", and in the proof it
		means "scroll to it". Only one of those is a URL, so neither is.
	-->
		<nav id="outline" class="rail outline" aria-label="Outline">
			<h2>Outline</h2>
			<ol>
				{#each OUTLINE as heading (heading.text)}
					<li>
						<button
							type="button"
							class="heading"
							style="--depth: {heading.depth - 1}">{heading.text}</button
						>
					</li>
				{/each}
			</ol>
		</nav>
	</div>
</div>

<style>
	/*
	 * THE PADDING IS THE BAR'S OWN, so the workspace's first name begins on the
	 * same line as the mark above it. `--space-m` and not the letter's
	 * `--space-2xl` on the block edges: that space is what separates a title from
	 * the text under it, and there is no title here to separate anything from.
	 */
	/*
	 * THE APP IS THE WINDOW UNDER THE BAR, exactly — `100dvh` less the height the
	 * bar publishes, with the padding counted inside it because the reset makes
	 * every box `border-box`. So the page itself never scrolls: what scrolls is
	 * whichever region has more in it than it can show, which is the difference
	 * between an app and a document.
	 *
	 * `dvh` and not `vh`, for the reason the reset gives — a phone's bars move,
	 * and `vh` would make this taller than the window it is supposed to be.
	 */
	.app {
		/*
		 * NO PADDING ON TOP, because the bar already put it there. The bar is a
		 * 32px control between two `--space-m` paddings, so the lower one is a
		 * step of air below the controls that belongs to the bar and is drawn
		 * whether or not anything sits under it. Adding another here made two
		 * steps where the design has one — and on a fullscreen app that is a
		 * band of window not being worked in.
		 *
		 * The other three sides keep theirs: nothing else on the page is offering
		 * to hold the content off an edge.
		 */
		padding: 0 var(--space-m) var(--space-m);
		min-block-size: calc(100dvh - var(--bar-block-size));

		display: flex;
		flex-direction: column;
	}

	/*
	 * THE VIEW KEYS. A row of them, sized like every other control on this site
	 * so the whole page answers a pointer the same way.
	 */
	.views {
		display: flex;
		gap: var(--space-2xs);
	}

	.view {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2xs);

		block-size: var(--control-block-size);
		padding-inline: var(--space-xs);
		border: none;
		border-radius: var(--radius-round);
		background: none;
		color: inherit;
		font-size: var(--text-s);
		cursor: pointer;
	}

	.view :global(svg) {
		inline-size: 1em;
		block-size: 1em;
	}

	.view:hover {
		background-color: var(--surface-hover);
		box-shadow: inset 0 0 0 1px var(--edge);
	}

	.view:focus-visible {
		outline: 2px solid var(--fg);
		outline-offset: 2px;
	}

	/* THE ONE IN USE. `aria-pressed` is the state, and this draws it — so the
	 * mark and the announcement cannot disagree, because they are the same
	 * attribute read twice. */
	.view[aria-pressed='true'] {
		background-color: var(--accent);
		color: var(--accent-fg);
	}

	/*
	 * THE WORKING AREA. One column normally and two in `split`, from the same
	 * grid — so the sheet does not move sideways when the proof appears beside
	 * it, it only narrows.
	 */
	/*
	 * THE WORKING AREA TAKES WHAT THE DESK HAS LEFT once the keys above it have
	 * had their row. It was `min-block-size: 60dvh`, which was a guess at how
	 * much of the window would be left over and wrong at every size but the one
	 * it was picked at. `flex: 1` does not guess.
	 */
	.area {
		flex: 1;
		min-block-size: 0;

		display: grid;
		gap: var(--space-xs);
	}

	/*
	 * SPLIT IS TWO COLUMNS WHERE THERE IS ROOM AND TWO ROWS WHERE THERE IS NOT.
	 * Split means "both at once" and that is true either way; what a narrow
	 * window cannot give is two readable columns, and halving 380px into two
	 * would honour the word and lose the point of it.
	 *
	 * `minmax(0, 1fr)` twice, and not `1fr 1fr`, for the reason the workbench
	 * gives: a track's default minimum is its content, and one long line in the
	 * source would push its own column wider than its half.
	 */
	@media (min-width: 48rem) {
		.area[data-view='split'] {
			grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		}
	}

	/*
	 * EACH PANE SCROLLS ITSELF. The app is exactly the window, so a document
	 * longer than the pane has to go somewhere — and it goes inside the pane
	 * rather than lengthening the page. That is what keeps the keys, the
	 * workspace and the outline on screen while somebody is a thousand lines
	 * down a document, which is the point of an app shell.
	 *
	 * `min-block-size: 0` again: these are grid items and a grid track's default
	 * minimum is its content, so without it the pane would grow to fit the
	 * document and `overflow` would never have anything to do.
	 */
	.sheet,
	.proof {
		min-block-size: 0;
		overflow-y: auto;

		padding: var(--space-s);
		border: 1px solid var(--edge);
		border-radius: var(--space-2xs);
	}

	/* The sheet is where the SOURCE is, so it is set in a face where a column of
	 * characters lines up. The proof beside it is prose and is not. */
	.sheet pre,
	textarea.sheet {
		margin: 0;
		font-family: ui-monospace, monospace;
		font-size: var(--text-s);
		white-space: pre-wrap;
	}

	/*
	 * The textarea keeps the box the sheet already draws and gives up everything
	 * the browser would draw over it. `resize: none` because the pane's height is
	 * the window's — a drag handle offering to change it would be offering
	 * something the layout takes straight back.
	 */
	textarea.sheet {
		resize: none;
		border: 1px solid var(--edge);
		background: none;
		color: inherit;
		line-height: var(--leading-prose);
	}

	textarea.sheet:focus-visible {
		outline: 2px solid var(--fg);
		outline-offset: -1px;
	}

	/* Not the document, so it does not read as one. */
	.pending {
		color: color-mix(in oklab, var(--fg) 60%, transparent);
		font-size: var(--text-s);
	}

	.proof h2,
	.proof h3 {
		font-size: var(--text-m);
		line-height: var(--leading-tight);
	}

	.proof > * + * {
		margin-block-start: var(--space-xs);
	}

	/*
	 * THE THREE REGIONS, as one grid. The rails were absolute against `.prose`
	 * and hung in the margins either side of it, which is the Emoji Viewer's
	 * arrangement and was the wrong one here: a full-width page HAS no margins,
	 * and the measure that would have made them was the thing squeezing the
	 * editor in the first place.
	 *
	 * `minmax(0, 1fr)` on the middle and not `1fr`. A grid track's default
	 * minimum is its content, and a long unbroken line in the sheet would push
	 * the desk wider than the window and take the whole page sideways with it.
	 */
	/*
	 * THE WORKBENCH TAKES WHAT THE APP HAS LEFT, and its three columns take the
	 * full height of it. `align-items: start` was here and is gone: it held every
	 * region to its own content, so the rails ended half way down the window and
	 * the desk stopped wherever the document did.
	 *
	 * `min-block-size: 0` on a flex child, and it is not decoration. A flex item's
	 * default minimum is its content, so a long document would push the workbench
	 * past the bottom of the app and take the page's scroll back — the exact
	 * thing the app's fixed height is for.
	 */
	.workbench {
		flex: 1;
		min-block-size: 0;

		display: grid;
		/*
		 * ONE STEP EVERYWHERE. The three regions, the keys against the panes, the
		 * panes against each other and the two sections in the rail all keep the
		 * same `--space-xs`, so nothing in the app is parted more than anything
		 * else and no gap reads as a division that is not one.
		 *
		 * It was `--space-m` throughout, which is the letter's step — right on a
		 * page of prose, where space is what separates one thought from the next,
		 * and too much on a working surface, where every step of it is window not
		 * being worked in. The EDGES keep `--space-m`: holding the app off the
		 * window is a different job from parting its regions from each other.
		 */
		gap: var(--space-xs);
	}

	.desk {
		display: flex;
		flex-direction: column;
		gap: var(--space-xs);
		/* Both axes, and for the same reason: a long line must not widen the desk
		 * and a long document must not lengthen it. */
		min-inline-size: 0;
		min-block-size: 0;
	}

	/*
	 * THE RAILS GO when the window cannot hold three columns, and the desk keeps
	 * the whole width. Nothing is lost with them: the document is on the desk and
	 * the workspace is a way of choosing another one, not the only way.
	 */
	/*
	 * NOT STICKY ANY MORE. A rail used to be as tall as its own list and stuck to
	 * the bar as the page went past it; the page does not go past anything now,
	 * so it is a full-height column that scrolls its own list instead. A
	 * workspace of two hundred files keeps the desk beside it exactly where it
	 * was.
	 */
	.rail {
		display: none;

		min-block-size: 0;
		flex-direction: column;
	}

	/* Two rails and a desk. The rails are fixed at 12rem because a column of file
	 * names does not want to grow with the window — only the desk does. */
	@media (min-width: 64rem) {
		.workbench {
			grid-template-columns: 12rem minmax(0, 1fr) 12rem;
		}

		/*
		 * PUT AWAY, A PANEL GIVES ITS COLUMN BACK rather than leaving an empty
		 * one. The desk takes the width — which is the point of a switch on a
		 * working surface, and would be no point at all if the room stayed
		 * reserved.
		 *
		 * Four states written out rather than a calc. Two panels give exactly
		 * four, each one a line naming what is on the bench, and a reader can see
		 * the whole set at once instead of working it out from a rule.
		 */
		.workbench[data-workspace='closed'] {
			grid-template-columns: minmax(0, 1fr) 12rem;
		}

		.workbench[data-outline='closed'] {
			grid-template-columns: 12rem minmax(0, 1fr);
		}

		.workbench[data-workspace='closed'][data-outline='closed'] {
			grid-template-columns: minmax(0, 1fr);
		}

		.workbench[data-workspace='closed'] .workspace,
		.workbench[data-outline='closed'] .outline {
			display: none;
		}

		.rail {
			display: flex;
		}
	}

	/* The heading stays; the list under it is what moves. */
	.rail ol {
		min-block-size: 0;
		overflow-y: auto;
	}

	.rail h2 {
		font-size: var(--text-s);
		line-height: var(--leading-tight);
		color: color-mix(in oklab, var(--fg) 60%, transparent);
	}

	/*
	 * THE SECTIONS. Scratch is one and the files are another, and they are marked
	 * as sections rather than run together because they are different kinds of
	 * thing: one is in this browser and one is somewhere else. The rail scrolls
	 * as a whole, so the sections are stacked and only the rail has an overflow.
	 */
	.section {
		display: flex;
		flex-direction: column;
		min-block-size: 0;
	}

	.section + .section {
		margin-block-start: var(--space-xs);
	}

	.section h2 {
		display: flex;
		align-items: center;
		gap: var(--space-2xs);

		font-size: var(--text-s);
		line-height: var(--leading-tight);
		color: color-mix(in oklab, var(--fg) 60%, transparent);
	}

	/* At the end of the heading it belongs to, so it reads as "Scratch, and one
	 * more" rather than as a control of the rail's. */
	.add {
		margin-inline-start: auto;
	}

	.add,
	.close {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex: none;

		inline-size: 1.5rem;
		block-size: 1.5rem;
		padding: 0;
		border: none;
		border-radius: var(--radius-round);
		background: none;
		color: inherit;
		cursor: pointer;
	}

	.add :global(svg),
	.close :global(svg) {
		inline-size: 0.875rem;
		block-size: 0.875rem;
	}

	.add:hover,
	.close:hover {
		background-color: var(--surface-hover);
		box-shadow: inset 0 0 0 1px var(--edge);
	}

	.add:focus-visible,
	.close:focus-visible {
		outline: 2px solid var(--fg);
		outline-offset: -2px;
	}

	/*
	 * A ROW IS TWO CONTROLS, not one with something inside it. A button cannot
	 * hold another button, and the name and the close do different things — so
	 * they are siblings, and the name takes the room the close does not.
	 */
	.row {
		display: flex;
		align-items: center;

		/*
		 * A STEP BETWEEN THE TWO WASHES. Both the selected name and the hovered
		 * close draw a rounded ground, and with nothing between them the two
		 * touched and read as one shape with a bite out of it. The same step the
		 * rows keep from each other, so the air around a row is even on all four
		 * sides.
		 */
		gap: var(--space-2xs);
	}

	/*
	 * `flex: 1` AND `inline-size: auto`, because `.file` is 100% wide on its own
	 * — which is right for a row that is only a name, and in a row that also
	 * holds a close it means 100% of the RAIL, pushing the close past the edge.
	 * Here the name takes what is left instead.
	 */
	.row .file {
		flex: 1;
		inline-size: auto;
		min-inline-size: 0;
	}

	/* The close is drawn only when the row is pointed at or reached by Tab, so a
	 * column of notes is a column of names rather than a column of crosses. It
	 * stays in the layout throughout, or the name would jump as it appeared. */
	.close {
		visibility: hidden;
	}

	.row:hover .close,
	.row:focus-within .close {
		visibility: visible;
	}

	/*
	 * A FINGER HAS NO HOVER, so on a touchscreen the close is simply there. The
	 * rule above would leave it reachable only by tapping the name first — which
	 * OPENS the note — so the way to close a note would be to open it, which is
	 * not a way to close a note.
	 *
	 * `any-pointer: coarse` and not `hover: none`, which is the same question the
	 * stylesheet asks about target sizes and for the same reason: what matters is
	 * whether a finger is available at all, and a laptop with a touchscreen has
	 * one whatever its trackpad can also do.
	 */
	@media (any-pointer: coarse) {
		.close {
			visibility: visible;
		}
	}

	/*
	 * A STEP OF AIR BETWEEN ROWS. The rows had none, so six file names read as
	 * one block of text with the rounded wash appearing inside it on hover. The
	 * gap is what makes each one a thing of its own before anybody points at it.
	 *
	 * Both lists take it. The workspace is what asked for it and the outline is
	 * the same shape standing on the other side of the desk; one loose and one
	 * tight would read as two different kinds of list.
	 */
	.rail ol {
		list-style: none;
		padding: 0;
		margin-block-start: var(--space-2xs);
		display: flex;
		flex-direction: column;
		gap: var(--space-2xs);
	}

	/* THE FILES. A button and not a link: opening one changes what this page is
	 * showing rather than going anywhere, and the address bar should not claim
	 * otherwise until a document has an address of its own. */
	.file {
		inline-size: 100%;
		display: flex;
		align-items: center;
		gap: var(--space-2xs);

		padding: var(--space-2xs) var(--space-xs);
		border: none;
		border-radius: var(--radius-round);
		background: none;
		color: color-mix(in oklab, var(--fg) 60%, transparent);
		font-size: var(--text-s);
		line-height: var(--leading-tight);
		text-align: start;
		cursor: pointer;
	}

	.file :global(svg) {
		flex: none;
		inline-size: 1em;
		block-size: 1em;
	}

	/* The name is what gets clipped when the rail is too narrow for it, and the
	 * mark beside it stays whole. */
	.name {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.file:hover:not(:disabled) {
		color: var(--fg);
		background-color: var(--surface-hover);
		box-shadow: inset 0 0 0 1px var(--edge);
	}

	.file:focus-visible {
		outline: 2px solid var(--fg);
		outline-offset: -2px;
	}

	.file[aria-current='true'] {
		color: var(--fg);
		background-color: var(--surface);
	}

	/*
	 * WHAT THIS EDITOR CANNOT OPEN is still listed, and plainly inert. A picture
	 * and a PDF belong to the folder whether or not this app can show them, and a
	 * row that is present and obviously dead answers "where did it go" in a way
	 * an absent row never can.
	 */
	.file.inert {
		color: color-mix(in oklab, var(--fg) 35%, transparent);
		cursor: default;
	}

	.heading {
		inline-size: 100%;
		/* The depth is a step of indent, and it comes from the heading level so a
		 * document with no H1 does not start indented. */
		padding: var(--space-2xs) var(--space-xs);
		padding-inline-start: calc(var(--space-xs) + var(--depth) * var(--space-s));

		border: none;
		border-radius: var(--radius-round);
		background: none;
		font-size: var(--text-s);
		line-height: var(--leading-tight);
		text-align: start;
		color: color-mix(in oklab, var(--fg) 60%, transparent);
		cursor: pointer;
	}

	.heading:hover {
		color: var(--fg);
		background-color: var(--surface-hover);
		box-shadow: inset 0 0 0 1px var(--edge);
	}

	.heading:focus-visible {
		outline: 2px solid var(--fg);
		outline-offset: -2px;
	}
</style>
