import { expect, test } from '@playwright/test';

/*
 * The Emoji Viewer's strip of groups, and the columns the wall stands in.
 *
 * The strip FILTERS: a tab shows its group alone, and All shows the lot. It
 * stays under the search field, a step below the bar, wherever the page is.
 *
 * The groups stand in columns on a desktop, so most of these run at a width
 * that has more than one, and one at a phone's, which has one.
 */

const WIDE = { width: 1400, height: 900 };

/*
 * The page is prerendered, so every button is in the HTML before Svelte has
 * taken it over, and a press then does nothing. The strip marks itself live
 * from a client-only effect; its arrival is the signal.
 */
async function open(page: import('@playwright/test').Page, size = WIDE) {
	await page.setViewportSize(size);
	await page.goto('/emoji-viewer');
	await page.locator('.tabs[data-live]').waitFor({ state: 'attached' });
}

const tab = (page: import('@playwright/test').Page, name: string) =>
	page.locator('.tabs button', { hasText: name });

const pressed = (page: import('@playwright/test').Page) =>
	page.locator('.tabs button[aria-pressed="true"]');

test('the groups wear as many columns as the sheet has room for', async ({
	page,
}) => {
	await open(page);

	// At the default window the wall stands in more than one column: the
	// headings do not all share one left edge.
	const lefts = await page
		.locator('.group')
		.evaluateAll((els) =>
			els.map((el) => Math.round(el.getBoundingClientRect().left)),
		);
	expect(new Set(lefts).size).toBeGreaterThan(1);

	// And no group is cut in two by a column's foot.
	const split = await page
		.locator('.group')
		.evaluateAll((els) => els.some((el) => el.getClientRects().length > 1));
	expect(split).toBe(false);
});

test('a phone has one column, and the strip scrolls sideways', async ({
	page,
}) => {
	await open(page, { width: 390, height: 844 });

	const lefts = await page
		.locator('.group')
		.evaluateAll((els) =>
			els.map((el) => Math.round(el.getBoundingClientRect().left)),
		);
	expect(new Set(lefts).size).toBe(1);

	// The tabs stay on one line rather than wrapping, so the dock keeps its
	// height; the strip scrolls instead, and the page does not.
	const strip = await page.locator('.tabs').evaluate((el) => ({
		scrolls: el.scrollWidth > el.clientWidth,
		rows: new Set(
			[...el.querySelectorAll('button')].map((b) =>
				Math.round(b.getBoundingClientRect().top),
			),
		).size,
		page: document.documentElement.scrollWidth <= window.innerWidth,
	}));
	expect(strip).toEqual({ scrolls: true, rows: 1, page: true });
});

test('the strip starts on the search field’s edge', async ({ page }) => {
	await open(page, { width: 1100, height: 900 });

	const field = (await page.locator('.search').boundingBox())!;
	const first = (await pressed(page).boundingBox())!;
	expect(Math.round(first.x)).toBe(Math.round(field.x));
});

test('the strip stands beside the field where there is room, under it where not', async ({
	page,
}) => {
	/*
	 * Clear of the field's FOCUS RING, which is drawn 4px outside its edge: the
	 * strip used to sit 4px away and the ring touched it.
	 */
	const RING = 4;

	for (const [size, beside] of [
		[WIDE, true],
		[{ width: 1100, height: 900 }, false],
	] as const) {
		await open(page, size);
		await page.evaluate(() => window.scrollTo(0, 1500));

		const tabs = (await page.locator('.tabs').boundingBox())!;
		const header = (await page.locator('header').boundingBox())!;
		const search = (await page.locator('.search').boundingBox())!;

		// Clear of the bar wherever the page is.
		expect(tabs.y).toBeGreaterThan(header.height);

		if (beside) {
			expect(Math.round(tabs.y)).toBe(Math.round(search.y));
			expect(tabs.x - (search.x + search.width)).toBeGreaterThan(RING);
		} else {
			expect(Math.round(tabs.x)).toBe(Math.round(search.x));
			expect(tabs.y - (search.y + search.height)).toBeGreaterThan(RING);
		}
	}
});

