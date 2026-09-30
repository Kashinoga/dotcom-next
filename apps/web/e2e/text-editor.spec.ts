import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import { editor, modifier, monaco, pixels, words } from './helpers';

/*
 * THE TEXT EDITOR: the sheet and its proof, the workspace of notes and
 * folders, and the keys it shares with VS Code. What the editor shares with
 * every page, the bar and the footer, is in chrome.spec.ts.
 */

/*
 * AND IT TAKES THE WINDOW DOWNWARDS TOO. The app is `100dvh` less the bar, so
 * the PAGE never scrolls and each region scrolls itself instead — which is what
 * keeps the keys, the workspace and the outline on screen while somebody is a
 * thousand lines into a document.
 *
 * Asked at two heights, because the first version of this was
 * `min-block-size: 60dvh` — a guess at how much of the window would be left
 * over, right at one size and wrong at every other.
 */
for (const height of [900, 620]) {
	test(`the editor fills a ${height}px window and the page does not scroll`, async ({
		page,
	}) => {
		await page.setViewportSize({ width: 1400, height });
		await page.goto('/text-editor');

		const seen = await page.evaluate(() => {
			const bottom = (s) =>
				Math.round(document.querySelector(s)!.getBoundingClientRect().bottom);
			return {
				app: bottom('.app'),
				sheet: bottom('.sheet'),
				workspace: bottom('.workspace'),
				viewport: window.innerHeight,
				pageScroll: document.documentElement.scrollHeight - window.innerHeight,
			};
		});

		// The app ends where the window does, and so does everything in it.
		expect(seen.app).toBe(seen.viewport);
		expect(seen.sheet).toBeGreaterThan(seen.viewport - 40);
		expect(seen.workspace).toBeGreaterThan(seen.viewport - 40);
		expect(seen.pageScroll).toBe(0);
	});
}

/*
 * AN EMPTY SHEET DOES NOT SCROLL, and a full one does.
 *
 * The bug this was written for was 8px of it. A textarea is an inline-block by
 * default, so it sits on a line box's BASELINE and leaves the descender's space
 * under it — and a textarea filling a pane that is exactly the window's height
 * put the pane 8px over its own, for a scrollbar with nothing to scroll to.
 *
 * Asked at three heights, because the number is not a constant of the layout: it
 * is whatever the font leaves under a baseline, and a test pinned to one window
 * would pass on the one it was written at.
 */
for (const height of [1000, 700, 500]) {
	test(`an empty sheet has nothing to scroll at ${height}px`, async ({
		page,
	}) => {
		await page.setViewportSize({ width: 1400, height });
		await page.goto('/text-editor');
		await expect(page.locator('.workspace[data-ready]')).toBeVisible();
		await monaco(page);

		const seen = await page.evaluate(() => {
			const over = (selector: string) => {
				const element = document.querySelector(selector)!;
				return element.scrollHeight - element.clientHeight;
			};
			return {
				sheet: over('.sheet'),
				proof: over('.proof'),
				page: document.documentElement.scrollHeight - window.innerHeight,
			};
		});

		expect(seen.sheet).toBe(0);
		expect(seen.proof).toBe(0);
		expect(seen.page).toBe(0);
	});
}

/*
 * ...AND A DOCUMENT LONGER THAN THE PANE STILL SCROLLS INSIDE IT. The fix above
 * is one declaration away from being "nothing scrolls ever", which would look
 * correct on an empty sheet and lose the end of every real document.
 */
test('a document longer than the pane scrolls, and the page does not', async ({
	page,
}) => {
	const mod = await modifier(page);
	await page.setViewportSize({ width: 1400, height: 500 });
	await page.goto('/text-editor');
	await expect(page.locator('.workspace[data-ready]')).toBeVisible();

	await write(
		page,
		Array.from({ length: 80 }, (_, line) => `Line ${line + 1}`).join('\n'),
	);

	// Monaco is its own scroller: the end of the document is reached inside it.
	await page.keyboard.press(mod.documentEnd);
	const line = (text: string) =>
		page.locator('.sheet .view-line', {
			// Monaco draws a space as a no-break space; `s` is either.
			hasText: new RegExp(`^${text.replace(' ', '\\s')}$`),
		});
	await expect(line('Line 80')).toBeInViewport();
	await expect(line('Line 1')).not.toBeInViewport();

	const seen = await page.evaluate(() => {
		const sheet = document.querySelector('.sheet')!;
		return {
			sheet: sheet.scrollHeight - sheet.clientHeight,
			page: document.documentElement.scrollHeight - window.innerHeight,
		};
	});
	// And the pane and the app are still exactly their size, which is the
	// invariant it all rests on.
	expect(seen.sheet).toBe(0);
	expect(seen.page).toBe(0);
});

/*
 * NOTHING INSIDE A PANE PAINTS ITS OWN GROUND. The pane draws the colour and
 * everything in it is transparent — which matters because a FORM CONTROL does
 * not default to transparent: a textarea's background is the system's `field`,
 * and `field` follows `color-scheme`.
 *
 * This is the bug it was written for. The textarea had no background of its own,
 * so it took `field` — white in light, and #3b3b3b in dark. In light that
 * happened to equal the sheet and nothing looked wrong; in dark it was a light
 * grey box on a black sheet. A mistake that is invisible in the mode you happen
 * to be working in is exactly what a two-scheme test is for.
 *
 * Asked of every control the panes hold, and not only the one that was wrong.
 */
for (const mode of ['light', 'dark'] as const) {
	test(`no control inside a pane paints its own ground in ${mode}`, async ({
		browser,
	}) => {
		const context = await browser.newContext({ colorScheme: mode });
		const page = await context.newPage();
		await page.goto('/text-editor');
		await expect(page.locator('.workspace[data-ready]')).toBeVisible();
		await monaco(page);

		/*
		 * Monaco draws a cursor, a selection and its scrollbars, which are not
		 * grounds; the layers that would be — the editor, its background and its
		 * gutter — are asked by name, and everything outside it as before.
		 */
		const seen = await page.evaluate(() => {
			const pane = document.querySelector('.sheet')!;
			const layers = ['.monaco-editor', '.monaco-editor-background', '.margin'];
			return {
				pane: getComputedStyle(pane).backgroundColor,
				inside: [
					...[...pane.querySelectorAll('*')].filter(
						(child) => !child.closest('.monaco-editor'),
					),
					...layers.map((layer) => pane.querySelector(layer)!),
				].map((child) => ({
					tag: `${child.tagName.toLowerCase()}.${child.classList[0] ?? ''}`,
					background: getComputedStyle(child).backgroundColor,
				})),
			};
		});

		// The pane itself is opaque — that is the whole point of it.
		expect(seen.pane).not.toBe('rgba(0, 0, 0, 0)');

		/* And nothing in it is. Transparent, not "the same colour as the pane":
		 * matching by value is how this passed in light while being wrong. */
		expect(seen.inside.length).toBeGreaterThan(0);
		for (const child of seen.inside) {
			expect(child.background, child.tag).toBe('rgba(0, 0, 0, 0)');
		}

		await context.close();
	});
}

/*
 * THE SPACE PARTS THE PANES, AND NOT A LINE. The sheet and the proof used to be
 * `--bg` boxes on a `--bg` page with a hairline drawn round each — a line
 * between two things of the same colour, which is what `--surface` exists to
 * make unnecessary.
 *
 * Three claims, and the third is the one that is easy to lose: the bar has to be
 * the desk too. It wears the frost everywhere else, and the frost is 50% `--bg`,
 * so leaving it alone put a hard edge across the top of the app — the same line
 * taken off the panes, redrawn where the chrome meets the field.
 *
 * Asked in both schemes, because `--surface` is mixed off `--fg` and `--bg` and
 * a mix that reads in one can vanish in the other — which is the bug the token's
 * own note records, from when it was mixed in oklab and did nothing in dark.
 */
for (const mode of ['light', 'dark'] as const) {
	test(`the panes are parted by the desk and not a line in ${mode}`, async ({
		browser,
	}) => {
		const context = await browser.newContext({ colorScheme: mode });
		const page = await context.newPage();
		await page.goto('/text-editor');

		const seen = await page.evaluate(() => {
			const of = (s: string) => getComputedStyle(document.querySelector(s)!);
			const sheet = of('.sheet');
			return {
				desk: of('.app').backgroundColor,
				bar: of('header').backgroundColor,
				barFrame: of('header').boxShadow,
				sheet: sheet.backgroundColor,
				proof: of('.proof').backgroundColor,
				page: of('body').color, // --fg, only to prove the scheme took
				borders: [
					sheet.borderTopWidth,
					sheet.borderInlineStartWidth,
					of('.proof').borderTopWidth,
				],
			};
		});

		// 1. The document is one colour and the desk under it is another.
		expect(seen.sheet).toBe(seen.proof);
		expect(seen.desk).not.toBe(seen.sheet);

		// 2. Nothing is ruled. The step in colour is the whole of the parting.
		expect(seen.borders).toEqual(['0px', '0px', '0px']);

		// 3. The bar is the same field, so the app has no seam along its top —
		// and the frame a letter's bar wears is OFF, or it would rule a line
		// across the top of the app and draw that seam anyway.
		expect(seen.bar).toBe(seen.desk);
		expect(seen.barFrame).toBe('none');

		await context.close();
	});
}

/*
 * A SELECTED NOTE DRAWS ITS GROUND ACROSS ITS WHOLE ROW, and the close opens out
 * of it when a hand arrives.
 *
 * The close used to sit in the row the whole time, hidden, so the name was a
 * control's width short on every row whether or not anything was there — and the
 * selected wash stopped 28px from the end at an edge with nothing behind it.
 * Now the name has the row until the close asks for its share.
 */
test('a selected note fills its row, and gives way to the close', async ({
	page,
}) => {
	await page.setViewportSize({ width: 1280, height: 600 });
	await page.goto('/text-editor');
	await expect(page.locator('.workspace[data-ready]')).toBeVisible();
	await page.getByRole('button', { name: 'Open a new ephemeral note' }).click();

	const widths = () =>
		page.evaluate(() => {
			const row = document.querySelector('.row')!;
			const w = (s: string) =>
				Math.round(row.querySelector(s)!.getBoundingClientRect().width);
			return {
				row: Math.round(row.getBoundingClientRect().width),
				file: w('.file'),
				close: w('.close'),
			};
		});

	// At rest the name IS the row, so its ground can span the whole of it.
	const rest = await widths();
	expect(rest.close).toBe(0);
	expect(rest.file).toBe(rest.row);

	// Pointed at, the close opens and the name gives way by exactly its share.
	await page.locator('.row').first().hover();
	await expect.poll(async () => (await widths()).close).toBeGreaterThan(0);
	// Measured once the close has finished opening, not partway through it.
	await page.evaluate(() =>
		Promise.all(
			document.getAnimations().map((a) => a.finished.catch(() => {})),
		),
	);
	const open = await widths();
	expect(open.file).toBeLessThan(rest.file);
	expect(open.file + open.close).toBeLessThan(open.row);
	expect(open.row).toBe(rest.row);
});

/*
 * AND A KEYBOARD REACHES IT WITHOUT WAITING. A control is not focusable while it
 * is still opening, so with the morph left on the focus path the close is out of
 * the tab order for its whole length — and two quick presses of Tab go from the
 * name to the NEXT note, past the one control this test is about.
 *
 * No wait between the focus and the Tab, deliberately. A wait here would be the
 * test agreeing to be slower than a person.
 */
test('tabbing off a note name reaches its close, with no pause', async ({
	page,
}) => {
	await page.goto('/text-editor');
	await expect(page.locator('.workspace[data-ready]')).toBeVisible();

	await page.locator('.row .file').first().focus();
	await page.keyboard.press('Tab');

	await expect(page.locator('.close:focus')).toHaveAttribute(
		'aria-label',
		/Clear Ephemeral 0/,
	);
});

/*
 * A HEADING STANDS ON ITS OWN ROWS' LINE. Inside a pane the rows are inset from
 * the pane's padding to give their hover somewhere to be drawn, and a heading
 * has no hover — so left alone it would start a step to the left of everything
 * it heads, which is the one misalignment a column of names actually shows.
 *
 * Asked of every pane, because each has a heading and only the workspace's two
 * have rows with marks in them.
 */
test('a heading starts where its own rows start', async ({ page }) => {
	await page.goto('/text-editor');
	await expect(page.locator('.workspace[data-ready]')).toBeVisible();
	// The outline lists what the document holds, so it is given a heading to list.
	await write(page, '# A heading');
	await expect(page.locator('#outline li button')).toHaveCount(1);

	const seen = await page.evaluate(() => {
		const text = (node: Node) => {
			const range = document.createRange();
			range.selectNodeContents(node);
			return Math.round(range.getBoundingClientRect().x);
		};

		return [...document.querySelectorAll('.rail .section')].map((pane) => {
			const heading = pane.querySelector('h2')!;
			/* Files starts with no folder and so with no rows. Its heading still has
			 * to stand where its rows WOULD, but there is nothing to compare it to
			 * until there is one — so it says so rather than reading null. */
			const row = pane.querySelector('li button');
			if (!row) return { heading: text(heading.firstChild!), row: null };
			const mark = row.querySelector('svg');
			return {
				heading: text(heading.firstChild!),
				// A file row leads with a mark; an outline row is a word.
				row: mark
					? Math.round(mark.getBoundingClientRect().x)
					: text(row.firstChild!),
			};
		});
	});

	/* Asserted as "more than two" rather than as a count: the claim is about every
	 * pane there is, and how many there are is a different fact. */
	expect(seen.length).toBeGreaterThan(2);

	/* Scratch and the outline have rows here; Files and Drives do not until
	 * something is handed over. Every pane that HAS rows keeps the line. */
	const withRows = seen.filter((pane) => pane.row !== null);
	expect(withRows.length).toBeGreaterThan(1);
	for (const pane of withRows) expect(pane.heading).toBe(pane.row);
});

