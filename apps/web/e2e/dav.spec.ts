import { expect, test } from '@playwright/test';

import { hrefSegments, parseMultistatus } from '../src/lib/dav';

/*
 * THE MULTISTATUS READER, asked directly.
 *
 * It is hand-written rather than handed to `DOMParser` precisely so it can be
 * checked like this — no page, no server, no browser. These are the shapes a real
 * Nextcloud sends, and every one of them was a trap first.
 */

const ROOT = ['remote.php', 'dav', 'files', 'someone', 'Notes'];

const wrap = (inner: string) =>
	`<?xml version="1.0"?><d:multistatus xmlns:d="DAV:">${inner}</d:multistatus>`;

const response = (href: string, props: string, status = '200 OK') =>
	`<d:response><d:href>${href}</d:href><d:propstat><d:prop>${props}</d:prop>` +
	`<d:status>HTTP/1.1 ${status}</d:status></d:propstat></d:response>`;

test('the prefix can be anything, or nothing at all', () => {
	// The same document three ways. Nextcloud has changed which it sends.
	const bodies = [
		wrap(
			response(
				'/remote.php/dav/files/someone/Notes/one.md',
				'<d:getetag>"abc"</d:getetag>',
			),
		),
		`<?xml version="1.0"?><D:multistatus xmlns:D="DAV:"><D:response>` +
			`<D:href>/remote.php/dav/files/someone/Notes/one.md</D:href><D:propstat><D:prop>` +
			`<D:getetag>"abc"</D:getetag></D:prop><D:status>HTTP/1.1 200 OK</D:status>` +
			`</D:propstat></D:response></D:multistatus>`,
		`<?xml version="1.0"?><multistatus xmlns="DAV:"><response>` +
			`<href>/remote.php/dav/files/someone/Notes/one.md</href><propstat><prop>` +
			`<getetag>"abc"</getetag></prop><status>HTTP/1.1 200 OK</status>` +
			`</propstat></response></multistatus>`,
	];

	for (const xml of bodies) {
		const entries = parseMultistatus(xml, ROOT);
		expect(entries).toHaveLength(1);
		expect(entries[0].name).toBe('one.md');
		expect(entries[0].etag).toBe('abc');
	}
});

test('a property is read from the block it was FOUND in', () => {
	/*
	 * The trap: a response carries several propstat blocks, one per status, and
	 * the properties that were not found come back in a 404 block, present and
	 * empty. Read without checking, the etag comes back '' for a file that has a
	 * perfectly good one in the 200 block above.
	 */
	const xml = wrap(
		`<d:response><d:href>/remote.php/dav/files/someone/Notes/one.md</d:href>` +
			`<d:propstat><d:prop><d:getetag>"real"</d:getetag></d:prop>` +
			`<d:status>HTTP/1.1 200 OK</d:status></d:propstat>` +
			`<d:propstat><d:prop><d:getcontentlength/></d:prop>` +
			`<d:status>HTTP/1.1 404 Not Found</d:status></d:propstat></d:response>`,
	);

	expect(parseMultistatus(xml, ROOT)[0].etag).toBe('real');
});

test('an etag comes back usable in an If-Match', () => {
	// Quotes inside XML character data very often arrive as entities, and a weak
	// validator wears a W/ prefix. Either one read raw can never match anything.
	const xml = wrap(
		response(
			'/remote.php/dav/files/someone/Notes/one.md',
			'<d:getetag>W/&quot;abc123&quot;</d:getetag>',
		),
	);
	expect(parseMultistatus(xml, ROOT)[0].etag).toBe('abc123');
});

test('a folder is what says it is a collection', () => {
	// A file's resourcetype is PRESENT AND EMPTY, so its absence cannot be the test.
	const xml = wrap(
		response(
			'/remote.php/dav/files/someone/Notes/Deeper/',
			'<d:resourcetype><d:collection/></d:resourcetype>',
		) +
			response(
				'/remote.php/dav/files/someone/Notes/one.md',
				'<d:resourcetype/>',
			),
	);

	const entries = parseMultistatus(xml, ROOT);
	expect(entries.find((e) => e.name === 'Deeper')!.dir).toBe(true);
	expect(entries.find((e) => e.name === 'one.md')!.dir).toBe(false);
});

test('the collection asked about is not a thing inside itself', () => {
	// Depth: 1 always includes self, and a folder is not one of its own children.
	const xml = wrap(
		response(
			'/remote.php/dav/files/someone/Notes/',
			'<d:resourcetype><d:collection/></d:resourcetype>',
		) +
			response(
				'/remote.php/dav/files/someone/Notes/one.md',
				'<d:getetag>"a"</d:getetag>',
			),
	);

	const entries = parseMultistatus(xml, ROOT);
	expect(entries).toHaveLength(1);
	expect(entries[0].name).toBe('one.md');
});

test('nothing outside the root gets into the tree', () => {
	/*
	 * A href is the one field in this document the server controls completely, and
	 * a listing that could name somewhere else is a listing that puts a path into
	 * the tree which every later verb would then act on.
	 */
	const xml = wrap(
		response(
			'/remote.php/dav/files/someone-else/Secrets/one.md',
			'<d:getetag>"a"</d:getetag>',
		) +
			response(
				'/remote.php/dav/files/someone/Elsewhere/two.md',
				'<d:getetag>"b"</d:getetag>',
			) +
			response(
				'/remote.php/dav/files/someone/Notes/mine.md',
				'<d:getetag>"c"</d:getetag>',
			),
	);

	const entries = parseMultistatus(xml, ROOT);
	expect(entries.map((e) => e.name)).toEqual(['mine.md']);
});

test('a name with a slash in it stays one name', () => {
	/*
	 * A file called `a/b` cannot exist, but a file called `a%2Fb` can — and
	 * decoding the whole path at once turns that one name into two folders.
	 */
	expect(hrefSegments('/remote.php/dav/files/someone/Notes/a%2Fb.md')).toEqual([
		'remote.php',
		'dav',
		'files',
		'someone',
		'Notes',
		'a/b.md',
	]);

	const xml = wrap(
		response(
			'/remote.php/dav/files/someone/Notes/a%2Fb.md',
			'<d:getetag>"a"</d:getetag>',
		),
	);
	const entries = parseMultistatus(xml, ROOT);
	expect(entries[0].name).toBe('a/b.md');
	expect(entries[0].path).toBe('a/b.md');
});

test('an absolute href loses its scheme and host', () => {
	// Some servers send one, and the root comparison is against path segments.
	const xml = wrap(
		response(
			'https://cloud.example.com/remote.php/dav/files/someone/Notes/one.md',
			'<d:getetag>"a"</d:getetag>',
		),
	);
	expect(parseMultistatus(xml, ROOT)[0].name).toBe('one.md');
});

test('a href the server encoded badly costs one name, not the listing', () => {
	// A stray percent is not valid encoding and decodeURIComponent throws on it.
	const xml = wrap(
		response(
			'/remote.php/dav/files/someone/Notes/100%.md',
			'<d:getetag>"a"</d:getetag>',
		) +
			response(
				'/remote.php/dav/files/someone/Notes/fine.md',
				'<d:getetag>"b"</d:getetag>',
			),
	);

	const entries = parseMultistatus(xml, ROOT);
	expect(entries).toHaveLength(2);
	expect(entries.map((e) => e.name)).toContain('fine.md');
});
