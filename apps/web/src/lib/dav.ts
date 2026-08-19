/*
 * NEXTCLOUD (and ownCloud) — a workspace that lives on a server.
 *
 * WHAT IS AND IS NOT GENERIC HERE, said because the answer is not what the word
 * DAV suggests. Almost everything below is RFC 4918 and would work against any
 * compliant server: the multistatus reader, PROPFIND at Depth 1, GET, PUT,
 * DELETE, MOVE with `Overwrite: F`, `If-Match` on an etag.
 *
 * What is NOT generic is WHERE THE FILES ARE — `/remote.php/dav/files/<user>`.
 * Nextcloud and ownCloud share that layout; nothing else does, and it is not a
 * field anybody can type. So this supports those two and says so, in the filename
 * and here.
 *
 * That is a decision rather than a gap. The path being FIXED is what lets
 * `/api/dav` keep a path allow-list, and that allow-list is the whole of what
 * makes the relayed mode a Nextcloud relay rather than a general HTTP relay with
 * this site's name on it. A configurable DAV root would buy a handful of other
 * servers at the cost of the one control that matters. If generic WebDAV is ever
 * wanted, the honest shape is DIRECT MODE ONLY, where nothing passes through this
 * site at all.
 *
 * IT IS A `Store` AND NOTHING ELSE. The editor cannot tell one of these from a
 * folder on the disk, because the seam it goes through was cut for exactly this.
 *
 * THE PARSER IS HAND-WRITTEN, and deliberately. `DOMParser` would do it in three
 * lines and exists in every browser this runs in — and in none of the places this
 * file has to be checkable. A multistatus is a very regular document and the
 * whole of what is read out of one is below.
 *
 * WHAT IS NOT HERE: a cache and an offline queue. A document is read when it is
 * opened and written when it is saved, exactly as a local one is — and where a
 * local read fails because the file was deleted, a remote one fails because a
 * train went into a tunnel.
 */

import {
	join,
	notWritten,
	WROTE,
	type FolderEntry,
	type Listing,
	type Openable,
	type Store,
	type WriteError,
	type WriteResult,
} from '$lib/workspace';

// ── Reading a multistatus ────────────────────────────────────────────────────
//
// PROPFIND answers 207 with a document whose useful parts are few. TWO THINGS
// ABOUT ITS SHAPE ARE TRAPS, and both are why this is parsed rather than grepped.
//
// The PREFIX is not fixed. `d:`, `D:`, and no prefix at all with `xmlns="DAV:"`
// on the root are all the same document, and different servers send different
// ones — Nextcloud has changed which between versions. Everything below matches
// on the LOCAL name and lets the prefix be anything or nothing.
//
// And a response carries SEVERAL propstat blocks, one per status. Properties that
// were not found come back in a 404 block, present and empty. Reading a property
// without first checking which block it came from gets you an empty etag from the
// 404 block for a file that has a perfectly good one in the 200 block above it.

/** A tag, at any prefix or none, self-closing or not. Capture 1 is the inner text. */
const tagRe = (local: string) =>
	new RegExp(
		`<(?:[A-Za-z0-9_.-]+:)?${local}(?:\\s[^>]*)?(?:/>|>([\\s\\S]*?)</(?:[A-Za-z0-9_.-]+:)?${local}\\s*>)`,
		'gi',
	);

/** Every occurrence of a tag's inner text, in order. Self-closing tags yield ''. */
function blocks(xml: string, local: string): string[] {
	const out: string[] = [];
	const re = tagRe(local);
	for (let m = re.exec(xml); m; m = re.exec(xml)) out.push(m[1] ?? '');
	return out;
}

/** The first occurrence's inner text, or null if the tag is not there at all. */
function first(xml: string, local: string): string | null {
	const m = tagRe(local).exec(xml);
	return m ? (m[1] ?? '') : null;
}