/*
 * EVERY PANE'S HEAD IS THE SAME HEIGHT, and not all of them have a reason to be.
 * Scratch carries the button that opens a note, Files the one that opens a
 * folder, Drives the one that connects a server — and the outline carries a
 * word. Left alone, the ones with a control came out taller than the one
 * without, and four panes down one window had differently sized heads.
 *
 * The FOOT is asserted with it, because the two are one decision: a heading is
 * a control's height with its text centred in it, so the air above that text is
 * more than the pane's padding, and a foot that only had the padding read
 * bottom-light. What is matched is the air, not the numbers.
 */
test('every pane in a rail has the same head, and a foot to answer it', async ({
	page,
}) => {
	await page.setViewportSize({ width: 1280, height: 800 });
	await page.goto('/text-editor');
	await expect(page.locator('.workspace[data-ready]')).toBeVisible();

	const seen = await page.evaluate(() => {
		const panes = [...document.querySelectorAll('.rail .section')];
		return panes.map((pane) => {
			const head = pane.querySelector('h2')!.getBoundingClientRect();
			/*
			 * THE LAST THING IN THE PANE, whatever it is. Files holds rows once a
			 * folder is open and a line of grey saying there is none before that, and
			 * the foot is measured from whichever it currently ends with — the air
			 * under the last thing is the claim, not the air under a row.
			 */
			const tail = [...pane.children].filter(
				(child) => child.getBoundingClientRect().height > 0,
			);
			const last = (
				[...pane.querySelectorAll('li')].pop() ?? tail[tail.length - 1]
			).getBoundingClientRect();
			const box = pane.getBoundingClientRect();
			return {
				head: Math.round(head.height),
				// The gap under the last row, which is the pane's own foot.
				foot: Math.round(box.bottom - last.bottom),
				// What the head would be with nothing in it but its text.
				control: Math.round(
					pane.querySelector('.add')?.getBoundingClientRect().height ?? 0,
				),
			};
		});
	});

	/*
	 * SOME HEADS HOLD A CONTROL AND SOME DO NOT, and that is the whole point of
	 * the claim: Scratch carries the button that opens a note, Files carries the
	 * one that opens a folder, and the outline carries a word. A head with no
	 * control must still be a control tall.
	 */
	const withControl = seen.filter((pane) => pane.control > 0);
	const without = seen.filter((pane) => pane.control === 0);
	expect(withControl.length).toBeGreaterThan(0);
	expect(without.length).toBeGreaterThan(0);

	const heights = new Set(seen.map((pane) => pane.head));
	expect(heights.size).toBe(1);

	// And the height is the control's, not the word's.
	expect([...heights][0]).toBeGreaterThan(withControl[0].control);

	// The foot answers the head rather than the padding, so it is the larger step.
	for (const pane of seen) expect(pane.foot).toBeGreaterThan(0);
	expect(new Set(seen.map((p) => p.foot)).size).toBe(1);
});

/*
 * A FOLDER FROM THIS DEVICE, listed and read.
 *
 * FIREFOX ONLY, and that is the app's shape rather than the test's. Chromium has
 * `showDirectoryPicker`, which opens a dialog belonging to the operating system
 * and cannot be driven from here; everything else has `<input webkitdirectory>`,
 * which can. So the snapshot store is what is exercised, and the walk it shares
 * with the handle-backed one is the same walk.
 *
 * The folder is BUILT HERE rather than committed. A fixture would need a binary
 * to prove the inert row, and the repository's .gitignore opts files back in by
 * extension — so a committed `.png` would either be untracked and mysteriously
 * absent on another machine, or would mean adding an extension to that list for
 * the sake of four bytes.
 */
/* An open folder's close comes with the pointer, so the row is pointed at first. */
async function putAway(page: Page, name: string) {
	await page.getByRole('button', { name, exact: true }).hover();
	await page.getByRole('button', { name: `Put ${name} away` }).click();
}

/* A folder handed over through the input, as Firefox does, and opened: every
 * folder arrives shut. */
async function snapshot(page: Page, root: string) {
	await page.locator('input[webkitdirectory]').setInputFiles(root);
	await page.getByRole('button', { name: basename(root), exact: true }).click();
}

function fixtureFolder() {
	const root = mkdtempSync(join(tmpdir(), 'workspace-'));
	writeFileSync(
		join(root, 'The Curriculum.md'),
		'# The Curriculum\n\nWelcome.\n',
	);
	writeFileSync(join(root, 'Notes.txt'), 'plain words');
	// Not text, so it is listed and inert rather than dropped.
	writeFileSync(join(root, 'crest.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
	// Machinery, so it is not listed at all.
	writeFileSync(join(root, '.hidden'), 'skip me');
	mkdirSync(join(root, 'Deeper'));
	writeFileSync(join(root, 'Deeper', 'inside.md'), 'nested words');
	return root;
}

/*
 * TWO FOLDERS SIDE BY SIDE, as a VS Code workspace holds them: each heads its
 * own rows, a document opens from either, and putting one away leaves the
 * other — and the way in stays offered while one is open.
 */
test('a second folder opens beside the first, and each is put away alone', async ({
	page,
	browserName,
}) => {
	test.skip(
		browserName !== 'firefox',
		'the input is the only way in from here',
	);

	const first = fixtureFolder();
	const second = mkdtempSync(join(tmpdir(), 'second-'));
	writeFileSync(join(second, 'other.md'), 'from the second');

	await page.goto('/text-editor');
	await expect(page.locator('.workspace[data-ready]')).toBeVisible();
	await snapshot(page, first);
	await expect(
		page.getByRole('button', { name: 'The Curriculum.md' }),
	).toBeVisible();

	await snapshot(page, second);
	const roots = page.locator('.workspace .row.root .name');
	await expect(roots).toHaveText([basename(first), basename(second)]);

	// Each is a snapshot here, and says so on its own row.
	await expect(page.locator('.workspace .row.root .view-only')).toHaveCount(2);

	// A document from each, and each onto the sheet.
	await page.getByRole('button', { name: 'other.md' }).click();
	await expect.poll(() => words(page)).toContain('from the second');
	await page.getByRole('button', { name: 'The Curriculum.md' }).click();
	await expect.poll(() => words(page)).toContain('# The Curriculum');

	// The first put away: its rows go, the second stays, and so does the sheet
	// — it was showing the first, so it lands on the scratch note.
	await putAway(page, basename(first));
	await expect(roots).toHaveText([basename(second)]);
	await expect(
		page.getByRole('button', { name: 'The Curriculum.md' }),
	).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'other.md' })).toBeVisible();
});

test('a folder is walked, listed, and read onto the sheet', async ({
	page,
	browserName,
}) => {
	test.skip(
		browserName !== 'firefox',
		'the input is the only way in from here',
	);

	const root = fixtureFolder();

	await page.goto('/text-editor');
	await expect(page.locator('.workspace[data-ready]')).toBeVisible();

	// Before: no folder, and the rail says so rather than showing an empty list.
	await expect(page.locator('.workspace ol')).toHaveCount(1);
	/* Scoped to the Folders pane: Files and Drives say "nothing here" too, so a
	 * bare `.workspace .note` matches more than one. */
	await expect(
		page.locator('.workspace [aria-label="Folders"] .note'),
	).toContainText('No folder open');

	await snapshot(page, root);

	const files = page
		.locator('.workspace [aria-label="Folders"]')
		.locator('.file');

	/* The folder's own row, then three documents at its top and the folder the
	 * fourth is in — SHUT, so what is inside it is not drawn until asked for. */
	await expect(files).toHaveCount(5);
	await expect(page.getByRole('button', { name: 'inside.md' })).toHaveCount(0);

	await page.getByRole('button', { name: 'Deeper' }).click();
	await expect(files).toHaveCount(6);

	const seen = await page.evaluate(() =>
		[
			...document
				.querySelector('.workspace [aria-label="Folders"]')!
				.querySelectorAll('.file'),
		].map((row) => ({
			name: row.querySelector('.name')!.textContent,
			inert: row.getAttribute('aria-disabled') === 'true',
			folder: row.classList.contains('folder'),
			depth: Number(
				getComputedStyle(row).getPropertyValue('--depth').trim() || 0,
			),
		})),
	);

	const names = seen.map((row) => row.name);
	// Walked into the subfolder, and left the dot-file alone.
	expect(names).toContain('inside.md');
	expect(names).not.toContain('.hidden');

	/*
	 * A FOLDER FIRST, AND WHAT IS IN IT INDENTED UNDER IT. A reader scanning the
	 * column is looking for a place or for a thing in one, never for both at once,
	 * so folders sort ahead of documents — and `Deeper` coming before `crest.png`
	 * is how you can tell the sort is by KIND first and by name second.
	 */
	// The head of the tree is the folder that was opened, and names itself.
	// `basename` and not a split on '/': on Windows the temp folder's path is
	// written with backslashes, and a split on the wrong separator hands back
	// the whole path.
	expect(seen[0].folder).toBe(true);
	expect(seen[0].name).toBe(basename(root));
	expect(seen[0].depth).toBe(0);
	expect(seen[1].folder).toBe(true);
	expect(seen[1].name).toBe('Deeper');
	expect(seen[1].depth).toBe(1);
	expect(seen[2].name).toBe('inside.md');
	expect(seen[2].depth).toBe(2);
	// Everything after that folder's contents is back at the folder's top.
	for (const row of seen.slice(3)) expect(row.depth).toBe(1);

	// Listed and plainly dead, rather than dropped — see FolderEntry.openable.
	expect(seen.find((row) => row.name === 'crest.png')!.inert).toBe(true);
	expect(seen.find((row) => row.name === 'Notes.txt')!.inert).toBe(false);

	// And a row puts its own words on the sheet.
	await page.getByRole('button', { name: 'The Curriculum.md' }).click();
	await expect.poll(() => words(page)).toContain('# The Curriculum');
	await expect.poll(() => words(page)).toContain('Welcome.');

	await page.getByRole('button', { name: 'inside.md' }).click();
	await expect.poll(() => words(page)).toContain('nested words');
});

/*
 * THE TWO RAILS ARE NOT THE SAME WIDTH, and the workspace is the wider of them.
 * It holds paths — names that nest, indent and carry guides in front of them —
 * where the outline holds headings, which are short and already stepped. The
 * figures come from the first site: 15rem and 13rem.
 *
 * Asserted as a RELATIONSHIP and a figure both. The relationship is the design;
 * the figure is what stops a later edit quietly making them equal again while
 * keeping the relationship true at 1px.
 */
test('the workspace rail is wider than the outline', async ({ page }) => {
	await page.setViewportSize({ width: 1400, height: 800 });
	await page.goto('/text-editor');
	await expect(page.locator('.workspace[data-ready]')).toBeVisible();

	const seen = await page.evaluate(() => ({
		workspace: Math.round(
			document.querySelector('#workspace')!.getBoundingClientRect().width,
		),
		outline: Math.round(
			document.querySelector('#outline')!.getBoundingClientRect().width,
		),
	}));

	expect(seen.workspace).toBeGreaterThan(seen.outline);
	expect(seen.workspace).toBe(240);
	expect(seen.outline).toBe(208);
});

/*
 * A ROW SITS AS FAR IN AS IT IS DEEP, and the indent is the whole of what says
 * so. Asserted on where the MARK is drawn rather than where the box begins: the
 * box is the rail's full width at every depth, so it says nothing about nesting.
 */
test('the tree indents by depth, one step per level', async ({
	page,
	browserName,
}) => {
	test.skip(
		browserName !== 'firefox',
		'the input is the only way in from here',
	);

	const root = mkdtempSync(join(tmpdir(), 'workspace-'));
	writeFileSync(join(root, 'top.md'), 'x');
	mkdirSync(join(root, 'Densette'));
	writeFileSync(join(root, 'Densette', 'one.md'), 'x');
	mkdirSync(join(root, 'Densette', 'Library'));
	writeFileSync(join(root, 'Densette', 'Library', 'two.md'), 'x');

	await page.setViewportSize({ width: 1400, height: 800 });
	await page.goto('/text-editor');
	await expect(page.locator('.workspace[data-ready]')).toBeVisible();
	await snapshot(page, root);

	await page.getByRole('button', { name: 'Densette' }).click();
	await page.getByRole('button', { name: 'Library' }).click();

	const seen = await page.evaluate(() =>
		[
			...document
				.querySelector('.workspace [aria-label="Folders"]')!
				.querySelectorAll('.file'),
		].map((row) => ({
			name: row.querySelector('.name')!.textContent,
			/* Where the MARK is drawn, not where the box begins — the box is the full
			 * width of the rail at every depth. */
			mark: Math.round(row.querySelector('svg')!.getBoundingClientRect().x),
		})),
	);

	const at = (name: string) => seen.find((row) => row.name === name)!;

	/* One step per level, and the step is the same one every time. */
	const step = at('Densette').mark;
	expect(at('Library').mark - at('Densette').mark).toBeGreaterThan(0);
	expect(at('two.md').mark - at('Library').mark).toBe(
		at('Library').mark - at('Densette').mark,
	);
	expect(at('top.md').mark).toBe(step);
});

