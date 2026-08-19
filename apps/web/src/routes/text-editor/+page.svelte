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
	import File from '@lucide/svelte/icons/file';
	import FileText from '@lucide/svelte/icons/file-text';
	import NotepadText from '@lucide/svelte/icons/notepad-text';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import FolderOpen from '@lucide/svelte/icons/folder-open';
	import Cloud from '@lucide/svelte/icons/cloud';
	import Plus from '@lucide/svelte/icons/plus';
	import X from '@lucide/svelte/icons/x';

	import ConnectDrive from '$lib/components/ConnectDrive.svelte';
	import Seo from '$lib/components/Seo.svelte';
	import { canPickFolder, folder } from '$lib/folder.svelte';
	import { outline as outlinePanel, workspace } from '$lib/panel.svelte';
	import { view } from '$lib/view.svelte';
	import { name as scratchName, PERMANENT, scratch } from '$lib/scratch.svelte';

	/*
	 * WHAT IS ON THE DESK. A scratch note and a document in a folder are not the
	 * same kind of thing — one is a number in this browser and the other is a path
	 * in somebody's workspace — so what is open is a KIND and a handle, and nothing
	 * has to guess which sort of thing a string was.
	 *
	 * The folder's own side of it lives in $lib/folder.svelte.ts, because reading a
	 * document is asynchronous and a folder closing has to take the open one with
	 * it. This holds only which of the two kinds is showing.
	 */
	type Open = { kind: 'scratch'; id: number } | { kind: 'file'; path: string };

	let open = $state<Open>({ kind: 'scratch', id: PERMANENT });

	const openScratch = $derived(open.kind === 'scratch' ? open.id : null);

	/* The input is the fallback path — see `canPickFolder`. Held so the button can
	 * be a button and the input can stay out of the reading. */
	let dirInput = $state<HTMLInputElement | null>(null);

	async function openFile(path: string) {
		open = { kind: 'file', path };
		await folder.open(path);
	}

	async function takeFolder(
		event: Event & { currentTarget: HTMLInputElement },
	) {
		const picked = [...(event.currentTarget.files ?? [])];
		// Cleared so choosing the SAME folder twice fires a change the second time.
		event.currentTarget.value = '';
		open = { kind: 'scratch', id: PERMANENT };
		await folder.take(picked);
	}

	// The stored notes arrive a tick after the first paint, which is what keeps
	// the prerendered HTML and the hydrated page agreeing about what is there.
	$effect(() => scratch.watch());

	// The bar draws each panel's switch, and the view keys, while this page is the
	// one showing.
	$effect(() => workspace.claim());
	$effect(() => outlinePanel.claim());
	$effect(() => view.claim());

	/* Ask whether a folder was remembered. It does not open one — a browser will
	 * not grant permission except in answer to a click — so what this can produce
	 * is an offer, and the offer is a button. See `look` and `resume`. */
	$effect(() => {
		void folder.look();
	});

	/* The drives this browser knows, read once. No tokens are touched. */
	$effect(() => {
		void folder.loadDrives();
	});

	/* The connect form takes the desk while it is up — see the note on it. */
	let connecting = $state(false);

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

			<!--
				THE FILES ARE REAL NOW, and until somebody hands over a folder there
				are none. The heading carries the folder's name once there is one, so
				the rail says WHICH workspace rather than just "Files" — a person with
				two of them open across two tabs should not have to guess.
			-->
			<section class="section">
				<h2>
					{folder.name ?? 'Files'}

					<!--
						TWO WAYS IN, AND ONLY ONE IS OFFERED. Chromium can hand over a
						folder the app could later write through; every other browser has
						`<input webkitdirectory>`, which is a snapshot and read-only. The
						control looks the same either way and the label does not, because
						what a visitor gets is not the same thing.
					-->
					{#if folder.name}
						<!--
							CLOSING IS A DECISION ABOUT THIS FOLDER, so it forgets it too —
							otherwise the next visit opens on the folder somebody just put
							away. The scratch notes are untouched: they were never in it.
						-->
						<button
							type="button"
							class="add"
							title="Put this folder away"
							aria-label="Put {folder.name} away"
							onclick={() => folder.close()}
						>
							<X aria-hidden="true" />
						</button>
					{:else if canPickFolder()}
						<button
							type="button"
							class="add"
							title="Open a folder from this device"
							aria-label="Open a folder from this device"
							onclick={() => folder.pick()}
						>
							<FolderOpen aria-hidden="true" />
						</button>
					{:else}
						<button
							type="button"
							class="add"
							title="Open a folder from this device, as it is now"
							aria-label="Open a folder from this device, read-only"
							onclick={() => dirInput?.click()}
						>
							<FolderOpen aria-hidden="true" />
						</button>

						<!--
							OUT OF THE READING, and not `display: none`, which would take it
							out of the tab order and out of reach of the click above. The
							button beside it is the control; this is the mechanism.
						-->
						<input
							bind:this={dirInput}
							class="visually-hidden"
							type="file"
							tabindex="-1"
							aria-hidden="true"
							webkitdirectory
							multiple
							onchange={takeFolder}
						/>
					{/if}
				</h2>

				{#if folder.reading}
					<p class="note">Reading the folder.</p>
				{:else if folder.waiting}
					<!--
						A FOLDER FROM LAST TIME. Named, because "the folder from last time"
						is a question nobody can answer and "Notes" is one they can. It is a
						button because a browser grants the permission again only in answer
						to a press.
					-->
					<p class="note">Last time you had {folder.waiting.name}.</p>
					<button type="button" class="file" onclick={() => folder.resume()}>
						<FolderOpen aria-hidden="true" />
						<span class="name">Open it again</span>
					</button>
				{:else if folder.trouble === 'idle' && !folder.count}
					<!--
						NO FOLDER YET, which is not a failure and does not read as one. It
						says what the control above does, because a mark on its own is a
						thing to work out and this is the one row a first visit sees.
					-->
					<p class="note">
						No folder open. The scratch notes above are kept in this browser.
					</p>
				{:else if folder.trouble === 'empty'}
					<p class="note">Nothing in {folder.name} this editor can open.</p>
				{:else if folder.trouble === 'unreadable'}
					<p class="note">That folder could not be read.</p>
				{:else if folder.trouble === 'denied'}
					<p class="note">That folder was not handed over.</p>
				{/if}

				<!--
					NO LIST UNTIL THERE IS SOMETHING IN IT. An empty <ol> is not nothing:
					it keeps the step every list holds off what is above it, so the pane
					that had no rows carried four pixels more foot than the two that did.
				-->
				{#if folder.rows.length}
					<ol>
						{#each folder.rows as row (row.path)}
							<li>
								{#if row.kind === 'dir'}
									<!--
										A FOLDER FOLDS. `aria-expanded` is the state and the mark
										is drawn from it, so the announcement and the drawing are
										one attribute read twice.
									-->
									<button
										type="button"
										class="file folder"
										style="--depth: {row.depth}"
										aria-expanded={!folder.isClosed(row.path)}
										title={row.path}
										onclick={() => folder.fold(row.path)}
									>
										{#if folder.isClosed(row.path)}
											<ChevronRight aria-hidden="true" />
										{:else}
											<ChevronDown aria-hidden="true" />
										{/if}
										<span class="name">{row.name}</span>
									</button>
								{:else}
									<button
										type="button"
										class="file"
										class:inert={!row.openable}
										style="--depth: {row.depth}"
										aria-current={open.kind === 'file' && open.path === row.path
											? 'true'
											: undefined}
										disabled={!row.openable}
										title={row.path}
										onclick={() => openFile(row.path)}
									>
										<!--
											A PAGE WITH WRITING ON IT, or a page without. What these
											rows have in common is being files this editor cannot
											read, so they get the page with nothing on it.
										-->
										{#if row.openable}
											<FileText aria-hidden="true" />
										{:else}
											<File aria-hidden="true" />
										{/if}
										<span class="name">{row.name}</span>
									</button>
								{/if}
							</li>
						{/each}
					</ol>
				{/if}
			</section>

			<!--
				DRIVES ARE THEIR OWN PANE, because a folder on this device and a folder
				on a server are different kinds of thing to somebody choosing between
				them — one is here and one is somewhere else, and which of those it is
				matters more than which folder it is.

				The editor cannot tell them apart once one is open, which is the seam
				doing its job. A person can, and the rail says so.
			-->
			<section class="section">
				<h2>
					Drives
					<button
						type="button"
						class="add"
						title="Connect a Nextcloud or ownCloud drive"
						aria-label="Connect a drive"
						onclick={() => (connecting = true)}
					>
						<Plus aria-hidden="true" />
					</button>
				</h2>

				{#if !folder.drives.length}
					<p class="note">No drives. Nextcloud and ownCloud.</p>
				{:else}
					<ol>
						{#each folder.drives as drive (drive.id)}
							<li class="row">
								<button
									type="button"
									class="file"
									title="{drive.user} at {drive.base}"
									onclick={() => folder.openDrive(drive.id)}
								>
									<Cloud aria-hidden="true" />
									<span class="name">{drive.name}</span>
								</button>

								<button
									type="button"
									class="close"
									title="Forget it"
									aria-label="Forget {drive.name}"
									onclick={() => folder.dropDrive(drive.id)}
								>
									<X aria-hidden="true" />
								</button>
							</li>
						{/each}
					</ol>
				{/if}
			</section>
		</nav>

		<div class="desk">
			<!--
		THE SHEET AND THE PROOF. In `split` both are drawn; otherwise one is. They
		are siblings in a grid rather than one element that changes what it is,
		because in `split` they are genuinely two things and a component that
		becomes two under a flag is harder to reason about than two that are
		sometimes one.
	-->
			{#if connecting}
				<div class="area">
					<ConnectDrive
						onconnect={async (drive, token) => {
							connecting = false;
							open = { kind: 'scratch', id: PERMANENT };
							await folder.connect(drive, token);
						}}
						oncancel={() => (connecting = false)}
					/>
				</div>
			{:else}
				<div class="area" data-view={view.current}>
					{#if view.current !== 'preview'}
						<!--
						A SCRATCH NOTE CAN BE TYPED IN and a placeholder file cannot,
						because one of them exists. The textarea is deliberately plain
						and deliberately temporary — it is standing in for an editor, and
						the whole reason for the scratch notes is to have somewhere real
						to put one when it arrives.
					-->
						{#if openScratch !== null}
							<div class="sheet">
								<textarea
									class="column"
									aria-label="{scratchName(openScratch)}, the document"
									placeholder="Type something."
									value={scratch.text(openScratch)}
									oninput={(event) =>
										scratch.write(openScratch, event.currentTarget.value)}
								></textarea>
							</div>
						{:else if folder.openText !== null && folder.writable}
							<!--
							A WRITABLE FOLDER TAKES TYPING. The sheet keeps the words the
							moment they are typed and the disk catches up a beat later — see
							SETTLE_MS. A textarea and not a `<pre>` because the difference
							between the two IS whether this folder can be written to, and a
							sheet that took typing and dropped it would be worse than one
							that never offered.
						-->
							<div class="sheet">
								<textarea
									class="column"
									aria-label="{open.kind === 'file'
										? open.path
										: 'The document'}, the document"
									value={folder.openText}
									oninput={(event) => folder.edit(event.currentTarget.value)}
								></textarea>
							</div>
						{:else}
							<!--
							AND A SNAPSHOT DOES NOT. It is a `<pre>`, which says so without a
							word: there is no folder behind these files to write back to.
						-->
							<div class="sheet" aria-label="The document">
								{#if folder.openText !== null}
									<pre class="column">{folder.openText}</pre>
								{:else}
									<p class="pending">
										{open.kind === 'file'
											? 'That document could not be read.'
											: 'Nothing is open.'}
									</p>
								{/if}
							</div>
						{/if}
					{/if}

					{#if view.current !== 'edit'}
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
								<!--
								WHERE THE WORDS STAND, and this is the one place it can be said.
								A save that failed leaves the sheet looking exactly like a save
								that worked, so a document that is not on the disk has to say so
								somewhere or nobody will ever know.
							-->
								{#if folder.save === 'trouble'}
									<p class="pending" role="status">
										{folder.saveWhy === 'denied'
											? 'This folder cannot be written to.'
											: folder.saveWhy === 'gone'
												? 'That document is no longer there.'
												: 'Those words are not saved.'}
									</p>
								{:else if folder.save === 'saving'}
									<p class="pending" role="status">Saving.</p>
								{:else if folder.save === 'dirty'}
									<p class="pending" role="status">Not saved yet.</p>
								{:else}
									<p class="pending">
										There is no setting yet. What is on the sheet is the
										document as it is written.
									</p>
								{/if}
							{/if}
						</div>
					{/if}
				</div>
			{/if}
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
			<!--
				ONE SECTION AND NOT NONE, so the outline is a pane by the same rule
				the workspace's two are rather than by a rule of its own. A rail
				holds panes; that this one holds a single pane is a fact about the
				outline and not a second kind of rail.
			-->
			<section class="section">
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
			</section>
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
	 *
	 * `block-size` AND NOT `min-block-size`, and the word in the first line is
	 * what settles it: EXACTLY is a height, and a minimum is a floor with nothing
	 * over it. The rail is a grid item in an auto row, and an auto row is sized by
	 * its content unless the grid has a height to divide up — so with only a
	 * minimum here, nothing above the rail had a definite height to give it, the
	 * row grew to fit the whole list, and the page grew with it. The rail's
	 * `overflow-y` had nothing to overflow and never once ran.
	 *
	 * It was measured: five scratch notes in a 320px window pushed the page 112px
	 * past its end. Every region on this page scrolling itself rests on this one
	 * declaration.
	 */
	.app {
		/*
		 * ONE STEP ON ALL FOUR SIDES, and the top one is the bar's to draw. The bar
		 * is a control between two `--space-xs` paddings, so the lower of them is
		 * already this same step; a padding here would make two where the design
		 * has one.
		 *
		 * `--space-xs` and not `--space-m`, so the frame round the regions is the
		 * step that parts them from each other. An edge and a gap at different
		 * sizes read as two ideas about one space — which is the answer the first
		 * site's editor reached, where a single token is both the gutter between
		 * the panes and the padding around them.
		 */
		padding: 0 var(--space-xs) var(--space-xs);
		block-size: calc(100dvh - var(--bar-block-size));

		/*
		 * THE DESK, and the panes are sheets laid on it. It was `--bg` with a
		 * hairline round each pane, which is a line drawn between two things that
		 * are the same colour — the least the design can do, and the thing
		 * `--surface` exists to make unnecessary: it is what tells a supporting
		 * area from the thing it supports without drawing a line between them.
		 *
		 * So the SPACE does the parting. The gutter is already there and already
		 * one step; giving it a colour of its own is what makes it read as a field
		 * the panes sit on rather than as a gap between two edges.
		 *
		 * THE RAILS TAKE NO COLOUR OF THEIR OWN and let this through, so there are
		 * two shades here and not three: the document, and everything that is not
		 * the document. The first site's editor has a third, a step between the
		 * desk and the sheet for its rails — it needs one because its rails are
		 * panes with corners of their own, and these are bare lists.
		 */
		background-color: var(--surface);
		/*
		 * THE SIZE OF A CONTROL IN A RAIL. Smaller than the bar's `2rem`, because
		 * these sit at the end of a heading or a file row rather than in a bar
		 * with nothing else in it, and a control the height of the row it is in
		 * would leave the row no line to be.
		 *
		 * Written down because THREE rules read it and one of them is not a
		 * control: the add, the close, and the height of every heading in a pane.
		 * That last is the reason it is a token at all — see `.section h2`.
		 */
		--rail-control-block-size: 1.5rem;

		display: flex;
		flex-direction: column;
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

		/*
		 * `--bg` AND NOT A THIRD COLOUR. The rule the whole site keeps is that the
		 * content is `--bg` — white in light, black in dark, and never anything
		 * else — and the furniture around it steps off that. A document is the
		 * content here, so the sheet and the proof are the only two things in this
		 * app wearing it.
		 *
		 * It puts the DOCUMENT at the far end in both modes and the desk a step in
		 * from it, which is the arrangement every editor uses and is why it needs
		 * no explaining to anybody who opens this. The first site's editor reads
		 * the other way in dark — its sheet is the LIGHTEST thing, because there
		 * the metaphor is paper on a desk and paper stays paper. Both are
		 * coherent; this one is the one this site already committed to.
		 */
		background-color: var(--bg);
		border-radius: var(--space-2xs);
	}

	/*
	 * THE MEASURE, AND THE PANE IS NOT IT. The sheet stays the width of the desk
	 * and the COLUMN inside it caps — a pane that narrowed with its text would be a
	 * white card floating on a grey field, which is a different design.
	 *
	 * TWO NUMBERS BECAUSE THERE ARE TWO FACES. The sheet is monospace and the proof
	 * is prose, and the same pixel width is a different number of characters in
	 * each: 52rem is about 82 columns of the mono face, 34rem about 68 of the body
	 * face, and those are the same reading comfort. Both from the first site.
	 *
	 * The cap goes on a WRAPPER and not on the textarea, so the pane keeps its
	 * padding and its scroll and the text column is the only thing bounded.
	 */
	.sheet .column {
		max-inline-size: 52rem;
	}

	/* The proof holds whatever a renderer gives it, so the cap goes on its CHILDREN
	 * — there is no one element to put it on and there should not be. */
	.proof > :global(*) {
		max-inline-size: 34rem;
	}

	/* Full height, so the pane's whole area takes a click into the text rather than
	 * only the part a short document reaches. */
	textarea.column {
		/*
		 * BLOCK, AND THAT IS THE LINE THAT MATTERS. A textarea is an inline-block by
		 * default, so it sits on the BASELINE of a line box and leaves the
		 * descender's space under it — the same default the reset in src/app.css
		 * corrects for an <img> and an <svg>, and for the same reason.
		 *
		 * Measured, it was 8px: the sheet is exactly as tall as the window allows,
		 * the textarea fills it, and those 8 put the pane 8px over its own height —
		 * so an empty document showed a scrollbar with nothing to scroll to.
		 */
		display: block;
		inline-size: 100%;
		min-block-size: 100%;
	}

	/* The sheet is where the SOURCE is, so it is set in a face where a column of
	 * characters lines up. The proof beside it is prose and is not. */
	.sheet pre,
	.sheet textarea {
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
	.sheet textarea {
		resize: none;
		/* The pane above draws the box and the colour; this gives up everything the
		 * browser would draw over them. `resize: none` because the pane's height is
		 * the window's — a drag handle offering to change it would be offering
		 * something the layout takes straight back. */
		border: none;
		/*
		 * TRANSPARENT, so the PANE'S colour is what shows. A textarea's default
		 * background is the system's `field`, which follows `color-scheme` — and in
		 * dark that is #3b3b3b, a light grey box sitting on a black sheet.
		 *
		 * It read as correct for a while because in LIGHT the default is white and
		 * the sheet is white, so the two agreed by luck and the mistake was only
		 * visible in the mode nobody had screenshotted. This declaration was here
		 * once and was taken off when the textarea WAS the pane — where transparent
		 * would have punched through to the desk. Inside a pane it is right again.
		 */
		background: none;
		color: inherit;
		line-height: var(--leading-prose);
	}

	/* INSIDE THE PANE, by the ring's whole width. It was -1px, which put it over
	 * the hairline that used to be there; with the hairline gone the ring has
	 * nothing to sit on and would hang half of itself in the gutter, where the
	 * pane beside it is 8px away. */
	.sheet textarea:focus-visible {
		outline: 2px solid var(--fg);
		/* Inside the column, which is inside the pane's padding, so the ring is not
		 * drawn under the pane's own rounded edge. */
		outline-offset: 0;
	}

	/*
	 * NOT THE DOCUMENT, so it does not read as one. Both the proof's "there is no
	 * setting yet" and the sheet's "that could not be read" wear it: neither is
	 * anybody's words, and the one thing they must not look like is the words.
	 */
	.pending {
		color: color-mix(in oklab, var(--fg) 60%, transparent);
		font-size: var(--text-s);
	}

	/*
	 * WHAT A RAIL SAYS WHEN IT HAS NOTHING TO LIST. The same grey as a heading and
	 * the same inset as the rows, so it stands in the column rather than beside it.
	 *
	 * `text-wrap: pretty` because these are two or three words wider than a 12rem
	 * rail, and a last line holding one word is the shape a message like this
	 * always lands in.
	 */
	.note {
		padding: var(--space-2xs);

		color: color-mix(in oklab, var(--fg) 60%, transparent);
		font-size: var(--text-s);
		line-height: var(--leading-tight);
		text-wrap: pretty;
	}

	/*
	 * THE PROOF'S OWN TYPE IS GONE WITH THE MARKUP IT SET. `.proof h2`, `h3` and
	 * the stack between them styled a hand-written document that stood in for a
	 * renderer; there is a real document on the sheet now and nothing setting it,
	 * so those rules had no elements left. They come back with the renderer, which
	 * is the commit that can say what they should be.
	 */

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
		 * being worked in. The EDGES came to it afterwards: they were `--space-m`
		 * for one commit, on the argument that holding the app off the window is a
		 * different job from parting its regions from each other, and the first
		 * site had already tried that and written down what it read as.
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
	 * so it is a full-height column and what scrolls is the column. A workspace of
	 * two hundred files keeps the desk beside it exactly where it was.
	 *
	 * THE OVERFLOW IS HERE AND NOT ON THE LIST, which is what makes a pane the
	 * height of what is in it. A list that scrolls inside its pane holds the pane
	 * open at whatever height is going spare — so the pane stops being sized by
	 * its contents and starts being sized by the window, which is the one thing
	 * these are not.
	 *
	 * The rail is the only thing on this page with an `--space-xs` gap that is not
	 * the workbench's own: the panes in a rail are parted by exactly what parts
	 * the rail from the desk.
	 */
	.rail {
		display: none;

		min-block-size: 0;
		overflow-y: auto;
		flex-direction: column;
		gap: var(--space-xs);
	}

	/*
	 * TWO RAILS AND A DESK, and the rails are FIXED because a column of file names
	 * does not want to grow with the window — only the desk does.
	 *
	 * THE TWO ARE NOT THE SAME WIDTH, and that is the first site's answer rather
	 * than an oversight. The workspace holds paths — names that nest, indent, and
	 * carry a folder's name in front of them — and the outline holds headings,
	 * which are short and already stepped. 15rem and 13rem, from there.
	 *
	 * (The first site's own note beside those two says "same width and material as
	 * the workspace on the other side" while the rules say 15 and 13. The material
	 * is shared; the width is not, and the widths are the part that was measured.)
	 */
	@media (min-width: 64rem) {
		.workbench {
			grid-template-columns: 15rem minmax(0, 1fr) 13rem;
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
			grid-template-columns: minmax(0, 1fr) 13rem;
		}

		.workbench[data-outline='closed'] {
			grid-template-columns: 15rem minmax(0, 1fr);
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

	/* Nothing moves inside a pane — see the overflow on `.rail`. */

	/*
	 * THE SECTIONS ARE THE PANES. Scratch is one and the files are another, and
	 * they were marked as sections before they were drawn as anything because they
	 * are different kinds of thing: one is in this browser and one is somewhere
	 * else. Giving each its own corners says out loud what the markup already
	 * said, and says it to the eye rather than only to a screen reader.
	 *
	 * ONE SHADE ACROSS ALL OF THEM. Two panes in two colours would be a claim that
	 * one matters more, and the difference between them is what they hold and not
	 * how much they are worth. What separates them is the gap, the same as
	 * everywhere else on this page.
	 *
	 * `flex: none` is what keeps a pane the height of its content. Flex items do
	 * not grow on their own, but they DO shrink, and a rail with more in it than
	 * fits would otherwise squeeze both panes to fit rather than scrolling.
	 */
	.section {
		flex: none;

		display: flex;
		flex-direction: column;

		padding: var(--space-xs);
		/*
		 * MORE AT THE FOOT THAN AT THE HEAD, and it is what makes the pane look
		 * evenly filled rather than measured evenly. The heading above is a
		 * CONTROL'S height and the text in it is centred, so the air over that
		 * text is the pane's own padding plus whatever the control leaves around
		 * it; the last row below has only the pane's padding and its own. Matching
		 * the two numbers would leave the pane visibly bottom-light — so what is
		 * matched is the air, which is the thing being looked at.
		 *
		 * ONE RUNG UP FROM THE OTHER THREE, and it stays one rung up now that they
		 * have all moved: at 4 the foot was 8, and at 8 it is 16.
		 *
		 * MEASURE THE INK AND NOT THE LINE BOXES, and this is the whole of why 16
		 * is here rather than 12. By the boxes, 16 is plainly wrong — 15.3px over
		 * the heading against 19.4 under the last row — and 12 squares them at 15.3
		 * and 15.4. Set both and look at them, and 12 is the one that reads
		 * top-heavy.
		 *
		 * A line box is not where the letters are. The heading's carries half its
		 * leading above the cap, so its ink starts 3px below the top of its own
		 * box; the last row's name ends in a descender that reaches the bottom of
		 * its box exactly. So the air a reader actually sees is 18.3 against 19.4
		 * at a foot of 16 — a pixel apart — and 18.3 against 15.4 at 12, which is
		 * three the other way.
		 *
		 * The two numbers here are UNEQUAL ON PURPOSE. Squaring them is the obvious
		 * edit and it has been made and undone once; what is being balanced is what
		 * can be seen, and the two paddings are not made of the same parts.
		 */
		padding-block-end: var(--space-m);
		border-radius: var(--space-2xs);
		background-color: var(--rail);
	}

	/*
	 * THE HEADING TAKES THE ROWS' OWN INSET, so its first letter stands on the
	 * same line as theirs — and, through them, on the line the bar's own mark
	 * stands on. The pane is inset from the app's edge and the row is inset from
	 * the pane's, and the two together come to the bar's inline padding.
	 *
	 * EVERY HEADING IS A CONTROL TALL, and only one of them holds a control.
	 * "Scratch" carries the button that opens a note, so its row came out taller
	 * than "Files" and "Outline" by the difference between a control and a line of
	 * text — three panes down one window, each with a differently sized head. The
	 * minimum gives the other two the same room without giving them a control they
	 * have no use for, and it is the rail's own control size rather than a figure,
	 * so a heading cannot come to disagree with the button sitting in it.
	 */
	.section h2 {
		display: flex;
		align-items: center;
		gap: var(--space-2xs);

		min-block-size: calc(var(--rail-control-block-size) + var(--space-2xs) * 2);
		padding: var(--space-2xs);

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

		inline-size: var(--rail-control-block-size);
		block-size: var(--rail-control-block-size);
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
		 * NO GAP HERE ANY MORE. There is still a step between the two washes —
		 * both draw a rounded ground and touching would read as one shape with a
		 * bite out of it — but it is the CLOSE'S margin now, because a gap belongs
		 * to the row and cannot go away when only one of the two things it parts
		 * is there. See `.close`.
		 */
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

	/*
	 * THE CLOSE TAKES NO ROOM UNTIL IT IS WANTED, and the name has all of it
	 * until then. It used to sit in the layout the whole time, hidden — which
	 * kept the name from jumping as it appeared, and cost the name a control's
	 * width on every row for a control that is not there. A selected note could
	 * not draw its ground across its own row: the wash stopped 28px short of the
	 * end, at an edge with nothing on the other side of it.
	 *
	 * SO IT OPENS INSTEAD OF APPEARING. The width goes from nothing to a control
	 * and the name gives way as it does — one wash becoming two, over
	 * `--motion-morph`, which is the same length as every other thing on this site
	 * that changes what it is. The jump the old rule was avoiding is answered by
	 * the animation rather than by the reservation, so the name keeps the row.
	 *
	 * `visibility` IS IN THE TRANSITION, and it is doing a job `opacity` cannot: a
	 * button that is only transparent is still in the tab order, so a column of
	 * notes would hold a column of invisible controls to tab through. Transitioned
	 * rather than switched, so it stays `visible` while the width closes and the
	 * close does not vanish before it has finished leaving.
	 *
	 * The margin is the step between the two washes, and it collapses with the
	 * width because it is a step between two things and there is only one of them
	 * to begin with.
	 */
	.close {
		visibility: hidden;
		overflow: hidden;

		inline-size: 0;
		margin-inline-start: 0;
		opacity: 0;

		transition:
			inline-size var(--motion-morph),
			margin-inline-start var(--motion-morph),
			opacity var(--motion-morph),
			visibility var(--motion-morph);
	}

	.row:hover .close,
	.row:focus-within .close {
		visibility: visible;

		inline-size: var(--rail-control-block-size);
		margin-inline-start: var(--space-2xs);
		opacity: 1;
	}

	/*
	 * A KEYBOARD GETS IT AT ONCE. The morph is a POINTER'S affordance — a shape
	 * giving way as the hand arrives — and somebody stepping through with Tab has
	 * already asked for the next control rather than happening past it.
	 *
	 * It is also a correctness rule and not a preference. A control is not
	 * focusable while it is still opening, so for the length of the animation the
	 * close is not in the tab order at all: two quick presses of Tab step from the
	 * name straight to the next note, and the close a person was tabbing toward is
	 * the one thing they cannot reach. Measured — it is 180ms, which is well
	 * inside the gap between two deliberate keypresses.
	 */
	.row:focus-within .close {
		transition: none;
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

			inline-size: var(--rail-control-block-size);
			margin-inline-start: var(--space-2xs);
			opacity: 1;
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
	/*
	 * A ROW SITS AS FAR IN AS IT IS DEEP, and the indent is the whole of what says
	 * so. A guide line was drawn at every level a row had passed and has been
	 * taken off again: the rail is 15rem now and the folders open one at a time, so
	 * a column of nested names is short and the indent alone reads. The lines were
	 * answering a crowding that the width and the folding had already fixed.
	 *
	 * `--depth` defaults to 0 so a row that never sets it — a scratch note, a drive
	 * — is not indented by a variable it has never heard of.
	 */
	.file {
		--depth: 0;
		--indent: var(--space-m);

		inline-size: 100%;
		display: flex;
		align-items: center;
		gap: var(--space-2xs);

		padding: var(--space-2xs);
		/*
		 * AFTER THE SHORTHAND, and that is not a matter of tidiness. `padding` is a
		 * shorthand: written below this longhand it resets it, so an indent declared
		 * first and a `padding` declared second is no indent at all. It was, once,
		 * and it failed silently — the tree drew as a flat list.
		 */
		padding-inline-start: calc(var(--space-2xs) + var(--depth) * var(--indent));

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
		padding: var(--space-2xs);
		padding-inline-start: calc(
			var(--space-2xs) + var(--depth) * var(--space-s)
		);

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
