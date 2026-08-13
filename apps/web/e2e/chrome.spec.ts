import { expect, test } from '@playwright/test';

/*
 * The furniture the whole site wears: the bar, its frost, the selection, and
 * the gutter that stops the column moving between pages. None of this is
 * visible to `pnpm check`, and all of it is a stylesheet edit away from
 * quietly going.
 */

/*
 * The bar's height is a CONSEQUENCE of the control in it, not a number of its
 * own: a control between two --space-m paddings. Asserting the relationship
 * rather than the figure is what lets the control be resized — as it was, from
 * 44px to 32px for a pointer — without a test having to be told.
 */
test('the bar is exactly its control between two paddings', async ({
	page,
}) => {
	await page.goto('/');

	const header = (await page.locator('header').boundingBox())!;
	const control = (await page.locator('header nav a').boundingBox())!;

	// The control is centred in the bar, so its top edge IS the padding.
	const padding = control.y;
	expect(header.height).toBe(control.height + padding * 2);
	expect(padding).toBe(16);
});

/*
 * THE FLOOR, and this is the assertion that makes shrinking the controls safe
 * to keep doing. WCAG 2.2 puts the minimum target at 24x24 (2.5.8, AA); 44x44
 * is the enhanced size (2.5.5, AAA) and what a finger gets. This says the
 * pointer size may be tuned but may not fall through the floor.
 */
test('every control in the bar clears the minimum target size', async ({
	page,
}) => {
	await page.goto('/apps');

	for (const selector of ['header nav a', 'header button.control']) {
		const box = (await page.locator(selector).boundingBox())!;
		expect(box.width, selector).toBeGreaterThanOrEqual(24);
		expect(box.height, selector).toBeGreaterThanOrEqual(24);
	}

	// The brand is a press target too, whatever its width.
	const brand = (await page.locator('.brand').boundingBox())!;
	expect(brand.height).toBeGreaterThanOrEqual(24);
});

test('a touchscreen gets the larger target back', async ({ browser }) => {
	// `any-pointer: coarse` is what the stylesheet asks, and a context with touch
	// is what answers it. Chromium is the engine that emulates this faithfully.
	const context = await browser.newContext({ hasTouch: true, isMobile: true });
	const page = await context.newPage();
	await page.goto('/apps');

	const control = (await page.locator('header nav a').boundingBox())!;
	expect(control.height).toBeGreaterThanOrEqual(44);

	// And the bar grew with it, without a rule of its own being changed.
	const header = (await page.locator('header').boundingBox())!;
	expect(header.height).toBe(control.height + control.y * 2);

	await context.close();
});

test('the bar stays at the top once the page moves under it', async ({
	page,
}) => {
	await page.goto('/emoji-viewer');
	await page.evaluate(() => window.scrollTo(0, 1200));

	const box = await page.locator('header').boundingBox();
	expect(box?.y).toBe(0);
});

/*
 * THE FROST'S CONTRACT, and this is the test that needed three engines.
 *
 * The rule is not "there is a blur" — it is that the bar is NEVER translucent
 * without one. A browser that took the 50% and skipped the blur would let the
 * letter read straight through the icons, which is worse than no frost at all,
 * and that is what the `@supports` arm is there to prevent. So the question
 * each engine is asked is the same one the stylesheet asks it.
 */
test('the bar is never see-through without a blur behind it', async ({
	page,
}) => {
	await page.goto('/emoji-viewer');

	const result = await page.evaluate(() => {
		const supported =
			CSS.supports('backdrop-filter', 'blur(1px)') ||
			CSS.supports('-webkit-backdrop-filter', 'blur(1px)');

		const header = getComputedStyle(document.querySelector('header')!);
		const blur =
			header.backdropFilter ||
			(header as unknown as Record<string, string>).webkitBackdropFilter ||
			'none';

		return {
			supported,
			hasBlur: blur !== 'none' && blur !== '',
			barBackground: header.backgroundColor,
			pageBackground: getComputedStyle(document.documentElement)
				.backgroundColor,
		};
	});

	if (result.supported) {
		expect(result.hasBlur).toBe(true);
	} else {
		// No blur available, so the opaque floor has to be what is showing.
		expect(result.barBackground).toBe(result.pageBackground);
	}
});

/*
 * The selection takes the accent. Worth asking all three engines, because a
 * highlight pseudo-element is one of the places they have historically differed
 * — and because until this file existed the claim was never tested anywhere but
 * Chromium.
 */
test('a selection is drawn in the accent, not the browser blue', async ({
	page,
}) => {
	await page.goto('/');

	const selection = await page.evaluate(() => {
		const paragraph = document.querySelector('.prose p')!;
		const style = getComputedStyle(paragraph, '::selection');
		return { background: style.backgroundColor, color: style.color };
	});

	// Some engines decline to report highlight styles at all. Where the question
	// can be asked, the answer has to be the accent.
	if (selection.background && selection.background !== 'rgba(0, 0, 0, 0)') {
		expect(selection.background).toBe('rgb(255, 214, 10)');
		expect(selection.color).toBe('rgb(0, 0, 0)');
	}
});