/*
 * A FOLDER FOLDS, and what is inside it goes with it. `aria-expanded` is the
 * state and the mark is drawn from it, so this asks the attribute and trusts the
 * drawing to follow — they are one thing read twice.
 */
test('folding a folder takes its contents with it', async ({
	page,
	browserName,
}) => {
	test.skip(
		browserName !== 'firefox',
		'the input is the only way in from here',
	);

	const root = fixtureFolder();

	await page.goto('/text-editor');
	await expect(page.locator('.workspace[data-ready]')).toBeVisible();
	await snapshot(page, root);

	const inside = page.getByRole('button', { name: 'inside.md' });
	const deeper = page.getByRole('button', { name: 'Deeper' });

	/*
	 * SHUT TO BEGIN WITH, whichever kind of store it came from. It was open for a
	 * folder on this device and shut for one on a server, which made the two behave
	 * differently for a reason that was about the STORE and not about the reader —
	 * and a workspace of thirty folders unrolled is a column nobody can find
	 * anything in.
	 */
	await expect(deeper).toHaveAttribute('aria-expanded', 'false');
	await expect(inside).toHaveCount(0);

	await deeper.click();
	await expect(deeper).toHaveAttribute('aria-expanded', 'true');
	await expect(inside).toBeVisible();

	// The documents beside it are untouched — only what was IN it came.
	await expect(page.getByRole('button', { name: 'Notes.txt' })).toBeVisible();

	await deeper.click();
	await expect(inside).toHaveCount(0);
});

/*
 * EVERY FOLDER STARTS SHUT, however deep, and the heading opens or shuts them
 * all. Deeper's own folder is only named by a document's path in a snapshot,
 * which is the case a list of shut folders would miss.
 */
test('folders open shut, and all of them open and shut at once', async ({
	page,
	browserName,
}) => {
	test.skip(
		browserName !== 'firefox',
		'the input is the only way in from here',
	);

	const root = fixtureFolder();
	mkdirSync(join(root, 'Deeper', 'Deepest'));
	writeFileSync(join(root, 'Deeper', 'Deepest', 'bottom.md'), 'the floor');

	await page.goto('/text-editor');
	await expect(page.locator('.workspace[data-ready]')).toBeVisible();
	await snapshot(page, root);

	const deeper = page.getByRole('button', { name: 'Deeper' });
	const deepest = page.getByRole('button', { name: 'Deepest' });
	const bottom = page.getByRole('button', { name: 'bottom.md' });
	const collapse = page.getByRole('button', { name: 'Collapse all folders' });
	const top = page.getByRole('button', { name: basename(root), exact: true });

	// The folder itself opens open, so there is already something to shut.
	await expect(collapse).toBeEnabled();
	await deeper.click();
	await expect(deepest).toHaveAttribute('aria-expanded', 'false');
	await expect(bottom).toHaveCount(0);

	await page.getByRole('button', { name: 'Expand all folders' }).click();
	await expect(bottom).toBeVisible();

	// Every folder shut, the one that was opened with them.
	await collapse.click();
	await expect(top).toHaveAttribute('aria-expanded', 'false');
	await expect(deeper).toHaveCount(0);
	await expect(collapse).toBeDisabled();
	await top.click();

	// VS Code's tree keys: Right opens, Left shuts, and Left again goes up.
	await deeper.focus();
	await page.keyboard.press('ArrowRight');
	await expect(deepest).toBeVisible();
	await deepest.focus();
	await page.keyboard.press('ArrowLeft');
	await expect(deeper).toBeFocused();
	await page.keyboard.press('ArrowLeft');
	await expect(deepest).toHaveCount(0);
});

/*
 * A SNAPSHOT CANNOT BE WRITTEN TO, and the sheet says so by BEING a `<pre>`
 * rather than by refusing a keystroke somebody has already made.
 *
 * This is the read-only half of the write work. The other half needs a folder
 * handed over by `showDirectoryPicker`, which is a dialog belonging to the
 * operating system — so what this guards is the seam that decides between them.
 */
test('a folder that cannot be written to offers no typing', async ({
	page,
	browserName,
}) => {
	test.skip(
		browserName !== 'firefox',
		'the input is the only way in from here',
	);

	const root = fixtureFolder();

	await page.goto('/text-editor');
	await expect(page.locator('.workspace[data-ready]')).toBeVisible();
	await snapshot(page, root);
	await page.getByRole('button', { name: 'The Curriculum.md' }).click();

	// The document is shown, and shown as something that cannot be typed in.
	await expect.poll(() => words(page)).toContain('# The Curriculum');
	await (await monaco(page)).click();
	await page.keyboard.insertText('typed');
	// Given time to have gone in, had it been going to.
	await page.waitForTimeout(300);
	expect(await words(page)).not.toContain('typed');

	/* A scratch note in the same session still takes typing — the sheet is
	 * read-only about THIS document and not about itself. */
	await page.getByRole('button', { name: 'Ephemeral 0' }).click();
	await write(page, 'typed');
	await expect.poll(() => words(page)).toBe('typed');
});

/*
 * A FOLDER THAT CAN BE WRITTEN TO, without the operating system's dialog: the
 * picker is answered with a folder in the origin's private file system, which
 * is a real writable handle. Chromium only — that is where the picker is.
 *
 * The clock is installed and left running; see `freeze`.
 */
async function writableFolder(page: Page, files: Record<string, string>) {
	await page.clock.install();
	await page.addInitScript(() => {
		window.showDirectoryPicker = async () =>
			(await navigator.storage.getDirectory()).getDirectoryHandle('Notes', {
				create: true,
			});
	});
	await editor(page);
	await page.evaluate(async (files) => {
		const root = await (
			await navigator.storage.getDirectory()
		).getDirectoryHandle('Notes', { create: true });
		for (const [name, body] of Object.entries(files)) {
			const writable = await (
				await root.getFileHandle(name, { create: true })
			).createWritable();
			await writable.write(body);
			await writable.close();
		}
	}, files);
	await page
		.getByRole('button', { name: 'Open a folder from this device' })
		.click();
	// Every folder arrives shut, so it is opened to reach what is in it. Its
	// own verbs come with the pointer, so it is the row that is waited for.
	await page.getByRole('button', { name: 'Notes', exact: true }).click();
}

/*
 * THE CLOCK STOPPED, so the 600ms settle never fires on its own and any word
 * that reaches the disk got there by the path under test. Only once Monaco is
 * on the sheet: it draws on the clock too, and would stop half made.
 */
async function freeze(page: Page) {
	await monaco(page);
	await page.clock.pauseAt(Date.now() + 60_000);
}

function onDisk(page: Page, name: string) {
	return page.evaluate(async (name) => {
		const root = await (
			await navigator.storage.getDirectory()
		).getDirectoryHandle('Notes');
		return (await (await root.getFileHandle(name)).getFile()).text();
	}, name);
}

test('the bar says where the words stand, in Edit too', async ({
	page,
	browserName,
}) => {
	test.skip(browserName !== 'chromium', 'the picker is Chromium’s');

	await writableFolder(page, { 'one.md': 'first' });
	await page.getByRole('button', { name: 'one.md' }).click();
	await page.getByRole('button', { name: 'Edit', exact: true }).click();
	await freeze(page);

	const status = page.locator('.status');
	await expect(status).toHaveText('All changes saved.');

	await write(page, 'second');
	await expect(status).toHaveText('Saving…');

	await page.clock.runFor(600);
	await expect(status).toHaveText('All changes saved.');
	expect(await onDisk(page, 'one.md')).toBe('second');
});

test('putting a folder away saves what was just typed', async ({
	page,
	browserName,
}) => {
	test.skip(browserName !== 'chromium', 'the picker is Chromium’s');

	await writableFolder(page, { 'one.md': 'first' });
	await page.getByRole('button', { name: 'one.md' }).click();
	await freeze(page);
	await write(page, 'second');

	await putAway(page, 'Notes');
	await expect(page.getByRole('button', { name: 'one.md' })).toHaveCount(0);
	expect(await onDisk(page, 'one.md')).toBe('second');
});

test('a hidden page saves what was just typed', async ({
	page,
	browserName,
}) => {
	test.skip(browserName !== 'chromium', 'the picker is Chromium’s');

	await writableFolder(page, { 'one.md': 'first' });
	await page.getByRole('button', { name: 'one.md' }).click();
	await freeze(page);
	await write(page, 'second');

	await page.evaluate(() => {
		Object.defineProperty(document, 'visibilityState', { value: 'hidden' });
		document.dispatchEvent(new Event('visibilitychange'));
	});
	await expect.poll(() => onDisk(page, 'one.md')).toBe('second');
});

test('a folder whose save failed is not put away on the first press', async ({
	page,
	browserName,
}) => {
	test.skip(browserName !== 'chromium', 'the picker is Chromium’s');

	await writableFolder(page, { 'one.md': 'first' });
	await page.getByRole('button', { name: 'one.md' }).click();
	await freeze(page);

	// The grant withdrawn from under the editor, so the write is refused.
	await page.evaluate(() => {
		FileSystemFileHandle.prototype.createWritable = () =>
			Promise.reject(new DOMException('withdrawn', 'NotAllowedError'));
	});
	await write(page, 'second');

	const away = page.getByRole('button', { name: 'Put Notes away' });
	await page.getByRole('button', { name: 'Notes', exact: true }).hover();
	await away.click();
	await expect(page.locator('.status')).toHaveAttribute('data-tone', 'alert');
	await expect(page.getByRole('button', { name: 'one.md' })).toHaveCount(1);

	// The second press is a choice, and it is honoured.
	await page.getByRole('button', { name: 'Notes', exact: true }).hover();
	await away.click();
	await expect(page.getByRole('button', { name: 'one.md' })).toHaveCount(0);
});

/*
 * ONE WAY IN PER BROWSER, and the right one. `showDirectoryPicker` hands over a
 * folder this app could write through and remember; the input hands over a
 * snapshot that is read-only and gone at the end of the session. Where the first
 * exists it is strictly the better bargain, so the second is not also offered.
 *
 * The detect is on that one function and on nothing else, because everything
 * else lies: `FileSystemDirectoryHandle` and `createWritable` are present in
 * browsers that will not let a page ask for a folder at all.
 */
test('a browser is offered the one way it has, and not both', async ({
	page,
}) => {
	await page.goto('/text-editor');
	await expect(page.locator('.workspace[data-ready]')).toBeVisible();

	const seen = await page.evaluate(() => ({
		picker:
			typeof (window as unknown as Record<string, unknown>)
				.showDirectoryPicker === 'function',
		input: document.querySelectorAll('input[webkitdirectory]').length,
	}));

	// Exactly one of the two, whichever engine this is.
	expect(seen.input).toBe(seen.picker ? 0 : 1);

	// And the control is a button either way, so the rail reads the same.
	await expect(
		page.getByRole('button', { name: /Open a folder from this device/ }),
	).toHaveCount(1);
});

/*
 * THE VIEW KEYS ARE AN ISLAND AT THE START OF THE BAR, beside the workspace's
 * switch, and not in the end cluster. There they shared the free space with the
 * status line and slid along the bar whenever its words changed length.
 *
 * Position asserted as an ORDER and not as coordinates. What matters is which
 * side of which, and a bar whose controls are resized should not have to be told.
 */
test('the view keys stand at the start, on the app and nowhere else', async ({
	page,
}) => {
	await page.setViewportSize({ width: 1280, height: 800 });
	await page.goto('/text-editor');
	// The page claims the keys on mount, so they arrive a tick after the markup.
	await expect(page.locator('.views')).toBeVisible();

	const seen = await page.evaluate(() => {
		const x = (s: string) =>
			document.querySelector(s)!.getBoundingClientRect().x;
		const island = document.querySelector('.views')!.getBoundingClientRect();
		return {
			brandEnd: document.querySelector('.brand')!.getBoundingClientRect().right,
			island: island.x,
			islandEnd: island.right,
			workspace: x('[aria-controls="workspace"]'),
			outline: x('[aria-controls="outline"]'),
			apps: x('header nav a'),
			mode: x('header > button.control:not(.panel)'),
			bar: document.querySelector('header')!.getBoundingClientRect(),
		};
	});

	// After the brand, and close to it rather than floating mid-bar.
	expect(seen.island).toBeGreaterThan(seen.brandEnd);
	expect(seen.island - seen.brandEnd).toBeLessThan(seen.bar.width / 3);

	// The two panel switches side by side, the workspace's first, then the keys.
	expect(seen.outline).toBeGreaterThan(seen.workspace);
	expect(seen.island).toBeGreaterThan(seen.outline);

	// The site's own two are what the bar is split for.
	expect(seen.apps - seen.islandEnd).toBeGreaterThan(seen.bar.width / 3);
	expect(seen.mode).toBeGreaterThan(seen.apps);

	// It belongs to the app, so a letter has none.
	await page.goto('/apps');
	await expect(page.locator('.views')).toHaveCount(0);
});

