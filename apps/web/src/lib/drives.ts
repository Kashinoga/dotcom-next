/*
 * DRIVES — the servers this editor knows about, and where their passwords are
 * kept.
 *
 * A drive is the small amount somebody has to say once: which server, whose
 * files, which way the requests go, and which folder in it is the workspace. It
 * outlives a session and it outlives the workspace it opens, so it lives here
 * rather than inside a store, and a store is BUILT from one.
 *
 * ── About keeping the password ──────────────────────────────────────────────
 *
 * Encrypting a credential against script running in the same origin is theatre if
 * the key is also in the origin: whatever can read the ciphertext can read the
 * key, or can skip both and call this module's own `open`. There is no secret a
 * page can keep from script inside that page, and any design that claims
 * otherwise is selling something.
 *
 * What IS worth doing, and what this does:
 *
 *   · A NON-EXTRACTABLE CryptoKey. Generated with `extractable: false` and kept
 *     in IndexedDB as a CryptoKey rather than as bytes. Script in this origin can
 *     USE it and cannot export it, and that is enforced by the browser and not by
 *     us. It turns "steal the password and keep it" into "abuse it while this tab
 *     is open" — the only reduction actually available, and a real one.
 *   · An APP PASSWORD, never an account password. Nextcloud's are per-device and
 *     revocable, and that list is the control the visitor genuinely has. It is
 *     the mitigation; everything here is a supporting act.
 *   · NOT KEEPING IT AT ALL, as something somebody can choose. A drive with
 *     `keep: false` holds its token in memory for the session and writes nothing.
 *
 * THE WORD "ENCRYPTED" MUST NOT APPEAR IN ANYTHING THE VISITOR READS. It promises
 * safety against an attacker this design does not stop.
 *
 * The thing worth more than all of the above is a Content-Security-Policy on this
 * site, which it does not have. That is a site-wide job, and it is noted here
 * because this is the file that makes it matter.
 */

import type { DavConfig } from '$lib/dav';

/** What is remembered about a drive. Everything except the token, sealed separately. */
export type Drive = {
	/** Stable, derived from the server and the user — see `driveId`. */
	id: string;
	/** What the head of its tree says. The folder's name, or the host if there is none. */
	name: string;
	/** Origin only: `https://cloud.example.com`. */
	base: string;
	user: string;
	via: 'direct' | 'proxy';
	/** The folder inside the user's files that is the workspace. '' is the drive. */
	root: string;
	/** Is its token written down, or does it live for this session only? */
	keep: boolean;
};

/*
 * A server is a URL somebody typed, so it arrives with a trailing slash, a path, a
 * bare hostname, or all three. It is reduced to an ORIGIN here and nowhere else:
 * two drives that differ only in how the address was typed are one drive.
 */
export function toOrigin(typed: string): string | null {
	const trimmed = typed.trim();
	if (!trimmed) return null;

	/* A bare hostname is the common way to type one, and https is the only scheme
	 * this app will use — see the relay's rules. */
	const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
		? trimmed
		: `https://${trimmed}`;

	try {
		const url = new URL(withScheme);
		if (url.protocol !== 'https:') return null;
		return url.origin;
	} catch {
		return null;
	}
}

/** A folder path somebody typed, reduced to the form every other path here takes. */
export const toRoot = (typed: string) =>
	typed
		.trim()
		.replace(/^\/+|\/+$/g, '')
		.replace(/\/{2,}/g, '/');

/*
 * ONE DRIVE PER SERVER AND USER. Derived rather than random, so connecting to the
 * same place twice replaces the first rather than making a second row that looks
 * identical and holds a different password.
 */
export const driveId = (base: string, user: string) => `${base}|${user}`;

// ── Where they are kept ──────────────────────────────────────────────────────

const DB = 'text-editor';
const DB_VERSION = 2;
const DRIVES = 'drives';
const VAULT = 'vault';

let opening: Promise<IDBDatabase | null> | null = null;

/*
 * ONE DATABASE, SHARED WITH THE REMEMBERED FOLDER. $lib/remembered.ts opens the
 * same name at version 1 and this one opens it at 2, which is exactly the trap
 * IndexedDB sets: only one version may be current, and an `open` at a LOWER
 * version than the database has fails outright.
 *
 * So the upgrade here creates every store, including the one version 1 made, and
 * $lib/remembered.ts asks for no version at all — an open with no version takes
 * whatever is current. Adding a store means bumping this number and adding it to
 * the block below, and nowhere else.
 */
function open(): Promise<IDBDatabase | null> {
	if (opening) return opening;

	opening = new Promise((resolve) => {
		if (typeof indexedDB === 'undefined') return resolve(null);

		let request: IDBOpenDBRequest;
		try {
			request = indexedDB.open(DB, DB_VERSION);
		} catch {
			return resolve(null);
		}

		request.onupgradeneeded = () => {
			const db = request.result;
			for (const name of ['folder', DRIVES, VAULT]) {
				if (!db.objectStoreNames.contains(name)) db.createObjectStore(name);
			}
		};
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => resolve(null);
		request.onblocked = () => resolve(null);
	});

	return opening;
}

function transact(
	name: string,
	mode: IDBTransactionMode,
): Promise<IDBObjectStore | null> {
	return open().then((db) => {
		if (!db) return null;
		try {
			return db.transaction(name, mode).objectStore(name);
		} catch {
			return null;
		}
	});
}

