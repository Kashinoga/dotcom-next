/*
 * THE WORKSPACE'S BACKING STORE — what a folder of documents is, and what can be
 * done to one.
 *
 * A row in the rail is a NAME AND A PATH, and this is the thing that knows what
 * a path means. Nothing above here touches a file handle: the map from path to
 * handle is private to the local store, in the same way a URL and a token will
 * be private to a drive on a server. The editor asks for a listing and a body;
 * the store answers, and where it cannot it says so.
 *
 * THE SEAM IS THE POINT, and it is why this is a file of its own before there is
 * a second implementation to justify one. The first site's editor grew up against
 * one backing store and had it in its hands — every verb called a
 * `FileSystemFileHandle` method directly, and the row it called through carried
 * the handle as a field. That is a fine shape for one store and an impossible one
 * for two, because a document on a server has no handle to carry and never will.
 * The seam was cut there afterwards, at some cost; it is cut here first.
 *
 * EVERY METHOD ANSWERS RATHER THAN THROWING — a null, a false, or a reason. That
 * is not politeness: over a network every one of these can fail for reasons that
 * are nobody's mistake, and an exception thrown out of a click handler is a
 * failure the visitor never sees.
 */

/** A document in the tree. Its name, where it sits, and deliberately nothing else. */
export type FolderEntry = {
	name: string;
	path: string;
	/*
	 * Can this editor open it? False for everything that is not text.
	 *
	 * They are LISTED, and that is the point: a workspace that silently dropped
	 * them shows a folder of eleven things as a folder of three, and leaves the
	 * reader wondering whether the walk missed them or they were never there. A
	 * row that is present and plainly inert answers that; an absent row cannot.
	 *
	 * Absent means yes, so the common case says nothing.
	 */
	openable?: boolean;
};

/** What a walk found: the documents, and every folder it went into. */
export type Listing = { files: FolderEntry[]; dirs: string[] };

/*
 * WHY A WRITE DID NOT HAPPEN.
 *
 * A write is the one verb whose failure leaves NOTHING on screen to notice. A
 * rename that was refused shows the old name, a delete that was refused leaves
 * the row where it was, a move that was refused leaves it in its folder — but a
 * save that was refused looks exactly like a save that worked, because the words
 * are still on the sheet either way. So this one answers with a reason and the
 * others answer with a yes or a no.
 *
 * The reasons are what a row can usefully SAY, not a translation of a platform's
 * error list. `conflict` cannot happen yet and is named anyway: it means the
 * document changed underneath and nothing was overwritten, which is good news
 * wearing the shape of bad news, and it is the one nobody would guess.
 */
export type WriteError = 'conflict' | 'offline' | 'denied' | 'gone' | 'failed';

/** A write's answer. Only `{ ok: true }` means the words are safe. */
export type WriteResult = { ok: true } | { ok: false; why: WriteError };

export const WROTE: WriteResult = { ok: true };
export const notWritten = (why: WriteError): WriteResult => ({
	ok: false,
	why,
});

/*
 * What the File System Access API throws, said in the words above. Its exceptions
 * are DOMExceptions whose `name` is the whole of the information — the message is
 * for a console, not for a row.
 */
export function whyLocal(error: unknown): WriteError {
	const name = error instanceof DOMException ? error.name : '';
	if (name === 'NotAllowedError' || name === 'SecurityError') return 'denied';
	if (name === 'NotFoundError') return 'gone';
	return 'failed';
}

