/*
 * THE FOLDER THIS BROWSER SAW LAST, kept so a visit does not begin by asking for
 * it again.
 *
 * ONLY A HANDLE CAN BE KEPT, and that is the whole shape of this file. A
 * `FileSystemDirectoryHandle` is a structured-cloneable object, so IndexedDB will
 * store one and hand it back next visit still pointing at the same folder. A
 * snapshot cannot be: those are `File` objects handed over once, with no folder
 * behind them to go back to, so a browser without the picker gets no memory and
 * this module never hears from it.
 *
 * THE GRANT DOES NOT COME BACK WITH IT. The handle survives; permission to read
 * through it does not, and it has to be asked for again on a gesture — a browser
 * will refuse `requestPermission` that is not answering a click. So this hands
 * back a handle and a question, not a folder: see `permission` on the store, and
 * `resume` in $lib/folder.svelte.ts, which is called from a button and not from
 * an effect for exactly that reason.
 *
 * LOCALSTORAGE WOULD NOT DO. The scratch notes are strings and live there; a
 * handle is an object, and `JSON.stringify` of one is `{}` — which is the shape
 * of bug that looks like it worked.
 */

const DB = 'text-editor';
const STORE = 'folder';

/** One row, because there is one folder. A list of them is a different feature. */
const KEY = 'last';

/*
 * The open is shared. Two calls racing would each run `onupgradeneeded`, and only
 * one of them may own the version — the second blocks behind the first for as
 * long as the first holds the connection.
 */
let opening: Promise<IDBDatabase | null> | null = null;

function open(): Promise<IDBDatabase | null> {
	if (opening) return opening;

	opening = new Promise((resolve) => {
		/* A private window with storage refused, or a browser that has none. This is
		 * a convenience and its absence is not an error anybody needs told about. */
		if (typeof indexedDB === 'undefined') return resolve(null);

		let request: IDBOpenDBRequest;
		try {
			/*
			 * NO VERSION, ON PURPOSE. $lib/drives.ts opens this same database at a
			 * version and creates every store in it, including this one — and only
			 * ONE opener may own the version. An `open` at a version BELOW what the
			 * database already has fails outright, so two files each naming their own
			 * number is two files racing to be wrong.
			 *
			 * An open with no version takes whatever is current and never upgrades.
			 * The store may therefore not be there yet, which is what the guard below
			 * is for: no remembered folder is a state the rail already draws.
			 */
			request = indexedDB.open(DB);
		} catch {
			return resolve(null);
		}

		request.onsuccess = () => {
			const db = request.result;
			/* Nothing has created it yet — see the note above. */
			if (!db.objectStoreNames.contains(STORE)) return resolve(null);
			resolve(db);
		};
		request.onerror = () => resolve(null);
		/* Another tab holds an older version open. Answering null rather than waiting
		 * means this visit simply has no remembered folder, which is a state the rail
		 * already draws. */
		request.onblocked = () => resolve(null);
	});

	return opening;
}

function transact(mode: IDBTransactionMode): Promise<IDBObjectStore | null> {
	return open().then((db) => {
		if (!db) return null;
		try {
			return db.transaction(STORE, mode).objectStore(STORE);
		} catch {
			return null;
		}
	});
}

/** The folder this browser saw last, still pointing at it — or null. */
export async function recall(): Promise<FileSystemDirectoryHandle | null> {
	const store = await transact('readonly');
	if (!store) return null;

	return new Promise((resolve) => {
		const request = store.get(KEY);
		request.onsuccess = () => {
			const value: unknown = request.result;
			/*
			 * Anything at all could be under that key — an older shape of this, or
			 * something a person put there with devtools. A handle is recognised by
			 * being one, and not by having been written by us.
			 */
			resolve(
				typeof FileSystemDirectoryHandle !== 'undefined' &&
					value instanceof FileSystemDirectoryHandle
					? value
					: null,
			);
		};
		request.onerror = () => resolve(null);
	});
}

/** Keep this folder as the one to offer next visit. Silent if it cannot. */
export async function remember(
	handle: FileSystemDirectoryHandle,
): Promise<void> {
	const store = await transact('readwrite');
	if (!store) return;

	return new Promise((resolve) => {
		let request: IDBRequest;
		try {
			request = store.put(handle, KEY);
		} catch {
			/* A browser that will not clone a handle. Nothing is kept and nothing is
			 * said: the folder still works for this session. */
			return resolve();
		}
		request.onsuccess = () => resolve();
		request.onerror = () => resolve();
	});
}

/** Forget it — when it is closed, or when it turns out not to be there any more. */
export async function forget(): Promise<void> {
	const store = await transact('readwrite');
	if (!store) return;

	return new Promise((resolve) => {
		const request = store.delete(KEY);
		request.onsuccess = () => resolve();
		request.onerror = () => resolve();
	});
}
