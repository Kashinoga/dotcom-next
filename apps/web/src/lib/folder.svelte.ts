/*
 * THE FOLDER THAT IS OPEN, and how it got here.
 *
 * $lib/workspace.ts knows what a folder IS; this knows which one the visitor is
 * looking at, whether it has been read yet, and what to say when it cannot be.
 * The split is the same one $lib/scratch.svelte.ts keeps against the page: the
 * rules in a file with no runes in it, and the state that a rail redraws from in
 * a file that is nothing but runes.
 *
 * NOTHING IS REMEMBERED BETWEEN VISITS YET. A directory handle survives a reload
 * — it goes in IndexedDB and comes back with its permission to be re-asked for —
 * and a snapshot cannot, because there is no folder behind it to go back to. Two
 * different answers to one question is a thing to build on purpose rather than on
 * the way past, so for now a visit begins with no folder and the rail says so.
 */

import { davStore, probe, type DavConfig, type Probe } from '$lib/dav';
import {
	configFor,
	driveId,
	drives as listDrives,
	dropDrive,
	keepDrive,
	toOrigin,
	toRoot,
	tokenFor,
	type Drive,
} from '$lib/drives';
import { forget, recall, remember } from '$lib/remembered';
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
 * WHY THERE IS NO FOLDER. `idle` is the state a visit opens in and is not a
 * failure; the rest are, and each says a different thing to the rail.
 *
 * `denied` and `empty` are worth telling apart even though both leave the rail
 * with nothing in it. One is a folder that was refused and one is a folder that
 * was read and had nothing in it, and a reader who sees "nothing here" for the
 * second reason will go looking for a bug that is not there.
 */
export type Trouble = 'idle' | 'denied' | 'unreadable' | 'empty';

/*
 * A FOLDER FROM LAST TIME, WAITING TO BE LET BACK IN. The handle survives a
 * reload; the permission to read through it does not, and a browser will only
 * grant it again in answer to a click. So this is not a folder that is open — it
 * is a folder that could be, and the rail offers it by name.
 *
 * Its name is what makes the offer worth making. "Open the folder from last
 * time" is a question nobody can answer; "Notes" is one they can.
 */
let waiting = $state<FileSystemDirectoryHandle | null>(null);

/* Whether `look` has answered. Until it has, "no folder open" may not be true. */
let looked = $state(false);

/*
 * THE DRIVES THIS BROWSER KNOWS. Listed on the page so they can be opened again
 * without being described again — a drive is the small amount somebody says once,
 * and saying it twice is the thing this list exists to prevent.
 */
let known = $state<Drive[]>([]);
let drivesRead = $state(false);

let store = $state<Store | null>(null);
let listing = $state<Listing>({ files: [], dirs: [] });

/*
 * WHICH FOLDERS ARE OPEN. Open rather than shut, so a folder that arrives in a
 * later listing — a drive's, read when its parent opens, or one only named by a
 * document's path — is drawn shut like every other, as VS Code draws it.
 */
let expanded = $state<Set<string>>(new Set());

/*
 * WHICH FOLDERS HAVE BEEN READ. Only a LAZY store needs this — one that answered
 * everything in `list` has read them all by definition, and this stays empty.
 *
 * A folder that is being read is in `reading` too, so the row can say so: over a
 * network, opening a folder is a round trip and a rail that did nothing visible
 * for half a second would read as a press that did not land.
 */
let loaded = $state<Set<string>>(new Set());
let opening = $state<Set<string>>(new Set());
let trouble = $state<Trouble>('idle');
let reading = $state(false);

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