/*
 * THE ISLAND DOES NOT MAKE THE BAR TALLER. Every region on a fullscreen page is
 * measured off `--bar-block-size`, so a control in here with padding over or
 * under it would push the app down the window and the page would start to
 * scroll. The island is exactly as tall as the keys in it, and the keys are the
 * bar's own control height.
 */
test('the island is as tall as the bar and no taller', async ({ page }) => {
	await page.setViewportSize({ width: 1280, height: 800 });
	await page.goto('/text-editor');
	await expect(page.locator('.views')).toBeVisible();

	const seen = await page.evaluate(() => ({
		bar: document.querySelector('header')!.getBoundingClientRect().height,
		island: document.querySelector('.views')!.getBoundingClientRect().height,
		key: document.querySelector('.view')!.getBoundingClientRect().height,
		pageScroll: document.documentElement.scrollHeight - window.innerHeight,
	}));

	expect(seen.island).toBe(seen.key);
	// A control between two paddings, and the island IS the control.
	expect(seen.bar).toBeGreaterThan(seen.island);
	expect((seen.bar - seen.island) % 2).toBe(0);
	expect(seen.pageScroll).toBe(0);
});

/*
 * A KEY'S GROUND SITS ONE STEP INSIDE THE ISLAND, on all four sides. It was
 * flush top and bottom and a step in at the ends — one shape inside another on
 * two sides and level with it on the other two.
 *
 * The step is read off the island rather than written here, so it can be changed
 * in one place and this still holds. What is asserted is that the four are equal.
 */
test('the pressed key is drawn a step inside the island, all round', async ({
	page,
}) => {
	await page.setViewportSize({ width: 1280, height: 800 });
	await page.goto('/text-editor');
	await expect(page.locator('.views')).toBeVisible();

	const seen = await page.evaluate(() => {
		const island = document.querySelector('.views')!;
		const box = island.getBoundingClientRect();
		const keys = [...document.querySelectorAll('.view')];
		const pressed = document.querySelector('.view[aria-pressed="true"]')!;

		// A pseudo-element has no box to ask for, so its edges are worked out from
		// the key it is drawn in and the size it is given. It is centred on the
		// key's height and starts at the key's start.
		const ground = (el: Element) => {
			const g = getComputedStyle(el, '::before');
			const k = el.getBoundingClientRect();
			const height = parseFloat(g.height);
			const top = k.top + (k.height - height) / 2;
			const left = k.left + parseFloat(g.insetInlineStart);
			return {
				top,
				bottom: top + height,
				left,
				right: left + parseFloat(g.width),
			};
		};

		const first = ground(keys[0]);
		const last = ground(keys[keys.length - 1]);
		const it = ground(pressed);

		return {
			step: parseFloat(getComputedStyle(island).paddingInlineStart),
			top: it.top - box.top,
			bottom: box.bottom - it.bottom,
			start: first.left - box.left,
			end: box.right - last.right,
			// The CONTROL is still the island's full height; only the drawing moved.
			keyHeight: keys[0].getBoundingClientRect().height,
			islandHeight: box.height,
		};
	});

	// Firefox lands these a ten-thousandth of a pixel out, which is a rounding
	// and not a disagreement.
	expect(seen.top).toBeCloseTo(seen.step, 2);
	expect(seen.bottom).toBeCloseTo(seen.step, 2);
	expect(seen.start).toBeCloseTo(seen.step, 2);
	expect(seen.end).toBeCloseTo(seen.step, 2);

	expect(seen.keyHeight).toBe(seen.islandHeight);
});

/*
 * ...AND A FINGER STILL GETS THE WHOLE KEY. This is the reason the ground is a
 * pseudo-element and not a padding on the island: padding would have taken the
 * step out of the CONTROL, and on a touchscreen that is 44px down to 36 — under
 * the size this site gives a finger — to buy four pixels of drawing.
 *
 * The same question the bar's own controls are asked, in the same words.
 */
test('a touchscreen gets the whole key, not the drawn pill', async ({
	browser,
}) => {
	const context = await browser.newContext({ hasTouch: true });
	const page = await context.newPage();
	await page.goto('/text-editor');
	await expect(page.locator('.views')).toBeVisible();

	const seen = await page.evaluate(() => ({
		key: Math.round(
			document.querySelector('.view')!.getBoundingClientRect().height,
		),
		/* Measured off ANOTHER control in the same bar rather than off the token —
		 * a custom property computes to '2.75rem' and not to pixels, and what is
		 * being claimed is that the key is one of these, not that it is 44. */
		siteControl: Math.round(
			document.querySelector('header nav a')!.getBoundingClientRect().height,
		),
	}));

	// 2.75rem is 44px, which is where a coarse pointer moves the token.
	expect(seen.siteControl).toBe(44);
	expect(seen.key).toBe(seen.siteControl);

	await context.close();
});

/*
 * A KEY'S CONTENTS SIT IN THE MIDDLE OF IT, which only became a question when
 * the keys became equal columns: each is as wide as the widest, so "Edit" and
 * "Split" are handed room "Preview" needed, and left alone they sat at the start
 * of a box a third wider than their own words with the ground filling all of it.
 *
 * Asked as lead against trail rather than against a figure, so the padding and
 * the labels can both change and this still means the same thing.
 */
test('every key is centred in its own column', async ({ page }) => {
	await page.setViewportSize({ width: 1280, height: 800 });
	await page.goto('/text-editor');
	await expect(page.locator('.views')).toBeVisible();

	const seen = await page.evaluate(() =>
		[...document.querySelectorAll('.view')].map((key) => {
			const box = key.getBoundingClientRect();
			const mark = key.querySelector('svg')!.getBoundingClientRect();
			const name = key.querySelector('.name')!.getBoundingClientRect();
			return {
				label: key.textContent!.trim(),
				lead: mark.left - box.left,
				trail: box.right - name.right,
				width: box.width,
			};
		}),
	);

	expect(seen).toHaveLength(3);
	for (const key of seen) expect(key.lead).toBeCloseTo(key.trail, 1);

	// The columns really are equal — the premise the centring is answering.
	expect(new Set(seen.map((key) => Math.round(key.width))).size).toBe(1);

	// And the widest label is the one that sets the width, so it has the least
	// room at its ends: everything else is padded out from there.
	const widest = seen.find((key) => key.label === 'Preview')!;
	for (const key of seen) expect(key.lead).toBeGreaterThanOrEqual(widest.lead);
});

/*
 * THE GROUND TRAVELS BETWEEN THE KEYS, and there is exactly ONE of it. It was
 * three grounds taking turns being coloured, so a switch put the accent out in
 * one place and on in another with nothing in between.
 *
 * Asserted as a LANDING first: wherever it comes to rest it is the pressed key's
 * own box, inset by the island's step. That is the claim a slot index has to
 * keep, and the one that breaks the moment the keys stop being equal columns.
 */
test('one ground, and it lands on whichever key is pressed', async ({
	page,
}) => {
	await page.setViewportSize({ width: 1280, height: 800 });
	await page.goto('/text-editor');
	await expect(page.locator('.views')).toBeVisible();

	// One, however many keys there are.
	await expect(page.locator('.thumb')).toHaveCount(1);

	for (const name of ['Edit', 'Preview', 'Split']) {
		await page.getByRole('button', { name }).click();
		await expect(page.locator(`.view[aria-pressed="true"]`)).toHaveText(name);

		// Let it arrive before asking where it is.
		await expect
			.poll(async () =>
				page.evaluate((wanted) => {
					const key = [...document.querySelectorAll('.view')].find(
						(k) => k.textContent!.trim() === wanted,
					)!;
					const thumb = document.querySelector('.thumb')!;
					const k = key.getBoundingClientRect();
					const t = thumb.getBoundingClientRect();
					const step = parseFloat(
						getComputedStyle(document.querySelector('.views')!)
							.paddingInlineStart,
					);
					return (
						Math.abs(t.x - k.x) < 1 &&
						Math.abs(t.width - k.width) < 1 &&
						Math.abs(t.top - k.top - step) < 1 &&
						Math.abs(k.bottom - t.bottom - step) < 1
					);
				}, name),
			)
			.toBe(true);
	}
});

/*
 * ...AND IT TRAVELS RATHER THAN JUMPING, which is asked by comparing the two
 * motion settings at the SAME moment rather than by watching a clock.
 *
 * Sampled the instant the click returns: with motion the ground is still where
 * it started, and with `prefers-reduced-motion` it is already where it is going.
 * A test that slept and looked for a half-way position would be timing the
 * machine it runs on; this one only asks whether a transition is there at all,
 * which is the thing that can actually break.
 */
test('the ground moves over time, and at once when motion is refused', async ({
	browser,
}) => {
	const where = async (reducedMotion: 'reduce' | 'no-preference') => {
		const context = await browser.newContext({
			reducedMotion,
			viewport: { width: 1280, height: 800 },
		});
		const page = await context.newPage();
		await page.goto('/text-editor');
		await expect(page.locator('.views')).toBeVisible();

		const at = () =>
			page.evaluate(() =>
				Math.round(document.querySelector('.thumb')!.getBoundingClientRect().x),
			);

		const start = await at();
		// Split is where it opens, so Edit is two slots away.
		await page.getByRole('button', { name: 'Edit' }).click();
		const immediately = await at();

		/* Polled until it is ON the key rather than until it has merely left the one
		 * it was on — the first sample that differs from `start` catches it
		 * mid-flight, at whatever pixel that frame happened to fall on. */
		await expect
			.poll(() =>
				page.evaluate(() => {
					const key = document
						.querySelector('.view[aria-pressed="true"]')!
						.getBoundingClientRect();
					const thumb = document
						.querySelector('.thumb')!
						.getBoundingClientRect();
					return Math.abs(thumb.x - key.x) < 1;
				}),
			)
			.toBe(true);
		const arrived = await at();

		await context.close();
		return { start, immediately, arrived };
	};

	const moving = await where('no-preference');
	const still = await where('reduce');

	// Both end up on Edit.
	expect(moving.arrived).toBe(still.arrived);
	expect(moving.arrived).not.toBe(moving.start);

	// The difference is only whether it was still at the start a moment after.
	expect(moving.immediately).toBe(moving.start);
	expect(still.immediately).toBe(still.arrived);
});

/*
 * A NARROW BAR KEEPS THE MARKS AND GIVES UP THE NAMES. Left to shrink, the flex
 * line took the island's width out of its icons — three keys reduced to three
 * bare words, which is the wrong half of a control to keep.
 *
 * The NAME is still there for a screen reader, which is the whole reason it is
 * `.visually-hidden` and not `display: none`.
 */
for (const width of [1280, 380]) {
	test(`the island keeps every mark at ${width}px`, async ({ page }) => {
		await page.setViewportSize({ width, height: 700 });
		await page.goto('/text-editor');
		await expect(page.locator('.views')).toBeVisible();

		const seen = await page.evaluate(() => {
			const keys = [...document.querySelectorAll('.view')];
			return {
				marks: keys.map((k) =>
					Math.round(k.querySelector('svg')!.getBoundingClientRect().width),
				),
				named: keys.map(
					(k) =>
						Math.round(
							k.querySelector('.name')!.getBoundingClientRect().width,
						) > 2,
				),
				names: keys.map((k) => k.querySelector('.name')!.textContent),
				hScroll:
					document.documentElement.scrollWidth -
					document.documentElement.clientWidth,
			};
		});

		// Every mark is drawn at its full size, at either width.
		expect(seen.marks).toHaveLength(3);
		for (const mark of seen.marks) expect(mark).toBeGreaterThan(8);

		// The names are read either way, and shown only where there is room.
		expect(seen.names).toEqual(['Edit', 'Preview', 'Split']);
		// 33rem is 528px — see the media query and the sum written above it.
		for (const shown of seen.named) expect(shown).toBe(width >= 528);

		expect(seen.hScroll).toBe(0);
	});
}

/*
 * THE RAIL STANDS STILL, as VS Code's side bar does: a long list scrolls inside
 * its own pane, and every heading stays in view.
 *
 * This is also the test for `block-size` on `.app`. With `min-block-size` there
 * the rail had no definite height above it, an auto grid row took the whole
 * list, and the page grew past its end — 112px of it, before it was found.
 */