test('All is on show at first, and one choice is ever pressed', async ({
	page,
}) => {
	await open(page);

	await expect(pressed(page)).toHaveCount(1);
	await expect(pressed(page)).toHaveText('All');
	await expect(page.locator('.group')).toHaveCount(9);
});

test('a tab shows its group alone, across the whole sheet', async ({
	page,
}) => {
	await open(page);

	await tab(page, 'Food & Drink').click();

	await expect(pressed(page)).toHaveText('Food & Drink');
	await expect(page.locator('.group')).toHaveCount(1);
	await expect(page.locator('.group h2')).toHaveText('Food & Drink');

	// Not standing in one column of the sheet with the rest of it empty: as
	// wide as the scroller has room for, its scrollbar's gutter aside.
	const width = await page.evaluate(() => [
		document.querySelector('.group')!.getBoundingClientRect().width,
		document.querySelector('.scroller')!.clientWidth,
	]);
	expect(Math.round(width[0])).toBe(Math.round(width[1]));

	await tab(page, 'All').click();
	await expect(page.locator('.group')).toHaveCount(9);
});

test('choosing a group starts it from the top', async ({ page }) => {
	await open(page);
	const scroller = page.locator('.scroller');
	await scroller.evaluate((el) => el.scrollTo(0, 800));

	await tab(page, 'Flags').click();

	await expect.poll(() => scroller.evaluate((el) => el.scrollTop)).toBe(0);
});

test('a choice outlasts a search that empties it', async ({ page }) => {
	await open(page);

	await tab(page, 'Flags').click();
	const search = page.getByRole('searchbox');

	// Nothing among the flags is a cat, so the strip shows All for as long as
	// the search lasts…
	await search.fill('cat');
	await expect(pressed(page)).toHaveText('All');
	await expect(page.locator('.group')).toHaveCount(2);

	// …and clearing it puts the reader back where they had chosen to be.
	await search.fill('');
	await expect(pressed(page)).toHaveText('Flags');
	await expect(page.locator('.group')).toHaveCount(1);
});

test('the panel stands still while the wall scrolls inside it', async ({
	page,
}) => {
	await open(page);

	const where = () =>
		page.evaluate(() => ({
			search: Math.round(
				document.querySelector('.search')!.getBoundingClientRect().top,
			),
			page: Math.round(scrollY),
		}));
	const before = await where();

	await page.locator('.scroller').evaluate((el) => el.scrollTo(0, 800));

	// The wall moved and nothing else did: the field is where it was, and so is
	// the page.
	expect(await page.locator('.scroller').evaluate((el) => el.scrollTop)).toBe(
		800,
	);
	expect(await where()).toEqual(before);

	// The panel is the window less the bar and a gap at either end, whatever
	// the wall holds.
	const fits = await page.evaluate(() => {
		const sheet = document.querySelector('.sheet')!.getBoundingClientRect();
		const bar = document.querySelector('header')!.getBoundingClientRect();
		return Math.round(sheet.bottom - bar.bottom) <= innerHeight;
	});
	expect(fits).toBe(true);
});

test('past the wall’s end, the page scrolls on to the footer', async ({
	page,
}) => {
	await open(page);

	const scroller = page.locator('.scroller');
	const box = (await scroller.boundingBox())!;
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);

	// Wheel until both have nothing left to give.
	for (let i = 0; i < 40; i++) await page.mouse.wheel(0, 500);

	await expect
		.poll(() =>
			scroller.evaluate(
				(el) => el.scrollHeight - el.clientHeight - el.scrollTop,
			),
		)
		.toBeLessThanOrEqual(1);
	await expect(page.locator('footer')).toBeInViewport();
});

test('the choice is told apart by more than its colour', async ({ page }) => {
	await open(page);

	// The whole tab is the accent, and the words on it are the accent's own
	// black: light letters on the yellow would be 1.3:1.
	await expect(pressed(page)).toHaveCSS(
		'background-color',
		'rgb(255, 214, 10)',
	);
	await expect(pressed(page)).toHaveCSS('color', 'rgb(0, 0, 0)');

	const unpressed = page.locator('.tabs button[aria-pressed="false"]').first();
	await expect(unpressed).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
});
