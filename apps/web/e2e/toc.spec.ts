import { expect, test } from '@playwright/test';

/*
 * The emoji TOC — the one piece of this site that could not be checked by hand
 * at all. Its active mark is scheduled on a frame, and a background tab has no
 * frames, so a browser sitting behind another window reports nothing. A test
 * page is always visible, which is the whole reason this file can exist.
 *
 * The rail appears at 70rem, so the tests that examine it need a window wider
 * than that, and the one that checks it is absent needs one narrower.
 */

const WIDE = { width: 1400, height: 900 };
const NARROW = { width: 900, height: 900 };

/*
 * The page is prerendered, so its links and headings are all in the HTML before
 * Svelte has taken it over. The mark is written by a client-only effect, so its
 * arrival is the signal that the page is live — without waiting for it a test
 * can follow a link before anything is listening and then blame the page for
 * the answer it got.
 */
async function open(page: import('@playwright/test').Page, size = WIDE) {
	await page.setViewportSize(size);
	await page.goto('/emoji-viewer');
	await page
		.locator('.toc a[aria-current="location"]')
		.first()
		.waitFor({ state: 'attached' });
}

test('the rail stands outside the letter, on the end side', async ({
	page,
}) => {
	await open(page);

	const prose = (await page.locator('.prose').boundingBox())!;
	const rail = (await page.locator('.rail').boundingBox())!;

	// Just past the prose's end edge, by one --space-l, and spanning the whole
	// column so the sticky list has its full height to travel in.
	expect(Math.round(rail.x - (prose.x + prose.width))).toBe(24);
	expect(Math.round(rail.width)).toBe(176);
	expect(Math.round(rail.height)).toBe(Math.round(prose.height));
});

test('the rail keeps out of the way when there is no margin to stand in', async ({
	page,
}) => {
	await open(page, NARROW);

	await expect(page.locator('.rail')).toBeHidden();

	// Nothing is lost but a shortcut: the groups are still headings, so heading
	// navigation and find-in-page still reach every one of them.
	await expect(page.getByRole('heading', { level: 2 })).toHaveCount(9);
});

test('the list stops short of the bar instead of sliding under it', async ({
	page,
}) => {
	await open(page);
	await page.evaluate(() => window.scrollTo(0, 2000));

	const toc = (await page.locator('.toc').boundingBox())!;
	const header = (await page.locator('header').boundingBox())!;
	const search = (await page.locator('.search').boundingBox())!;

	// It comes to rest CLEAR of the bar, a step below it rather than against it.
	expect(toc.y).toBeGreaterThan(header.height);

	/*
	 * And on the same line as the search field. Both offsets are written as the
	 * same expression, and this is the assertion that says so — the step of air
	 * was once on one and not the other, which put them on different lines and
	 * looked like a mistake because it was one.
	 */
	expect(Math.round(toc.y)).toBe(Math.round(search.y));

	// Stated as CSS too, so a change to one that is not made to the other fails
	// here rather than merely looking wrong to somebody.
	const offsets = await page.evaluate(() => [
		getComputedStyle(document.querySelector('.toc')!).insetBlockStart,
		getComputedStyle(document.querySelector('.search')!).insetBlockStart,
	]);
	expect(offsets[0]).toBe(offsets[1]);
});

/*
 * THE TEST THAT COULD NOT BE RUN BY HAND. The mark is recomputed on a frame,
 * and the browser it was written in was behind another window the whole time,
 * so `requestAnimationFrame` never fired and the mark never moved. It looked
 * like a bug in the page and was a bug in the method.
 */
test('the mark follows the reader down the wall', async ({ page }) => {
	await open(page);

	const active = () =>
		page.locator('.toc a[aria-current="location"]').getAttribute('href');

	// At rest, before any heading has reached the bar, the first group is the one
	// being read towards.
	expect(await active()).toBe('#smileys-emotion');

	/*
	 * The scroll positions are ASKED FOR, not written down. How far down the page
	 * a group sits depends on how many columns the wall got, which depends on the
	 * window — so a table of numbers here would be a table measured at one width
	 * and wrong at every other.
	 *
	 * For each group: scroll until its heading sits exactly on the bar's lower
	 * edge, which is the line the page uses to decide. The last groups may be
	 * unreachable — a page cannot scroll past its end — and those are skipped
	 * rather than quietly passed.
	 */
	const ids = await page
		.locator('.group')
		.evaluateAll((els) => els.map((el) => el.id));
	const reached: string[] = [];

	for (const id of ids) {
		const landed = await page.evaluate((name) => {
			const el = document.getElementById(name)!;
			const bar = document
				.querySelector('header')!
				.getBoundingClientRect().height;
			const target = el.getBoundingClientRect().top + window.scrollY - bar;
			window.scrollTo(0, target);
			// Did the page actually go there, or did it run out of length?
			return Math.abs(window.scrollY - target) < 2;
		}, id);

		if (!landed) continue;
		reached.push(id);
		await expect
			.poll(active, { message: `heading ${id} on the line` })
			.toBe(`#${id}`);
	}

	// If the walk never got past the first group the test proved nothing.
	expect(reached.length).toBeGreaterThan(4);
});

