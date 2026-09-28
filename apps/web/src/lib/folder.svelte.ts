/*
 * THE FOLDERS THAT ARE OPEN, and how they got here.
 *
 * $lib/workspace.ts knows what a folder IS; this knows which ones the visitor is
 * looking at, whether they have been read yet, and what to say when one cannot
 * be. The split is the same one $lib/scratch.svelte.ts keeps against the page:
 * the rules in a file with no runes in it, and the state that a rail redraws from
 * in a file that is nothing but runes.
 *
 * SEVERAL AT ONCE, side by side, as VS Code opens a multi-root workspace: a
 * folder on this device, a snapshot of one, a drive on a server, in any mix.
 * Each is a ROOT, and every path the page sees starts with its root's key — so
 * "Notes/Sub/one.md" is `Sub/one.md` in the root keyed "Notes". The page works
 * in those paths and never has to ask which folder a row is in; this file takes
 * the key off on the way into a store and puts it back on the way out.
 *
 * ONE DOCUMENT IS ON THE SHEET, whichever root it is in, so the words and where
 * they stand with the disk are held once, here, and not per root.
 */

import { davStore, probe, type DavConfig, type Probe } from '$lib/dav';
import {
	configFor,
	drives as listDrives,
	dropDrive,
	keepDrive,
	tokenFor,
	type Drive,
} from '$lib/drives';
import { recall, remember } from '$lib/remembered';
import {
	dirOf,
	foldersOf,
	isOpenable,
	join,
	localStore,
	MAX_DEPTH,
	snapshotStore,
	type FolderEntry,
	toRows,
	type Listing,
	type Row,
	type Store,
	type WriteError,
} from '$lib/workspace';

/*
 * HOW LONG AFTER THE LAST KEYSTROKE A SAVE GOES OUT.
 *
 * Not on the motion scale and not read from CSS: `--motion-morph` is how long a
 * shape takes to become another shape, and this is how long a hand pauses before
 * it has stopped typing. Two numbers that mean different things should not be
 * one number because they happen to be close.
 *
 * 600ms is long enough that a normal sentence goes out as one write rather than
 * as forty, and short enough that closing the tab a beat after typing does not
 * lose the beat. A document is also written on the way out — see `flush`.
 */
const SETTLE_MS = 600;

/*
 * WHICH WAY THIS BROWSER CAN HAND OVER A FOLDER.
 *
 * Detected on `showDirectoryPicker` and on nothing else, because everything else
 * lies: `FileSystemDirectoryHandle` and `createWritable` are present in browsers
 * that will not let a page ask for a folder in the first place, so a feature
 * detect on any of them reports a capability this app cannot use.
 *
 * Undefined until asked, because the answer needs a window and the first render
 * of this page happens on a build machine.
 */
export function canPickFolder() {
	return (
		typeof window !== 'undefined' &&
		typeof window.showDirectoryPicker === 'function'
	);
}

/*
 * WHAT WENT WRONG LAST, if anything. `idle` is the state a visit opens in and is
 * not a failure; the other two are about a folder that was asked for and did not
 * arrive, so there is no root to say it beside and the rail says it on its own.
 *
 * A folder that arrived with nothing in it is not here: it is a root, and says
 * so under its own name — see `isEmpty`.
 */
export type Trouble = 'idle' | 'denied' | 'unreadable';

/*
 * ONE OPEN FOLDER. `key` is its name in the rail and the first segment of every
 * path in it — its own name, numbered where another root already has that one.
 * `handle` is kept for a folder on this device, so it can be remembered and so
 * the same folder picked twice is recognised; `drive` likewise for a drive.
 */
type Root = {
	key: string;
	store: Store;
	listing: Listing;
	handle: FileSystemDirectoryHandle | null;
	drive: string | null;
};

/* Replaced whole on every change rather than proxied: a store is a bag of
 * closures and a handle is a platform object, and neither wants a proxy around
 * it. */
let roots = $state.raw<Root[]>([]);

/*
 * FOLDERS FROM LAST TIME, WAITING TO BE LET BACK IN. A handle survives a reload;
 * the permission to read through it does not, and a browser will only grant it
 * again in answer to a click. So these are not folders that are open — they are
 * folders that could be, and the rail offers each by name.
 */
let waiting = $state.raw<FileSystemDirectoryHandle[]>([]);

/* Whether `look` has answered. Until it has, "no folder open" may not be true. */
let looked = $state(false);

/*
 * Whether it has been ASKED, which is not state: `look` runs from an effect, and
 * a guard the effect could read would be one it re-runs on. It reads the
 * waiting list and then replaces it, so an effect following that list asked
 * again every time it answered, for ever.
 */
let asked = false;

