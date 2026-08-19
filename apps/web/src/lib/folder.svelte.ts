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
	isOpenable,
	localStore,
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

/*
 * THE DRIVES THIS BROWSER KNOWS. Listed on the page so they can be opened again
 * without being described again — a drive is the small amount somebody says once,
 * and saying it twice is the thing this list exists to prevent.
 */
let known = $state<Drive[]>([]);

let store = $state<Store | null>(null);
let listing = $state<Listing>({ files: [], dirs: [] });

/*
 * WHICH FOLDERS ARE SHUT. Closed rather than open, so a folder that arrives in a
 * later listing is drawn open — a workspace that hid every folder until it was
 * clicked would open on a rail that looks empty.
 */
let closed = $state<Set<string>>(new Set());

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
	closed = new Set(read.dirs);
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
		return toRows(listing, closed);
	},

	/* How many documents there are, whatever is folded away. The rail asks this to
	 * tell an empty folder from a folded one. */
	get count() {
		return listing.files.length;
	},

	isClosed(path: string) {
		return closed.has(path);
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
		const next = new Set(closed);
		const opened = next.delete(path);
		if (!opened) next.add(path);
		closed = next;

		if (!opened || !store?.listDir || loaded.has(path)) return;

		opening = new Set(opening).add(path);
		const extra = await store.listDir(path);
		opening = new Set([...opening].filter((one) => one !== path));

		/* Closed again while it was in flight, or the whole folder put away. Either
		 * way this answer is about a tree nobody is looking at. */
		if (!store) return;

		if (!extra) {
			/* Left UNLOADED, so pressing again tries again. A folder that failed once
			 * over a network is not a folder that is empty. */
			return;
		}

		loaded = new Set(loaded).add(path);
		listing = merge(listing, extra, path);
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

	/* The drives, read once on arrival. No tokens are touched: a list is a list. */
	async loadDrives() {
		known = await listDrives();
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
		if (store || waiting) return;

		const handle = await recall();
		if (!handle) return;

		const next = localStore(handle, isOpenable);
		if ((await next.permission()) === 'granted') {
			await adopt(next);
			return;
		}

		waiting = handle;
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
		openText = await store.read(path);
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

	/* Put the folder away. The scratch notes are untouched: they were never in it. */
	close() {
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
		closed = new Set();
		loaded = new Set();
		opening = new Set();
		trouble = 'idle';
		openPath = null;
		openText = null;
	},
};