test('exactly one group is ever marked', async ({ page }) => {
	await open(page);
	await page.evaluate(() => window.scrollTo(0, 2200));

	await expect(page.locator('.toc a[aria-current="location"]')).toHaveCount(1);
});

test('following a link lands the heading clear of the bar', async ({
	page,
}) => {
	await open(page);

	for (const id of ['travel-places', 'symbols']) {
		await page.locator(`.toc a[href="#${id}"]`).click();

		const heading = (await page.locator(`#${id}`).boundingBox())!;
		const header = (await page.locator('header').boundingBox())!;

		// THE RULE, and it holds wherever the heading ends up: without
		// `scroll-padding-block-start` the browser puts the target at the very top
		// of the window, which on this site is behind the bar — the one thing the
		// reader asked to see would be the one thing hidden.
		expect(heading.y).toBeGreaterThanOrEqual(header.height);

		/*
		 * The exact landing, but ONLY where the page had room to make it. A jump
		 * near the end of a document stops at the end of the document, and the
		 * heading then sits lower than the padding asked for — which is the browser
		 * being right, not wrong. Firefox draws the wall taller than Chromium does,
		 * so it runs out on a jump where Chromium does not, and an unconditional
		 * `toBe(92)` here was a test that only knew one engine.
		 */
		const atEnd = await page.evaluate(
			() =>
				window.scrollY >=
				document.documentElement.scrollHeight - window.innerHeight - 1,
		);
		/*
		 * The landing is ASKED FOR, not written down: the document's scroll padding
		 * plus this heading's own scroll margin. Hardcoding 92 was right until the
		 * search field began to stay under the bar and the headings had to clear
		 * that too — at which point the number moved and the test was measuring a
		 * layout that no longer existed.
		 *
		 * Within a pixel. Firefox rounds a fractional landing differently from
		 * Chromium, and a test that insists on one of the two answers is testing
		 * the rounding rather than the padding.
		 */
		const expected = await page.evaluate((name) => {
			const root = getComputedStyle(document.documentElement);
			const el = document.getElementById(name)!;
			return (
				Number.parseFloat(root.scrollPaddingTop) +
				Number.parseFloat(getComputedStyle(el).scrollMarginTop)
			);
		}, id);

		if (!atEnd) expect(Math.abs(heading.y - expected)).toBeLessThanOrEqual(1);
	}
});

test('the search field stays put, a step below the bar', async ({ page }) => {
	await open(page);

	const field = page.locator('.search');
	await page.evaluate(() => window.scrollTo(0, 2500));

	const box = (await field.boundingBox())!;
	const header = (await page.locator('header').boundingBox())!;

	// A step clear of the bar rather than seated against it.
	expect(box.y).toBeGreaterThan(header.height);

	// And opaque, or the emojis would scroll through whatever is being typed.
	// Compared against the PAGE's own background rather than a colour: these run
	// in light mode by default and the site has two.
	const [fieldBg, pageBg] = await page.evaluate(() => [
		getComputedStyle(document.querySelector('.search')!).backgroundColor,
		getComputedStyle(document.documentElement).backgroundColor,
	]);
	expect(fieldBg).toBe(pageBg);
});

test('a heading clears the bar AND the field that stays under it', async ({
	page,
}) => {
	await open(page);

	for (const id of ['animals-nature', 'activities']) {
		await page.locator(`.toc a[href="#${id}"]`).click();

		const heading = (await page.locator(`#${id}`).boundingBox())!;
		const field = (await page.locator('.search').boundingBox())!;

		// The heading has two things to get past now, not one. Landing it behind
		// the search would hide the very thing the reader asked to see.
		expect(heading.y).toBeGreaterThanOrEqual(field.y + field.height);
	}
});

/*
 * THE MARK MUST AGREE WITH THE JUMP, which it did not.
 *
 * Following "Animals & Nature" scrolled to the right heading and then marked
 * "People & Gestures". Two numbers were deciding: the browser landed the
 * heading at `scroll-padding-block-start` (92px), while the mark asked which
 * heading had passed the bar's lower edge (77px). The heading a reader had just
 * asked for sat below the deciding line, so the group above it stayed marked.
 */
test('following a link marks the group it lands on', async ({ page }) => {
	await open(page);

	for (const id of ['animals-nature', 'food-drink', 'activities']) {
		await page.locator(`.toc a[href="#${id}"]`).click();

		await expect
			.poll(
				() =>
					page.locator('.toc a[aria-current="location"]').getAttribute('href'),
				{ message: `after following #${id}` },
			)
			.toBe(`#${id}`);
	}
});

test('the marked group is told apart by more than its colour', async ({
	page,
}) => {
	await open(page);

	const marked = page.locator('.toc a[aria-current="location"]');
	// The accent alone would not do it: yellow on white is 1.4:1, so the mark is
	// a rule beside the words and the words come back to full strength as well.
	await expect(marked).toHaveCSS('border-left-color', 'rgb(255, 214, 10)');

	const unmarked = page.locator('.toc a:not([aria-current])').first();
	await expect(unmarked).toHaveCSS('border-left-color', 'rgba(0, 0, 0, 0)');
});