async function flush() {
	if (timer) {
		clearTimeout(timer);
		timer = null;
	}
	if (!store || !pending) return;

	const { path, body } = pending;
	pending = null;
	save = 'saving';

	const result = await store.write(path, body);

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

async function adopt(next: Store) {
	store = next;
	openPath = null;
	openText = null;
	fetching = false;
	reading = true;

	const read = await next.list();
	reading = false;

	if (!read) {
		listing = { files: [], dirs: [] };
		trouble = 'unreadable';
		return;
	}

	/*
	 * EVERY FOLDER OPENS SHUT, whichever kind of store it came from.
	 *
	 * It was open for an eager store and shut for a lazy one, on the argument that
	 * an eager store has already paid for its rows so hiding them hides work
	 * already done. That argument is about the STORE, and what a rail opens on is
	 * a question about the READER: a workspace of thirty folders unrolled is a
	 * column nobody can find anything in, and the cost of the rows was paid whether
	 * or not they are drawn.
	 *
	 * It also makes the two kinds behave the same, which they should: a folder on
	 * this device and a folder on a server are the same thing to somebody looking
	 * at a list of them.
	 */
	expanded = new Set();
	loaded = new Set(next.listDir ? [''] : []);
	opening = new Set();
	listing = read;
	trouble = read.files.length || read.dirs.length ? 'idle' : 'empty';
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
		dirs: [...dirs].filter(Boolean),
	};
}

/*
 * WHAT A NAME THAT WILL NOT DO IS TOLD. VS Code's own refusals, since the
 * editor takes vscode.dev as its reference: `taken` and `empty` are its words,
 * `slash` is ours, because VS Code makes the folders a slash names and the
 * stores here do not.
 */
export type Refusal =
	'empty' | 'slash' | 'taken' | 'into' | 'partial' | 'failed';

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
	const path = join(dir, name).toLowerCase();
	if (except?.toLowerCase() === path) return false;
	return (
		listing.files.some((file) => file.path.toLowerCase() === path) ||
		listing.dirs.some((one) => one.toLowerCase() === path)
	);
}

function refuse(name: string): Refusal | null {
	if (!name.trim()) return 'empty';
	if (/[/\\]/.test(name)) return 'slash';
	return null;
}

/* A folder and everything under it, or a document on its own. */
const within = (path: string, root: string) =>
	path === root || path.startsWith(`${root}/`);

/* A document as the rail lists it, at a path. */
function entryAt(path: string): FolderEntry {
	const name = path.slice(path.lastIndexOf('/') + 1);
	return isOpenable(name) ? { name, path } : { name, path, openable: false };
}

/*
 * EVERYTHING AT `from` IS AT `to` NOW — a document, or a folder and all it
 * holds — so the rail, the folds and the open document follow it there.
 */
function remap(from: string, to: string) {
	const swap = (path: string) =>
		within(path, from) ? to + path.slice(from.length) : path;
	listing = {
		files: listing.files.map((file) =>
			within(file.path, from) ? entryAt(swap(file.path)) : file,
		),
		dirs: listing.dirs.map(swap),
	};
	expanded = new Set([...expanded].map(swap));
	loaded = new Set([...loaded].map(swap));
	if (openPath !== null) openPath = swap(openPath);
}

/*
 * READ A FOLDER ON A LAZY STORE, the first time it is opened. Its folders
 * arrive shut, as every folder does — see `expanded`.
 */
async function load(path: string) {
	const from = store;
	if (!from?.listDir || loaded.has(path) || opening.has(path)) return;

	opening = new Set(opening).add(path);
	const extra = await from.listDir(path);
	opening = new Set([...opening].filter((one) => one !== path));

	/* The whole folder put away, or another taken, while that was in flight:
	 * this answer is about a tree nobody is looking at. */
	if (store !== from) return;

	/* Left UNLOADED, so opening it again tries again. A folder that failed once
	 * over a network is not a folder that is empty. */
	if (!extra) return;

	loaded = new Set(loaded).add(path);
	listing = merge(listing, extra, path);
}

const folderPaths = () => foldersOf(listing);

/* Open every folder above a path, so what was just made is in view. */
function reveal(path: string) {
	const next = new Set(expanded);
	for (let dir = dirOf(path); dir; dir = dirOf(dir)) next.add(dir);
	expanded = next;
}