/*
 * THE DRIVES THIS BROWSER KNOWS. Listed on the page so they can be opened again
 * without being described again — a drive is the small amount somebody says once,
 * and saying it twice is the thing this list exists to prevent.
 */
let known = $state<Drive[]>([]);
let drivesRead = $state(false);

/*
 * WHICH FOLDERS ARE OPEN, roots among them. Open rather than shut, so a folder
 * that arrives in a later listing — a drive's, read when its parent opens, or one
 * only named by a document's path — is drawn shut like every other, as VS Code
 * draws it.
 */
let expanded = $state.raw<Set<string>>(new Set());

/*
 * WHICH FOLDERS HAVE BEEN READ. Only a LAZY store needs this — one that answered
 * everything in `list` has read them all by definition.
 *
 * A folder that is being read is in `opening` too, so the row can say so: over a
 * network, opening a folder is a round trip and a rail that did nothing visible
 * for half a second would read as a press that did not land.
 */
let loaded = $state.raw<Set<string>>(new Set());
let opening = $state.raw<Set<string>>(new Set());
let trouble = $state<Trouble>('idle');

/* How many folders are being read on their way in. A count, because two can be
 * asked for before the first has answered. */
let reading = $state(0);

/* Which document is on the sheet, by path, and its words. Held here rather than
 * on the page because a folder closing has to take them with it. */
let openPath = $state<string | null>(null);
let openText = $state<string | null>(null);

/* A document on its way. Without it the sheet has only `null`, which is also
 * what a document that could not be read is. */
let fetching = $state(false);

/*
 * WHERE THE WORDS ON THE SHEET STAND WITH THE DISK. `clean` is not "saved" — it
 * is "nothing to save", which is also what a document that has never been typed
 * in is. The two are the same state and there is no use telling them apart.
 *
 * `trouble` is the one that earns its place. A save that failed leaves the words
 * on the sheet exactly where a save that worked leaves them, so this is the only
 * thing standing between a visitor and the belief that their document is safe.
 */
export type SaveState = 'clean' | 'dirty' | 'saving' | 'trouble';

let save = $state<SaveState>('clean');
let saveWhy = $state<WriteError | null>(null);

let timer: ReturnType<typeof setTimeout> | null = null;
/* What is on the sheet, unproxied. `openText` is state and reading it inside the
 * timer would tie the timer to it; this is the value the write actually carries. */
let pending: { path: string; body: string } | null = null;

// ── Paths, and which root they are in ────────────────────────────────────────

/* A folder and everything under it, or a document on its own. */
const within = (path: string, root: string) =>
	path === root || path.startsWith(`${root}/`);

const rootOf = (path: string) => roots.find((root) => within(path, root.key));

/* A path inside its root, as the root's store knows it: '' for the top. */
const rel = (root: Root, path: string) =>
	path === root.key ? '' : path.slice(root.key.length + 1);

/* And back: a store's path, as the page knows it. */
const qual = (root: { key: string }, path: string) =>
	path ? `${root.key}/${path}` : root.key;

function qualify(root: { key: string }, listing: Listing): Listing {
	return {
		files: listing.files.map((file) => ({
			...file,
			path: qual(root, file.path),
		})),
		dirs: listing.dirs.filter(Boolean).map((dir) => qual(root, dir)),
	};
}

/* The same root, as it is now: roots are replaced whole, so the one a slow
 * answer set out from may have been replaced — or put away — while it was out. */
const current = (root: Root) => roots.find((one) => one.store === root.store);

function patch(root: Root, change: (listing: Listing) => Listing) {
	roots = roots.map((one) =>
		one.store === root.store ? { ...one, listing: change(one.listing) } : one,
	);
}

/*
 * A KEY FOR A NEW ROOT: its own name, or "Notes (2)" where one is already open
 * under it — two folders called Notes are not unusual, and the rail has to tell
 * them apart. A slash would read as a folder inside it, so none is kept.
 */