/** The five named entities XML defines, and numeric references. Nothing else is legal. */
export function decodeEntities(text: string): string {
	return text.replace(
		/&(#x?[0-9a-f]+|amp|lt|gt|quot|apos);/gi,
		(whole, body: string) => {
			const key = body.toLowerCase();
			if (key === 'amp') return '&';
			if (key === 'lt') return '<';
			if (key === 'gt') return '>';
			if (key === 'quot') return '"';
			if (key === 'apos') return "'";
			if (key.startsWith('#x')) {
				return String.fromCodePoint(Number.parseInt(key.slice(2), 16));
			}
			if (key.startsWith('#')) {
				return String.fromCodePoint(Number.parseInt(key.slice(1), 10));
			}
			return whole;
		},
	);
}

/*
 * A href, as the list of path segments it names — DECODED ONE SEGMENT AT A TIME,
 * which is the whole point of doing it this way. A file called `a/b` cannot
 * exist, but a file called `a%2Fb` can, and `decodeURIComponent` on the whole
 * path would turn that one name into two folders. An absolute href (some servers
 * send one) loses its scheme and host on the way in.
 */
export function hrefSegments(href: string): string[] {
	const path = decodeEntities(href.trim()).replace(
		/^[a-z][a-z0-9+.-]*:\/\/[^/]*/i,
		'',
	);
	return path
		.split('/')
		.filter(Boolean)
		.map((segment) => {
			try {
				return decodeURIComponent(segment);
			} catch {
				/* A href the server did not encode properly. Its own characters are
				 * better than throwing away the whole listing over one row. */
				return segment;
			}
		});
}

/** What a PROPFIND says about one thing. */
export type DavEntry = {
	/** Its path RELATIVE to the collection asked about. Never leading-slashed. */
	path: string;
	name: string;
	dir: boolean;
	etag?: string;
};

/*
 * Read a multistatus. `root` is the segment list of the collection that was asked
 * about — its own response is in the document (Depth: 1 always includes self) and
 * is dropped, because a folder is not a thing inside itself.
 *
 * Anything not underneath the root is dropped too, and that is not defensiveness
 * for its own sake: a href is the one field in this document the server controls
 * completely, and a listing that could name `../../someone-else` is a listing that
 * could put a path into the tree which every later verb would then act on.
 */
export function parseMultistatus(xml: string, root: string[]): DavEntry[] {
	const out: DavEntry[] = [];

	for (const response of blocks(xml, 'response')) {
		const href = first(response, 'href');
		if (href === null) continue;

		const segments = hrefSegments(href);
		if (segments.length <= root.length) continue;
		if (!root.every((segment, i) => segments[i] === segment)) continue;

		/* ONLY the properties that were actually found — see the note above. */
		let props = '';
		for (const propstat of blocks(response, 'propstat')) {
			const status = first(propstat, 'status') ?? '';
			if (!/\s2\d\d\s/.test(` ${status} `)) continue;
			props += first(propstat, 'prop') ?? '';
		}

		const rest = segments.slice(root.length);

		/* DECODED, like a href is. An etag is quoted, and a quote inside XML
		 * character data is very often sent as `&quot;` — so an etag read raw comes
		 * back wearing six characters of entity at each end and goes into an
		 * `If-Match` that can never match anything. */
		const raw = first(props, 'getetag');
		const etag = raw === null ? null : decodeEntities(raw).trim();

		out.push({
			path: rest.join('/'),
			name: rest[rest.length - 1],
			/* `<resourcetype><collection/></resourcetype>` is the only thing that
			 * makes it a folder. A file's resourcetype is present and empty, so its
			 * ABSENCE cannot be the test. */
			dir: /<(?:[A-Za-z0-9_.-]+:)?collection(?:\s[^>]*)?\/?>/i.test(props),
			/* Weak validators and quotes both come off: this is handed straight back
			 * to the server in `If-Match`, in the form it arrived. */
			...(etag
				? { etag: etag.replace(/^W\//i, '').replace(/^"|"$/g, '') }
				: {}),
		});
	}

	return out;
}

// ── Reaching the server ──────────────────────────────────────────────────────

export type DavConfig = {
	/** The id of the connection this came from — see $lib/drives. */
	connection: string;
	/** The origin: `https://cloud.example.com`, no trailing slash, no `/remote.php`. */
	base: string;
	/** Whose files. A path segment in the DAV URL, not only a login. */
	user: string;
	/** The app password. */
	token: string;
	/*
	 * WHICH WAY THE REQUEST GOES, and it is a CHOICE the visitor makes rather than
	 * something this works out.
	 *
	 * `direct` needs the server to send CORS headers for this origin, which on
	 * Nextcloud means an app installed by whoever runs it. `proxy` goes through
	 * this site's own `/api/dav`, which needs nothing of the server and everything
	 * of the visitor: the credential and the document both pass through a machine
	 * that is neither of theirs.
	 *
	 * THERE IS NO FALLBACK BETWEEN THEM, and there must never be one. A blocked
	 * preflight rejects `fetch` with a bare TypeError indistinguishable from a dead
	 * network, a bad certificate or a mistyped host — so "try direct, fall back to
	 * the relay" is not a detection, it is a guess, and what it would be guessing
	 * about is where somebody's password goes.
	 */
	via: 'direct' | 'proxy';
	/** A folder inside the user's files to use as the workspace. '' is the drive. */
	root: string;
	/** What the head of the tree says. */
	name: string;
};

/** This site's own relay. See the note on `via`. */
export const DAV_RELAY = '/api/dav';

const enc = encodeURIComponent;
const encPath = (path: string) =>
	path.split('/').filter(Boolean).map(enc).join('/');

/** Where the user's files begin, as a URL. */
export const filesUrl = (cfg: DavConfig) =>
	`${cfg.base.replace(/\/+$/, '')}/remote.php/dav/files/${enc(cfg.user)}`;

/** The absolute URL of a path in the workspace. Also what a MOVE's `Destination` is. */
export const target = (cfg: DavConfig, path = '') => {
	const under = join(cfg.root, path);
	return under ? `${filesUrl(cfg)}/${encPath(under)}` : filesUrl(cfg);
};

/** The segments the workspace root sits at, for reading hrefs against. */
export const rootSegments = (cfg: DavConfig) =>
	hrefSegments(`/remote.php/dav/files/${enc(cfg.user)}/${encPath(cfg.root)}`);

function authHeader(cfg: DavConfig): string {
	/* btoa is Latin-1 only, and both a username and an app password can hold
	 * anything. Encode the pair as UTF-8 bytes first, which is what every server
	 * expects and what btoa cannot do alone. */
	const bytes = new TextEncoder().encode(`${cfg.user}:${cfg.token}`);
	let binary = '';
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return `Basic ${btoa(binary)}`;
}

/*
 * ONE REQUEST, EITHER WAY ROUND.
 *
 * In relayed mode the destination travels in a header rather than in the path,
 * because a DAV path holds slashes and percent-encoded characters a route
 * parameter would have to be escaped into and out of twice. THE RELAY MUST NOT
 * TRUST IT — see $lib/relay, which is where every check lives, because a check
 * the client makes is a check an attacker skips.
 */
async function dav(
	cfg: DavConfig,
	method: string,
	url: string,
	init: { headers?: Record<string, string>; body?: string } = {},
): Promise<Response | null> {
	const headers: Record<string, string> = { ...init.headers };

	try {
		if (cfg.via === 'direct') {
			headers.authorization = authHeader(cfg);
			return await fetch(url, { method, headers, body: init.body });
		}
		headers['x-dav-target'] = url;
		headers['x-dav-authorization'] = authHeader(cfg);
		return await fetch(DAV_RELAY, { method, headers, body: init.body });
	} catch {
		/* Offline, blocked by CORS, DNS gone, certificate refused — one TypeError
		 * for all of them, with nothing in it worth reading. Null is "the request
		 * did not happen". */
		return null;
	}
}

/** The properties worth asking for. Asking for all fetches every Nextcloud extension. */
const PROPS =
	'<?xml version="1.0"?>' +
	'<d:propfind xmlns:d="DAV:"><d:prop>' +
	'<d:resourcetype/><d:getetag/>' +
	'</d:prop></d:propfind>';

const XML = 'application/xml; charset=utf-8';

/* How much of one folder is worth drawing, and how deep a path is worth
 * following. Per FOLDER and not per tree: there is no unbounded walk here to
 * guard, and what is left is one folder with more rows than anybody will read. */
const MAX_IN_DIR = 500;
const MAX_DEPTH = 8;

/*
 * WHAT HAPPENED WHEN WE TRIED THE SERVER ONCE. For the connect form and nothing
 * else — a store's verbs answer in the words a ROW can use, and this answers in
 * the words somebody filling in a form needs, which are not the same words.
 *
 * `blocked` is the one worth having and the one that cannot be known for certain.
 * A request the browser refused to make rejects with a bare TypeError carrying
 * nothing. In DIRECT mode the overwhelmingly likely cause is a preflight that was
 * never answered, because the others would have been noticed before anybody got
 * as far as typing a password — so the form says so as the first thing to check,
 * and says it as a suggestion.
 */
export type Probe = 'ok' | 'refused' | 'no-such-user' | 'blocked' | 'failed';

/** One PROPFIND at the workspace root, to find out whether any of this works. */
export async function probe(cfg: DavConfig): Promise<Probe> {
	const answer = await dav(cfg, 'PROPFIND', target(cfg), {
		headers: { depth: '0', 'content-type': XML },
		body: PROPS,
	});

	if (!answer) return 'blocked';
	if (answer.status === 207) return 'ok';
	/* THROUGH THE RELAY a dead server is not a dead fetch — the route answers 502
	 * and the request itself succeeded, so the TypeError that means `blocked` in
	 * direct mode never happens. Without this, an unreachable server in relayed
	 * mode reports "the server answered, but not in a way this understands", which
	 * is true of the relay and useless about the server. */
	if (answer.status === 502 || answer.status === 504) return 'blocked';
	if (answer.status === 401 || answer.status === 403) return 'refused';
	/* A good password and a wrong username: the credential is accepted and the
	 * path under `/files/<user>/` is somebody else's or nobody's. */
	if (answer.status === 404) return 'no-such-user';
	return 'failed';
}

/*
 * An HTTP status in the words a row can use. 412 is the interesting one and it
 * means two different things on two different requests — "somebody else changed
 * it" after `If-Match`, and "that name is taken" after `Overwrite: F` — so only
 * the caller that sent the precondition can name it.
 */
function whyStatus(status: number): WriteError {
	if (status === 412 || status === 409) return 'conflict';
	/* The relay's own word for a server it could not reach. */
	if (status === 502 || status === 504) return 'offline';
	if (status === 401 || status === 403) return 'denied';
	if (status === 404 || status === 410) return 'gone';
	return 'failed';
}

/*
 * A WORKSPACE ON A SERVER.
 *
 * IT IS LAZY, and `listDir` is what says so. One folder is one round trip, so
 * `list` answers with the ROOT LEVEL and the rail asks for the rest as folders
 * are opened. A store without `listDir` has already said everything it knows;
 * a store with it has said only the top.
 *
 * A flag would have done, and this is better: a flag and a method could disagree,
 * and a store that claimed to be lazy without a way to fetch would draw a tree
 * nobody could open.
 */
export function davStore(cfg: DavConfig, openable: Openable): Store {
	const root = rootSegments(cfg);

	/** The last etag seen for a path — what lets a save notice it would clobber. */
	const etags = new Map<string, string>();

	async function propfind(path: string): Promise<DavEntry[] | null> {
		const answer = await dav(cfg, 'PROPFIND', target(cfg, path), {
			headers: { depth: '1', 'content-type': XML },
			body: PROPS,
		});
		if (!answer || answer.status !== 207) return null;

		const at = path ? [...root, ...path.split('/')] : root;
		const entries = parseMultistatus(await answer.text(), at);
		for (const entry of entries) {
			if (entry.etag) etags.set(join(path, entry.path), entry.etag);
		}
		return entries;
	}

	/** One folder's own children. Null if that folder could not be read. */
	async function level(at: string): Promise<Listing | null> {
		const entries = await propfind(at);
		if (!entries) return null;

		const files: FolderEntry[] = [];
		const dirs: string[] = [];

		for (const entry of entries) {
			const path = join(at, entry.path);
			/*
			 * DOT-DIRECTORIES ARE SKIPPED AND NOTHING ELSE IS. The local store's list
			 * — node_modules, dist, build — is right for a source tree and wrong here:
			 * a cloud drive is somebody's documents, and hiding a folder they called
			 * `build` from their own Documents is not a service.
			 */
			if (entry.dir) {
				if (!entry.name.startsWith('.') && path.split('/').length < MAX_DEPTH) {
					dirs.push(path);
				}
				continue;
			}
			if (entry.name.startsWith('.')) continue;
			files.push(
				openable(entry.name)
					? { name: entry.name, path }
					: { name: entry.name, path, openable: false },
			);
		}

		files.sort((a, b) => a.path.localeCompare(b.path));
		dirs.sort((a, b) => a.localeCompare(b));

		return {
			files: files.slice(0, MAX_IN_DIR),
			dirs: dirs.slice(0, MAX_IN_DIR),
		};
	}

	async function put(
		path: string,
		body: string,
		headers: Record<string, string>,
	): Promise<Response | null> {
		return dav(cfg, 'PUT', target(cfg, path), {
			headers: { 'content-type': 'text/plain; charset=utf-8', ...headers },
			body,
		});
	}

	return {
		kind: 'dav',
		name: cfg.name || cfg.root.split('/').pop() || cfg.user,
		writable: true,

		list: () => level(''),
		listDir: (path) => level(path),

		async read(path) {
			const answer = await dav(cfg, 'GET', target(cfg, path));
			if (!answer || !answer.ok) return null;

			const tag = answer.headers.get('etag');
			if (tag) etags.set(path, tag.replace(/^W\//i, '').replace(/^"|"$/g, ''));

			try {
				return await answer.text();
			} catch {
				return null;
			}
		},

		/*
		 * A SAVE REFUSES TO CLOBBER. `If-Match` on the etag we last saw means the
		 * server does the comparison, atomically, and answers 412 if the document
		 * changed underneath — which the local store cannot do at all: a file system
		 * can only be asked twice and hoped at.
		 *
		 * With no etag the write goes out unconditionally, because a document nobody
		 * has read has nothing to conflict with.
		 */
		async write(path, body) {
			const tag = etags.get(path);
			const answer = await put(
				path,
				body,
				tag ? { 'if-match': `"${tag}"` } : {},
			);

			if (!answer) return notWritten('offline');
			if (!answer.ok) return notWritten(whyStatus(answer.status));

			const next = answer.headers.get('etag');
			if (next) {
				etags.set(path, next.replace(/^W\//i, '').replace(/^"|"$/g, ''));
			} else {
				/* Written, but we no longer know what it looks like — so the NEXT save
				 * goes out unconditional rather than against a stale etag that would
				 * refuse it for ever. */
				etags.delete(path);
			}
			return WROTE;
		},

		/*
		 * A NEW DOCUMENT TAKES THE FIRST FREE NAME, and the server decides what is
		 * free: `If-None-Match: *` means "only if this does not exist", answered
		 * atomically. The local store has to ask and then act, with a gap in
		 * between; this one cannot lose that race.
		 */
		async create(dir, base, ext, body) {
			for (let n = 1; n < 100; n += 1) {
				const name = n === 1 ? `${base}${ext}` : `${base} ${n}${ext}`;
				const path = join(dir, name);
				const answer = await put(path, body, { 'if-none-match': '*' });

				if (!answer) return null;
				if (answer.ok) {
					const tag = answer.headers.get('etag');
					if (tag) {
						etags.set(path, tag.replace(/^W\//i, '').replace(/^"|"$/g, ''));
					}
					return { name, path };
				}
				/* Taken. Anything else is a real failure and not a name to try again. */
				if (answer.status !== 412 && answer.status !== 409) return null;
			}
			return null;
		},

		async rename(path, to) {
			/* A name is a NAME and not a path — the same rule the local store keeps,
			 * and the last place it can be enforced. */
			if (!to || /[/\\]/.test(to)) return null;

			const dir = path.includes('/')
				? path.slice(0, path.lastIndexOf('/'))
				: '';
			const moved = { name: to, path: join(dir, to) };

			const answer = await dav(cfg, 'MOVE', target(cfg, path), {
				/* `Overwrite: F` is what makes this refuse rather than replace. The
				 * server does it; the local store has to look first and hope. */
				headers: { destination: target(cfg, moved.path), overwrite: 'F' },
			});
			if (!answer || !answer.ok) return null;

			const tag = etags.get(path);
			etags.delete(path);
			if (tag) etags.set(moved.path, tag);
			return moved;
		},

		async move(path, dir) {
			const name = path.slice(path.lastIndexOf('/') + 1);
			const from = path.includes('/')
				? path.slice(0, path.lastIndexOf('/'))
				: '';
			if (from === dir) return null;

			const moved = { name, path: join(dir, name) };
			const answer = await dav(cfg, 'MOVE', target(cfg, path), {
				headers: { destination: target(cfg, moved.path), overwrite: 'F' },
			});
			if (!answer || !answer.ok) return null;

			const tag = etags.get(path);
			etags.delete(path);
			if (tag) etags.set(moved.path, tag);
			return moved;
		},

		async remove(path) {
			const answer = await dav(cfg, 'DELETE', target(cfg, path));
			if (!answer || !answer.ok) return false;
			etags.delete(path);
			return true;
		},

		async createDir(dir, name) {
			if (!name || /[/\\]/.test(name)) return null;
			const path = join(dir, name);
			const answer = await dav(cfg, 'MKCOL', target(cfg, path));
			/* MKCOL answers 405 when something is already there, which is the same
			 * refusal the local store makes for the same reason: a folder is named on
			 * purpose. */
			return answer && answer.ok ? path : null;
		},

		async removeDir(path) {
			const answer = await dav(cfg, 'DELETE', target(cfg, path));
			if (!answer || !answer.ok) return false;
			for (const key of [...etags.keys()]) {
				if (key === path || key.startsWith(`${path}/`)) etags.delete(key);
			}
			return true;
		},
	};
}