export const folder = {
	get name() {
		return store?.name ?? null;
	},

	get kind() {
		return store?.kind ?? null;
	},

	get writable() {
		return store?.writable ?? false;
	},

	/* The rail's rows: folders and documents in one flat list, each carrying how
	 * far in it sits. See `toRows`. */
	get rows(): Row[] {
		return toRows(listing, expanded);
	},

	/* How many documents there are, whatever is folded away. The rail asks this to
	 * tell an empty folder from a folded one. */
	get count() {
		return listing.files.length;
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

	/* Every folder shut, as VS Code's Collapse Folders in Explorer shuts them. */
	collapseAll() {
		expanded = new Set();
	},

	/*
	 * EVERY FOLDER OPEN, down to what the walk would reach. A lazy store reads
	 * each level as it is opened, one round trip a folder, and a level at a time
	 * so the rail fills from the top.
	 */
	async expandAll() {
		const from = store;
		for (let depth = 0; depth < MAX_DEPTH && store === from; depth += 1) {
			const shut = [...folderPaths()].filter((path) => !expanded.has(path));
			if (!shut.length) return;
			expanded = new Set([...expanded, ...shut]);
			await Promise.all(shut.map(load));
		}
	},

	/* Whether any folder is open, for the heading to offer the one of the two
	 * that would do something. */
	get anyExpanded() {
		return [...expanded].some((path) => folderPaths().has(path));
	},

	get hasFolders() {
		return folderPaths().size > 0;
	},

	get trouble() {
		return trouble;
	},

	get reading() {
		return reading;
	},

	get openPath() {
		return openPath;
	},

	get openText() {
		return openText;
	},

	/*
	 * ASK FOR A FOLDER. Chromium hands over a handle that could be written through
	 * and remembered; everything else has the input below instead.
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
			const root = await ask.call(window, { mode: 'readwrite' });
			waiting = null;
			await adopt(localStore(root, isOpenable));
			/* Kept AFTER it read, so a folder that could not be walked is not offered
			 * back next visit. */
			if (trouble !== 'unreadable') await remember(root);
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
	 * CONNECT A DRIVE AND OPEN IT. The probe has already happened in the form, so
	 * what is left is to remember it and read it.
	 */
	async connect(drive: Drive, token: string) {
		await keepDrive(drive, token);
		known = await listDrives();
		waiting = null;
		await adopt(davStore(configFor(drive, token), isOpenable));
	},

	/*
	 * OPEN A DRIVE THAT IS ALREADY KNOWN. Its token comes from the vault, or from
	 * this session if it was never written down — and if there is none, the drive
	 * has to be connected again, which the rail says rather than failing quietly.
	 */
	async openDrive(id: string) {
		const drive = known.find((one) => one.id === id);
		if (!drive) return;

		const token = await tokenFor(id);
		if (!token) {
			trouble = 'denied';
			return;
		}

		waiting = null;
		await adopt(davStore(configFor(drive, token), isOpenable));
	},

	async dropDrive(id: string) {
		await dropDrive(id);
		known = await listDrives();
	},

	/*
	 * ASK WHETHER THERE IS ONE, without asking for it. Called from an effect on the
	 * page, and it must not do anything a browser would refuse outside a gesture —
	 * so it reads the handle and stops there.
	 *
	 * A handle whose grant HAS survived is opened straight away, because there is
	 * nothing to ask: `queryPermission` answering `granted` means a click would add
	 * nothing but a click. Anything else waits for one.
	 */
	async look() {
		try {
			if (store || waiting) return;

			const handle = await recall();
			if (!handle) return;

			const next = localStore(handle, isOpenable);
			if ((await next.permission()) === 'granted') {
				await adopt(next);
				return;
			}

			waiting = handle;
		} finally {
			looked = true;
		}
	},

	/*
	 * LET IT BACK IN. From a click, because `requestPermission` outside a gesture is
	 * refused by every browser that has it — which is the whole reason this is two
	 * steps and not one.
	 *
	 * A folder that is gone, or refused, is FORGOTTEN rather than offered again
	 * next visit: an offer that cannot be taken up is worse than none, and it would
	 * be made on every visit for ever.
	 */
	async resume() {
		const handle = waiting;
		if (!handle) return;

		const next = localStore(handle, isOpenable);
		const granted = await next.requestPermission();

		if (granted !== 'granted') {
			waiting = null;
			trouble = 'denied';
			await forget();
			return;
		}

		waiting = null;
		await adopt(next);

		/* The grant was given and the folder still would not read, so it is not
		 * there any more. */
		if (trouble === 'unreadable') await forget();
	},

	/* The `<input webkitdirectory>` path, handed the files it collected. */
	async take(picked: File[]) {
		if (!picked.length) return;
		await adopt(snapshotStore(picked, isOpenable));
	},

	/*
	 * PUT A DOCUMENT ON THE SHEET. A row that cannot be read leaves the path set
	 * and the words null, which is what the sheet needs to say so — the difference
	 * between "nothing is open" and "this would not open" is the whole of what a
	 * reader wants to know there.
	 */
	get save() {
		return save;
	},

	get saveWhy() {
		return saveWhy;
	},

	async open(path: string) {
		if (!store) return;

		/* Whatever was on the sheet goes out BEFORE the sheet changes. A debounce
		 * that is still counting when a row is clicked would otherwise write the old
		 * document's words after the new one has arrived. */
		await flush();

		openPath = path;
		openText = null;
		save = 'clean';
		saveWhy = null;
		fetching = true;
		const text = await store.read(path);

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
		if (!store || openPath === null || !store.writable) return;

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

	/* Every document listed, folded away or not: what Go to File searches. */
	get files() {
		return listing.files;
	},

	/* A file's bytes, for a picture in the proof. */
	picture(path: string) {
		return store ? store.picture(path) : Promise.resolve(null);
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
		if (!store?.writable) return { refusal: 'failed' };

		const dot = name.lastIndexOf('.');
		const made =
			dot > 0
				? await store.create(dir, name.slice(0, dot), name.slice(dot), '')
				: await store.create(dir, name, '', '');
		if (!made) return { refusal: 'failed' };

		const entry: FolderEntry = isOpenable(made.name)
			? made
			: { ...made, openable: false };
		listing = { files: [...listing.files, entry], dirs: listing.dirs };
		trouble = 'idle';
		reveal(made.path);
		return { path: made.path };
	},

	/* A NEW FOLDER, drawn shut as VS Code draws it, and known to be empty so a
	 * lazy store is not asked to read it. */
	async newFolder(dir: string, name: string): Promise<Made> {
		name = name.trim();
		const no = refuse(name) ?? (taken(dir, name) ? 'taken' : null);
		if (no) return { refusal: no };
		if (!store?.writable) return { refusal: 'failed' };

		const path = await store.createDir(dir, name);
		if (!path) return { refusal: 'failed' };

		listing = { files: listing.files, dirs: [...listing.dirs, path] };
		if (store.listDir) loaded = new Set(loaded).add(path);
		trouble = 'idle';
		reveal(path);
		return { path };
	},

	/* Folders can be renamed and moved only where the store does it in one step
	 * — see `renameDir` in $lib/workspace. The rail offers it only here. */
	get relocatesDirs() {
		return Boolean(store?.renameDir && store.moveDir);
	},

	/*
	 * A NEW NAME. The words on the sheet go out first, under the name they were
	 * typed under, if the open document is the one being renamed or is inside it.
	 */
	async rename(path: string, to: string): Promise<Made> {
		to = to.trim();
		const no = refuse(to) ?? (taken(dirOf(path), to, path) ? 'taken' : null);
		if (no) return { refusal: no };
		if (!store?.writable) return { refusal: 'failed' };
		if (to === path.slice(path.lastIndexOf('/') + 1)) return { path };

		const isDir = listing.dirs.includes(path);
		if (isDir && !store.renameDir) return { refusal: 'failed' };
		if (openPath !== null && within(openPath, path)) await flush();

		const moved = isDir
			? await store.renameDir!(path, to)
			: ((await store.rename(path, to))?.path ?? null);
		if (!moved) return { refusal: 'failed' };

		remap(path, moved);
		return { path: moved };
	},

	/*
	 * INTO ANOTHER FOLDER, from a drag or a cut and paste. A taken name is
	 * refused rather than replaced, and a folder is not put inside itself.
	 */
	/*
	 * A COPY, from a paste or a drag with Ctrl held. It keeps its name where that
	 * is free and takes a "copy" name where it is not — into its own folder, a
	 * duplicate. The words on the sheet go out first, so the copy is of what is
	 * on the screen. A folder copy that stopped part way is still listed, as far
	 * as it got.
	 */
	async copy(
		row: { kind: 'dir' | 'file'; path: string },
		dir: string,
	): Promise<Made> {
		if (!store?.writable) return { refusal: 'failed' };
		if (row.kind === 'dir' && within(dir, row.path)) {
			return { refusal: 'into' };
		}

		let name = row.path.slice(row.path.lastIndexOf('/') + 1);
		for (let tries = 0; taken(dir, name); tries += 1) {
			if (tries >= 100) return { refusal: 'failed' };
			name = copyName(name, row.kind === 'dir');
		}

		if (openPath !== null && within(openPath, row.path)) await flush();
		const copied = await store.copy(row.path, row.kind, dir, name);
		if (!copied) return { refusal: 'failed' };

		const known = new Set(listing.files.map((file) => file.path));
		listing = {
			files: [
				...listing.files,
				...copied.made.files.filter((file) => !known.has(file.path)),
			],
			dirs: [...new Set([...listing.dirs, ...copied.made.dirs])],
		};
		trouble = 'idle';

		/* Every folder a copy made lands shut, as every folder opens shut — see
		 * `adopt`. On a lazy store it is read when it is opened, like any other. */
		const top = join(dir, name);
		reveal(top);

		return copied.whole ? { path: top } : { refusal: 'partial' };
	},

	async move(path: string, dir: string): Promise<Made> {
		if (!store?.writable) return { refusal: 'failed' };
		if (dirOf(path) === dir) return { path };
		if (within(dir, path)) return { refusal: 'into' };
		if (taken(dir, path.slice(path.lastIndexOf('/') + 1))) {
			return { refusal: 'taken' };
		}

		const isDir = listing.dirs.includes(path);
		if (isDir && !store.moveDir) return { refusal: 'failed' };
		if (openPath !== null && within(openPath, path)) await flush();

		const moved = isDir
			? await store.moveDir!(path, dir)
			: ((await store.move(path, dir))?.path ?? null);
		if (!moved) return { refusal: 'failed' };

		remap(path, moved);
		reveal(moved);
		return { path: moved };
	},

	/*
	 * GONE FOR GOOD: there is no bin to put it in from a web page. The page asks
	 * first, in VS Code's words. A document open on the sheet goes with it, and
	 * so do its unsaved words, which have nowhere left to be written.
	 */
	async remove(row: { kind: 'dir' | 'file'; path: string }) {
		if (!store?.writable) return false;
		const gone =
			row.kind === 'dir'
				? await store.removeDir(row.path)
				: await store.remove(row.path);
		if (!gone) return false;

		const kept = (path: string) => !within(path, row.path);
		listing = {
			files: listing.files.filter((file) => kept(file.path)),
			dirs: listing.dirs.filter(kept),
		};
		expanded = new Set([...expanded].filter(kept));
		loaded = new Set([...loaded].filter(kept));
		if (!listing.files.length && !listing.dirs.length) trouble = 'empty';

		if (openPath !== null && !kept(openPath)) {
			if (timer) clearTimeout(timer);
			timer = null;
			pending = null;
			save = 'clean';
			saveWhy = null;
			openPath = null;
			openText = null;
		}
		return true;
	},

	/* Put the folder away. The scratch notes are untouched: they were never in it. */
	async close() {
		/*
		 * THE LAST WORDS GO OUT FIRST. They were dropped here, which lost anything
		 * typed in the 600ms before the press. A save that fails keeps the folder
		 * open, once, so the bar can say so; a second press closes it anyway,
		 * because by then losing them is a choice.
		 */
		const unsaved = pending !== null;
		await flush();
		if (unsaved && save === 'trouble') return;

		/* Closing is a decision about this folder and not about the browser, so it
		 * is forgotten as well as put away — otherwise the next visit would open on
		 * the folder somebody just closed. */
		void forget();
		waiting = null;
		if (timer) clearTimeout(timer);
		timer = null;
		pending = null;
		save = 'clean';
		saveWhy = null;
		store = null;
		listing = { files: [], dirs: [] };
		expanded = new Set();
		loaded = new Set();
		opening = new Set();
		trouble = 'idle';
		openPath = null;
		openText = null;
		fetching = false;
	},
};