/** What a workspace can do. Grows one verb at a time, as a gesture needs one. */
export type Store = {
	/** Which kind, for the messages that have to name it. */
	kind: 'local' | 'snapshot' | 'dav';
	/** The folder's own name — the head of the tree. */
	name: string;
	/** Can anything in here be written? False for a snapshot, always. */
	writable: boolean;
	/*
	 * Read the tree.
	 *
	 * NULL means it could not be read AT ALL — the folder moved, was deleted, or
	 * the grant went away between the check and the call — and that is a different
	 * answer from an empty listing. A partial read answers with what it got: some
	 * of a workspace is worth showing, and the rows that are there are all true.
	 */
	list(): Promise<Listing | null>;
	/*
	 * ONE FOLDER'S OWN CHILDREN — present only on a store where reading the whole
	 * tree at once is not free. Its presence is what tells the rail the tree is
	 * PARTIAL: a store without it has already said everything it knows in `list`,
	 * and a store with it has said only the top.
	 *
	 * A flag would have done, and this is better: a flag and a method could
	 * disagree, and a store that claimed to be lazy without a way to fetch would
	 * draw a tree nobody could open.
	 */
	listDir?(path: string): Promise<Listing | null>;
	/** A document's words, or null if they cannot be got at. */
	read(path: string): Promise<string | null>;
	/** Write a document back — and say why not, where it did not. See `WriteError`. */
	write(path: string, body: string): Promise<WriteResult>;
	/*
	 * Make a NEW document under `dir` ('' is the root), named `base` + `ext` or the
	 * first free variant of it. Answers with the entry it made, or null.
	 */
	create(
		dir: string,
		base: string,
		ext: string,
		body: string,
	): Promise<FolderEntry | null>;
	/** Rename in place. `to` is a NAME, not a path. Answers with the entry at its new path. */
	rename(path: string, to: string): Promise<FolderEntry | null>;
	/** Move to another folder in the same tree. Refused if the name is taken there. */
	move(path: string, dir: string): Promise<FolderEntry | null>;
	remove(path: string): Promise<boolean>;
	/*
	 * Make a FOLDER under `dir`. A separate verb from `create` rather than a flag on
	 * it, because the two answer different questions: a document is a thing you make
	 * and its name is incidental, so `create` finds a free one; a folder is named on
	 * purpose, and asking for `Notes` and silently getting `Notes 2` is not the same
	 * favour.
	 */
	createDir(dir: string, name: string): Promise<string | null>;
	/*
	 * Delete a FOLDER AND EVERYTHING UNDER IT. Separate from `remove` because it
	 * asks a different question of the visitor: it is the most destructive thing
	 * this app can do and it is recursive. The caller confirms by NAME.
	 */
	removeDir(path: string): Promise<boolean>;
};

/*
 * A TREE, FROM A FLAT LIST OF PATHS. The stores answer with paths because a path
 * is the thing a store can promise; the shape of a tree is the rail's business,
 * and this is where a list of them becomes one.
 *
 * FOLDERS FIRST AND THEN DOCUMENTS, each alphabetically. A folder is a place and
 * a document is a thing in it, so a reader scanning a column is looking for one
 * or the other and never for both at once.
 *
 * Depth is carried rather than nested, and that is what lets the rail stay a flat
 * <ol>: a nested list would need a component that calls itself, and the only
 * thing depth is used for is how far a row is indented.
 */
export type Row =
	| { kind: 'dir'; name: string; path: string; depth: number }
	| {
			kind: 'file';
			name: string;
			path: string;
			depth: number;
			openable: boolean;
	  };

export function toRows(listing: Listing, closed: ReadonlySet<string>): Row[] {
	/* Every folder that holds anything, including the ones only named by a
	 * document's path — a store lists the folders it walked, and a folder that
	 * came back empty is not one the rail has anything to put in. */
	const folders = new Set(listing.dirs);
	for (const file of listing.files) {
		let dir = dirOf(file.path);
		while (dir) {
			folders.add(dir);
			dir = dirOf(dir);
		}
	}

	/* A folder inside a closed folder is not drawn at all, however it was closed —
	 * so the test is against every ancestor and not just the parent. */
	const shut = (path: string) => {
		let dir = dirOf(path);
		while (dir) {
			if (closed.has(dir)) return true;
			dir = dirOf(dir);
		}
		return false;
	};

	const depthOf = (path: string) => path.split('/').length - 1;
	const nameOf = (path: string) => path.slice(path.lastIndexOf('/') + 1);

	const byName = (a: { name: string }, b: { name: string }) =>
		a.name.localeCompare(b.name, undefined, {
			numeric: true,
			sensitivity: 'base',
		});

	/* Children of one folder, folders first — the recursion is over the tree and
	 * not over the list, so a folder's rows always follow it immediately. */
	const under = (dir: string): Row[] => {
		const out: Row[] = [];

		const childDirs = [...folders]
			.filter((path) => dirOf(path) === dir)
			.map((path) => ({
				kind: 'dir' as const,
				name: nameOf(path),
				path,
				depth: depthOf(path),
			}))
			.sort(byName);

		for (const folder of childDirs) {
			out.push(folder);
			if (!closed.has(folder.path)) out.push(...under(folder.path));
		}

		const childFiles = listing.files
			.filter((file) => dirOf(file.path) === dir)
			.map((file) => ({
				kind: 'file' as const,
				name: file.name,
				path: file.path,
				depth: depthOf(file.path),
				openable: file.openable !== false,
			}))
			.sort(byName);

		out.push(...childFiles);
		return out;
	};

	return under('').filter((row) => !shut(row.path));
}

