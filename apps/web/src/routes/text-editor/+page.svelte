<script lang="ts">
	/*
	 * THE TEXT EDITOR, with vscode.dev as the reference for what is underneath,
	 * so it behaves as somebody who knows VS Code expects: Monaco for the sheet
	 * on a computer, markdown-it for the proof and the outline, and the explorer's
	 * verbs on the workspace. A phone keeps a textarea, which Monaco does not
	 * support.
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
	import ChevronsDownUp from '@lucide/svelte/icons/chevrons-down-up';
	import ChevronsUpDown from '@lucide/svelte/icons/chevrons-up-down';
	import FilePlus from '@lucide/svelte/icons/file-plus';
	import FolderOpen from '@lucide/svelte/icons/folder-open';
	import FolderPlus from '@lucide/svelte/icons/folder-plus';
	import PencilOff from '@lucide/svelte/icons/pencil-off';
	import Cloud from '@lucide/svelte/icons/cloud';
	import Plus from '@lucide/svelte/icons/plus';
	import X from '@lucide/svelte/icons/x';

	import { bar, type BarStatus } from '$lib/bar.svelte';
	import ConnectDrive from '$lib/components/ConnectDrive.svelte';
	import MonacoSheet from '$lib/components/MonacoSheet.svelte';
	import QuickOpen, { type Item } from '$lib/components/QuickOpen.svelte';
	import {
		pressed,
		SHORTCUTS,
		type Shortcut,
		type ShortcutId,
		type Stroke,
	} from '$lib/shortcuts';
	import Placeholder from '$lib/components/Placeholder.svelte';
	import Seo from '$lib/components/Seo.svelte';
	import {
		canPickFolder,
		folder,
		type Made,
		type Refusal,
	} from '$lib/folder.svelte';
	import { outline as outlinePanel, workspace } from '$lib/panel.svelte';
	import { view } from '$lib/view.svelte';
	import { isMarkdown, NAMED_FENCE, set } from '$lib/markdown';
	import type { HLJSApi } from 'highlight.js';
	import { name as scratchName, PERMANENT, scratch } from '$lib/scratch.svelte';
	import { dirOf, type Row } from '$lib/workspace';
	import { tick, untrack } from 'svelte';
	import { MediaQuery } from 'svelte/reactivity';

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

	/* One folder put away. What was on the sheet goes with it if it was in it,
	 * and the sheet lands on the scratch note, as a closed note's does. */
	async function closeRoot(key: string) {
		if (!(await folder.close(key))) return;
		if (open.kind === 'file' && folder.rootKey(open.path) === null) {
			open = { kind: 'scratch', id: PERMANENT };
		}
		if (chosen && folder.rootKey(chosen.path) === null) chosen = null;
		if (clipboard && folder.rootKey(clipboard.row.path) === null) {
			clipboard = null;
		}
	}

	/*
	 * THE GAP BEFORE `change`. Firefox walks the whole folder AFTER its dialog
	 * closes and only then says anything, which on a big folder is seconds of a
	 * rail that looks like the press did not land. The page gets its focus back
	 * the moment the dialog goes, so that is when the rail starts saying it is
	 * reading; a `cancel` takes it back.
	 *
	 * `picking` is the pick itself, and the focus only counts while it is still
	 * going. Firefox sends `cancel` BEFORE the focus comes back, so a flag set on
	 * focus alone was set after the cancel had already cleared it — and the rail
	 * read a folder nobody had chosen forever.
	 */
	let gathering = $state(false);
	let picking = false;

	function pickSnapshot() {
		if (!dirInput) return;
		picking = true;
		window.addEventListener('focus', () => (gathering = picking), {
			once: true,
		});
		dirInput.click();
	}

	function cancelSnapshot() {
		picking = false;
		gathering = false;
	}

	async function takeFolder(
		event: Event & { currentTarget: HTMLInputElement },
	) {
		const picked = [...(event.currentTarget.files ?? [])];
		// Cleared so choosing the SAME folder twice fires a change the second time.
		event.currentTarget.value = '';
		try {
			await folder.take(picked);
		} finally {
			picking = false;
			gathering = false;
		}
	}

	// The stored notes arrive a tick after the first paint, which is what keeps
	// the prerendered HTML and the hydrated page agreeing about what is there.
	$effect(() => scratch.watch());

	// The bar draws each panel's switch, and the view keys, while this page is the
	// one showing.
	$effect(() => workspace.claim());
	$effect(() => outlinePanel.claim());
	$effect(() => view.claim());

	/*
	 * WHERE THE WORDS STAND, IN THE BAR, so it can be seen in every view. It was
	 * in the proof, which Edit hides — and a save that failed leaves the sheet
	 * looking exactly like one that worked. Typing and waiting to go out are one
	 * "Saving…", or the line would flicker between two words on every keystroke.
	 * The trip board's words, where the two say the same thing.
	 */
	function saveStatus(): BarStatus {
		if (folder.save === 'trouble') {
			return {
				text:
					folder.saveWhy === 'denied'
						? 'This folder can’t be written to.'
						: folder.saveWhy === 'gone'
							? 'That document is gone.'
							: 'Couldn’t save that.',
				tone: 'alert',
			};
		}
		if (folder.save === 'clean') {
			return { text: 'All changes saved.', tone: 'quiet' };
		}
		return { text: 'Saving…', tone: 'busy' };
	}

	// Only for a document that can be written to. A snapshot has nothing to save,
	// and a scratch note is kept in this browser as it is typed.
	$effect(() => {
		if (open.kind !== 'file') return;
		/* A snapshot's sheet takes no typing, and says why rather than leaving
		 * somebody to find out by trying. */
		if (!folder.writableAt(open.path)) {
			return bar.report({
				text: 'View only. This browser can’t save to the folder.',
				tone: 'quiet',
				Icon: PencilOff,
			});
		}
		return bar.report(saveStatus());
	});

	/*
	 * ON THE WAY OUT. Hidden is the last moment a page can count on — a phone
	 * backgrounds a tab and may never tell it again — so the words go out then.
	 * A page that is closing gets the browser's own "leave?" while anything is
	 * unsaved, because a write started during unload is not sure to finish.
	 */
	function onHidden() {
		if (document.visibilityState === 'hidden') void folder.flush();
	}

	function onLeave(event: BeforeUnloadEvent) {
		if (folder.save !== 'clean') event.preventDefault();
	}

	/* Ask whether a folder was remembered. It does not open one — a browser will
	 * not grant permission except in answer to a click — so what this can produce
	 * is an offer, and the offer is a button. See `look` and `resume`. */
	$effect(() => {
		untrack(() => void folder.look());
	});

	/* The drives this browser knows, read once. No tokens are touched. */
	$effect(() => {
		void folder.loadDrives();
	});

	/* The connect form takes the desk while it is up — see the note on it. */
	let connecting = $state(false);

	/* The drives this browser knows that are not open now: the rest are roots. */
	const closedDrives = $derived(
		folder.drives.filter(
			(drive) => !folder.roots.some((root) => root.drive === drive.id),
		),
	);

	function closeScratch(id: number) {
		scratch.close(id);

		// Closing the note you were looking at has to leave you somewhere. The
		// permanent one is still there — emptied — so it is where you land.
		if (openScratch === id && id !== PERMANENT) {
			open = { kind: 'scratch', id: PERMANENT };
		}
	}

	/* The words on the desk, whichever kind of thing is open, or null for none. */
	const source = $derived(
		openScratch !== null
			? scratch.text(openScratch)
			: folder.fetching
				? null
				: folder.openText,
	);

	/* A scratch note is taken as Markdown, since this is a Markdown editor; a
	 * file only if its name says so, as VS Code decides. */
	const markdown = $derived(
		openScratch !== null || (open.kind === 'file' && isMarkdown(open.path)),
	);

	/*
	 * highlight.js, fetched the first time a document names a language on a
	 * fence and kept after. `common` and not every language: the forty or so
	 * people write, at a fraction of the weight. Its arrival sets the document
	 * again, coloured.
	 */
	let highlighter = $state.raw<HLJSApi | null>(null);

	$effect(() => {
		if (highlighter || !markdown || !source || !NAMED_FENCE.test(source)) {
			return;
		}
		void import('highlight.js/lib/common').then(
			(loaded) => (highlighter = loaded.default),
		);
	});

	const setting = $derived(
		source !== null && markdown ? set(source, highlighter) : null,
	);

	/* The shallowest heading stands at the edge, so a document with no H1 does
	 * not open indented. */
	const shallowest = $derived(
		Math.min(...(setting?.headings.map((heading) => heading.depth) ?? [1])),
	);

	let sheetText = $state<HTMLTextAreaElement | null>(null);
	let monacoSheet = $state<MonacoSheet | null>(null);

	/*
	 * MONACO WHERE THE POINTER IS A MOUSE OR A TRACKPAD, and the textarea where
	 * it is a finger: Monaco's README answers "is the editor supported in mobile
	 * browsers?" with "No." False until the page is in a browser, so the
	 * prerendered sheet is the textarea and Monaco takes over once it has loaded.
	 */
	const computer = new MediaQuery('(pointer: fine)', false);
	let proof = $state<HTMLElement | null>(null);

	/*
	 * GO TO A LINE: the caret to it on the sheet and the proof scrolled to it,
	 * whichever of the two is showing. The offset is counted in the textarea's
	 * own value and not the source, because a textarea turns CRLF into LF and
	 * the file may not have.
	 */
	function goTo(line: number) {
		if (monacoSheet) {
			monacoSheet.goTo(line);
		} else if (sheetText) {
			const offset = sheetText.value
				.split('\n')
				.slice(0, line)
				.reduce((sum, text) => sum + text.length + 1, 0);
			sheetText.focus();
			sheetText.setSelectionRange(offset, offset);
			sheetText.scrollTop = lineTop(sheetText, offset);
		}
		proof
			?.querySelector(`[data-line="${line}"]`)
			?.scrollIntoView({ block: 'start' });
	}

	/*
	 * HOW FAR DOWN A TEXTAREA A LINE BEGINS, wrapping and all. Firefox scrolls
	 * to a caret it was handed and Chromium does not, so this asks a copy of the
	 * same width holding only the lines above, and reads its height.
	 */
	function lineTop(area: HTMLTextAreaElement, offset: number) {
		if (offset === 0) return 0;
		const copy = area.cloneNode() as HTMLTextAreaElement;
		copy.value = area.value.slice(0, offset - 1);
		Object.assign(copy.style, {
			position: 'absolute',
			visibility: 'hidden',
			inlineSize: `${area.clientWidth}px`,
			blockSize: '0',
			minBlockSize: '0',
			paddingBlock: '0',
			// No scrollbar of its own, which would narrow the lines it is measuring.
			overflow: 'hidden',
		});
		// Not `after`, which the Worker's HTMLRewriter types claim for themselves.
		area.parentNode?.insertBefore(copy, area.nextSibling);
		const top = copy.scrollHeight;
		copy.remove();
		return top;
	}

	/*
	 * THE PREVIEW FOLLOWS THE SHEET, and the sheet the preview, in split: VS
	 * Code's `markdown.preview.scrollPreviewWithEditor` and its opposite, both
	 * on by default there. A line is found by the `data-line` each block of the
	 * proof carries, and a place between two blocks in proportion between them.
	 * The textarea has no lines to read, so it and the proof keep proportion.
	 */
	const syncing = $derived(view.current === 'split' && setting !== null);
	const lineCount = $derived(source?.split('\n').length ?? 0);

	/* The proof's blocks by source line, the outermost of each. Read again when
	 * the proof is set again. */
	let blocks: { line: number; el: HTMLElement }[] | null = null;

	function blockList() {
		if (blocks?.[0]?.el.isConnected) return blocks;
		const seen = new Set<number>();
		blocks = [];
		for (const el of proof?.querySelectorAll<HTMLElement>('[data-line]') ??
			[]) {
			const line = Number(el.dataset.line);
			if (seen.has(line)) continue;
			seen.add(line);
			blocks.push({ line, el });
		}
		blocks.sort((a, b) => a.line - b.line);
		return blocks;
	}

	/* Where a block stands in the proof's scroll, less the padding, so the first
	 * block of a document is at 0 as it is before any scrolling. */
	function topOf(el: HTMLElement) {
		if (!proof) return 0;
		return (
			el.getBoundingClientRect().top -
			proof.getBoundingClientRect().top +
			proof.scrollTop -
			Number.parseFloat(getComputedStyle(proof).paddingBlockStart)
		);
	}

	/* The last block at or above a line, by halving. */
	function blockAt(list: { line: number }[], line: number) {
		let lo = 0;
		let hi = list.length - 1;
		while (lo < hi) {
			const mid = Math.ceil((lo + hi) / 2);
			if (list[mid].line <= line) lo = mid;
			else hi = mid - 1;
		}
		return lo;
	}

	/* Set by the page scrolling one pane, so that pane's scroll is not handed
	 * back to the other as if a person had made it. */
	let proofSteered = false;
	let sheetSteered = false;

	function steer(el: HTMLElement, to: number) {
		const before = el.scrollTop;
		el.scrollTop = to;
		return el.scrollTop !== before;
	}

	function proofTo(line: number) {
		const list = blockList();
		if (!proof || !list.length) return;
		const i = blockAt(list, line);
		const prev = list[i];
		const next = list[i + 1];
		const from = topOf(prev.el);
		let at: number;
		if (line < prev.line) at = 0;
		else if (next) {
			at =
				from +
				((line - prev.line) / (next.line - prev.line)) *
					(topOf(next.el) - from);
		} else {
			// Past the last block, the rest of the proof in proportion.
			const left = Math.max(lineCount - prev.line, 1);
			at =
				from +
				Math.min((line - prev.line) / left, 1) * (proof.scrollHeight - from);
		}
		if (steer(proof, at)) proofSteered = true;
	}

	/* The source line at the top of the proof: `proofTo` read backwards. */
	function lineAtProof() {
		const list = blockList();
		if (!proof || !list.length) return null;
		const y = proof.scrollTop;
		let lo = 0;
		let hi = list.length - 1;
		while (lo < hi) {
			const mid = Math.ceil((lo + hi) / 2);
			if (topOf(list[mid].el) <= y) lo = mid;
			else hi = mid - 1;
		}
		const prev = list[lo];
		const from = topOf(prev.el);
		if (y < from) return 0;
		const next = list[lo + 1];
		if (next) {
			const to = topOf(next.el);
			const through = to > from ? (y - from) / (to - from) : 0;
			return prev.line + Math.min(through, 1) * (next.line - prev.line);
		}
		const rest = proof.scrollHeight - from;
		return (
			prev.line +
			(rest > 0 ? (y - from) / rest : 0) * Math.max(lineCount - prev.line, 0)
		);
	}

	const ratio = (el: HTMLElement) =>
		el.scrollTop / Math.max(el.scrollHeight - el.clientHeight, 1);

	const toRatio = (el: HTMLElement, at: number) =>
		at * Math.max(el.scrollHeight - el.clientHeight, 0);

	function sheetScrolled(line: number) {
		if (syncing) proofTo(line);
	}

	function textScrolled() {
		if (sheetSteered) {
			sheetSteered = false;
			return;
		}
		if (!syncing || !proof || !sheetText) return;
		if (steer(proof, toRatio(proof, ratio(sheetText)))) proofSteered = true;
	}

	function proofScrolled() {
		if (proofSteered) {
			proofSteered = false;
			return;
		}
		if (!syncing || !proof) return;
		if (monacoSheet) {
			const line = lineAtProof();
			if (line !== null) monacoSheet.scrollToLine(line);
		} else if (sheetText) {
			if (steer(sheetText, toRatio(sheetText, ratio(proof)))) {
				sheetSteered = true;
			}
		}
	}

	/* On entering split, and each time the proof is set again, it catches up
	 * with the sheet — which is where the person is typing. */
	$effect(() => {
		void setting?.html;
		if (!syncing || !proof) return;
		blocks = null;
		const line = monacoSheet?.currentLine();
		if (line != null) proofTo(line);
		else if (sheetText && steer(proof, toRatio(proof, ratio(sheetText)))) {
			proofSteered = true;
		}
	});

	/*
	 * A LINK IN THE PROOF. Out of the site it opens beside the editor — see
	 * $lib/markdown. Within the document it goes to the heading. Anything else is
	 * a path in this workspace, and opens here as it would in VS Code; a scratch
	 * note is in no folder, so its relative links have nowhere to go.
	 */
	function follow(event: MouseEvent) {
		const link = (event.target as Element).closest('a');
		const href = link?.getAttribute('href');
		if (!href || /^[a-z][a-z\d+.-]*:/i.test(href)) return;
		event.preventDefault();

		if (href.startsWith('#')) {
			const id = decodeURIComponent(href.slice(1)).toLowerCase();
			const heading = setting?.headings.find((one) => one.id === id);
			if (heading) goTo(heading.line);
			return;
		}

		if (open.kind !== 'file') return;
		void openFile(resolveFrom(open.path, href));
	}

	/* A path written in a document, as a path in the folder: relative to the
	 * document, or to the top of the folder when it starts with `/` — VS Code's
	 * reading of both. A URL does the resolving, since dot segments are its job.
	 * Resolved inside the document's own folder, so neither can climb out of it
	 * into another one open beside it. */
	function resolveFrom(document: string, href: string) {
		const key = folder.rootKey(document);
		const inner = folder.relative(document);
		const dir = inner.slice(0, inner.lastIndexOf('/') + 1);
		const url = new URL(href, `file:///${encodeURI(dir)}`);
		const path = decodeURIComponent(url.pathname.slice(1));
		return key ? (path ? `${key}/${path}` : key) : path;
	}

	/*
	 * PICTURES IN A DOCUMENT, read from the folder it is in and given a URL of
	 * their own. Each is read once per folder, and the URLs go when the folder
	 * does, or the page. A scratch note is in no folder and has none to show.
	 */
	const pictures = new Map<string, Promise<string | null>>();

	$effect(() => {
		void setting?.html;
		if (!proof || open.kind !== 'file') return;
		const from = open.path;

		for (const img of proof.querySelectorAll<HTMLImageElement>(
			'img[data-src]',
		)) {
			const path = resolveFrom(from, img.dataset.src ?? '');
			if (!pictures.has(path)) {
				pictures.set(
					path,
					folder
						.picture(path)
						.then((blob) => (blob ? URL.createObjectURL(blob) : null)),
				);
			}
			void pictures.get(path)?.then((url) => {
				if (url && img.isConnected) img.src = url;
			});
		}
	});

	$effect(() => {
		void folder.roots;
		return () => {
			for (const url of pictures.values()) {
				void url.then((made) => made && URL.revokeObjectURL(made));
			}
			pictures.clear();
		};
	});

	/*
	 * A SECTION FOLDS TO ITS HEADING, as each of VS Code's side bar views does,
	 * and stays folded between visits. Read after the first paint, so the
	 * prerendered rail and the hydrated one agree.
	 */
	type Section = 'scratch' | 'files';
	const SECTIONS = 'text-editor.sections';
	let shut = $state<Section[]>([]);

	$effect(() => {
		try {
			const kept = JSON.parse(localStorage.getItem(SECTIONS) ?? '[]');
			if (Array.isArray(kept)) shut = kept;
		} catch {
			// Every section open, which is where a first visit starts anyway.
		}
	});

	function toggleSection(section: Section, show = shut.includes(section)) {
		shut = show ? shut.filter((one) => one !== section) : [...shut, section];
		try {
			localStorage.setItem(SECTIONS, JSON.stringify(shut));
		} catch {
			// Folded for this visit only.
		}
	}

	/*
	 * THE EXPLORER'S VERBS, as VS Code's explorer has them: New File and New
	 * Folder in the heading, a name typed into the tree, F2 to rename, Delete to
	 * delete, and all of them on the row's context menu. Only where the folder
	 * can be written to; a snapshot offers none of them.
	 */

	/* The row last pressed. A new thing goes into it if it is a folder, and
	 * beside it if not — VS Code's rule. */
	let chosen = $state<Row | null>(null);

	type Naming =
		| { kind: 'file' | 'dir'; dir: string; refusal: Refusal | null }
		| { kind: 'rename'; path: string; refusal: Refusal | null };

	let naming = $state<Naming | null>(null);
	/* What is in the box, for the refusal to name it. */
	let typed = $state('');

	function refusal(why: Refusal, name: string, kind: Naming['kind']) {
		switch (why) {
			case 'empty':
				return 'A file or folder name must be provided.';
			case 'slash':
				return 'A name cannot hold a / or a \\ here.';
			case 'taken':
				return `A file or folder ${name.trim()} already exists at this location. Please choose a different name.`;
			case 'into':
				return 'A folder cannot be moved into itself.';
			case 'failed':
				return kind === 'rename'
					? `Unable to rename to ${name.trim()}.`
					: `Unable to create ${name.trim()}.`;
		}
	}

	/*
	 * `root` is the folder whose button was pressed. The row last pressed still
	 * decides where in it, as VS Code's selection does — but only a row in THAT
	 * folder: a press on one folder's New File is never a file in another.
	 */
	function startNew(kind: 'file' | 'dir', root?: string) {
		notice = null;
		toggleSection('files', true);
		const picked = !chosen
			? null
			: chosen.kind === 'dir'
				? chosen.path
				: dirOf(chosen.path);
		const dir =
			root === undefined
				? picked
				: picked && folder.rootKey(picked) === root
					? picked
					: root;
		// Somewhere in a folder that can be written to, or nowhere.
		if (!dir || !folder.writableAt(dir)) return;
		folder.reveal(dir);
		if (folder.isClosed(dir)) void folder.fold(dir);
		typed = '';
		naming = { kind, dir, refusal: null };
	}

	/* A folder moves or takes a new name only where the store can do it in one
	 * step — see `relocatesAt`. A document always can; a root never does. */
	const movable = (row: Row) =>
		row.kind === 'file' || (!row.root && folder.relocatesAt(row.path));

	function startRename(row: Row) {
		if (!movable(row)) return;
		notice = null;
		chosen = row;
		typed = row.name;
		naming = { kind: 'rename', path: row.path, refusal: null };
	}

	/* The name box takes the focus, with the name selected up to its extension,
	 * so typing replaces the name and keeps the kind of file it is. A folder's
	 * name is chosen whole, as VS Code chooses it: a dot in it is not a kind. */
	function takeName(input: HTMLInputElement) {
		input.focus();
		const dot = input.dataset.whole ? -1 : input.value.lastIndexOf('.');
		input.setSelectionRange(0, dot > 0 ? dot : input.value.length);
	}

	function recheck(value: string) {
		if (!naming) return;
		naming.refusal =
			naming.kind === 'rename'
				? folder.check(dirOf(naming.path), value, naming.path)
				: folder.check(naming.dir, value);
	}

	/* Back to the row a thing was done to, so the keyboard is where the eye is. */
	async function focusRow(path: string) {
		await tick();
		document
			.querySelector<HTMLElement>(
				`#workspace button[data-path="${CSS.escape(path)}"]`,
			)
			?.focus();
	}

	/* One at a time: Enter and the blur that can follow it would otherwise make
	 * the same thing twice. */
	let committing = false;

	async function commit(value: string) {
		const now = naming;
		if (!now || now.refusal || committing) return;
		committing = true;

		let made: Made;
		if (now.kind === 'rename') made = await folder.rename(now.path, value);
		else if (now.kind === 'file') made = await folder.newFile(now.dir, value);
		else made = await folder.newFolder(now.dir, value);
		committing = false;

		if ('refusal' in made) {
			if (naming === now) naming = { ...now, refusal: made.refusal };
			return;
		}

		naming = null;
		if (
			now.kind === 'rename' &&
			open.kind === 'file' &&
			open.path === now.path
		) {
			open = { kind: 'file', path: made.path };
		}
		// A new document opens, as it does in VS Code.
		if (now.kind === 'file') await openFile(made.path);
		void focusRow(made.path);
	}

	/* Away from the box: kept if it can be, dropped if it cannot — VS Code's
	 * answer, so a click elsewhere never leaves a box behind asking. */
	async function leaveName(value: string) {
		const now = naming;
		if (!now) return;
		if (!value.trim() || now.refusal) {
			naming = null;
			return;
		}
		await commit(value);
		// Refused on the way out: dropped, and not left behind asking.
		if (naming?.refusal) naming = null;
	}

	function nameKeys(
		event: KeyboardEvent & { currentTarget: HTMLInputElement },
	) {
		if (event.key === 'Enter') {
			event.preventDefault();
			void commit(event.currentTarget.value);
		} else if (event.key === 'Escape') {
			event.preventDefault();
			const was = naming;
			naming = null;
			if (was?.kind === 'rename') void focusRow(was.path);
		}
	}

	/* VS Code's keys on a row: F2, Delete (⌘⌫ on a Mac), cut, copy and paste.
	 * The chord for its path is the page's — see `pageKeys`. */
	function rowKeys(event: KeyboardEvent, row: Row) {
		// Ctrl alone: Ctrl+Shift+C is the second half of a chord, not a copy.
		const mod =
			(event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey;
		const key = event.key.toLowerCase();

		/* VS Code's tree: Right opens a folder, Left shuts it, and Left on
		 * anything already shut goes up to the folder it is in. */
		if (event.key === 'ArrowRight' && row.kind === 'dir') {
			event.preventDefault();
			if (folder.isClosed(row.path)) void folder.fold(row.path);
			return;
		}
		if (event.key === 'ArrowLeft') {
			event.preventDefault();
			if (row.kind === 'dir' && !folder.isClosed(row.path)) {
				void folder.fold(row.path);
			} else if (dirOf(row.path)) {
				void focusRow(dirOf(row.path));
			}
			return;
		}

		// Every one of these changes the folder, which a snapshot cannot be.
		if (!folder.writableAt(row.path)) return;
		// A root is put away, not renamed, cut, copied or deleted; it takes a paste.
		if (row.kind === 'dir' && row.root) {
			if (
				(event.ctrlKey || event.metaKey) &&
				!event.shiftKey &&
				!event.altKey &&
				event.key.toLowerCase() === 'v' &&
				clipboard
			) {
				event.preventDefault();
				paste(row);
			}
			return;
		}
		if (event.key === 'F2') {
			event.preventDefault();
			startRename(row);
		} else if (
			event.key === 'Delete' ||
			(event.key === 'Backspace' && event.metaKey)
		) {
			event.preventDefault();
			askDelete(row);
		} else if (mod && key === 'x' && movable(row)) {
			event.preventDefault();
			clipboard = { row, mode: 'cut' };
		} else if (mod && key === 'c') {
			event.preventDefault();
			clipboard = { row, mode: 'copy' };
		} else if (mod && key === 'v' && clipboard) {
			event.preventDefault();
			paste(row);
		} else if (event.key === 'Escape' && clipboard) {
			clipboard = null;
		}
	}

	/*
	 * MOVING AND COPYING, by a drag or by the clipboard — VS Code's two ways,
	 * and the second is the one a keyboard has. What cannot be done says why
	 * above the rows, as VS Code says it in a notification.
	 */
	let notice = $state<string | null>(null);
	let clipboard = $state<{ row: Row; mode: 'cut' | 'copy' } | null>(null);
	let dragging = $state<Row | null>(null);
	let dropDir = $state<string | null>(null);

	const inside = (path: string, root: string) =>
		path === root || path.startsWith(`${root}/`);

	/* A drop on a folder goes into it; on a document, beside it, as in VS Code. */
	const destination = (row: Row | null) =>
		!row ? '' : row.kind === 'dir' ? row.path : dirOf(row.path);

	const dirName = (dir: string) => dir.slice(dir.lastIndexOf('/') + 1);

	/* A cut is pasted once and is gone; a copy stays, to be pasted again. */
	function paste(onto: Row | null) {
		const held = clipboard;
		if (!held) return;
		if (held.mode === 'cut') {
			clipboard = null;
			void moveNow(held.row, destination(onto));
		} else {
			void copyNow(held.row, destination(onto));
		}
	}

	async function moveNow(row: Row, dir: string) {
		notice = null;
		const made = await folder.move(row.path, dir);
		if ('refusal' in made) {
			notice =
				made.refusal === 'taken'
					? `A file or folder ${row.name} already exists in the destination folder.`
					: made.refusal === 'into'
						? 'A folder cannot be moved into itself.'
						: made.refusal === 'across'
							? `${row.name} can’t be moved to another open folder.`
							: `Unable to move ${row.name}.`;
			return false;
		}
		followMove(row.path, made.path);
		return true;
	}

	async function copyNow(row: Row, dir: string) {
		notice = null;
		const made = await folder.copy(row, dir);
		if ('refusal' in made) {
			notice =
				made.refusal === 'into'
					? 'A folder cannot be copied into itself.'
					: made.refusal === 'across'
						? `${row.name} can’t be copied to another open folder.`
						: made.refusal === 'partial'
							? `Only part of ${row.name} could be copied.`
							: `Unable to copy ${row.name}.`;
			return;
		}
		void focusRow(made.path);
	}

	/* The path from the top of the folder, with forward slashes: the only path a
	 * browser knows for a folder handed to it, and all a WebDAV drive has. */
	async function copyPath(row: { path: string }) {
		try {
			await navigator.clipboard.writeText(
				folder.relative(row.path) || row.path,
			);
		} catch {
			notice = 'The path could not be copied.';
		}
	}

	/*
	 * VS CODE'S KEYS FOR THE WINDOW — see $lib/shortcuts for which and why. The
	 * sheet hands them to Monaco, which answers them while the caret is in it;
	 * everywhere else on the page this does.
	 */
	let wrap = $state(true);
	let quick = $state<QuickOpen | null>(null);

	const commands: Record<ShortcutId, () => void> = {
		wordWrap: () => (wrap = !wrap),
		togglePreview: () =>
			view.show(view.current === 'preview' ? 'edit' : 'preview'),
		previewToSide: () => view.show('split'),
		sideBar: () => workspace.toggle(),
		secondarySideBar: () => outlinePanel.toggle(),
		explorer: () => void showExplorer(),
		// A scratch note is kept as it is typed; there is nothing to save.
		save: () => void folder.saveNow(),
		quickOpen: () => void quick?.show(),
		newFile: () => (open = { kind: 'scratch', id: scratch.open() }),
		copyRelativePath: () => {
			const row = (
				document.activeElement as HTMLElement | null
			)?.closest<HTMLElement>('[data-path]');
			const path =
				row?.dataset.path ?? (open.kind === 'file' ? open.path : null);
			if (path) void copyPath({ path });
		},
	};

	const actions: (Shortcut & { run: () => void })[] = (
		Object.keys(SHORTCUTS) as ShortcutId[]
	).map((id) => ({
		...SHORTCUTS[id],
		run: commands[id],
	}));

	/* The first half of a chord — Ctrl+K — while the second is awaited. */
	let chordStart: Stroke | null = null;

	function pageKeys(event: KeyboardEvent) {
		// A modifier on its own is the start of a key, and must not end a chord.
		if (['Control', 'Shift', 'Alt', 'Meta'].includes(event.key)) return;
		const first = chordStart;
		chordStart = null;
		if (event.defaultPrevented) return;
		// Monaco has these as its own actions, and answers them itself.
		if ((event.target as Element | null)?.closest?.('.monaco-editor')) return;

		for (const action of actions) {
			for (const key of action.keys) {
				const hit = Array.isArray(key)
					? first !== null && first === key[0] && pressed(event, key[1])
					: first === null && pressed(event, key);
				if (!hit) continue;
				event.preventDefault();
				action.run();
				return;
			}
		}

		// The start of a chord: held, and nothing else done with it.
		const starts = actions.flatMap((action) =>
			action.keys
				.filter((key): key is [Stroke, Stroke] => Array.isArray(key))
				.map((chord) => chord[0]),
		);
		const start =
			first === null && starts.find((stroke) => pressed(event, stroke));
		if (start) {
			event.preventDefault();
			chordStart = start;
		}
	}

	/* Ctrl+Shift+E: the files, and the focus on the open one, or the first. */
	async function showExplorer() {
		if (!workspace.open) workspace.toggle();
		// The open one is shown, as VS Code's `explorer.autoReveal` shows it.
		toggleSection(open.kind === 'file' ? 'files' : 'scratch', true);
		if (open.kind === 'file') folder.reveal(open.path);
		await tick();
		// One after the other: a list of selectors answers in page order, not in
		// the order it was written, and the first row would win over the open one.
		const at = (selector: string) =>
			document.querySelector<HTMLElement>(`#workspace ${selector}`);
		(at('[aria-current="true"]') ?? at('.file'))?.focus();
	}

	/* The open one's row is shown, its folders opened and scrolled to in its
	 * pane, as VS Code's `explorer.autoReveal` shows it. */
	$effect(() => {
		const path = open.kind === 'file' ? open.path : null;
		if (path) untrack(() => folder.reveal(path));
		void tick().then(() =>
			document
				.querySelector('#workspace [aria-current="true"]')
				?.scrollIntoView({ block: 'nearest' }),
		);
	});

	/*
	 * GO TO FILE'S LIST: the scratch notes and every document the folder can
	 * open, those opened lately first, as VS Code puts them.
	 */
	let recent = $state<string[]>([]);

	$effect(() => {
		const key =
			open.kind === 'file' ? `file:${open.path}` : `scratch:${open.id}`;
		// Read without being followed, or writing it would run this again.
		const before = untrack(() => recent);
		recent = [key, ...before.filter((one) => one !== key)].slice(0, 20);
	});

	const quickItems = $derived.by(() => {
		const all: Item[] = [
			...scratch.notes.map((note) => ({
				key: `scratch:${note.id}`,
				label: scratchName(note.id),
				detail: 'Scratch',
				run: () => (open = { kind: 'scratch' as const, id: note.id }),
			})),
			...folder.files
				.filter((file) => file.openable !== false)
				.map((file) => ({
					key: `file:${file.path}`,
					label: file.name,
					detail: dirOf(file.path),
					run: () => void openFile(file.path),
				})),
		];
		const at = (key: string) => {
			const i = recent.indexOf(key);
			return i < 0 ? recent.length : i;
		};
		return all.sort((a, b) => at(a.key) - at(b.key));
	});

	/* The open document, and the focus, go where the row went. */
	function followMove(from: string, to: string) {
		if (open.kind === 'file' && inside(open.path, from)) {
			open = { kind: 'file', path: to + open.path.slice(from.length) };
		}
		void focusRow(to);
	}

	/* Ctrl copies a drag rather than moving it, and on a Mac it is Option — VS
	 * Code's keys for the same. */
	const mac =
		typeof navigator !== 'undefined' && /Mac/.test(navigator.userAgent);
	const copying = (event: DragEvent) => (mac ? event.altKey : event.ctrlKey);

	function dragStart(event: DragEvent, row: Row) {
		if (
			!folder.writableAt(row.path) ||
			(row.kind === 'dir' && row.root) ||
			!event.dataTransfer
		) {
			event.preventDefault();
			return;
		}
		notice = null;
		dragging = row;
		event.dataTransfer.effectAllowed = movable(row) ? 'copyMove' : 'copy';
		event.dataTransfer.setData('text/plain', row.name);
	}

	/* Only a drop that would do something is offered: a copy anywhere but into
	 * itself, and a move anywhere but where it already is. */
	function dragOver(event: DragEvent, row: Row | null) {
		if (!dragging) return;
		event.stopPropagation();
		const dir = destination(row);
		const copy = copying(event);
		const offered =
			folder.rootKey(dir) === folder.rootKey(dragging.path) &&
			(copy
				? !(dragging.kind === 'dir' && inside(dir, dragging.path))
				: movable(dragging) &&
					dir !== dirOf(dragging.path) &&
					!inside(dir, dragging.path));
		if (!offered) {
			dropDir = null;
			return;
		}
		event.preventDefault();
		if (event.dataTransfer)
			event.dataTransfer.dropEffect = copy ? 'copy' : 'move';
		dropDir = dir;
	}

	function drop(event: DragEvent, row: Row | null) {
		const what = dragging;
		dragging = null;
		dropDir = null;
		if (!what) return;
		event.preventDefault();
		event.stopPropagation();

		const dir = destination(row);
		// VS Code asks before a drag that moves, and not before one that copies.
		if (copying(event)) void copyNow(what, dir);
		else if (asksBeforeDrop()) void ask({ kind: 'move', row: what, dir });
		else void moveNow(what, dir);
	}

	function dragEnd() {
		dragging = null;
		dropDir = null;
	}

	/* VS Code's `explorer.confirmDragAndDrop`, on until "Do not ask me again".
	 * Kept in this browser, which is where VS Code for the web keeps it too. */
	const CONFIRM_DROPS = 'explorer.confirmDragAndDrop';

	function asksBeforeDrop() {
		try {
			return localStorage.getItem(CONFIRM_DROPS) !== 'false';
		} catch {
			return true;
		}
	}

	/*
	 * THE CONTEXT MENU. A popover, so the browser gives it the top layer, a
	 * light dismiss and Escape, and gives the focus back where it came from.
	 * The keyboard's own menu key and Shift+F10 send `contextmenu` too.
	 */
	let menu = $state<{ row: Row; x: number; y: number } | null>(null);
	let menuEl = $state<HTMLElement | null>(null);

	async function openMenu(event: MouseEvent, row: Row) {
		event.preventDefault();
		chosen = row;

		// From the keyboard there is no pointer, so the menu opens on the row.
		const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
		const fromKeys = event.clientX === 0 && event.clientY === 0;
		menu = {
			row,
			x: fromKeys ? box.left + 16 : event.clientX,
			y: fromKeys ? box.bottom : event.clientY,
		};

		/*
		 * NOT UNTIL THE BUTTON IS UP. Firefox, and every browser on macOS and
		 * Linux, asks for the menu on the press; the release then lands outside a
		 * menu already open, and the popover takes it as a click away and closes
		 * at once. Windows asks on the release, with nothing still held.
		 */
		if (event.buttons) {
			await new Promise((released) =>
				addEventListener('pointerup', released, { once: true }),
			);
			await new Promise((next) => setTimeout(next));
		}

		await tick();
		if (!menuEl || !menu) return;
		menuEl.showPopover();

		// Kept inside the window, as a menu opened near an edge would not be.
		const size = menuEl.getBoundingClientRect();
		menu.x = Math.max(4, Math.min(menu.x, innerWidth - size.width - 4));
		menu.y = Math.max(4, Math.min(menu.y, innerHeight - size.height - 4));
		menuEl.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
	}

	function menuKeys(event: KeyboardEvent) {
		const items = [
			...(menuEl?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []),
		];
		const at = items.indexOf(document.activeElement as HTMLElement);
		const to =
			event.key === 'ArrowDown'
				? (at + 1) % items.length
				: event.key === 'ArrowUp'
					? (at - 1 + items.length) % items.length
					: event.key === 'Home'
						? 0
						: event.key === 'End'
							? items.length - 1
							: null;
		if (to === null) return;
		event.preventDefault();
		items[to]?.focus();
	}

	/* A choice made from the menu, which closes first so the focus it hands back
	 * does not land on top of what the choice is about to focus. The menu's own
	 * state goes when it says it has closed — see `ontoggle`. */
	function fromMenu(action: () => void) {
		menuEl?.hidePopover();
		action();
	}

	/*
	 * THE QUESTION BEFORE A DELETE OR A DROP, in VS Code's words for each. A
	 * delete cannot be undone from a web page — there is no bin to put it in —
	 * and a drop is easy to make by accident.
	 */
	type Asking =
		{ kind: 'delete'; row: Row } | { kind: 'move'; row: Row; dir: string };

	let asking = $state<Asking | null>(null);
	let askFailed = $state<string | null>(null);
	let dontAsk = $state(false);
	let confirmEl = $state<HTMLDialogElement | null>(null);

	async function ask(next: Asking) {
		chosen = next.row;
		asking = next;
		askFailed = null;
		dontAsk = false;
		await tick();
		confirmEl?.showModal();
		// The primary button, where VS Code puts the focus.
		confirmEl?.querySelector<HTMLElement>('.primary')?.focus();
	}

	function askDelete(row: Row) {
		notice = null;
		void ask({ kind: 'delete', row });
	}

	async function confirmAsk() {
		const now = asking;
		if (!now) return;

		if (now.kind === 'move') {
			if (dontAsk) {
				try {
					localStorage.setItem(CONFIRM_DROPS, 'false');
				} catch {
					// Asked again next time, which is the safe way to be wrong.
				}
			}
			// Said, so closing does not hand the focus back to where the row was.
			if (await moveNow(now.row, now.dir)) confirmEl?.close('done');
			else askFailed = notice;
			return;
		}

		if (!(await folder.remove(now.row))) {
			askFailed = 'It could not be deleted.';
			return;
		}
		confirmEl?.close('done');
		// What was on the sheet went with it, as its tab goes in VS Code.
		if (open.kind === 'file' && inside(open.path, now.row.path)) {
			open = { kind: 'scratch', id: PERMANENT };
		}
		chosen = null;
	}
</script>

{#snippet nameBox(
	kind: Naming['kind'],
	depth: number,
	initial: string,
	mark: 'dir' | 'file' = kind === 'dir' ? 'dir' : 'file',
)}
	<div class="naming" style="--depth: {depth}">
		{#if mark === 'dir'}
			<ChevronRight aria-hidden="true" />
		{:else}
			<FileText aria-hidden="true" />
		{/if}
		<input
			type="text"
			value={initial}
			aria-label={kind === 'rename'
				? `Rename ${initial}`
				: kind === 'dir'
					? 'Name of the new folder'
					: 'Name of the new file'}
			aria-invalid={naming?.refusal ? 'true' : undefined}
			aria-describedby={naming?.refusal ? 'name-refusal' : undefined}
			autocomplete="off"
			spellcheck="false"
			data-whole={mark === 'dir' || undefined}
			{@attach takeName}
			oninput={(event) => {
				typed = event.currentTarget.value;
				recheck(typed);
			}}
			onkeydown={nameKeys}
			onblur={(event) => void leaveName(event.currentTarget.value)}
		/>
	</div>
	{#if naming?.refusal}
		<p id="name-refusal" class="refusal" style="--depth: {depth}" role="alert">
			{refusal(naming.refusal, typed, kind)}
		</p>
	{/if}
{/snippet}

{#snippet twisty(section: Section, title: string)}
	<button
		type="button"
		class="twisty"
		aria-expanded={!shut.includes(section)}
		aria-controls="{section}-body"
		onclick={() => toggleSection(section)}
	>
		{#if shut.includes(section)}
			<ChevronRight aria-hidden="true" />
		{:else}
			<ChevronDown aria-hidden="true" />
		{/if}
		<span class="name">{title}</span>
	</button>
{/snippet}

<Seo
	title="Text Editor"
	description="A Markdown editor, set as a page of the manual it renders."
	path="/text-editor"
	icon="/favicon-text-editor.svg"
/>

<svelte:document onvisibilitychange={onHidden} />
<svelte:window onbeforeunload={onLeave} onkeydown={pageKeys} />

<QuickOpen bind:this={quick} items={quickItems} />

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
			<section class="section bounded">
				<h2>
					{@render twisty('scratch', 'Scratch')}
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

				<div id="scratch-body" class="body" hidden={shut.includes('scratch')}>
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
				</div>
			</section>

			<!--
				THE FILES ARE REAL NOW, and until somebody hands over a folder there
				are none. Each folder that is open heads its own rows by name, so the
				rail says WHICH folders rather than just "Files" — and a person with
				several open side by side can tell at a glance which a document is in.

				A drop anywhere in it that is not on a row is refused: with more than
				one folder there is no single "top" for it to go to, so a drop is made
				onto a folder, a root among them.
			-->
			<section
				class="section"
				class:drop={dropDir === ''}
				role="group"
				aria-label="Files"
				ondragover={(event) => dragOver(event, null)}
				ondrop={(event) => drop(event, null)}
			>
				<h2>
					{@render twisty('files', 'Files')}

					<!--
						THE WAYS IN, always offered: a folder on this device and a drive on a
						server, each opening BESIDE whatever is open already, as a folder
						added to a VS Code workspace does. The verbs that belong to one
						folder are on that folder's own row; these belong to all of them.

						TWO WAYS IN FROM THIS DEVICE, AND ONLY ONE IS OFFERED. Chromium can
						hand over a folder the app could later write through; every other
						browser has `<input webkitdirectory>`, which is a snapshot and
						read-only. The control looks the same either way and the label does
						not, because what a visitor gets is not the same thing.
					-->
					<span class="actions">
						{#if canPickFolder()}
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
								title="Open a folder from this device, as it is now. Nothing leaves this device."
								aria-label="Open a folder from this device, read-only"
								onclick={pickSnapshot}
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
								oncancel={cancelSnapshot}
							/>
						{/if}
						<button
							type="button"
							class="add"
							title="Connect a Nextcloud or ownCloud drive"
							aria-label="Connect a drive"
							onclick={() => (connecting = true)}
						>
							<Cloud aria-hidden="true" />
						</button>

						{#if folder.roots.length}
							<!-- VS Code's two, in its order, and under its names. -->
							<button
								type="button"
								class="add"
								title="Expand All"
								aria-label="Expand all folders"
								onclick={() => {
									toggleSection('files', true);
									void folder.expandAll();
								}}
							>
								<ChevronsUpDown aria-hidden="true" />
							</button>
							<button
								type="button"
								class="add"
								title="Collapse Folders in Explorer"
								aria-label="Collapse all folders"
								disabled={!folder.anyExpanded}
								onclick={() => folder.collapseAll()}
							>
								<ChevronsDownUp aria-hidden="true" />
							</button>
						{/if}
					</span>
				</h2>

				<div id="files-body" class="body" hidden={shut.includes('files')}>
					{#if notice}
						<p class="refusal notice" role="alert">{notice}</p>
					{/if}

					{#if !folder.looked}
						<!-- Not "no folder" until the folders from last time have been asked after. -->
						<Placeholder
							shape="rows"
							label="Looking for the folders from last time."
							widths={[65]}
						/>
					{:else}
						<!--
							FOLDERS FROM LAST TIME. Named, because "the folder from last time"
							is a question nobody can answer and "Notes" is one they can. Each is
							a button because a browser grants the permission again only in
							answer to a press.
						-->
						{#each folder.waiting as handle (handle)}
							<p class="note">Last time you had {handle.name}.</p>
							<button
								type="button"
								class="file"
								aria-label="Open {handle.name} again"
								onclick={() => folder.resume(handle)}
							>
								<FolderOpen aria-hidden="true" />
								<span class="name">Open it again</span>
							</button>
						{/each}

						{#if folder.trouble === 'unreadable'}
							<p class="note">That folder could not be read.</p>
						{:else if folder.trouble === 'denied'}
							<p class="note">That folder was not handed over.</p>
						{:else if !folder.roots.length && !folder.waiting.length && !folder.reading && !gathering}
							<!--
								NO FOLDER YET, which is not a failure and does not read as one. It
								says what the controls above do, because a mark on its own is a
								thing to work out and this is the one row a first visit sees.
							-->
							<p class="note">
								No folder open. Open one from this device, or a Nextcloud or
								ownCloud drive.
							</p>
						{/if}
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
									{#if row.kind === 'dir' && row.root}
										<!--
										A FOLDER THAT WAS OPENED, at the head of its own rows, as a
										root heads them in a VS Code workspace. It folds like any
										folder and takes a drop like one; its own verbs sit on it, and
										it is put away rather than renamed, moved or deleted — it is
										the visitor's folder, not something in it.
									-->
										{@const writable = folder.writableAt(row.path)}
										<div
											class="row root"
											role="presentation"
											ondragover={(event) => dragOver(event, row)}
											ondrop={(event) => drop(event, row)}
										>
											<button
												type="button"
												class="file folder"
												class:drop={dropDir === row.path}
												aria-expanded={!folder.isClosed(row.path)}
												title={row.name}
												data-path={row.path}
												onclick={() => {
													chosen = row;
													void folder.fold(row.path);
												}}
												oncontextmenu={(event) => openMenu(event, row)}
												onkeydown={(event) => rowKeys(event, row)}
											>
												{#if folder.isClosed(row.path)}
													<ChevronRight aria-hidden="true" />
												{:else}
													<ChevronDown aria-hidden="true" />
												{/if}
												<span class="name">{row.name}</span>
											</button>

											<span class="actions">
												<!--
													VIEW ONLY, said where the folder is named, because it is a
													fact about the folder and not about any one document in it.
												-->
												{#if !writable}
													<span
														class="view-only"
														title="A copy of the folder as it was when opened. This browser can’t save to it."
													>
														<PencilOff aria-hidden="true" />
														<span class="visually-hidden">View only</span>
													</span>
												{:else}
													<button
														type="button"
														class="add"
														title="New File…"
														aria-label="New file in {row.name}"
														onclick={() => startNew('file', row.path)}
													>
														<FilePlus aria-hidden="true" />
													</button>
													<button
														type="button"
														class="add"
														title="New Folder…"
														aria-label="New folder in {row.name}"
														onclick={() => startNew('dir', row.path)}
													>
														<FolderPlus aria-hidden="true" />
													</button>
												{/if}

												<!--
													CLOSING IS A DECISION ABOUT THIS FOLDER, so it forgets it
													too — otherwise the next visit opens on the folder somebody
													just put away. The other folders and the scratch notes are
													untouched: they were never in it.
												-->
												<button
													type="button"
													class="add"
													title="Put this folder away"
													aria-label="Put {row.name} away"
													onclick={() => closeRoot(row.path)}
												>
													<X aria-hidden="true" />
												</button>
											</span>
										</div>

										{#if folder.isOpening(row.path) && !folder.isClosed(row.path)}
											<Placeholder
												shape="rows"
												label="Reading {row.name}."
												depth={1}
												widths={[55, 40]}
											/>
										{/if}
									{:else if row.kind === 'dir'}
										<!--
										A FOLDER FOLDS. `aria-expanded` is the state and the mark
										is drawn from it, so the announcement and the drawing are
										one attribute read twice.
									-->
										{#if naming?.kind === 'rename' && naming.path === row.path}
											{@render nameBox('rename', row.depth, row.name, 'dir')}
										{:else}
											<button
												type="button"
												class="file folder"
												class:drop={dropDir === row.path}
												class:cut={clipboard?.mode === 'cut' &&
													clipboard.row.path === row.path}
												style="--depth: {row.depth}"
												aria-expanded={!folder.isClosed(row.path)}
												title={folder.relative(row.path)}
												data-path={row.path}
												draggable={folder.writableAt(row.path)}
												onclick={() => {
													chosen = row;
													void folder.fold(row.path);
												}}
												oncontextmenu={(event) => openMenu(event, row)}
												onkeydown={(event) => rowKeys(event, row)}
												ondragstart={(event) => dragStart(event, row)}
												ondragover={(event) => dragOver(event, row)}
												ondrop={(event) => drop(event, row)}
												ondragend={dragEnd}
											>
												{#if folder.isClosed(row.path)}
													<ChevronRight aria-hidden="true" />
												{:else}
													<ChevronDown aria-hidden="true" />
												{/if}
												<span class="name">{row.name}</span>
											</button>
										{/if}

										{#if folder.isOpening(row.path) && !folder.isClosed(row.path)}
											<Placeholder
												shape="rows"
												label="Reading {row.name}."
												depth={row.depth + 1}
												widths={[55, 40]}
											/>
										{/if}
									{:else if naming?.kind === 'rename' && naming.path === row.path}
										{@render nameBox('rename', row.depth, row.name)}
									{:else}
										<!--
										NOT `disabled`, which takes a row out of reach of the keyboard
										and the context menu: a document this editor cannot open can
										still be renamed and deleted, as it can in VS Code.
									-->
										<button
											type="button"
											class="file"
											class:inert={!row.openable}
											class:cut={clipboard?.mode === 'cut' &&
												clipboard.row.path === row.path}
											style="--depth: {row.depth}"
											aria-current={open.kind === 'file' &&
											open.path === row.path
												? 'true'
												: undefined}
											aria-disabled={row.openable ? undefined : 'true'}
											title={folder.relative(row.path)}
											data-path={row.path}
											onclick={() => {
												chosen = row;
												if (row.openable) void openFile(row.path);
											}}
											oncontextmenu={(event) => openMenu(event, row)}
											onkeydown={(event) => rowKeys(event, row)}
											draggable={folder.writableAt(row.path)}
											ondragstart={(event) => dragStart(event, row)}
											ondragover={(event) => dragOver(event, row)}
											ondrop={(event) => drop(event, row)}
											ondragend={dragEnd}
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
								{#if naming && naming.kind !== 'rename' && naming.dir === row.path && !folder.isClosed(row.path)}
									<li>{@render nameBox(naming.kind, row.depth + 1, '')}</li>
								{/if}
								{#if row.kind === 'dir' && row.root && !folder.isClosed(row.path) && folder.isEmpty(row.path) && !(naming && naming.kind !== 'rename' && naming.dir === row.path)}
									<li>
										<p class="note">
											Nothing in {row.name} this editor can open.
										</p>
									</li>
								{/if}
							{/each}
						</ol>
					{/if}

					<!-- A folder on its way in, under the ones already here. -->
					{#if folder.reading || gathering}
						<Placeholder
							shape="rows"
							label="Reading the folder."
							widths={[70, 45, 60, 50]}
						/>
					{/if}

					<!-- The drives this browser knows and that are not open now. -->
					{#if !folder.drivesRead}
						{#if !folder.roots.length}
							<Placeholder
								shape="rows"
								label="Reading the drives."
								widths={[60]}
							/>
						{/if}
					{:else if closedDrives.length}
						<ol aria-label="Drives">
							{#each closedDrives as drive (drive.id)}
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
				</div>

				{#if menu}
					{@const row = menu.row}
					{@const writable = folder.writableAt(row.path)}
					{@const isRoot = row.kind === 'dir' && row.root}
					<div
						bind:this={menuEl}
						class="menu"
						popover="auto"
						role="menu"
						tabindex="-1"
						aria-label={row.name}
						style="left: {menu.x}px; top: {menu.y}px"
						onkeydown={menuKeys}
						ontoggle={(event) => {
							if ((event as ToggleEvent).newState !== 'closed') return;
							// Read before the menu goes, and `row` with it.
							const path = row.path;
							menu = null;
							// Escape or a click away: the focus goes back to the row.
							if (
								!document.activeElement ||
								document.activeElement === document.body
							) {
								void focusRow(path);
							}
						}}
					>
						<!-- VS Code's groups, in its order. A snapshot can be read and not changed, so it keeps only the path; a root is put away rather than changed, so it keeps New, Paste and the path. -->
						{#if writable}
							<button
								type="button"
								role="menuitem"
								onclick={() => fromMenu(() => startNew('file'))}
							>
								New File…
							</button>
							<button
								type="button"
								role="menuitem"
								onclick={() => fromMenu(() => startNew('dir'))}
							>
								New Folder…
							</button>
							<hr />
							{#if movable(row)}
								<button
									type="button"
									role="menuitem"
									onclick={() =>
										fromMenu(() => (clipboard = { row, mode: 'cut' }))}
								>
									Cut <kbd>Ctrl+X</kbd>
								</button>
							{/if}
							{#if !isRoot}
								<button
									type="button"
									role="menuitem"
									onclick={() =>
										fromMenu(() => (clipboard = { row, mode: 'copy' }))}
								>
									Copy <kbd>Ctrl+C</kbd>
								</button>
							{/if}
							{#if clipboard}
								<button
									type="button"
									role="menuitem"
									onclick={() => fromMenu(() => paste(row))}
								>
									Paste <kbd>Ctrl+V</kbd>
								</button>
							{/if}
							<hr />
						{/if}
						<button
							type="button"
							role="menuitem"
							onclick={() => fromMenu(() => void copyPath(row))}
						>
							Copy Relative Path <kbd>Ctrl+K Ctrl+Shift+C</kbd>
						</button>
						{#if writable && !isRoot}
							<hr />
							{#if movable(row)}
								<button
									type="button"
									role="menuitem"
									onclick={() => fromMenu(() => startRename(row))}
								>
									Rename… <kbd>F2</kbd>
								</button>
							{/if}
							<button
								type="button"
								role="menuitem"
								onclick={() => fromMenu(() => void askDelete(row))}
							>
								Delete <kbd>Delete</kbd>
							</button>
						{/if}
					</div>
				{/if}

				<dialog
					bind:this={confirmEl}
					class="confirm"
					aria-labelledby="confirm-question"
					onclose={() => {
						const was = asking;
						asking = null;
						if (was && confirmEl?.returnValue !== 'done') {
							void focusRow(was.row.path);
						}
					}}
				>
					{#if asking?.kind === 'delete'}
						<p id="confirm-question">
							Are you sure you want to permanently delete ‘{asking.row
								.name}’{asking.row.kind === 'dir' ? ' and its contents' : ''}?
						</p>
						<p class="detail">This action is irreversible.</p>
					{:else if asking}
						<p id="confirm-question">
							Are you sure you want to move ‘{asking.row.name}’ into ‘{dirName(
								asking.dir,
							)}’?
						</p>
						<label class="detail dont-ask">
							<input type="checkbox" bind:checked={dontAsk} />
							Do not ask me again
						</label>
					{/if}
					{#if askFailed}
						<p class="detail" role="alert">{askFailed}</p>
					{/if}
					<div class="choices">
						<button type="button" onclick={() => confirmEl?.close()}>
							Cancel
						</button>
						<button type="button" class="primary" onclick={confirmAsk}>
							{asking?.kind === 'move' ? 'Move' : 'Delete'}
						</button>
					</div>
				</dialog>
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
							await folder.connect(drive, token);
						}}
						oncancel={() => (connecting = false)}
					/>
				</div>
			{:else}
				<div class="area" data-view={view.current}>
					{#if view.current !== 'preview'}
						{#if computer.current && source !== null}
							<!--
							ON A COMPUTER, MONACO: VS Code's own editor, for every kind of
							document, read-only where the folder is. One model per document,
							so each keeps its undo history — see $lib/monaco.
						-->
							<div class="sheet">
								<MonacoSheet
									bind:this={monacoSheet}
									key={open.kind === 'file'
										? `file:${open.path}`
										: `scratch:${open.id}`}
									value={source}
									language={markdown ? 'markdown' : 'plaintext'}
									label="{open.kind === 'file'
										? open.path
										: scratchName(open.id)}, the document"
									readOnly={open.kind === 'file' &&
										!folder.writableAt(open.path)}
									placeholder={open.kind === 'scratch' ? 'Type something.' : ''}
									{wrap}
									{actions}
									onscroll={sheetScrolled}
									oninput={(words) =>
										open.kind === 'scratch'
											? scratch.write(open.id, words)
											: folder.edit(words)}
								/>
							</div>
						{:else if openScratch !== null}
							<!--
							ON A PHONE, A TEXTAREA, which Monaco's README says it does not
							support. A scratch note can be typed in; a document from a folder
							can be where the folder can be written to.
						-->
							<div class="sheet">
								<textarea
									bind:this={sheetText}
									class="column"
									wrap={wrap ? 'soft' : 'off'}
									aria-label="{scratchName(openScratch)}, the document"
									placeholder="Type something."
									value={scratch.text(openScratch)}
									onscroll={textScrolled}
									oninput={(event) =>
										scratch.write(openScratch, event.currentTarget.value)}
								></textarea>
							</div>
						{:else if folder.fetching}
							<!--
							ON ITS WAY, and not "could not be read", which is what a sheet with
							no words said here until the words arrived.
						-->
							<div class="sheet">
								<Placeholder
									shape="lines"
									label="Reading the document."
									widths={[92, 88, 95, 60, 0, 85, 90, 40]}
								/>
							</div>
						{:else if open.kind === 'file' && folder.openText !== null && folder.writableAt(open.path)}
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
									bind:this={sheetText}
									class="column"
									wrap={wrap ? 'soft' : 'off'}
									aria-label="{open.kind === 'file'
										? open.path
										: 'The document'}, the document"
									value={folder.openText}
									onscroll={textScrolled}
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
						<!--
						The clicks listened for are the links' own, and Enter on a focused
						link already fires one; there is no key handling to add.
					-->
						<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
						<div
							bind:this={proof}
							class="proof"
							aria-label="The document, set"
							onclick={follow}
							onscroll={proofScrolled}
						>
							{#if openScratch === null && folder.fetching}
								<Placeholder
									shape="lines"
									label="Reading the document."
									widths={[40, 0, 92, 88, 95, 60, 0, 85, 90]}
								/>
							{:else if setting && source?.trim()}
								<!-- Sanitised in $lib/markdown before it gets here. -->
								<div class="markdown">{@html setting.html}</div>
							{:else if setting}
								<p class="pending">Nothing is written yet.</p>
							{:else if source !== null}
								<p class="pending">
									Only a Markdown document is set here, and this one is not.
								</p>
							{:else}
								<p class="pending">Nothing is open.</p>
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
				<div class="body">
					{#if setting?.headings.length}
						<ol>
							{#each setting.headings as heading (heading.id)}
								<li>
									<button
										type="button"
										class="heading"
										style="--depth: {heading.depth - shallowest}"
										onclick={() => goTo(heading.line)}>{heading.text}</button
									>
								</li>
							{/each}
						</ol>
					{:else}
						<p class="note">
							{source === null
								? 'Nothing is open.'
								: markdown
									? 'No headings in this document.'
									: 'Only a Markdown document has an outline.'}
						</p>
					{/if}
				</div>
			</section>
		</nav>
	</div>
</div>

<style>
	/*
	 * THE PADDING IS THE BAR'S OWN, so the workspace's first name begins on the
	 * same line as the mark above it. `--space-16` and not the letter's
	 * `--space-36` on the block edges: that space is what separates a title from
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
		 * is a control between two `--space-8` paddings, so the lower of them is
		 * already this same step; a padding here would make two where the design
		 * has one.
		 *
		 * `--space-8` and not `--space-16`, so the frame round the regions is the
		 * step that parts them from each other. An edge and a gap at different
		 * sizes read as two ideas about one space — which is the answer the first
		 * site's editor reached, where a single token is both the gutter between
		 * the panes and the padding around them.
		 */
		padding: 0 var(--gap-panel) var(--gap-panel);
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
		gap: var(--gap-panel);
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

		padding: var(--space-12);

		/* The document: the deepest surface, framed, as the editor is in Modern UI. */
		background-color: var(--bg);
		border-radius: var(--radius-l);
		box-shadow: inset 0 0 0 1px var(--frame);
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
		font-size: var(--text-label1);
		white-space: pre-wrap;
	}

	/*
	 * The textarea keeps the box the sheet already draws and gives up everything
	 * the browser would draw over it. `resize: none` because the pane's height is
	 * the window's — a drag handle offering to change it would be offering
	 * something the layout takes straight back.
	 */
	/* Alt+Z off: long lines run on, and the sheet scrolls sideways to them. */
	.sheet textarea[wrap='off'] {
		white-space: pre;
		overflow-x: auto;
	}

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

	/* NO RING: the caret is where the focus is, as in VS Code's editor. A text
	 * field counts as `:focus-visible` after a click too, so a ring here framed
	 * the whole sheet every time somebody clicked in to type. */
	.sheet textarea:focus-visible {
		outline: none;
	}

	/*
	 * NOT THE DOCUMENT, so it does not read as one. Both the proof's "there is no
	 * setting yet" and the sheet's "that could not be read" wear it: neither is
	 * anybody's words, and the one thing they must not look like is the words.
	 */
	.pending {
		color: color-mix(in oklab, var(--fg) 60%, transparent);
		font-size: var(--text-label1);
	}

	/*
	 * THE DOCUMENT, SET. The elements come from markdown-it and not from this
	 * file, so every rule reaches them through `:global` — scoped under
	 * `.markdown`, which is. The site's own type and steps, so a document set
	 * here reads as a page of this site and not as a second one inside it.
	 */
	.markdown {
		font-size: var(--text-body1);
		line-height: var(--leading-prose);
		overflow-wrap: break-word;
	}

	.markdown > :global(* + *) {
		margin-block-start: var(--space-12);
	}

	.markdown > :global(* + :is(h1, h2, h3, h4, h5, h6)) {
		margin-block-start: var(--space-24);
	}

	.markdown :global(:is(h1, h2, h3, h4, h5, h6)) {
		line-height: var(--leading-tight);
		scroll-margin-block-start: var(--space-12);
	}

	.markdown :global(h1) {
		font-size: var(--text-heading1);
	}

	.markdown :global(h2) {
		font-size: var(--text-heading2);
	}

	.markdown :global(:is(h3, h4, h5, h6)) {
		font-size: var(--text-body1);
	}

	.markdown :global(:is(ul, ol)) {
		padding-inline-start: 1.5em;
	}

	.markdown :global(li + li),
	.markdown :global(li > :is(ul, ol)) {
		margin-block-start: var(--space-4);
	}

	.markdown :global(a) {
		color: inherit;
		text-underline-offset: 0.15em;
	}

	.markdown :global(blockquote) {
		padding-inline-start: var(--space-12);
		border-inline-start: 2px solid var(--frame);
		color: color-mix(in oklab, var(--fg) 70%, transparent);
	}

	.markdown :global(hr) {
		border: none;
		border-block-start: 1px solid var(--frame);
	}

	.markdown :global(:is(code, pre)) {
		font-family: ui-monospace, monospace;
		font-size: 0.9em;
	}

	.markdown :global(:not(pre) > code) {
		padding: 0.1em 0.3em;
		border-radius: var(--radius-s);
		background-color: var(--surface-hover);
	}

	/* A code block scrolls on its own rather than widening the column. */
	.markdown :global(pre) {
		overflow-x: auto;
		padding: var(--space-12);
		border-radius: var(--radius-m);
		background-color: var(--surface-hover);
		line-height: var(--leading-prose);
	}

	.markdown :global(table) {
		display: block;
		overflow-x: auto;
		border-collapse: collapse;
	}

	.markdown :global(:is(th, td)) {
		padding: var(--space-4) var(--space-8);
		border: 1px solid var(--frame);
		text-align: start;
	}

	.markdown :global(img) {
		border-radius: var(--radius-m);
	}

	/*
	 * CODE IN COLOUR, VS Code's own: the preview's highlight.css, which is
	 * highlight.js's `vs` in light and `vs2015` in dark. The only colour on the
	 * site besides the accent, and only inside a fence that asked for it.
	 *
	 * One custom property per class, so dark is a second set of values and not
	 * a second set of rules; the two selectors for dark are the ones app.css
	 * uses, since this page follows the display mode and not only the machine.
	 */
	.markdown {
		--hl-keyword: #00f;
		--hl-literal: #a31515;
		--hl-symbol: #00b0e8;
		--hl-built-in: #007acc;
		--hl-type: #a31515;
		--hl-number: #008000;
		--hl-string: #a31515;
		--hl-regexp: inherit;
		--hl-template-tag: #a31515;
		--hl-subst: #2b91af;
		--hl-function: inherit;
		--hl-title: #808080;
		--hl-comment: #008000;
		--hl-doctag: #808080;
		--hl-meta: #2b91af;
		--hl-tag: #00f;
		--hl-variable: #008000;
		--hl-template-variable: #a31515;
		--hl-attr: #f00;
		--hl-attribute: #a31515;
		--hl-section: #a31515;
		--hl-bullet: #00b0e8;
		--hl-selector-tag: #00f;
		--hl-selector: inherit;
		--hl-selector-attr: #2b91af;
	}

	@media (prefers-color-scheme: dark) {
		:global(:root:not([data-mode='light'])) .markdown {
			--hl-keyword: #569cd6;
			--hl-literal: #569cd6;
			--hl-symbol: #569cd6;
			--hl-built-in: #4ec9b0;
			--hl-type: #4ec9b0;
			--hl-number: #b8d7a3;
			--hl-string: #d69d85;
			--hl-regexp: #9a5334;
			--hl-template-tag: #9a5334;
			--hl-subst: #dcdcdc;
			--hl-function: #dcdcdc;
			--hl-title: #dcdcdc;
			--hl-comment: #57a64a;
			--hl-doctag: #608b4e;
			--hl-meta: #9b9b9b;
			--hl-tag: #9b9b9b;
			--hl-variable: #bd63c5;
			--hl-template-variable: #bd63c5;
			--hl-attr: #9cdcfe;
			--hl-attribute: #9cdcfe;
			--hl-section: gold;
			--hl-bullet: #d7ba7d;
			--hl-selector-tag: #d7ba7d;
			--hl-selector: #d7ba7d;
			--hl-selector-attr: #d7ba7d;
		}
	}

	:global(:root[data-mode='dark']) .markdown {
		--hl-keyword: #569cd6;
		--hl-literal: #569cd6;
		--hl-symbol: #569cd6;
		--hl-built-in: #4ec9b0;
		--hl-type: #4ec9b0;
		--hl-number: #b8d7a3;
		--hl-string: #d69d85;
		--hl-regexp: #9a5334;
		--hl-template-tag: #9a5334;
		--hl-subst: #dcdcdc;
		--hl-function: #dcdcdc;
		--hl-title: #dcdcdc;
		--hl-comment: #57a64a;
		--hl-doctag: #608b4e;
		--hl-meta: #9b9b9b;
		--hl-tag: #9b9b9b;
		--hl-variable: #bd63c5;
		--hl-template-variable: #bd63c5;
		--hl-attr: #9cdcfe;
		--hl-attribute: #9cdcfe;
		--hl-section: gold;
		--hl-bullet: #d7ba7d;
		--hl-selector-tag: #d7ba7d;
		--hl-selector: #d7ba7d;
		--hl-selector-attr: #d7ba7d;
	}

	.markdown :global(:is(.hljs-keyword, .hljs-name)) {
		color: var(--hl-keyword);
	}
	.markdown :global(.hljs-literal) {
		color: var(--hl-literal);
	}
	.markdown :global(:is(.hljs-symbol, .hljs-link)) {
		color: var(--hl-symbol);
	}
	.markdown :global(.hljs-built_in) {
		color: var(--hl-built-in);
	}
	.markdown :global(.hljs-type) {
		color: var(--hl-type);
	}
	.markdown :global(:is(.hljs-number, .hljs-class)) {
		color: var(--hl-number);
	}
	.markdown :global(.hljs-string) {
		color: var(--hl-string);
	}
	.markdown :global(.hljs-regexp) {
		color: var(--hl-regexp);
	}
	.markdown :global(.hljs-template-tag) {
		color: var(--hl-template-tag);
	}
	.markdown :global(.hljs-subst) {
		color: var(--hl-subst);
	}
	.markdown :global(:is(.hljs-function, .hljs-params, .hljs-formula)) {
		color: var(--hl-function);
	}
	.markdown :global(.hljs-title) {
		color: var(--hl-title);
	}
	.markdown :global(:is(.hljs-comment, .hljs-quote)) {
		color: var(--hl-comment);
		font-style: italic;
	}
	.markdown :global(.hljs-doctag) {
		color: var(--hl-doctag);
	}
	.markdown :global(.hljs-meta) {
		color: var(--hl-meta);
	}
	.markdown :global(.hljs-tag) {
		color: var(--hl-tag);
	}
	.markdown :global(.hljs-variable) {
		color: var(--hl-variable);
	}
	.markdown :global(.hljs-template-variable) {
		color: var(--hl-template-variable);
	}
	.markdown :global(.hljs-attr) {
		color: var(--hl-attr);
	}
	.markdown :global(.hljs-attribute) {
		color: var(--hl-attribute);
	}
	.markdown :global(.hljs-section) {
		color: var(--hl-section);
	}
	.markdown :global(.hljs-bullet) {
		color: var(--hl-bullet);
	}
	.markdown :global(.hljs-selector-tag) {
		color: var(--hl-selector-tag);
	}
	.markdown :global(:is(.hljs-selector-id, .hljs-selector-class)) {
		color: var(--hl-selector);
	}
	.markdown :global(:is(.hljs-selector-attr, .hljs-selector-pseudo)) {
		color: var(--hl-selector-attr);
	}
	.markdown :global(.hljs-emphasis) {
		font-style: italic;
	}
	.markdown :global(.hljs-strong) {
		font-weight: bold;
	}
	.markdown :global(.hljs-addition) {
		color: rgb(155 185 85);
		background-color: rgb(155 185 85 / 20%);
	}
	.markdown :global(.hljs-deletion) {
		color: rgb(255 0 0);
		background-color: rgb(255 0 0 / 20%);
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
		padding: var(--space-4);

		color: color-mix(in oklab, var(--fg) 60%, transparent);
		font-size: var(--text-label1);
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
		 * same `--space-8`, so nothing in the app is parted more than anything
		 * else and no gap reads as a division that is not one.
		 *
		 * It was `--space-16` throughout, which is the letter's step — right on a
		 * page of prose, where space is what separates one thought from the next,
		 * and too much on a working surface, where every step of it is window not
		 * being worked in. The EDGES came to it afterwards: they were `--space-16`
		 * for one commit, on the argument that holding the app off the window is a
		 * different job from parting its regions from each other, and the first
		 * site had already tried that and written down what it read as.
		 */
		gap: var(--gap-panel);
	}

	.desk {
		display: flex;
		flex-direction: column;
		gap: var(--gap-panel);
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
	 * THE RAIL STANDS STILL, as VS Code's side bar does: each pane keeps its
	 * heading and scrolls its own list, so a folder of two hundred files does not
	 * carry Scratch and Drives off the top. The rail scrolls only when a window is
	 * too short for even the headings.
	 */
	.rail {
		display: none;

		min-block-size: 0;
		overflow-y: auto;
		flex-direction: column;
		gap: var(--gap-panel);
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
	 * A pane is the height of its content until the rail runs out, and then the
	 * files give way and scroll — see `.bounded` for the two that do not. The
	 * least a pane shrinks to is its heading and its padding.
	 */
	.section {
		flex: 0 1 auto;
		min-block-size: calc(
			var(--rail-control-block-size) + var(--space-4) * 2 + var(--space-8) +
				var(--space-16)
		);

		display: flex;
		flex-direction: column;

		padding: var(--space-8);
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
		padding-block-end: var(--space-16);
		border-radius: var(--radius-xl);
		background-color: var(--rail);
		box-shadow: inset 0 0 0 1px var(--frame);
	}

	/*
	 * SCRATCH AND DRIVES ARE SHORT LISTS, and hold their height while the files
	 * take the rest; past a third of the rail they scroll too. Shrinking all
	 * three by size, flexbox's own rule, would take a long folder's overflow out
	 * of the short panes first.
	 */
	.section.bounded {
		flex-shrink: 0;
		max-block-size: 33%;
	}

	/* The list under a heading, and what scrolls. */
	.body {
		min-block-size: 0;
		overflow-y: auto;
	}

	.body[hidden] {
		display: none;
	}

	/* Folded to its heading: the foot goes with the list it answered. */
	.section:has(> .body[hidden]) {
		padding-block-end: var(--space-8);
	}

	/*
	 * The heading's text starts where a row's icon does (the row's own 4px
	 * inset), and its button ends where a row's box does, so the pane has one
	 * left line and one right line. Every heading is a control tall, button or
	 * not, so the panes' heads match.
	 */
	.section h2 {
		display: flex;
		align-items: center;
		gap: var(--space-4);

		min-block-size: calc(var(--rail-control-block-size) + var(--space-4) * 2);
		padding: var(--space-4);
		padding-inline-end: 0;

		font-size: var(--text-label1);
		line-height: var(--leading-tight);
		color: color-mix(in oklab, var(--fg) 60%, transparent);
	}

	/* The heading's own button, which folds the section: the whole width that
	 * is not an action, as VS Code's view headers are. */
	.twisty {
		flex: 1;
		min-inline-size: 0;
		display: flex;
		align-items: center;
		gap: var(--space-4);
		align-self: stretch;

		padding: 0;
		border: none;
		border-radius: var(--radius-s);
		background: none;
		color: inherit;
		font: inherit;
		text-align: start;
		cursor: pointer;
	}

	.twisty :global(svg) {
		flex: none;
		inline-size: 1em;
		block-size: 1em;
	}

	.twisty:focus-visible {
		outline: 2px solid var(--fg);
		outline-offset: -2px;
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
		border-radius: var(--radius-s);
		background: none;
		color: inherit;
		cursor: pointer;
	}

	.add :global(svg),
	.close :global(svg) {
		inline-size: 0.875rem;
		block-size: 0.875rem;
	}

	.add:hover:not(:disabled),
	.close:hover {
		background-color: var(--surface-hover);
	}

	/* Nothing open to collapse, as VS Code dims its own. */
	.add:disabled {
		opacity: 0.4;
		cursor: default;
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
		margin-inline-start: var(--space-4);
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
			margin-inline-start: var(--space-4);
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
		margin-block-start: var(--space-4);
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
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
		--indent: var(--space-16);

		inline-size: 100%;
		/* The rail's control height, so a row and its close button are one size. */
		min-block-size: var(--rail-control-block-size);
		display: flex;
		align-items: center;
		gap: var(--space-4);

		padding: var(--space-4);
		/*
		 * AFTER THE SHORTHAND, and that is not a matter of tidiness. `padding` is a
		 * shorthand: written below this longhand it resets it, so an indent declared
		 * first and a `padding` declared second is no indent at all. It was, once,
		 * and it failed silently — the tree drew as a flat list.
		 */
		padding-inline-start: calc(var(--space-4) + var(--depth) * var(--indent));

		border: none;
		border-radius: var(--radius-s);
		background: none;
		color: color-mix(in oklab, var(--fg) 60%, transparent);
		font-size: var(--text-label1);
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

	.file:hover:not(.inert) {
		color: var(--fg);
		background-color: var(--surface-hover);
	}

	.file:focus-visible {
		outline: 2px solid var(--fg);
		outline-offset: -2px;
	}

	.file[aria-current='true'] {
		color: var(--fg);
		background-color: var(--selected);
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

	/*
	 * WHERE A DRAG WILL LAND: the folder it goes into, washed as a selected row
	 * is, or the whole pane when it goes to the top. A row that has been cut is
	 * faded until it is pasted, as VS Code fades it.
	 */
	.file.drop,
	.section.drop {
		background-color: var(--selected);
	}

	.file.cut {
		opacity: 0.5;
	}

	.notice {
		margin-inline: var(--space-4);
	}

	.dont-ask {
		display: flex;
		align-items: center;
		gap: var(--space-8);
		margin-block-start: var(--space-8);
	}

	/* THE HEADING'S CONTROLS, together at its end. One auto margin on the group,
	 * because one on each would share the space out between them. */
	.actions {
		display: flex;
		margin-inline-start: auto;
	}

	.actions .add {
		margin-inline-start: 0;
	}

	/* A root reads as the head of what is under it, as VS Code sets one. */
	.row.root .name {
		font-weight: 600;
	}

	/*
	 * A MARK ONLY, the size of the controls beside it so the row stays even. The
	 * word cost the folder its name on a narrow rail, and the name is the thing
	 * worth reading there; the words are in the hover and in the reading.
	 * Quieter than the controls, because it is a fact to read, not a thing to press.
	 */
	.view-only {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex: none;

		inline-size: var(--rail-control-block-size);
		block-size: var(--rail-control-block-size);

		color: color-mix(in oklab, var(--fg) 60%, transparent);
		cursor: pointer;
	}

	.view-only :global(svg) {
		inline-size: 0.875rem;
		block-size: 0.875rem;
	}

	/*
	 * THE NAME BOX, standing where the row it names will stand: a row's height
	 * and indent, with the mark it will have. VS Code draws its box in the tree
	 * for the same reason — the name is typed where it will be read.
	 */
	.naming {
		--indent: var(--space-16);

		display: flex;
		align-items: center;
		gap: var(--space-4);
		min-block-size: var(--rail-control-block-size);
		padding-inline: calc(var(--space-4) + var(--depth) * var(--indent))
			var(--space-4);

		font-size: var(--text-label1);
	}

	.naming :global(svg) {
		flex: none;
		inline-size: 1em;
		block-size: 1em;
		color: color-mix(in oklab, var(--fg) 60%, transparent);
	}

	.naming input {
		flex: 1;
		min-inline-size: 0;
		padding: var(--space-2) var(--space-4);
		border: none;
		border-radius: var(--radius-s);
		outline: 1px solid var(--fg);
		background-color: var(--bg);
		color: var(--fg);
		line-height: var(--leading-tight);
	}

	.naming input[aria-invalid='true'] {
		outline-width: 2px;
	}

	/* The refusal hangs under the box, as VS Code's does, and pushes the rows
	 * below it down rather than covering them. */
	.refusal {
		margin: var(--space-2) var(--space-4) var(--space-4)
			calc(
				var(--space-4) + var(--depth) * var(--space-16) + 1em + var(--space-4)
			);
		padding: var(--space-4) var(--space-6);
		border-radius: var(--radius-s);
		box-shadow: inset 0 0 0 1px var(--fg);
		background-color: var(--bg);
		font-size: var(--text-label2);
		line-height: var(--leading-tight);
		text-wrap: pretty;
	}

	/*
	 * THE CONTEXT MENU. In the top layer, so nothing in the rail can clip it,
	 * and placed where it was asked for. The browser's own popover rules centre
	 * it and hide it; `inset` and `margin` undo the first, and `display` is set
	 * only while it is open so the second still holds.
	 */
	.menu {
		position: fixed;
		inset: auto;
		margin: 0;
		min-inline-size: 11rem;
		padding: var(--space-4);
		border: none;
		border-radius: var(--radius-m);
		background-color: var(--bg);
		color: var(--fg);
		box-shadow:
			0 0 0 1px var(--frame),
			0 var(--space-4) var(--space-16) rgb(0 0 0 / 16%);
	}

	.menu:popover-open {
		display: flex;
		flex-direction: column;
	}

	.menu [role='menuitem'] {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-16);
		min-block-size: var(--rail-control-block-size);
		padding: var(--space-4) var(--space-8);
		border: none;
		border-radius: var(--radius-s);
		background: none;
		color: inherit;
		font-size: var(--text-label1);
		text-align: start;
		cursor: pointer;
	}

	/* The wash is the focus, as it is in VS Code's menus; the ring would sit on
	 * top of it saying the same thing. */
	.menu [role='menuitem']:is(:hover, :focus-visible) {
		outline: none;
		background-color: var(--surface-hover);
	}

	.menu kbd {
		font: inherit;
		color: color-mix(in oklab, var(--fg) 60%, transparent);
	}

	.menu hr {
		margin: var(--space-4) 0;
		border: none;
		border-block-start: 1px solid var(--frame);
	}

	/* THE QUESTION BEFORE A DELETE. Modal, so nothing else can be pressed while
	 * it is asked, and Escape is the browser's own "no". */
	.confirm {
		max-inline-size: min(24rem, calc(100vw - var(--space-32)));
		margin: auto;
		padding: var(--space-16);
		border: none;
		border-radius: var(--radius-l);
		background-color: var(--bg);
		color: var(--fg);
		box-shadow: 0 0 0 1px var(--frame);
		font-size: var(--text-body1);
		line-height: var(--leading-prose);
	}

	.confirm::backdrop {
		background-color: rgb(0 0 0 / 30%);
	}

	.confirm .detail {
		color: color-mix(in oklab, var(--fg) 60%, transparent);
	}

	.choices {
		display: flex;
		justify-content: flex-end;
		gap: var(--space-8);
		margin-block-start: var(--space-16);
	}

	/* 2.75rem is 44px, the smallest target a finger can hit reliably. */
	.choices button {
		min-block-size: 2.75rem;
		padding-inline: var(--space-16);
		border: none;
		border-radius: var(--radius-m);
		background-color: var(--surface-hover);
		color: inherit;
		cursor: pointer;
	}

	.choices .primary {
		background-color: var(--accent);
		color: var(--accent-fg);
	}

	.choices button:focus-visible {
		outline: 2px solid var(--fg);
		outline-offset: 2px;
	}

	.heading {
		inline-size: 100%;
		/* The depth is a step of indent, and it comes from the heading level so a
		 * document with no H1 does not start indented. */
		padding: var(--space-4);
		padding-inline-start: calc(var(--space-4) + var(--depth) * var(--space-12));

		border: none;
		border-radius: var(--radius-s);
		background: none;
		font-size: var(--text-label1);
		line-height: var(--leading-tight);
		text-align: start;
		color: color-mix(in oklab, var(--fg) 60%, transparent);
		cursor: pointer;
	}

	.heading:hover {
		color: var(--fg);
		background-color: var(--surface-hover);
	}

	.heading:focus-visible {
		outline: 2px solid var(--fg);
		outline-offset: -2px;
	}
</style>