const ask = <T>(request: IDBRequest<T>): Promise<T | null> =>
	new Promise((resolve) => {
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => resolve(null);
	});

// ── The sealed token ─────────────────────────────────────────────────────────

/*
 * ONE KEY FOR THIS BROWSER, made once and never exported. `extractable: false` is
 * the whole of what this buys — see the note at the top of the file for what it
 * does and does not protect against.
 */
async function vaultKey(): Promise<CryptoKey | null> {
	if (typeof crypto === 'undefined' || !crypto.subtle) return null;

	const store = await transact(VAULT, 'readonly');
	const existing = store ? await ask<unknown>(store.get('key')) : null;
	if (existing instanceof CryptoKey) return existing;

	let key: CryptoKey;
	try {
		key = await crypto.subtle.generateKey(
			{ name: 'AES-GCM', length: 256 },
			false,
			['encrypt', 'decrypt'],
		);
	} catch {
		return null;
	}

	const write = await transact(VAULT, 'readwrite');
	if (write) await ask(write.put(key, 'key'));
	return key;
}

/* `Uint8Array<ArrayBuffer>` and not a bare `Uint8Array`: the default is over
 * `ArrayBufferLike`, which includes `SharedArrayBuffer`, and `crypto.subtle` will
 * not take one of those. */
type Sealed = { iv: Uint8Array<ArrayBuffer>; body: ArrayBuffer };

/** Seal a token for this browser. Null if this browser cannot. */
async function seal(token: string): Promise<Sealed | null> {
	const key = await vaultKey();
	if (!key) return null;

	/* A fresh IV per token. Reusing one with AES-GCM is the failure mode that
	 * actually matters, and there is no reason to hold one. */
	const iv = crypto.getRandomValues(new Uint8Array(12));
	try {
		const body = await crypto.subtle.encrypt(
			{ name: 'AES-GCM', iv },
			key,
			new TextEncoder().encode(token),
		);
		return { iv, body };
	} catch {
		return null;
	}
}

async function unseal(sealed: Sealed): Promise<string | null> {
	const key = await vaultKey();
	if (!key) return null;

	try {
		const plain = await crypto.subtle.decrypt(
			{ name: 'AES-GCM', iv: sealed.iv },
			key,
			sealed.body,
		);
		return new TextDecoder().decode(plain);
	} catch {
		/* A different browser profile, a cleared key, or a tampered row. All the
		 * same answer: this token cannot be read and the drive has to be connected
		 * again. */
		return null;
	}
}

/*
 * THE TOKENS THAT ARE NOT WRITTEN DOWN. A drive with `keep: false` lives here for
 * as long as the tab does and nowhere else, which is a real option somebody may
 * want and costs one map to offer.
 */
const session = new Map<string, string>();

// ── The list ─────────────────────────────────────────────────────────────────

/** Every drive this browser knows, oldest first. */
export async function drives(): Promise<Drive[]> {
	const store = await transact(DRIVES, 'readonly');
	if (!store) return [];

	const all = await ask<unknown[]>(store.getAll());
	if (!Array.isArray(all)) return [];

	/* Anything at all could be under that key — an older shape of this, or
	 * something typed into devtools. A drive is recognised by having the fields a
	 * drive has. */
	return all.filter(
		(row): row is Drive =>
			!!row &&
			typeof row === 'object' &&
			typeof (row as Drive).id === 'string' &&
			typeof (row as Drive).base === 'string' &&
			typeof (row as Drive).user === 'string',
	);
}

/** Remember a drive, and its token if it is to be kept. */
export async function keepDrive(drive: Drive, token: string): Promise<void> {
	const store = await transact(DRIVES, 'readwrite');
	if (store) await ask(store.put(drive, drive.id));

	if (!drive.keep) {
		session.set(drive.id, token);
		return;
	}

	const sealed = await seal(token);
	const vault = await transact(VAULT, 'readwrite');
	if (sealed && vault) {
		await ask(vault.put(sealed, `token:${drive.id}`));
	} else {
		/* Could not be sealed, so it is not written. The drive still works for this
		 * session, and next visit asks again — which is the honest failure. */
		session.set(drive.id, token);
	}
}

/** A drive's token, from the session or from the vault. Null if it has to be asked for. */
export async function tokenFor(id: string): Promise<string | null> {
	const held = session.get(id);
	if (held) return held;

	const vault = await transact(VAULT, 'readonly');
	if (!vault) return null;

	const sealed = await ask<unknown>(vault.get(`token:${id}`));
	if (
		!sealed ||
		typeof sealed !== 'object' ||
		!(sealed as Sealed).body ||
		!(sealed as Sealed).iv
	) {
		return null;
	}
	return unseal(sealed as Sealed);
}

/** Forget a drive and its token. */
export async function dropDrive(id: string): Promise<void> {
	session.delete(id);

	const store = await transact(DRIVES, 'readwrite');
	if (store) await ask(store.delete(id));

	const vault = await transact(VAULT, 'readwrite');
	if (vault) await ask(vault.delete(`token:${id}`));
}

/** A drive and its token, as the store wants them. */
export const configFor = (drive: Drive, token: string): DavConfig => ({
	connection: drive.id,
	base: drive.base,
	user: drive.user,
	token,
	via: drive.via,
	root: drive.root,
	name: drive.name,
});