/** The directory part of a path — '' for a document at the root. */
export const dirOf = (path: string) =>
	path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';

/** A path, from a directory and a name. The root takes no leading slash. */
export const join = (dir: string, name: string) =>
	dir ? `${dir}/${name}` : name;

/*
 * WHAT THIS EDITOR WILL NOT OPEN. Everything else it will, which is the way round
 * that costs nothing to be wrong about: a text sheet showing a file that turns
 * out to be some format nobody named is a shrug, and a folder listing four
 * hundred photographs as documents is not.
 */
const BINARY =
	/\.(png|jpe?g|gif|webp|avif|bmp|ico|tiff?|heic|psd|pdf|zip|gz|tgz|tar|bz2|xz|7z|rar|dmg|iso|img|exe|dll|so|dylib|wasm|bin|dat|db|sqlite\d?|mp[34]|m4[av]|aac|wav|flac|ogg|opus|mov|avi|mkv|webm|woff2?|ttf|otf|eot|glb|gltf|ds_store)$/i;

/*
 * A PREDICATE AND NOT A PATTERN, because "everything except" is not a thing a
 * readable regular expression says, and because a store only ever wants the
 * answer. It is passed in rather than reached for, so a store can be tested
 * against a folder of anything.
 */
export type Openable = (name: string) => boolean;

export const isOpenable: Openable = (name) => !BINARY.test(name);

/* Folders not worth walking into. A workspace is for documents, not a dependency tree. */
const SKIP_DIR =
	/^(node_modules|\.git|\.svn|\.hg|\.cache|dist|build|\.next|\.svelte-kit)$/;

/*
 * HOW MUCH OF A FOLDER IS WORTH WALKING. A folder can be arbitrarily deep and
 * arbitrarily large, and a workspace that walked all of one would hang on a home
 * directory. These cover any notes folder anybody actually keeps.
 */
const MAX_FILES = 500;
const MAX_DEPTH = 6;

/*
 * How many UNOPENABLE files a walk lists before it stops bothering, on a budget of
 * its own and well under MAX_FILES. A folder holding several hundred photographs
 * would otherwise spend the whole document allowance on pictures nobody can open
 * in a text editor — turning the rule that makes a folder look like itself into
 * one that hides the notes.
 */
const MAX_INERT = 80;

/* Is a name machinery rather than a document? The same judgement for a file and a
 * folder: listing `.DS_Store` greyed out answers a question nobody asked. */
const hidden = (name: string) => name.startsWith('.');

// ── A folder on the disk ─────────────────────────────────────────────────────

/** The local store, plus the two things only a handle-backed folder has. */
export type LocalStore = Store & {
	kind: 'local';
	/** The handle itself — what would be kept so the folder comes back next visit. */
	root: FileSystemDirectoryHandle;
	permission(): Promise<PermissionState | undefined>;
	requestPermission(): Promise<PermissionState | undefined>;
};

/*
 * A REAL FOLDER, through the File System Access API. Chromium only today, and the
 * only one of the two that could ever be written to.
 *
 * The map is the whole reason this is a closure rather than a bag of functions. A
 * row is a path, and reading one needs the actual handle behind it; collecting
 * them on the way down the walk is the only place they all pass through, and the
 * alternative is re-walking from the root on every open.
 */