function keyFor(name: string) {
	const base = name.replace(/\//g, '∕').trim() || 'Folder';
	const used = new Set(roots.map((root) => root.key));
	let key = base;
	for (let n = 2; used.has(key); n += 1) key = `${base} (${n})`;
	return key;
}

// ── The document on the sheet ────────────────────────────────────────────────

async function flush() {
	if (timer) {
		clearTimeout(timer);
		timer = null;
	}
	if (!pending) return;

	const { path, body } = pending;
	const root = rootOf(path);
	if (!root) {
		pending = null;
		return;
	}
	pending = null;
	save = 'saving';

	const result = await root.store.write(rel(root, path), body);

	/* The document may have been closed or another one opened while that was in
	 * flight, and this answer is about a document nobody is looking at. Reporting
	 * it on the row that IS open would be reporting it about the wrong document. */
	if (openPath !== path) return;

	if (result.ok) {
		save = pending ? 'dirty' : 'clean';
		saveWhy = null;
	} else {
		save = 'trouble';
		saveWhy = result.why;
	}
}

/* Nothing on the sheet from the folders, and nothing waiting to go out. */
function clearSheet() {
	if (timer) clearTimeout(timer);
	timer = null;
	pending = null;
	save = 'clean';
	saveWhy = null;
	openPath = null;
	openText = null;
	fetching = false;
}

// ── Roots arriving and leaving ───────────────────────────────────────────────

/* The folders on this device that are open or offered, to come back next visit. */
function persist() {
	return remember([
		...roots.flatMap((root) => (root.handle ? [root.handle] : [])),
		...waiting,
	]);
}

/*
 * READ A FOLDER AND ADD IT. It is added only once it has read, so a folder that
 * would not is never a root with nothing under it — it is trouble, said once.
 *
 * EVERY FOLDER OPENS SHUT, whichever kind of store it came from, and the root
 * itself opens open. A workspace of thirty folders unrolled is a column nobody
 * can find anything in, and a folder on this device and one on a server are the
 * same thing to somebody looking at a list of them.
 */
async function adopt(
	next: Store,
	from: { handle?: FileSystemDirectoryHandle; drive?: string } = {},
) {
	reading += 1;
	const read = await next.list();
	reading -= 1;

	if (!read) {
		trouble = 'unreadable';
		return null;
	}

	const key = keyFor(next.name);
	const root: Root = {
		key,
		store: next,
		listing: qualify({ key }, read),
		handle: from.handle ?? null,
		drive: from.drive ?? null,
	};
	roots = [...roots, root];
	expanded = new Set(expanded).add(key);
	if (next.listDir) loaded = new Set(loaded).add(key);
	trouble = 'idle';
	return root;
}

/* Is this handle's folder open already? Picked twice, it is shown, not doubled. */
async function sameEntry(
	one: FileSystemDirectoryHandle,
	other: FileSystemDirectoryHandle,
) {
	if (one === other) return true;
	if (typeof one.isSameEntry !== 'function') return false;
	try {
		return await one.isSameEntry(other);
	} catch {
		// A handle that cannot be compared is not the same one.
		return false;
	}
}

async function openAlready(handle: FileSystemDirectoryHandle) {
	for (const root of roots) {
		if (root.handle && (await sameEntry(root.handle, handle))) return root;
	}
	return null;
}

/* A folder opened some other way is no longer one to offer: left there, it
 * would be remembered twice and offered back as a second copy of itself. */
async function unoffer(handle: FileSystemDirectoryHandle) {
	const kept: FileSystemDirectoryHandle[] = [];
	for (const one of waiting) {
		if (!(await sameEntry(one, handle))) kept.push(one);
	}
	if (kept.length !== waiting.length) waiting = kept;
}

function show(root: Root) {
	expanded = new Set(expanded).add(root.key);
	trouble = 'idle';
}

/* Two listings, joined. A folder's children arrive knowing only themselves, and
 * a path is unique, so this is a merge on path and nothing cleverer. */
function merge(into: Listing, extra: Listing, at: string): Listing {
	const paths = new Set(into.files.map((file) => file.path));
	const dirs = new Set(into.dirs);
	dirs.add(at);
	for (const dir of extra.dirs) dirs.add(dir);

	return {
		files: [
			...into.files,
			...extra.files.filter((file) => !paths.has(file.path)),
		],
		dirs: [...dirs].filter((dir) => !roots.some((root) => root.key === dir)),
	};
}

// ── Names ────────────────────────────────────────────────────────────────────

/*
 * WHAT A NAME THAT WILL NOT DO IS TOLD. VS Code's own refusals, since the
 * editor takes vscode.dev as its reference: `taken` and `empty` are its words,
 * `slash` is ours, because VS Code makes the folders a slash names and the
 * stores here do not.
 */
export type Refusal =
	'empty' | 'slash' | 'taken' | 'into' | 'partial' | 'failed' | 'across';

/*
 * THE NAME A COPY TAKES WHERE ITS OWN IS TAKEN: VS Code's default,
 * `explorer.incrementalNaming: simple`. `one.md`, then `one copy.md`, then
 * `one copy 2.md`; a folder's name has no extension to keep.
 */
export function copyName(name: string, isDir: boolean) {
	const dot = isDir ? -1 : name.lastIndexOf('.');
	const base = dot > 0 ? name.slice(0, dot) : name;
	const ext = dot > 0 ? name.slice(dot) : '';
	const counted = /^(.+ copy)(?: (\d+))?$/.exec(base);
	return counted
		? `${counted[1]} ${Number(counted[2] ?? 1) + 1}${ext}`
		: `${base} copy${ext}`;
}

/* A path, or why not — never one string that could be either. */
export type Made = { path: string } | { refusal: Refusal };

/* Is a name in use in `dir` already? Without regard to case, because the disk
 * underneath may not regard it either, and `except` lets a rename change only
 * the case of its own name. */
function taken(dir: string, name: string, except?: string) {
	const root = rootOf(dir);
	if (!root) return false;
	const path = join(dir, name).toLowerCase();
	if (except?.toLowerCase() === path) return false;
	return (
		root.listing.files.some((file) => file.path.toLowerCase() === path) ||
		root.listing.dirs.some((one) => one.toLowerCase() === path)
	);
}

function refuse(name: string): Refusal | null {
	if (!name.trim()) return 'empty';
	if (/[/\\]/.test(name)) return 'slash';
	return null;
}

/* A document as the rail lists it, at a path. */
function entryAt(path: string): FolderEntry {
	const name = path.slice(path.lastIndexOf('/') + 1);
	return isOpenable(name) ? { name, path } : { name, path, openable: false };
}

/*
 * EVERYTHING AT `from` IS AT `to` NOW — a document, or a folder and all it
 * holds — so the rail, the folds and the open document follow it there.
 */
function remap(root: Root, from: string, to: string) {
	const swap = (path: string) =>
		within(path, from) ? to + path.slice(from.length) : path;
	patch(root, (listing) => ({
		files: listing.files.map((file) =>
			within(file.path, from) ? entryAt(swap(file.path)) : file,
		),
		dirs: listing.dirs.map(swap),
	}));
	expanded = new Set([...expanded].map(swap));
	loaded = new Set([...loaded].map(swap));
	if (openPath !== null) openPath = swap(openPath);
}

/*
 * READ A FOLDER ON A LAZY STORE, the first time it is opened. Its folders
 * arrive shut, as every folder does — see `adopt`.
 */
async function load(path: string) {
	const root = rootOf(path);
	if (!root?.store.listDir || loaded.has(path) || opening.has(path)) return;

	opening = new Set(opening).add(path);
	const extra = await root.store.listDir(rel(root, path));
	opening = new Set([...opening].filter((one) => one !== path));

	/* The root put away while that was in flight: this answer is about a tree
	 * nobody is looking at. */
	const now = current(root);
	if (!now) return;

	/* Left UNLOADED, so opening it again tries again. A folder that failed once
	 * over a network is not a folder that is empty. */
	if (!extra) return;

	loaded = new Set(loaded).add(path);
	patch(now, (listing) => merge(listing, qualify(now, extra), path));
}

/* Every folder there is to fold: the roots, and every folder in each. */
function folderPaths() {
	const all = new Set<string>();
	for (const root of roots) {
		all.add(root.key);
		for (const dir of foldersOf(root.listing)) all.add(dir);
	}
	return all;
}

/* Open every folder above a path, so what was just made is in view. */
function reveal(path: string) {
	const next = new Set(expanded);
	for (let dir = dirOf(path); dir; dir = dirOf(dir)) next.add(dir);
	expanded = next;
}

/* A new document or folder, in the root it was made in. */
function added(root: Root, entry: { files?: FolderEntry[]; dirs?: string[] }) {
	patch(root, (listing) => ({
		files: [...listing.files, ...(entry.files ?? [])],
		dirs: [...new Set([...listing.dirs, ...(entry.dirs ?? [])])],
	}));
	trouble = 'idle';
}

export const folder = {
	/* The open folders, in the order they were opened, as the rail lists them. */
	get roots() {
		return roots.map((root) => ({
			key: root.key,
			kind: root.store.kind,
			writable: root.store.writable,
			drive: root.drive,
		}));
	},

	/* Which root a path is in, by key — or null for one in none. */
	rootKey(path: string) {
		return rootOf(path)?.key ?? null;
	},

	/* A path from the top of its own folder, which is what a person means by
	 * "the path" and what Copy Relative Path copies. */
	relative(path: string) {
		const root = rootOf(path);
		return root ? rel(root, path) : path;
	},

	/* Whether the folder a path is in can be written to. A snapshot cannot. */
	writableAt(path: string) {
		return rootOf(path)?.store.writable ?? false;
	},

	/* Folders can be renamed and moved only where the store does it in one step
	 * — see `renameDir` in $lib/workspace. The rail offers it only there. */
	relocatesAt(path: string) {
		const store = rootOf(path)?.store;
		return Boolean(store?.renameDir && store.moveDir);
	},

	/* A root that read and has nothing in it this editor can open. */
	isEmpty(key: string) {
		const root = roots.find((one) => one.key === key);
		return Boolean(
			root && !root.listing.files.length && !root.listing.dirs.length,
		);
	},

	/* The rail's rows: each root, and under it, when it is open, its folders and
	 * documents in one flat list, each carrying how far in it sits. See `toRows`. */
	get rows(): Row[] {
		return roots.flatMap((root): Row[] => [
			{ kind: 'dir', name: root.key, path: root.key, depth: 0, root: true },
			...(expanded.has(root.key)
				? toRows(root.listing, expanded, root.key)
				: []),
		]);
	},

	isClosed(path: string) {
		return !expanded.has(path);
	},

	isOpening(path: string) {
		return opening.has(path);
	},

	/*
	 * OPEN OR SHUT A FOLDER, and on a lazy store fetch it the first time.
	 *
	 * The fold happens FIRST and the fetch after. A rail that waited for the round
	 * trip before turning the mark would leave a press with nothing to show for
	 * half a second, and the folder is open either way — what is not yet known is
	 * only what is in it.
	 */
	async fold(path: string) {
		const next = new Set(expanded);
		const opened = !next.delete(path);
		if (opened) next.add(path);
		expanded = next;

		if (opened) await load(path);
	},

	/* Every folder above a path opened, so its row is in view. */
	reveal(path: string) {
		reveal(path);
	},

	/* Every folder shut, as VS Code's Collapse Folders in Explorer shuts them —
	 * all but the roots, which stay as they were, so each open folder still shows
	 * its own top and a reader is not left with a column of names. */
	collapseAll() {
		const keys = new Set(roots.map((root) => root.key));
		expanded = new Set([...expanded].filter((path) => keys.has(path)));
	},

	/*
	 * EVERY FOLDER OPEN, down to what the walk would reach. A lazy store reads
	 * each level as it is opened, one round trip a folder, and a level at a time
	 * so the rail fills from the top.
	 */
	async expandAll() {
		/* The same folders open, by their stores: `roots` itself is replaced every
		 * time a level is read in, so comparing the array stopped after one. */
		const stores = roots.map((root) => root.store);
		const same = () =>
			roots.length === stores.length &&
			roots.every((root, i) => root.store === stores[i]);
		for (let depth = 0; depth <= MAX_DEPTH && same(); depth += 1) {
			const shut = [...folderPaths()].filter((path) => !expanded.has(path));
			if (!shut.length) return;
			expanded = new Set([...expanded, ...shut]);
			await Promise.all(shut.map(load));
		}
	},

	/* Whether any folder below a root is open, for the heading to offer the one
	 * of the two that would do something — see `collapseAll`. */
	get anyExpanded() {
		const all = folderPaths();
		const keys = new Set(roots.map((root) => root.key));
		return [...expanded].some((path) => all.has(path) && !keys.has(path));
	},

	get trouble() {
		return trouble;
	},

	get reading() {
		return reading > 0;
	},

	get openPath() {
		return openPath;
	},

	get openText() {
		return openText;
	},

	/*
	 * ASK FOR A FOLDER. Chromium hands over a handle that could be written through
	 * and remembered; everything else has the input the page draws instead.
	 *
	 * A visitor who dismisses the picker has not failed at anything — that is what
	 * a cancel is — so an AbortError leaves the state exactly as it was rather than
	 * reporting trouble nobody is in.
	 */
	async pick() {
		/* Held rather than called through `window`, because the check and the call
		 * have to be about the same thing — which is what the optional member in
		 * app.d.ts is for. */
		const ask =
			typeof window === 'undefined' ? undefined : window.showDirectoryPicker;
		if (!ask) return;

		try {
			const handle = await ask.call(window, { mode: 'readwrite' });
			await unoffer(handle);
			const already = await openAlready(handle);
			if (already) {
				show(already);
				await persist();
				return;
			}

			/* Kept AFTER it read, so a folder that could not be walked is not offered
			 * back next visit. */
			if (await adopt(localStore(handle, isOpenable), { handle })) {
				await persist();
			}
		} catch (error) {
			if (error instanceof DOMException && error.name === 'AbortError') return;
			trouble = 'denied';
		}
	},

	get waiting() {
		return waiting;
	},

	get drives() {
		return known;
	},

	get drivesRead() {
		return drivesRead;
	},

	get looked() {
		return looked;
	},

	get fetching() {
		return fetching;
	},

	/* The drives, read once on arrival. No tokens are touched: a list is a list. */
	async loadDrives() {
		known = await listDrives();
		drivesRead = true;
	},

	/*
	 * TRY A SERVER ONCE, and answer in the words a form needs rather than in the
	 * words a row needs. Nothing is remembered — this is the question somebody
	 * asks before they commit to anything.
	 */
	async tryDrive(cfg: DavConfig): Promise<Probe> {
		return probe(cfg);
	},

	/*
	 * CONNECT A DRIVE AND OPEN IT beside whatever else is open. The probe has
	 * already happened in the form, so what is left is to remember it and read it.
	 */
	async connect(drive: Drive, token: string) {
		await keepDrive(drive, token);
		known = await listDrives();
		const already = roots.find((root) => root.drive === drive.id);
		if (already) return show(already);
		await adopt(davStore(configFor(drive, token), isOpenable), {
			drive: drive.id,
		});
	},

	/*
	 * OPEN A DRIVE THAT IS ALREADY KNOWN. Its token comes from the vault, or from
	 * this session if it was never written down — and if there is none, the drive
	 * has to be connected again, which the rail says rather than failing quietly.
	 */
	async openDrive(id: string) {
		const already = roots.find((root) => root.drive === id);
		if (already) return show(already);

		const drive = known.find((one) => one.id === id);
		if (!drive) return;

		const token = await tokenFor(id);
		if (!token) {
			trouble = 'denied';
			return;
		}

		await adopt(davStore(configFor(drive, token), isOpenable), { drive: id });
	},

	async dropDrive(id: string) {
		await dropDrive(id);
		known = await listDrives();
	},

	/*
	 * ASK WHETHER THERE ARE ANY, without asking for them. Called from an effect on
	 * the page, and it must not do anything a browser would refuse outside a
	 * gesture — so it reads the handles and stops there.
	 *
	 * A handle whose grant HAS survived is opened straight away, because there is
	 * nothing to ask: `queryPermission` answering `granted` means a click would add
	 * nothing but a click. Anything else waits for one.
	 */
	async look() {
		if (asked) return;
		asked = true;
		try {
			if (roots.length || waiting.length) return;

			const offered: FileSystemDirectoryHandle[] = [];
			for (const handle of await recall()) {
				/* Kept twice by an older visit: once is enough. */
				if (await openAlready(handle)) continue;
				let twice = false;
				for (const one of offered) twice ||= await sameEntry(one, handle);
				if (twice) continue;

				const next = localStore(handle, isOpenable);
				if ((await next.permission()) === 'granted') {
					await adopt(next, { handle });
				} else {
					offered.push(handle);
				}
			}
			waiting = offered;
		} finally {
			looked = true;
		}
	},

	/*
	 * LET ONE BACK IN. From a click, because `requestPermission` outside a gesture
	 * is refused by every browser that has it — which is the whole reason this is
	 * two steps and not one.
	 *
	 * A folder that is gone, or refused, is FORGOTTEN rather than offered again
	 * next visit: an offer that cannot be taken up is worse than none, and it would
	 * be made on every visit for ever.
	 */
	async resume(handle: FileSystemDirectoryHandle) {
		if (!waiting.includes(handle)) return;

		const next = localStore(handle, isOpenable);
		const granted = await next.requestPermission();
		waiting = waiting.filter((one) => one !== handle);

		if (granted !== 'granted') {
			trouble = 'denied';
			await persist();
			return;
		}

		/* Opened some other way since it was offered: shown, not doubled. */
		const already = await openAlready(handle);
		if (already) show(already);
		else await adopt(next, { handle });

		/* Read or not, what is kept is what is open and what is still offered: a
		 * folder that was granted and still would not read is not there any more. */
		await persist();
	},

	/* The `<input webkitdirectory>` path, handed the files it collected. */
	async take(picked: File[]) {
		if (!picked.length) return;
		await adopt(snapshotStore(picked, isOpenable));
	},

	get save() {
		return save;
	},

	get saveWhy() {
		return saveWhy;
	},

	/*
	 * PUT A DOCUMENT ON THE SHEET. A row that cannot be read leaves the path set
	 * and the words null, which is what the sheet needs to say so — the difference
	 * between "nothing is open" and "this would not open" is the whole of what a
	 * reader wants to know there.
	 */
	async open(path: string) {
		const root = rootOf(path);
		if (!root) return;

		/* Whatever was on the sheet goes out BEFORE the sheet changes. A debounce
		 * that is still counting when a row is clicked would otherwise write the old
		 * document's words after the new one has arrived. */
		await flush();

		openPath = path;
		openText = null;
		save = 'clean';
		saveWhy = null;
		fetching = true;
		const text = await root.store.read(rel(root, path));

		/* Another document was asked for while this one was on its way, and its
		 * own answer is the one the sheet is waiting for. */
		if (openPath !== path) return;
		openText = text;
		fetching = false;
	},

	/*
	 * TYPING. The sheet keeps its own words the moment they are typed and the disk
	 * catches up a beat later — anything else means a sheet that stutters, because
	 * a write is a round trip and a keystroke is not.
	 */
	edit(body: string) {
		if (openPath === null || !rootOf(openPath)?.store.writable) return;

		openText = body;
		pending = { path: openPath, body };
		save = 'dirty';
		saveWhy = null;

		if (timer) clearTimeout(timer);
		timer = setTimeout(flush, SETTLE_MS);
	},

	/* Put the words out now rather than when the timer says so. For leaving the
	 * page, and for anything that has to know the disk is current. */
	flush,

	/* Ctrl+S: out now, and again if the last write failed, as VS Code tries a
	 * failed save again when asked to save. */
	saveNow() {
		if (
			!pending &&
			save === 'trouble' &&
			openPath !== null &&
			openText !== null
		) {
			pending = { path: openPath, body: openText };
		}
		return flush();
	},

	/* Every document listed in every root, folded away or not: what Go to File
	 * searches. */
	get files() {
		return roots.flatMap((root) => root.listing.files);
	},

	/* A file's bytes, for a picture in the proof. */
	picture(path: string) {
		const root = rootOf(path);
		return root ? root.store.picture(rel(root, path)) : Promise.resolve(null);
	},

	/* The refusal a name would meet, asked as it is typed, as VS Code asks. */
	check(dir: string, name: string, except?: string): Refusal | null {
		return refuse(name) ?? (taken(dir, name.trim(), except) ? 'taken' : null);
	},

	/*
	 * A NEW DOCUMENT, named by the visitor as VS Code asks for one. Answers with
	 * its path, or why not. `create` would number a name it found taken; asking
	 * first means a taken name is refused, as VS Code refuses it, and not
	 * quietly changed.
	 */
	async newFile(dir: string, name: string): Promise<Made> {
		name = name.trim();
		const no = refuse(name) ?? (taken(dir, name) ? 'taken' : null);
		if (no) return { refusal: no };
		const root = rootOf(dir);
		if (!root?.store.writable) return { refusal: 'failed' };

		const at = rel(root, dir);
		const dot = name.lastIndexOf('.');
		const made =
			dot > 0
				? await root.store.create(at, name.slice(0, dot), name.slice(dot), '')
				: await root.store.create(at, name, '', '');
		if (!made) return { refusal: 'failed' };

		const path = qual(root, made.path);
		added(root, { files: [entryAt(path)] });
		reveal(path);
		return { path };
	},

	/* A NEW FOLDER, drawn shut as VS Code draws it, and known to be empty so a
	 * lazy store is not asked to read it. */
	async newFolder(dir: string, name: string): Promise<Made> {
		name = name.trim();
		const no = refuse(name) ?? (taken(dir, name) ? 'taken' : null);
		if (no) return { refusal: no };
		const root = rootOf(dir);
		if (!root?.store.writable) return { refusal: 'failed' };

		const made = await root.store.createDir(rel(root, dir), name);
		if (!made) return { refusal: 'failed' };

		const path = qual(root, made);
		added(root, { dirs: [path] });
		if (root.store.listDir) loaded = new Set(loaded).add(path);
		reveal(path);
		return { path };
	},

	/*
	 * A NEW NAME. The words on the sheet go out first, under the name they were
	 * typed under, if the open document is the one being renamed or is inside it.
	 * A root keeps its name: it is the folder's own, and not this editor's to change.
	 */
	async rename(path: string, to: string): Promise<Made> {
		to = to.trim();
		const no = refuse(to) ?? (taken(dirOf(path), to, path) ? 'taken' : null);
		if (no) return { refusal: no };
		const root = rootOf(path);
		if (!root?.store.writable || path === root.key)
			return { refusal: 'failed' };
		if (to === path.slice(path.lastIndexOf('/') + 1)) return { path };

		const isDir = root.listing.dirs.includes(path);
		if (isDir && !root.store.renameDir) return { refusal: 'failed' };
		if (openPath !== null && within(openPath, path)) await flush();

		const moved = isDir
			? await root.store.renameDir!(rel(root, path), to)
			: ((await root.store.rename(rel(root, path), to))?.path ?? null);
		if (!moved) return { refusal: 'failed' };

		const next = qual(root, moved);
		remap(root, path, next);
		return { path: next };
	},

	/*
	 * A COPY, from a paste or a drag with Ctrl held. It keeps its name where that
	 * is free and takes a "copy" name where it is not — into its own folder, a
	 * duplicate. The words on the sheet go out first, so the copy is of what is
	 * on the screen. A folder copy that stopped part way is still listed, as far
	 * as it got.
	 *
	 * WITHIN ONE ROOT. Across two it would be a read out of one store and a write
	 * into another, a different operation with different ways to fail — refused
	 * in words until it is built on purpose.
	 */
	async copy(
		row: { kind: 'dir' | 'file'; path: string },
		dir: string,
	): Promise<Made> {
		const root = rootOf(row.path);
		if (!root?.store.writable || row.path === root.key) {
			return { refusal: 'failed' };
		}
		if (rootOf(dir) !== root) return { refusal: 'across' };
		if (row.kind === 'dir' && within(dir, row.path)) {
			return { refusal: 'into' };
		}

		let name = row.path.slice(row.path.lastIndexOf('/') + 1);
		for (let tries = 0; taken(dir, name); tries += 1) {
			if (tries >= 100) return { refusal: 'failed' };
			name = copyName(name, row.kind === 'dir');
		}

		if (openPath !== null && within(openPath, row.path)) await flush();
		const copied = await root.store.copy(
			rel(root, row.path),
			row.kind,
			rel(root, dir),
			name,
		);
		if (!copied) return { refusal: 'failed' };

		const made = qualify(root, copied.made);
		const now = current(root);
		if (now) {
			const had = new Set(now.listing.files.map((file) => file.path));
			added(now, {
				files: made.files.filter((file) => !had.has(file.path)),
				dirs: made.dirs,
			});
		}

		/* Every folder a copy made lands shut, as every folder opens shut — see
		 * `adopt`. On a lazy store it is read when it is opened, like any other. */
		const top = join(dir, name);
		reveal(top);

		return copied.whole ? { path: top } : { refusal: 'partial' };
	},

	/* INTO ANOTHER FOLDER, from a drag or a cut and paste. A taken name is
	 * refused rather than replaced, a folder is not put inside itself, and
	 * nothing crosses from one root to another — see `copy`. */
	async move(path: string, dir: string): Promise<Made> {
		const root = rootOf(path);
		if (!root?.store.writable || path === root.key) {
			return { refusal: 'failed' };
		}
		if (rootOf(dir) !== root) return { refusal: 'across' };
		if (dirOf(path) === dir) return { path };
		if (within(dir, path)) return { refusal: 'into' };
		if (taken(dir, path.slice(path.lastIndexOf('/') + 1))) {
			return { refusal: 'taken' };
		}

		const isDir = root.listing.dirs.includes(path);
		if (isDir && !root.store.moveDir) return { refusal: 'failed' };
		if (openPath !== null && within(openPath, path)) await flush();

		const moved = isDir
			? await root.store.moveDir!(rel(root, path), rel(root, dir))
			: ((await root.store.move(rel(root, path), rel(root, dir)))?.path ??
				null);
		if (!moved) return { refusal: 'failed' };

		const next = qual(root, moved);
		remap(root, path, next);
		reveal(next);
		return { path: next };
	},

	/*
	 * GONE FOR GOOD: there is no bin to put it in from a web page. The page asks
	 * first, in VS Code's words. A document open on the sheet goes with it, and
	 * so do its unsaved words, which have nowhere left to be written. A root is
	 * put away, not deleted — see `close`.
	 */
	async remove(row: { kind: 'dir' | 'file'; path: string }) {
		const root = rootOf(row.path);
		if (!root?.store.writable || row.path === root.key) return false;
		const at = rel(root, row.path);
		const gone =
			row.kind === 'dir'
				? await root.store.removeDir(at)
				: await root.store.remove(at);
		if (!gone) return false;

		const kept = (path: string) => !within(path, row.path);
		const now = current(root);
		if (now) {
			patch(now, (listing) => ({
				files: listing.files.filter((file) => kept(file.path)),
				dirs: listing.dirs.filter(kept),
			}));
		}
		expanded = new Set([...expanded].filter(kept));
		loaded = new Set([...loaded].filter(kept));

		if (openPath !== null && !kept(openPath)) clearSheet();
		return true;
	},

	/*
	 * PUT ONE FOLDER AWAY. The others, and the scratch notes, are untouched.
	 * Answers whether it went.
	 */
	async close(key: string) {
		const root = roots.find((one) => one.key === key);
		if (!root) return false;
		const holdsSheet = openPath !== null && within(openPath, key);

		/*
		 * THE LAST WORDS GO OUT FIRST, if they are this folder's. They were dropped
		 * here once, which lost anything typed in the 600ms before the press. A save
		 * that fails keeps the folder open, once, so the bar can say so; a second
		 * press closes it anyway, because by then losing them is a choice.
		 */
		if (holdsSheet) {
			const unsaved = pending !== null;
			await flush();
			if (unsaved && save === 'trouble') return false;
			clearSheet();
		}

		const kept = (path: string) => !within(path, key);
		/* By store: the root may have been replaced while its words went out. */
		roots = roots.filter((one) => one.store !== root.store);
		expanded = new Set([...expanded].filter(kept));
		loaded = new Set([...loaded].filter(kept));
		opening = new Set([...opening].filter(kept));
		trouble = 'idle';

		/* Closing is a decision about this folder and not about the browser, so it
		 * is forgotten as well as put away — otherwise the next visit would open on
		 * the folder somebody just closed. */
		if (root.handle) void persist();
		return true;
	},
};