test('the rail stands still; a long list scrolls inside its pane', async ({
	page,
}) => {
	await page.setViewportSize({ width: 1280, height: 480 });
	await page.goto('/text-editor');
	await expect(page.locator('.workspace[data-ready]')).toBeVisible();

	for (let i = 0; i < 12; i += 1)
		await page
			.getByRole('button', { name: 'Open a new ephemeral note' })
			.click();

	const seen = await page.evaluate(() => {
		const rail = document.querySelector('#workspace')!;
		const box = rail.getBoundingClientRect();
		const list = document.querySelector('#scratch-body')!;
		return {
			pageScroll: document.documentElement.scrollHeight - window.innerHeight,
			railScroll: rail.scrollHeight - rail.clientHeight,
			listScroll: list.scrollHeight - list.clientHeight,
			heads: [...rail.querySelectorAll('.section h2')].map((head) => {
				const at = head.getBoundingClientRect();
				return at.top >= box.top && at.bottom <= box.bottom;
			}),
		};
	});

	expect(seen.pageScroll).toBe(0);
	expect(seen.railScroll).toBe(0);
	expect(seen.listScroll).toBeGreaterThan(0);
	expect(seen.heads).toEqual([true, true, true]);

	// The newest note is scrolled to inside the pane, not off the end of it.
	await expect(
		page.getByRole('button', { name: 'Ephemeral 12' }),
	).toBeInViewport();
});

/* A SECTION FOLDS TO ITS HEADING, and stays folded after a reload. */
test('a section folds to its heading, and stays folded', async ({ page }) => {
	await page.goto('/text-editor');
	await expect(page.locator('.workspace[data-ready]')).toBeVisible();

	const scratchHead = page.getByRole('button', {
		name: 'Scratch',
		exact: true,
	});
	const note = page.getByRole('button', { name: 'Ephemeral 0' });
	await expect(scratchHead).toHaveAttribute('aria-expanded', 'true');
	await expect(note).toBeVisible();

	await scratchHead.click();
	await expect(scratchHead).toHaveAttribute('aria-expanded', 'false');
	await expect(note).toBeHidden();

	await page.reload();
	await expect(page.locator('.workspace[data-ready]')).toBeVisible();
	await expect(scratchHead).toHaveAttribute('aria-expanded', 'false');
	await expect(note).toBeHidden();

	await scratchHead.click();
	await expect(note).toBeVisible();
});

/*
 * EVERY PANE IN A RAIL IS A RAISED, FRAMED PANEL ON THE DESK: one shade for
 * all of them, off both the desk and the document — the shell's own shade would
 * leave a pane no different from the ground it stands on.
 */
for (const mode of ['light', 'dark'] as const) {
	test(`every rail pane is a framed panel on the desk in ${mode}`, async ({
		browser,
	}) => {
		const context = await browser.newContext({ colorScheme: mode });
		const page = await context.newPage();
		await page.goto('/text-editor');

		const seen = await page.evaluate(() => {
			const bg = (el: Element) => getComputedStyle(el).backgroundColor;
			const panes = [...document.querySelectorAll('.rail .section')];
			return {
				count: panes.length,
				shades: [...new Set(panes.map(bg))],
				radii: [
					...new Set(panes.map((p) => getComputedStyle(p).borderTopLeftRadius)),
				],
				frames: panes.map((p) => getComputedStyle(p).boxShadow),
				desk: bg(document.querySelector('.app')!),
				sheet: bg(document.querySelector('.sheet')!),
			};
		});

		// Scratch, Files, Drives and the outline — each its own pane with corners.
		expect(seen.count).toBeGreaterThan(2);
		expect(seen.radii).toHaveLength(1);
		expect(seen.radii[0]).not.toBe('0px');

		// All one raised shade, each framed, and off both the desk and the document.
		expect(seen.shades).toHaveLength(1);
		expect(seen.shades[0]).not.toBe(seen.desk);
		expect(seen.shades[0]).not.toBe(seen.sheet);
		expect(seen.sheet).not.toBe(seen.desk);
		for (const frame of seen.frames) expect(frame).toContain('inset');

		await context.close();
	});
}

/*
 * ONE STEP ROUND THE APP AND BETWEEN ITS REGIONS, which is the whole of the
 * spacing argument the editor settled: an edge and a gap at different sizes read
 * as two ideas about one space.
 *
 * The TOP edge is the one worth asserting, because it is the one nothing on this
 * page draws — it is the bar's lower padding, and the app leans on it. A change
 * to the bar could take it back to 16 without anything in the editor's own
 * stylesheet moving, and this is what would notice.
 *
 * The figure is read off the app rather than written down, so the step can be
 * changed in one place and this still holds.
 */
test('the app is framed by the same step that parts its regions', async ({
	page,
}) => {
	await page.setViewportSize({ width: 1400, height: 900 });
	await page.goto('/text-editor');

	const seen = await page.evaluate(() => {
		const box = (s: string) =>
			document.querySelector(s)!.getBoundingClientRect();
		const app = box('.app');
		const bar = box('header');
		const workspace = box('#workspace');
		const desk = box('.desk');

		return {
			step: parseFloat(
				getComputedStyle(document.querySelector('.app')!).paddingInlineStart,
			),
			top: Math.round(workspace.top - bar.bottom),
			start: Math.round(workspace.left - app.left),
			between: Math.round(desk.left - workspace.right),
			end: Math.round(app.bottom - desk.bottom),
		};
	});

	// The bar's lower padding is the app's top edge; the app draws the other three.
	expect(seen.top).toBe(0);
	expect(seen.start).toBe(seen.step);
	expect(seen.end).toBe(seen.step);

	// And the gap between two regions is that same step.
	expect(seen.between).toBe(seen.step);
});

/*
 * PUT AWAY, THE WORKSPACE GIVES ITS COLUMN BACK. A switch that hid the panel
 * and left the room reserved would be no use at all on a working surface — the
 * width is the whole reason to close it.
 */
for (const [name, id] of [
	['Workspace', 'workspace'],
	['Outline', 'outline'],
]) {
	test(`closing the ${id} hands its width to the desk`, async ({ page }) => {
		await page.setViewportSize({ width: 1400, height: 800 });
		await page.goto('/text-editor');

		const button = page.getByRole('button', { name, exact: true });
		const rail = page.locator(`#${id}`);
		const sheet = page.locator('.sheet');

		await expect(button).toHaveAttribute('aria-expanded', 'true');
		await expect(rail).toBeVisible();
		const wide = (await sheet.boundingBox())!.width;

		await button.click();

		await expect(button).toHaveAttribute('aria-expanded', 'false');
		await expect(rail).toBeHidden();
		expect((await sheet.boundingBox())!.width).toBeGreaterThan(wide);

		await button.click();
		await expect(rail).toBeVisible();
	});
}

/*
 * BOTH AWAY IS THE FOURTH STATE, and the one a rule written as "the panel that
 * is closed" would miss. Two panels give four benches and the stylesheet names
 * all four rather than working them out.
 */
test('with both panels away the desk takes the whole bench', async ({
	page,
}) => {
	await page.setViewportSize({ width: 1400, height: 800 });
	await page.goto('/text-editor');

	const sheet = page.locator('.sheet');
	const both = (await sheet.boundingBox())!.width;

	await page.getByRole('button', { name: 'Workspace', exact: true }).click();
	await page.getByRole('button', { name: 'Outline', exact: true }).click();

	await expect(page.locator('#workspace')).toBeHidden();
	await expect(page.locator('#outline')).toBeHidden();
	expect((await sheet.boundingBox())!.width).toBeGreaterThan(both);

	// And nothing was pushed sideways by taking the columns out.
	expect(
		await page.evaluate(
			() =>
				document.documentElement.scrollWidth -
				document.documentElement.clientWidth,
		),
	).toBeLessThanOrEqual(0);
});

/*
 * AND IT GOES WHERE THE PANEL GOES. Below 64rem the workspace has no column to
 * stand in, so the control that moves it is not drawn either. Two rules hold
 * that one breakpoint — the layout's and the page's — which is the sort of pair
 * this repo warns about, so it is asserted rather than trusted.
 */
test('the switches are not offered where the panels cannot be shown', async ({
	page,
}) => {
	await page.goto('/text-editor');

	await page.setViewportSize({ width: 1400, height: 800 });
	await expect(page.locator('header .panel').first()).toBeVisible();
	await expect(page.locator('#workspace')).toBeVisible();
	await expect(page.locator('#outline')).toBeVisible();

	await page.setViewportSize({ width: 900, height: 800 });
	for (const nth of [0, 1]) {
		await expect(page.locator('header .panel').nth(nth)).toBeHidden();
	}
	await expect(page.locator('#workspace')).toBeHidden();
	await expect(page.locator('#outline')).toBeHidden();
});

async function write(page: Page, text: string) {
	const mod = await modifier(page);
	await (await monaco(page)).click();
	await page.keyboard.press(`${mod.key}+a`);
	await page.keyboard.press('Delete');
	if (!text) return;

	if (page.context().browser()?.browserType().name() === 'chromium') {
		await page.evaluate((text) => {
			const data = new DataTransfer();
			data.setData('text/plain', text);
			document.activeElement?.dispatchEvent(
				new ClipboardEvent('paste', {
					clipboardData: data,
					bubbles: true,
					cancelable: true,
				}),
			);
		}, text);
		return;
	}
	for (const [i, line] of text.split('\n').entries()) {
		if (i) await page.keyboard.press('Enter');
		if (line) await page.keyboard.insertText(line);
	}
}

test('a scratch note is there to type in, and survives a reload', async ({
	page,
}) => {
	await editor(page);
	// Edit, so the sentence is one line on the sheet and not wrapped in half.
	await page.getByRole('button', { name: 'Edit' }).click();
	await write(page, 'The terrain is unforgiving by design.');
	await page.reload();
	await page.locator('.workspace[data-ready]').waitFor({ state: 'attached' });
	await page.getByRole('button', { name: 'Edit' }).click();
	await expect
		.poll(() => words(page))
		.toBe('The terrain is unforgiving by design.');
});

/*
 * THE NUMBER IS A SLOT AND NOT AN IDENTITY. Close Ephemeral 1 out of three and
 * the next one opened is 1 again, in its old place — counting upwards instead
 * would leave somebody at Ephemeral 47 by the afternoon, and appending instead
 * of sorting once produced the list `0, 2, 1`.
 */
test('a closed ephemeral number comes back, in order', async ({ page }) => {
	await editor(page);

	const names = () =>
		page.locator('.workspace section').first().locator('.file .name');
	const add = page.getByRole('button', { name: 'Open a new ephemeral note' });

	await expect(names()).toHaveText(['Ephemeral 0']);

	await add.click();
	await add.click();
	await expect(names()).toHaveText([
		'Ephemeral 0',
		'Ephemeral 1',
		'Ephemeral 2',
	]);

	const one = page.locator('.row', { hasText: 'Ephemeral 1' });
	await one.hover();
	await one.getByRole('button', { name: 'Close Ephemeral 1' }).click();
	await expect(names()).toHaveText(['Ephemeral 0', 'Ephemeral 2']);

	await add.click();
	await expect(names()).toHaveText([
		'Ephemeral 0',
		'Ephemeral 1',
		'Ephemeral 2',
	]);
});

/*
 * CLOSING IS TWO DIFFERENT THINGS, and the label is what says which. Ephemeral
 * 0 is emptied and stays; anything else goes. Without the permanent one there
 * would be a state with nowhere at all to type, which is an editor greeting
 * somebody with no way in.
 */
test('closing Ephemeral 0 clears it; closing another removes it', async ({
	page,
}) => {
	await editor(page);

	await write(page, 'Take care.');

	const zero = page.locator('.row', { hasText: 'Ephemeral 0' });
	await zero.hover();
	// The label says CLEAR here and CLOSE everywhere else.
	await zero.getByRole('button', { name: 'Clear Ephemeral 0' }).click();

	await expect(
		page.locator('.workspace section').first().locator('.file .name'),
	).toHaveText(['Ephemeral 0']);
	await expect.poll(() => words(page)).toBe('');
});

/*
 * A PAGE THAT NEVER SAYS ITS NAME leaves the bar saying it, from the first
 * paint and without anybody scrolling. The editor has no masthead — a working
 * surface with a title above it has less room to work on — so the rule the
 * other pages follow arrives here at a different answer.
 *
 * The LINK is still a link home, and still says so. That is the part worth
 * guarding: the drawing changed and the name did not.
 */
test('the bar names a page that has no masthead of its own', async ({
	page,
}) => {
	await page.goto('/text-editor');

	// Nothing on the page claims to be its title.
	await expect(page.locator('[data-page-title]')).toHaveCount(0);

	const brand = page.locator('.brand');
	await expect(brand).toHaveClass(/showing-page/);
	await expect(page.locator('.brand-state.page')).toHaveText('Text Editor');
	await expect(page.locator('.brand-state.page')).toHaveCSS('opacity', '1');

	// Unscrolled — the name is there because the page never says it, not because
	// anything went under the bar.
	expect(await page.evaluate(() => Math.round(scrollY))).toBe(0);

	await expect(
		page.getByRole('link', { name: 'Kashinoga', exact: true }),
	).toHaveAttribute('href', '/');
});

/*
 * THE PROOF AND THE OUTLINE ARE ONE PARSE of what is on the sheet: markdown-it,
 * set as VS Code sets it. These hold the parts a reader would notice going
 * wrong, and the one part nobody would notice until it mattered.
 */
test('a note is set in the proof, and its headings are the outline', async ({
	page,
}) => {
	await editor(page);
	await write(
		page,
		'---\ntitle: kept out\n---\n# One\n\nSome **words**.\n\n## Two',
	);

	const proof = page.locator('.proof');
	await expect(proof.locator('h1')).toHaveText('One');
	await expect(proof.locator('strong')).toHaveText('words');
	await expect(proof.locator('h2')).toHaveText('Two');

	// Front matter is hidden, as VS Code hides it — not set as a rule and a line.
	await expect(proof).not.toContainText('kept out');
	await expect(proof.locator('hr')).toHaveCount(0);

	await expect(page.locator('#outline li button')).toHaveText(['One', 'Two']);
});