export function localStore(
	root: FileSystemDirectoryHandle,
	openable: Openable = isOpenable,
): LocalStore {
	const files = new Map<string, FileSystemFileHandle>();
	/* Folders as well as documents, because every write verb needs the handle of
	 * the folder it acts in — and the walk is the only place they all pass through.
	 * The alternative is re-walking from the root on every drop. */
	const dirs = new Map<string, FileSystemDirectoryHandle>();

	/* How many inert rows have been listed — see MAX_INERT. */
	let inert = 0;

	async function walk(
		dir: FileSystemDirectoryHandle,
		prefix: string,
		out: FolderEntry[],
	) {
		dirs.set(prefix, dir);
		if (out.length > MAX_FILES || prefix.split('/').length > MAX_DEPTH) return;

		for await (const [name, entry] of dir.entries()) {
			const path = join(prefix, name);

			if (entry.kind === 'directory') {
				if (!SKIP_DIR.test(name) && !hidden(name)) {
					await walk(entry as FileSystemDirectoryHandle, path, out);
				}
				continue;
			}

			if (hidden(name)) continue;

			if (openable(name)) {
				files.set(path, entry as FileSystemFileHandle);
				out.push({ name, path });
				continue;
			}

			/* No handle is kept: the row cannot be opened, so nothing above needs a
			 * way to read it. */
			if (inert >= MAX_INERT) continue;
			inert += 1;
			out.push({ name, path, openable: false });
		}
	}

	/*
	 * `Untitled.md`, or the first numbered variant that is free.
	 * `getFileHandle(create: true)` hands back an EXISTING file of that name rather
	 * than failing, so making a second note over a first one would be silent — the
	 * same trap `move` sets, answered the same way.
	 */
	async function freeName(
		dir: FileSystemDirectoryHandle,
		base: string,
		ext: string,
	) {
		for (let n = 1; n < 100; n += 1) {
			const name = n === 1 ? `${base}${ext}` : `${base} ${n}${ext}`;
			try {
				await dir.getFileHandle(name);
			} catch {
				return name;
			}
		}
		/* A hundred `Untitled` files in one folder is not a case worth a cleverer
		 * answer than giving up. */
		return `${base} 100${ext}`;
	}

	async function put(
		handle: FileSystemFileHandle,
		body: string,
	): Promise<WriteResult> {
		try {
			const writable = await handle.createWritable();
			await writable.write(body);
			await writable.close();
			return WROTE;
		} catch (error) {
			/* Permission withdrawn, or the file went away. Which of those it was is
			 * worth carrying: one is fixed by handing the folder over again and the
			 * other is not fixable at all. */
			return notWritten(whyLocal(error));
		}
	}

	return {
		kind: 'local',
		name: root.name,
		writable: true,
		root,

		async list() {
			files.clear();
			dirs.clear();
			inert = 0;

			const out: FolderEntry[] = [];

			try {
				await walk(root, '', out);
			} catch {
				/*
				 * A folder that went away mid-walk answers with what it got. NULL is for
				 * a walk that got nothing at all AND never got past the root, which is
				 * the case that means the workspace is gone rather than short.
				 */
				if (!out.length && dirs.size <= 1) return null;
			}

			out.sort((a, b) => a.path.localeCompare(b.path));
			return { files: out, dirs: [...dirs.keys()].filter(Boolean).sort() };
		},

		async read(path) {
			const handle = files.get(path);
			if (!handle) return null;
			try {
				return await (await handle.getFile()).text();
			} catch {
				return null;
			}
		},

		async write(path, body) {
			const handle = files.get(path);
			/* No handle at that path is the tree disagreeing with the disk, which is
			 * what happens when something is moved or deleted by another program while
			 * this is open. */
			return handle ? put(handle, body) : notWritten('gone');
		},

		async create(dir, base, ext, body) {
			const into = dirs.get(dir);
			if (!into) return null;

			const name = await freeName(into, base, ext);
			let handle: FileSystemFileHandle;
			try {
				handle = await into.getFileHandle(name, { create: true });
			} catch {
				return null;
			}
			if (!(await put(handle, body)).ok) return null;

			const path = join(dir, name);
			files.set(path, handle);
			return { name, path };
		},

		async rename(path, to) {
			const handle = files.get(path);
			/* A name is a NAME and not a path. A rename that could write into another
			 * folder is a move, and this is the last place that difference can still be
			 * enforced. */
			if (!handle || !to || /[/\\]/.test(to)) return null;

			try {
				await handle.move(to);
			} catch {
				return null;
			}

			const moved = { name: to, path: join(dirOf(path), to) };
			files.delete(path);
			files.set(moved.path, handle);
			return moved;
		},

		async move(path, dir) {
			const handle = files.get(path);
			const into = dirs.get(dir);
			const name = path.slice(path.lastIndexOf('/') + 1);
			if (!handle || !into || dirOf(path) === dir) return null;

			/* A name already taken at the destination. `move` OVERWRITES without a
			 * word — the platform will not warn you that the README you dropped has
			 * just replaced the README that was there — so this is the one place the
			 * store checks BEFORE acting. */
			try {
				await into.getFileHandle(name);
				return null;
			} catch {
				/* nothing there by that name, which is what we wanted */
			}

			try {
				await handle.move(into, name);
			} catch {
				return null;
			}

			const moved = { name, path: join(dir, name) };
			files.delete(path);
			files.set(moved.path, handle);
			return moved;
		},

		async remove(path) {
			const into = dirs.get(dirOf(path));
			const name = path.slice(path.lastIndexOf('/') + 1);
			if (!into || !files.has(path)) return false;

			try {
				await into.removeEntry(name);
			} catch {
				return false;
			}
			files.delete(path);
			return true;
		},

		async createDir(dir, name) {
			const into = dirs.get(dir);
			/* Named on purpose, so a name that is taken is refused rather than quietly
			 * numbered — see the note on the verb. */
			if (!into || !name || /[/\\]/.test(name)) return null;

			try {
				await into.getDirectoryHandle(name);
				return null;
			} catch {
				/* nothing there by that name */
			}

			try {
				const made = await into.getDirectoryHandle(name, { create: true });
				const path = join(dir, name);
				dirs.set(path, made);
				return path;
			} catch {
				return null;
			}
		},

		async removeDir(path) {
			const into = dirs.get(dirOf(path));
			const name = path.slice(path.lastIndexOf('/') + 1);
			if (!into || !dirs.has(path)) return false;

			try {
				await into.removeEntry(name, { recursive: true });
			} catch {
				return false;
			}

			/* Everything under it goes from the maps too, or the tree keeps rows for
			 * documents that are not there any more. */
			for (const key of [...files.keys()]) {
				if (key === path || key.startsWith(`${path}/`)) files.delete(key);
			}
			for (const key of [...dirs.keys()]) {
				if (key === path || key.startsWith(`${path}/`)) dirs.delete(key);
			}
			return true;
		},

		permission: () =>
			Promise.resolve(root.queryPermission?.({ mode: 'readwrite' })),
		requestPermission: () =>
			Promise.resolve(root.requestPermission?.({ mode: 'readwrite' })),
	};
}