/*
 * THE GUTTER, and this was a live bug rather than a precaution: the home page
 * fits its window and Apps does not, so before `scrollbar-gutter: stable` the
 * two reserved different widths and the centred column jogged sideways every
 * time a visitor crossed between them.
 */
test('the column does not move between pages', async ({ page }) => {
	await page.goto('/');
	const home = await page.locator('.prose').boundingBox();

	await page.goto('/apps');
	const apps = await page.locator('.prose').boundingBox();

	await page.goto('/emoji-viewer');
	const emoji = await page.locator('.prose').boundingBox();

	expect(apps?.x).toBe(home?.x);
	expect(emoji?.x).toBe(home?.x);
	expect(apps?.width).toBe(home?.width);
	expect(emoji?.width).toBe(home?.width);
});

test('the mark and the name are one link home, at the start of the bar', async ({
	page,
}) => {
	await page.goto('/apps');

	// ONE link, not two beside each other: two would be two tab stops and two
	// announcements to the same place. The word is the accessible name; the mark
	// is hidden, because "heart handshake Kashinoga" reads as nonsense.
	const brand = page.getByRole('link', { name: 'Kashinoga', exact: true });
	await expect(brand).toHaveAttribute('href', '/');
	await expect(brand.locator('span[aria-hidden="true"] svg')).toBeAttached();

	// At the START edge, and before the controls that sit at the end.
	const box = (await brand.boundingBox())!;
	const controls = (await page.locator('header nav a').boundingBox())!;
	expect(box.x).toBeLessThan(controls.x);

	/*
	 * The MARK is on the bar's 16px line, not the link's box. The link is padded
	 * out and pulled back by the same amount so its hover wash has room without
	 * the drawing moving off that line — so the box begins earlier, on purpose.
	 */
	const mark = (await page.locator('.brand .mark').boundingBox())!;
	expect(Math.round(mark.x)).toBe(16);
	expect(box.x).toBeLessThan(mark.x);

	await brand.click();
	await expect(page).toHaveURL(/\/$/);
});

test('the mark and the name share a centre line', async ({ page }) => {
	await page.goto('/');

	const centres = await page.evaluate(() => {
		const mark = document
			.querySelector('.brand .mark')!
			.getBoundingClientRect();
		const brand = document.querySelector('.brand')!.getBoundingClientRect();
		// The word is an anonymous text node beside the mark, so it is measured
		// with a Range rather than by selecting an element that does not exist.
		const word = document.createRange();
		word.setStartAfter(document.querySelector('.brand .mark')!);
		word.setEnd(
			document.querySelector('.brand')!,
			document.querySelector('.brand')!.childNodes.length,
		);
		const text = word.getBoundingClientRect();
		return {
			mark: mark.top + mark.height / 2,
			word: text.top + text.height / 2,
			bar: brand.top + brand.height / 2,
		};
	});

	// Within a pixel of each other, and of the line the pair sits on.
	expect(Math.abs(centres.mark - centres.word)).toBeLessThanOrEqual(1);
	expect(Math.abs(centres.mark - centres.bar)).toBeLessThanOrEqual(1);
});

test('the Apps control leads to Apps, and comes back from it', async ({
	page,
}) => {
	await page.goto('/');
	const control = page.locator('header nav a');
	await expect(control).toHaveAttribute('href', '/apps');

	await control.click();
	await expect(page).toHaveURL(/\/apps$/);

	// On Apps it is a way back, not a way in — which is why it carries no
	// `aria-current`, an attribute that would be describing a link pointing away
	// from the page it claims to mark.
	await expect(control).toHaveAttribute('href', '/');
	await expect(control).toHaveAttribute('data-open', 'true');
	await expect(control).not.toHaveAttribute('aria-current', /.*/);
	await expect(control).toHaveCSS('background-color', 'rgb(255, 214, 10)');

	await control.click();
	await expect(page).toHaveURL(/\/$/);
});

test('a built app is reachable from its card, by its name alone', async ({
	page,
}) => {
	await page.goto('/apps');

	// Only the built ones are links. A card with nowhere to go is not an anchor,
	// because a link that 404s is worse than no link.
	await expect(page.locator('.app a')).toHaveCount(1);

	const link = page.getByRole('link', { name: 'Emoji Viewer', exact: true });
	await expect(link).toHaveAttribute('href', '/emoji-viewer');

	// The whole card is pressable even though only the name is the link — the
	// ::after sheet covers the card, so the accessible name stays short.
	const card = page.locator('.app.built');
	const box = (await card.boundingBox())!;
	await page.mouse.click(box.x + box.width - 6, box.y + box.height - 6);
	await expect(page).toHaveURL(/\/emoji-viewer$/);
});