test('a script in a document is not run', async ({ page }) => {
	await editor(page);
	await write(
		page,

		[
			'<img src="x" onerror="window.ran = 1">',
			'<script>window.ran = 2</script>',
			'<a href="javascript:window.ran = 3">raw</a>',
			'[written](javascript:window.ran=4)',
		].join('\n\n'),
	);
	await expect(page.locator('.proof img')).toHaveCount(1);
	await expect(page.locator('.proof img')).not.toHaveAttribute('onerror');

	// Raw HTML keeps its link and loses the script; markdown-it will not make one.
	await expect(page.locator('.proof a')).toHaveCount(1);
	await expect(page.locator('.proof a')).not.toHaveAttribute('href');
	await page.locator('.proof a').click();

	expect(await page.evaluate(() => (window as { ran?: number }).ran)).toBe(
		undefined,
	);
});

test('a heading in the outline brings both panes to it', async ({ page }) => {
	await editor(page);
	const filler = Array.from({ length: 60 }, (_, i) => `Line ${i}.`);
	await write(
		page,
		['# Top', '', ...filler, '## Middle', '', ...filler].join('\n'),
	);

	await page.getByRole('button', { name: 'Middle' }).click();

	// The heading's line is near the top of the sheet, and the caret is on it.
	const middle = page.locator('.sheet .view-line', { hasText: '## Middle' });
	await expect(middle).toBeInViewport();
	await expect(page.locator('.sheet .monaco-editor')).toHaveClass(/focused/);
	const line = (await middle.boundingBox())!;
	const pane = (await page.locator('.sheet').boundingBox())!;
	// Near the top, as VS Code reveals it, with the pinned heading above.
	expect(line.y - pane.y).toBeLessThan(pane.height / 2);
	const current = (await page
		.locator('.sheet .view-overlays .current-line')
		.boundingBox())!;
	expect(Math.abs(current.y - line.y)).toBeLessThan(2);

	await expect(page.locator('.proof h2')).toBeInViewport();

	// And back up.
	await page.getByRole('button', { name: 'Top' }).click();
	await expect(
		page.locator('.sheet .view-line', { hasText: '# Top' }),
	).toBeInViewport();
	await expect(page.locator('.proof h1')).toBeInViewport();
});

/*
 * THE PREVIEW FOLLOWS THE SHEET IN SPLIT, and the sheet the preview, by the
 * line each block of the proof came from.
 */
test('in split, the preview follows the sheet and the sheet the preview', async ({
	page,
}) => {
	const mod = await modifier(page);
	await editor(page);
	await page.getByRole('button', { name: 'Split' }).click();
	const text = Array.from(
		{ length: 100 },
		(_, i) => `## Part ${i}\n\nWords for part ${i}.\n`,
	).join('\n');
	await write(page, text);
	await page.keyboard.press(mod.documentStart);

	// The line at the top of the sheet, read off Monaco's own numbers.
	const sheetTop = () =>
		page.evaluate(() => {
			const pane = document
				.querySelector('.sheet .monaco-editor')!
				.getBoundingClientRect();
			const numbers = [
				...document.querySelectorAll<HTMLElement>(
					'.sheet .margin-view-overlays .line-numbers',
				),
			]
				.filter((one) => one.getBoundingClientRect().top >= pane.top - 1)
				.map((one) => Number(one.textContent));
			return Math.min(...numbers) - 1;
		});

	// The source line of the block at the top of the proof.
	const proofTop = () =>
		page.evaluate(() => {
			const proof = document.querySelector('.proof')!;
			const top = proof.getBoundingClientRect().top;
			const block = [
				...proof.querySelectorAll<HTMLElement>('.markdown > [data-line]'),
			].find((one) => one.getBoundingClientRect().bottom > top + 12);
			return Number(block?.dataset.line);
		});

	const sheet = (await page.locator('.sheet').boundingBox())!;
	await page.mouse.move(sheet.x + sheet.width / 2, sheet.y + sheet.height / 2);
	// A step at a time: Firefox hands Monaco a wheel of lines, not pixels.
	for (let i = 0; i < 10; i += 1) await page.mouse.wheel(0, 200);
	await expect.poll(sheetTop).toBeGreaterThan(12);
	await expect
		.poll(async () => Math.abs((await proofTop()) - (await sheetTop())))
		.toBeLessThan(4);

	const proof = (await page.locator('.proof').boundingBox())!;
	await page.mouse.move(proof.x + proof.width / 2, proof.y + proof.height / 2);
	for (let i = 0; i < 3; i += 1) await page.mouse.wheel(0, -200);
	await expect
		.poll(async () => Math.abs((await proofTop()) - (await sheetTop())))
		.toBeLessThan(4);
});

test('a link to a heading goes to it', async ({ page }) => {
	await editor(page);
	const filler = Array.from({ length: 60 }, (_, i) => `Line ${i}.`);
	await write(
		page,
		['[down](#the-far-end)', '', ...filler, '## The Far End'].join('\n'),
	);

	await page.locator('.proof a').click();
	await expect(page.locator('.proof h2')).toBeInViewport();
	// The page's own address is left alone: this is a jump, not a navigation.
	expect(new URL(page.url()).hash).toBe('');
});

test('a link to a document in the folder opens it there', async ({
	page,
	browserName,
}) => {
	test.skip(
		browserName !== 'firefox',
		'the input is the only way in from here',
	);

	const root = mkdtempSync(join(tmpdir(), 'linked-'));
	writeFileSync(
		join(root, 'start.md'),
		'# Start\n\n[on](Deeper/next%20one.md)',
	);
	mkdirSync(join(root, 'Deeper'));
	writeFileSync(join(root, 'Deeper', 'next one.md'), '# Next');
	writeFileSync(join(root, 'plain.txt'), '# not a heading');

	await editor(page);
	await snapshot(page, root);
	await page.getByRole('button', { name: 'start.md' }).click();
	await page.locator('.proof a').click();

	await expect.poll(() => words(page)).toBe('# Next');
	await expect(page.locator('.proof h1')).toHaveText('Next');

	// Not Markdown, so nothing is set and nothing is outlined.
	await page.getByRole('button', { name: 'plain.txt' }).click();
	await expect(page.locator('.proof')).toContainText(
		'Only a Markdown document',
	);
	await expect(page.locator('#outline')).toContainText(
		'Only a Markdown document has an outline.',
	);
});

/*
 * THE EXPLORER'S VERBS, as VS Code's explorer has them. Against a folder that
 * can be written to, and read back off the disk rather than off the rail, since
 * a row that says a thing was done is not the thing being done.
 */
function atPath(page: Page, path: string) {
	return page.evaluate(async (path) => {
		let dir = await (
			await navigator.storage.getDirectory()
		).getDirectoryHandle('Notes');
		const parts = path.split('/');
		const name = parts.pop()!;
		try {
			for (const part of parts) dir = await dir.getDirectoryHandle(part);
			return await (
				await dir.getFileHandle(name)
			)
				.getFile()
				.then((f) => f.text());
		} catch {
			return null;
		}
	}, path);
}

test('a new document is named in the tree, made, and opened', async ({
	page,
	browserName,
}) => {
	test.skip(browserName !== 'chromium', 'the picker is Chromium’s');

	await writableFolder(page, { 'one.md': 'first' });
	await page.getByRole('button', { name: 'New file' }).click();

	const box = page.getByRole('textbox', { name: 'Name of the new file' });
	await expect(box).toBeFocused();
	await box.fill('two.md');
	await box.press('Enter');

	const row = page.getByRole('button', { name: 'two.md' });
	await expect(row).toHaveAttribute('aria-current', 'true');
	await expect(row).toBeFocused();
	expect(await atPath(page, 'two.md')).toBe('');
});

test('a taken name is refused as it is typed, in VS Code’s words', async ({
	page,
	browserName,
}) => {
	test.skip(browserName !== 'chromium', 'the picker is Chromium’s');

	await writableFolder(page, { 'one.md': 'first' });
	await page.getByRole('button', { name: 'New file' }).click();

	const box = page.getByRole('textbox', { name: 'Name of the new file' });
	await box.fill('ONE.md');
	await expect(page.locator('#name-refusal')).toHaveText(
		'A file or folder ONE.md already exists at this location. Please choose a different name.',
	);
	await box.press('Enter');
	await expect(box).toBeVisible();

	await box.press('Escape');
	await expect(box).toHaveCount(0);
	expect(await atPath(page, 'one.md')).toBe('first');
});

test('a new folder, and a document made inside it', async ({
	page,
	browserName,
}) => {
	test.skip(browserName !== 'chromium', 'the picker is Chromium’s');

	await writableFolder(page, { 'one.md': 'first' });
	const notes = page.getByRole('button', { name: 'Notes', exact: true });
	await notes.hover();
	await page.getByRole('button', { name: 'New folder' }).click();
	const box = page.getByRole('textbox', { name: 'Name of the new folder' });
	await box.fill('Sub');
	await box.press('Enter');

	// A folder that was pressed is where the next new thing goes.
	await page.getByRole('button', { name: 'Sub' }).click();
	await notes.hover();
	await page.getByRole('button', { name: 'New file' }).click();
	const inner = page.getByRole('textbox', { name: 'Name of the new file' });
	await inner.fill('in.md');
	await inner.press('Enter');

	await expect(page.getByRole('button', { name: 'in.md' })).toBeVisible();
	expect(await atPath(page, 'Sub/in.md')).toBe('');
});

test('F2 renames a document, and it stays open under its new name', async ({
	page,
	browserName,
}) => {
	test.skip(browserName !== 'chromium', 'the picker is Chromium’s');

	await writableFolder(page, { 'one.md': 'first', 'two.md': 'second' });
	const row = page.getByRole('button', { name: 'one.md' });
	await row.click();
	await row.press('F2');

	// The name is chosen up to its extension, so typing keeps the kind of file.
	const box = page.getByRole('textbox', { name: 'Rename one.md' });
	expect(
		await box.evaluate((input: HTMLInputElement) => [
			input.selectionStart,
			input.selectionEnd,
		]),
	).toEqual([0, 3]);

	// Taken first, and refused; then free, and done.
	await box.pressSequentially('two');
	// The refusal's own alert: Monaco keeps live regions of its own on the page.
	await expect(page.locator('#name-refusal')).toContainText('already exists');
	await box.fill('renamed.md');
	await box.press('Enter');

	const renamed = page.getByRole('button', { name: 'renamed.md' });
	await expect(renamed).toHaveAttribute('aria-current', 'true');
	await expect.poll(() => words(page)).toBe('first');
	expect(await atPath(page, 'renamed.md')).toBe('first');
	expect(await atPath(page, 'one.md')).toBe(null);
	expect(await atPath(page, 'two.md')).toBe('second');
});

test('Delete asks first, and then deletes for good', async ({
	page,
	browserName,
}) => {
	test.skip(browserName !== 'chromium', 'the picker is Chromium’s');

	await writableFolder(page, { 'one.md': 'first' });
	const row = page.getByRole('button', { name: 'one.md' });
	await row.click();
	await row.press('Delete');

	const dialog = page.getByRole('dialog');
	await expect(dialog).toContainText(
		'Are you sure you want to permanently delete ‘one.md’?',
	);
	await expect(dialog.getByRole('button', { name: 'Delete' })).toBeFocused();

	// Escape is a no, and the focus comes back to the row.
	await page.keyboard.press('Escape');
	await expect(dialog).toBeHidden();
	await expect(row).toBeFocused();
	expect(await atPath(page, 'one.md')).toBe('first');

	await row.press('Delete');
	await dialog.getByRole('button', { name: 'Delete' }).click();
	await expect(row).toHaveCount(0);
	expect(await atPath(page, 'one.md')).toBe(null);

	// It was on the sheet, and the sheet goes back to the scratch note.
	await expect(
		page.getByRole('button', { name: 'Ephemeral 0' }),
	).toHaveAttribute('aria-current', 'true');
});

test('the context menu offers the verbs, and gives the focus back', async ({
	page,
	browserName,
}) => {
	test.skip(browserName !== 'chromium', 'the picker is Chromium’s');

	await writableFolder(page, { 'one.md': 'first' });
	const row = page.getByRole('button', { name: 'one.md' });
	await row.click({ button: 'right' });

	const menu = page.getByRole('menu');
	await expect(menu.getByRole('menuitem')).toHaveText([
		'New File…',
		'New Folder…',
		'Cut Ctrl+X',
		'Copy Ctrl+C',
		'Copy Relative Path Ctrl+K Ctrl+Shift+C',
		'Rename… F2',
		'Delete Delete',
	]);
	await expect(menu.getByRole('menuitem').first()).toBeFocused();

	await page.keyboard.press('ArrowUp');
	await expect(menu.getByRole('menuitem').last()).toBeFocused();

	await page.keyboard.press('Escape');
	await expect(menu).toHaveCount(0);
	await expect(row).toBeFocused();

	// From the menu to the name box, which is where the focus has to land.
	await row.click({ button: 'right' });
	await menu.getByRole('menuitem', { name: 'Rename…' }).click();
	await expect(
		page.getByRole('textbox', { name: 'Rename one.md' }),
	).toBeFocused();
});