// ── A folder handed over once ────────────────────────────────────────────────

/*
 * THE `<input webkitdirectory>` FALLBACK. Every browser, read-only, and gone at
 * the end of the session — these are `File` objects with nothing behind them, so
 * there is no folder to go back to and nothing to write through.
 *
 * It is not a lesser version of the one above so much as a different bargain: a
 * snapshot of a folder as it was at the moment it was handed over. That is worth
 * having on a browser that cannot offer the other, and worth saying out loud
 * rather than letting somebody find out by trying to save.
 */
export function snapshotStore(
	picked: File[],
	openable: Openable = isOpenable,
): Store {
	const files = new Map<string, File>();
	const out: FolderEntry[] = [];
	const dirs: string[] = [];

	/*
	 * The folder's own name is the first segment of every entry's relative path,
	 * and it is only ever the first — so it comes OFF the paths as well as out of
	 * them. Left on, the tree would have one root node holding everything,
	 * indenting every document by a level to repeat what the heading already says.
	 */
	const root = picked[0]?.webkitRelativePath?.split('/')[0] ?? '';

	let inert = 0;
	for (const file of picked) {
		if (hidden(file.name)) continue;

		const full = file.webkitRelativePath || file.name;
		const path =
			root && full.startsWith(`${root}/`) ? full.slice(root.length + 1) : full;

		const dir = dirOf(path);
		if (dir && !dirs.includes(dir)) dirs.push(dir);

		if (!openable(file.name)) {
			if (inert >= MAX_INERT) continue;
			inert += 1;
			out.push({ name: file.name, path, openable: false });
			continue;
		}

		files.set(path, file);
		out.push({ name: file.name, path });
	}

	out.sort((a, b) => a.path.localeCompare(b.path));

	return {
		kind: 'snapshot',
		name: root,
		writable: false,
		list: async () => ({ files: out, dirs: dirs.sort() }),

		async read(path) {
			const file = files.get(path);
			if (!file) return null;
			try {
				return await file.text();
			} catch {
				return null;
			}
		},

		/*
		 * NOTHING HERE CAN BE WRITTEN, and the type is what says so. `writable` is
		 * false above, so a caller that reads it never gets this far — and a caller
		 * that does not is refused rather than quietly ignored.
		 *
		 * `denied` and not `failed`: nothing went wrong, and the sheet should say
		 * "this folder cannot be written to" rather than "that did not work", which
		 * invites somebody to try again.
		 */
		write: async () => notWritten('denied'),
		create: async () => null,
		rename: async () => null,
		move: async () => null,
		remove: async () => false,
		createDir: async () => null,
		removeDir: async () => false,
	};
}