test('a folder that cannot be written to offers none of the verbs', async ({
	page,
	browserName,
}) => {
	test.skip(
		browserName !== 'firefox',
		'the input is the only way in from here',
	);

	await editor(page);
	await snapshot(page, fixtureFolder());
	const row = page.getByRole('button', { name: 'Notes.txt' });
	await expect(row).toBeVisible();

	await expect(page.getByRole('button', { name: 'New file' })).toHaveCount(0);
	// It can be read, so its path can be copied; nothing else.
	await row.click({ button: 'right' });
	await expect(page.getByRole('menu').getByRole('menuitem')).toHaveText([
		'Copy Relative Path Ctrl+K Ctrl+Shift+C',
	]);
	await page.keyboard.press('Escape');
	await row.press('F2');
	await expect(page.locator('.naming input')).toHaveCount(0);
});

/*
 * MOVING, VS Code's two ways: a drag, which asks first until told not to, and
 * cut and paste, which is the keyboard's way and does not ask.
 */
async function withSub(page: Page) {
	await writableFolder(page, { 'one.md': 'first' });
	await page.evaluate(async () => {
		const root = await (
			await navigator.storage.getDirectory()
		).getDirectoryHandle('Notes');
		await root.getDirectoryHandle('Sub', { create: true });
	});
	// Handed over again, so the rail reads the folder made behind its back.
	await putAway(page, 'Notes');
	await page
		.getByRole('button', { name: 'Open a folder from this device' })
		.click();
	await page.getByRole('button', { name: 'Notes', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Sub' })).toBeVisible();
}

test('a document dragged onto a folder moves into it, once asked', async ({
	page,
	browserName,
}) => {
	test.skip(browserName !== 'chromium', 'the picker is Chromium’s');

	await withSub(page);
	const one = page.getByRole('button', { name: 'one.md' });
	await one.click();
	await one.dragTo(page.getByRole('button', { name: 'Sub' }));

	const dialog = page.getByRole('dialog');
	await expect(dialog).toContainText(
		'Are you sure you want to move ‘one.md’ into ‘Sub’?',
	);
	await dialog.getByRole('checkbox', { name: 'Do not ask me again' }).check();
	await dialog.getByRole('button', { name: 'Move' }).click();

	// Moved on the disk, and the open document went with it.
	expect(await atPath(page, 'Sub/one.md')).toBe('first');
	expect(await atPath(page, 'one.md')).toBe(null);
	await expect(page.getByRole('button', { name: 'one.md' })).toHaveAttribute(
		'aria-current',
		'true',
	);
	await expect.poll(() => words(page)).toBe('first');

	// Told not to ask, it does not: back out to the top, at once.
	await page
		.getByRole('button', { name: 'one.md' })
		.dragTo(page.getByRole('button', { name: 'Notes', exact: true }));
	await expect(dialog).toBeHidden();
	await expect.poll(() => atPath(page, 'one.md')).toBe('first');
});

test('cut and paste moves without asking, and a taken name is refused', async ({
	page,
	browserName,
}) => {
	const mod = await modifier(page);
	test.skip(browserName !== 'chromium', 'the picker is Chromium’s');

	await withSub(page);
	const one = page.getByRole('button', { name: 'one.md' });
	await one.focus();
	await page.keyboard.press(`${mod.key}+x`);
	await expect(one).toHaveClass(/cut/);

	const sub = page.getByRole('button', { name: 'Sub' });
	await sub.focus();
	await page.keyboard.press(`${mod.key}+v`);
	await expect(page.getByRole('dialog')).toBeHidden();
	await expect.poll(() => atPath(page, 'Sub/one.md')).toBe('first');

	// A second one.md cannot go where the first now is.
	await page.getByRole('button', { name: 'New file' }).click();
	const box = page.getByRole('textbox', { name: 'Name of the new file' });
	await box.fill('one.md');
	await box.press('Enter');
	const top = page.locator('button[title="one.md"]');
	await top.focus();
	await page.keyboard.press(`${mod.key}+x`);
	await page.locator('button[title="Sub/one.md"]').focus();
	await page.keyboard.press(`${mod.key}+v`);
	// The page's notice, and not one of Monaco's own live regions.
	await expect(page.locator('.notice')).toHaveText(
		'A file or folder one.md already exists in the destination folder.',
	);
	expect(await atPath(page, 'one.md')).toBe('');
});

test('a folder on this device is not offered a rename or a move', async ({
	page,
	browserName,
}) => {
	test.skip(browserName !== 'chromium', 'the picker is Chromium’s');

	await withSub(page);
	const sub = page.getByRole('button', { name: 'Sub' });
	await sub.click({ button: 'right' });
	// Copied, as vscode.dev copies a folder here; not cut, renamed or moved.
	// Nothing in it is open, so it offers Expand All and not Collapse All.
	await expect(page.getByRole('menu').getByRole('menuitem')).toHaveText([
		'Expand All',
		'New File…',
		'New Folder…',
		'Copy Ctrl+C',
		'Copy Relative Path Ctrl+K Ctrl+Shift+C',
		'Delete Delete',
	]);
});

/*
 * A PICTURE IN THE FOLDER, shown in the proof from the folder's own bytes, and
 * never asked of this site, which does not have it. A one-pixel PNG, written
 * alongside the documents.
 */
const PIXEL =
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

async function withPicture(page: Page, doc: string) {
	await writableFolder(page, { 'doc.md': doc });
	await page.evaluate(async (pixel) => {
		const root = await (
			await navigator.storage.getDirectory()
		).getDirectoryHandle('Notes');
		const bytes = Uint8Array.from(atob(pixel), (c) => c.charCodeAt(0));
		const writable = await (
			await root.getFileHandle('pic.png', { create: true })
		).createWritable();
		await writable.write(bytes);
		await writable.close();
	}, PIXEL);
	await putAway(page, 'Notes');
	await page
		.getByRole('button', { name: 'Open a folder from this device' })
		.click();
	await page.getByRole('button', { name: 'Notes', exact: true }).click();
}

test('a picture beside a document is shown from the folder', async ({
	page,
	browserName,
}) => {
	test.skip(browserName !== 'chromium', 'the picker is Chromium’s');

	const asked: string[] = [];
	page.on('request', (request) => {
		if (request.url().includes('pic.png')) asked.push(request.url());
	});

	await withPicture(page, '![here](pic.png)\n\n![top](/pic.png)');
	await page.getByRole('button', { name: 'doc.md' }).click();

	const pictures = page.locator('.proof img');
	await expect(pictures).toHaveCount(2);
	for (const picture of await pictures.all()) {
		await expect(picture).toHaveAttribute('src', /^blob:/);
		await expect
			.poll(() => picture.evaluate((img: HTMLImageElement) => img.naturalWidth))
			.toBe(1);
	}
	expect(asked).toEqual([]);
});

test('a file this editor cannot open can still be deleted', async ({
	page,
	browserName,
}) => {
	test.skip(browserName !== 'chromium', 'the picker is Chromium’s');

	await withPicture(page, '');
	const row = page.getByRole('button', { name: 'pic.png' });
	await expect(row).toHaveAttribute('aria-disabled', 'true');
	await row.focus();
	await page.keyboard.press('Delete');
	await page
		.getByRole('dialog')
		.getByRole('button', { name: 'Delete' })
		.click();

	await expect(row).toHaveCount(0);
	expect(await atPath(page, 'pic.png')).toBe(null);
});

/*
 * CODE IN COLOUR, VS Code's own, and only once a fence names a language: a
 * document without one never fetches highlight.js at all.
 */
test('a fence that names a language is coloured as VS Code colours it', async ({
	page,
}) => {
	const fetched: string[] = [];
	page.on('request', (request) => {
		// highlight.js, and not Monaco's own highlightDecorations.css.
		if (/highlight[._]js/.test(request.url())) fetched.push(request.url());
	});

	await editor(page);
	await write(page, '```\nplain\n```');
	await expect(page.locator('.proof pre')).toHaveText('plain');
	expect(fetched).toEqual([]);

	await write(page, '```js\nconst wand = "it"; // kept\n```');
	const keyword = page.locator('.proof .hljs-keyword');
	await expect(keyword).toHaveText('const');
	// The light theme's keyword, #00f, from VS Code's highlight.css.
	await expect(keyword).toHaveCSS('color', 'rgb(0, 0, 255)');
	await expect(page.locator('.proof .hljs-comment')).toHaveCSS(
		'font-style',
		'italic',
	);
	// And vs2015's in dark.
	await page.emulateMedia({ colorScheme: 'dark' });
	await expect(keyword).toHaveCSS('color', 'rgb(86, 156, 214)');
});

/*
 * ON A PHONE THE SHEET IS A TEXTAREA, since Monaco does not support mobile
 * browsers. Chromium only, which is the engine that can be told it is a phone.
 * These keep the textarea's own traps covered: the ground it paints by default,
 * the descender's space under it, and the caret Chromium will not scroll to.
 */
test.describe('on a phone', () => {
	test.use({
		isMobile: true,
		hasTouch: true,
		viewport: { width: 412, height: 800 },
	});
	test.skip(({ browserName }) => browserName !== 'chromium', 'Chromium only');

	test('the sheet is a textarea, and Monaco is never loaded', async ({
		page,
	}) => {
		const fetched: string[] = [];
		page.on('request', (request) => {
			if (request.url().includes('monaco')) fetched.push(request.url());
		});
		await editor(page);
		const sheet = page.locator('.sheet textarea');
		await sheet.fill('# On a phone');
		await expect(page.locator('#outline li button')).toHaveText(['On a phone']);
		await expect(page.locator('.sheet .monaco-editor')).toHaveCount(0);
		expect(fetched).toEqual([]);
	});

	test('the textarea paints no ground of its own, in dark', async ({
		page,
	}) => {
		await page.emulateMedia({ colorScheme: 'dark' });
		await editor(page);
		const ground = await page
			.locator('.sheet textarea')
			.evaluate((area) => getComputedStyle(area).backgroundColor);
		expect(ground).toBe('rgba(0, 0, 0, 0)');
	});

	/*
	 * THE BAR IS A BUTTON IN THE CORNER here: see src/lib/components/Fab.svelte.
	 * Split is not offered upright, the big key goes between writing and
	 * reading, and the button steps aside while somebody types.
	 */
	test('the bar gives way to a button that switches views', async ({
		page,
	}) => {
		await editor(page);
		await expect(page.locator('header')).toBeHidden();
		await expect(page.locator('.area')).toHaveAttribute('data-view', 'edit');

		await page.getByRole('button', { name: 'Read it set' }).tap();
		await expect(page.locator('.area')).toHaveAttribute('data-view', 'preview');
		await page.getByRole('button', { name: 'Back to writing' }).tap();

		await page.locator('.sheet textarea').tap();
		await page.keyboard.type('a');
		await expect(page.locator('.fab')).toHaveCSS('visibility', 'hidden');
		await expect(page.locator('.fab')).toHaveCSS('visibility', 'visible');
	});

	test('a heading in the outline scrolls the textarea to it', async ({
		page,
	}) => {
		await editor(page);
		const filler = Array.from({ length: 120 }, (_, i) => `Line ${i}.\n`);
		const sheet = page.locator('.sheet textarea');
		await sheet.fill(
			['[down](#middle)', '', ...filler, '## Middle'].join('\n'),
		);

		// The outline is a sheet on a phone, asked for from the corner button,
		// and it goes away once a heading is chosen.
		await page.getByRole('button', { name: 'More' }).tap();
		await page.getByRole('button', { name: 'Outline' }).tap();
		await page.getByRole('button', { name: 'Middle', exact: true }).tap();
		await expect(page.locator('#outline')).toBeHidden();
		const seen = await sheet.evaluate((area: HTMLTextAreaElement) => ({
			caret: area.selectionStart,
			line: area.value.indexOf('## Middle'),
			top: area.scrollTop,
		}));
		expect(seen.caret).toBe(seen.line);
		expect(seen.top).toBeGreaterThan(0);
	});
});

/*
 * COPYING, as VS Code's explorer copies: Ctrl+C and Ctrl+V, a copy that keeps
 * its name where it is free and takes VS Code's "copy" name where it is not,
 * and a drag with Ctrl held. Read back off the disk.
 */
test('a pasted copy takes a "copy" name, and pastes again', async ({
	page,
	browserName,
}) => {
	const mod = await modifier(page);
	test.skip(browserName !== 'chromium', 'the picker is Chromium’s');

	await withSub(page);
	const one = page.getByRole('button', { name: 'one.md' });
	await one.click();

	// Typed and not yet saved: the copy is of what is on the screen.
	await freeze(page);
	await write(page, 'typed');

	await one.focus();
	await page.keyboard.press(`${mod.key}+c`);
	await page.keyboard.press(`${mod.key}+v`);
	await expect(page.getByRole('button', { name: 'one copy.md' })).toBeFocused();
	await page.keyboard.press(`${mod.key}+v`);
	await expect(
		page.getByRole('button', { name: 'one copy 2.md' }),
	).toBeFocused();

	expect(await atPath(page, 'one copy.md')).toBe('typed');
	expect(await atPath(page, 'one copy 2.md')).toBe('typed');

	// Into another folder, where the name is free, it keeps it.
	await page.getByRole('button', { name: 'Sub' }).focus();
	await page.keyboard.press(`${mod.key}+v`);
	await expect.poll(() => atPath(page, 'Sub/one.md')).toBe('typed');
	expect(await atPath(page, 'one.md')).toBe('typed');
});

test('a folder is copied with everything in it', async ({
	page,
	browserName,
}) => {
	const mod = await modifier(page);
	test.skip(browserName !== 'chromium', 'the picker is Chromium’s');

	await writableFolder(page, { 'one.md': 'first' });
	await page.evaluate(async () => {
		const root = await (
			await navigator.storage.getDirectory()
		).getDirectoryHandle('Notes');
		const sub = await root.getDirectoryHandle('Sub', { create: true });
		const deeper = await sub.getDirectoryHandle('Deeper', { create: true });
		const writable = await (
			await deeper.getFileHandle('in.md', { create: true })
		).createWritable();
		await writable.write('nested');
		await writable.close();
	});
	await putAway(page, 'Notes');
	await page
		.getByRole('button', { name: 'Open a folder from this device' })
		.click();
	await page.getByRole('button', { name: 'Notes', exact: true }).click();

	const sub = page.getByRole('button', { name: 'Sub', exact: true });
	await sub.click({ button: 'right' });
	await page.getByRole('menuitem', { name: 'Copy Ctrl+C' }).click();
	await page.getByRole('button', { name: 'one.md' }).focus();
	await page.keyboard.press(`${mod.key}+v`);

	await expect.poll(() => atPath(page, 'Sub copy/Deeper/in.md')).toBe('nested');

	// Drawn shut, and holding what was copied once opened.
	const copy = page.getByRole('button', { name: 'Sub copy' });
	await expect(copy).toHaveAttribute('aria-expanded', 'false');
	await copy.click();
	await page.getByRole('button', { name: 'Deeper' }).last().click();
	await expect(
		page.locator('button[title="Sub copy/Deeper/in.md"]'),
	).toBeVisible();

	// And never into itself.
	await sub.focus();
	await page.keyboard.press(`${mod.key}+c`);
	await sub.click();
	await page.locator('button[title="Sub/Deeper"]').focus();
	await page.keyboard.press(`${mod.key}+v`);
	await expect(page.locator('.notice')).toHaveText(
		'A folder cannot be copied into itself.',
	);
});

test('a drag with Ctrl held copies, and does not ask', async ({
	page,
	browserName,
}) => {
	const mod = await modifier(page);
	test.skip(browserName !== 'chromium', 'the picker is Chromium’s');
	// A page that believes it is on Windows wants Ctrl held, and on a Mac
	// Control with a press is a right-click, so no drag starts at all.
	test.skip(
		process.platform === 'darwin' && mod.copy === 'Control',
		'a Mac cannot drag with Control held',
	);

	// Option on a Mac, as in VS Code and the Finder; see `copying` in the page.
	const copy = mod.copy;
	await withSub(page);
	await page.keyboard.down(copy);
	await page
		.getByRole('button', { name: 'one.md' })
		.dragTo(page.getByRole('button', { name: 'Sub' }));
	await page.keyboard.up(copy);

	await expect(page.getByRole('dialog')).toBeHidden();
	await expect.poll(() => atPath(page, 'Sub/one.md')).toBe('first');
	expect(await atPath(page, 'one.md')).toBe('first');
});

test('Copy Relative Path puts the path on the clipboard', async ({
	page,
	context,
	browserName,
}) => {
	const mod = await modifier(page);
	test.skip(browserName !== 'chromium', 'the picker is Chromium’s');
	await context.grantPermissions(['clipboard-read', 'clipboard-write']);

	await withSub(page);
	await page
		.getByRole('button', { name: 'one.md' })
		.dragTo(page.getByRole('button', { name: 'Sub' }));
	await page.getByRole('dialog').getByRole('button', { name: 'Move' }).click();

	// VS Code's chord: Ctrl+K, then Ctrl+Shift+C.
	const row = page.locator('button[title="Sub/one.md"]');
	await row.focus();
	await page.keyboard.press(`${mod.key}+k`);
	await page.keyboard.press(`${mod.key}+Shift+c`);
	await expect
		.poll(() => page.evaluate(() => navigator.clipboard.readText()))
		.toBe('Sub/one.md');
});

/*
 * VS CODE'S KEYS FOR THE WINDOW, each asked twice where it matters: with the
 * caret in Monaco, which has them as its own actions, and from anywhere else
 * on the page, which answers them itself.
 */
/* By the browser's own platform, which is what the page reads: the desktop
 * devices say Windows whatever machine the test runs on. */
const newNoteKeys = async (page: Page) => {
	const agent = await page.evaluate(() => navigator.userAgent);
	return /Windows/.test(agent)
		? ['Control+k', 'n']
		: [/Mac/.test(agent) ? 'Meta+Alt+n' : 'Control+Alt+n'];
};

test('Alt+Z turns wrapping off and on, from the sheet or anywhere', async ({
	page,
}) => {
	await editor(page);
	await write(page, 'word '.repeat(200).trim());
	const lines = page.locator('.sheet .view-line');
	await expect.poll(() => lines.count()).toBeGreaterThan(1);

	await page.keyboard.press('Alt+z');
	await expect(lines).toHaveCount(1);

	await page.getByRole('button', { name: 'Ephemeral 0' }).focus();
	await page.keyboard.press('Alt+z');
	await expect.poll(() => lines.count()).toBeGreaterThan(1);
});

test('the preview and panel keys are VS Code’s', async ({ page }) => {
	const mod = await modifier(page);
	await editor(page);
	await write(page, '# Keys');
	const pressedView = (name: string) =>
		expect(page.getByRole('button', { name, exact: true })).toHaveAttribute(
			'aria-pressed',
			'true',
		);

	// From the sheet.
	await page.keyboard.press(`${mod.key}+Shift+v`);
	await pressedView('Preview');
	// And from the page, since the sheet is gone in Preview.
	await page.keyboard.press(`${mod.key}+Shift+v`);
	await pressedView('Edit');
	await page.keyboard.press(`${mod.key}+k`);
	await page.keyboard.press('v');
	await pressedView('Split');

	await page.keyboard.press(`${mod.key}+b`);
	await expect(page.locator('#workspace')).toBeHidden();
	await page.keyboard.press(`${mod.key}+b`);
	await expect(page.locator('#workspace')).toBeVisible();
	await page.keyboard.press(`${mod.key}+Alt+b`);
	await expect(page.locator('#outline')).toBeHidden();
});

test('a new untitled note from vscode.dev’s key', async ({ page }) => {
	await editor(page);
	await page.getByRole('button', { name: 'Ephemeral 0' }).focus();
	for (const key of await newNoteKeys(page)) await page.keyboard.press(key);
	await expect(
		page.getByRole('button', { name: 'Ephemeral 1' }),
	).toHaveAttribute('aria-current', 'true');
});

test('Ctrl+Shift+O lists the headings, and sections fold', async ({ page }) => {
	const mod = await modifier(page);
	await editor(page);
	await write(page, '# One\n\nWords.\n\n## Two\n\n```js\nconst a = 1;\n```');

	// Folding: a section under each heading, and the block of code.
	await expect(page.locator('.sheet .codicon-folding-expanded')).toHaveCount(3);

	await page.keyboard.press(`${mod.key}+Shift+o`);
	const picker = page.locator('.sheet .quick-input-widget');
	await expect(picker).toBeVisible();
	await expect(picker).toContainText('# One');
	await expect(picker).toContainText('## Two');
});

test('Ctrl+P goes to a file, the latest first', async ({
	page,
	browserName,
}) => {
	const mod = await modifier(page);
	test.skip(browserName !== 'chromium', 'the picker is Chromium’s');

	await writableFolder(page, { 'one.md': 'first', 'two.md': 'second' });
	await page.getByRole('button', { name: 'one.md' }).click();

	await page.keyboard.press(`${mod.key}+p`);
	const search = page.getByRole('combobox', { name: 'Search files by name' });
	await expect(search).toBeFocused();
	// Nothing typed: what was opened last leads.
	await expect(page.getByRole('option').first()).toContainText('one.md');

	await search.fill('tw');
	await expect(page.getByRole('option')).toHaveCount(1);
	await search.press('Enter');
	await expect(page.getByRole('button', { name: 'two.md' })).toHaveAttribute(
		'aria-current',
		'true',
	);
	await expect.poll(() => words(page)).toBe('second');
});

test('Ctrl+S saves at once, and Ctrl+Shift+E finds the file', async ({
	page,
	browserName,
}) => {
	const mod = await modifier(page);
	test.skip(browserName !== 'chromium', 'the picker is Chromium’s');

	await writableFolder(page, { 'one.md': 'first' });
	await page.getByRole('button', { name: 'one.md' }).click();
	await freeze(page);
	await write(page, 'saved');

	await page.keyboard.press(`${mod.key}+s`);
	await expect.poll(() => atPath(page, 'one.md')).toBe('saved');

	await page.keyboard.press(`${mod.key}+Shift+e`);
	await expect(page.getByRole('button', { name: 'one.md' })).toBeFocused();
});

/*
 * ONE DOCUMENT, WITHOUT ITS FOLDER. It sits with the scratch notes, opens on
 * the sheet, saves back to the file it came from, and closes with its own ×.
 */
test('a single file opens with the notes, and saves where it came from', async ({
	page,
	browserName,
}) => {
	const mod = await modifier(page);
	test.skip(browserName !== 'chromium', 'the picker is Chromium’s');

	await page.addInitScript(() => {
		window.showOpenFilePicker = async () => [
			await (
				await navigator.storage.getDirectory()
			).getFileHandle('alone.md', { create: true }),
		];
	});
	await editor(page);
	await page
		.getByRole('button', { name: 'Open a file from this device' })
		.click();

	const row = page.getByRole('button', { name: 'alone.md' });
	await expect(row).toHaveAttribute('aria-current', 'true');

	await write(page, 'on its own');
	await expect
		.poll(() =>
			page.evaluate(async () =>
				(
					await (
						await (
							await navigator.storage.getDirectory()
						).getFileHandle('alone.md')
					).getFile()
				).text(),
			),
		)
		.toContain('on its own');

	// Go to File finds it by name, with its section beside it.
	await page.keyboard.press(`${mod.key}+p`);
	await page
		.getByRole('combobox', { name: 'Search files by name' })
		.fill('alone');
	await expect(page.getByRole('option')).toHaveCount(1);
	await expect(page.getByRole('option')).toContainText('Files');
	await page.keyboard.press('Escape');

	// Kept for the next visit: its grant here survives, so it is simply back.
	await page.reload();
	await expect(row).toBeVisible();

	await row.hover();
	await page.getByRole('button', { name: 'Close alone.md' }).click();
	await expect(row).toHaveCount(0);

	// Closed is forgotten, as a folder put away is — once the list is written.
	await expect
		.poll(() =>
			page.evaluate(
				() =>
					new Promise<number>((resolve) => {
						const open = indexedDB.open('text-editor');
						open.onsuccess = () => {
							const get = open.result
								.transaction('folder')
								.objectStore('folder')
								.get('roots');
							get.onsuccess = () => resolve((get.result ?? []).length);
						};
					}),
			),
		)
		.toBe(0);
	await page.reload();
	await expect(page.locator('.workspace[data-ready]')).toBeVisible();
	await expect(page.getByText('No file open.')).toBeVisible();
	await expect(row).toHaveCount(0);
});

/* Forgetting a drive asks first, and a cancel keeps it. */
test('forgetting a drive asks first', async ({ page }) => {
	await page.addInitScript(() => {
		const open = indexedDB.open('text-editor', 2);
		open.onupgradeneeded = () => {
			const db = open.result;
			if (!db.objectStoreNames.contains('drives'))
				db.createObjectStore('drives');
			if (!db.objectStoreNames.contains('vault')) db.createObjectStore('vault');
		};
		open.onsuccess = () => {
			const tx = open.result.transaction('drives', 'readwrite');
			tx.objectStore('drives').put(
				{
					id: 'https://cloud.example.com|someone',
					name: 'cloud.example.com',
					base: 'https://cloud.example.com',
					user: 'someone',
					via: 'proxy',
					root: '',
					keep: false,
				},
				'https://cloud.example.com|someone',
			);
		};
	});
	await editor(page);

	const drive = page.getByRole('button', {
		name: 'cloud.example.com',
		exact: true,
	});
	await expect(drive).toBeVisible();
	await drive.hover();
	await page.getByRole('button', { name: 'Forget cloud.example.com' }).click();

	const dialog = page.getByRole('dialog');
	await expect(dialog).toContainText('forget ‘cloud.example.com’');
	await dialog.getByRole('button', { name: 'Cancel' }).click();
	await expect(drive).toBeVisible();

	await drive.hover();
	await page.getByRole('button', { name: 'Forget cloud.example.com' }).click();
	await dialog.getByRole('button', { name: 'Forget' }).click();
	await expect(drive).toHaveCount(0);
});
