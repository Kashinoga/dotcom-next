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

/*
 * WHAT A POINTER SEES IS THE WASH, not the box. These two came apart once: the
 * wash moved off the link and onto the name inside it so it could hug whichever
 * name was showing, and the brand went on ANSWERING at 32px while LOOKING 20 —
 * the height of the word and its mark, which is nothing to do with what can be
 * pressed. Every assertion above still passed, because every one of them asks
 * the link's box.
 */
test('the brand looks the size it answers at', async ({ page }) => {
	await page.goto('/apps');

	const link = (await page.locator('.brand').boundingBox())!;
	const wash = (await page.locator('.brand-state.site').boundingBox())!;
	const control = (await page.locator('header nav a').boundingBox())!;

	expect(wash.height).toBe(link.height);
	expect(wash.height).toBe(control.height);
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
	// announcements to the same place. The name is `aria-label`; both drawings
	// are hidden, because "heart handshake Kashinoga" reads as nonsense.
	//
	// `.mark` and not any svg under the hidden span: the bar carries a SECOND
	// drawing now, the page's own, waiting to be faded in. Naming the site's mark
	// is what keeps this asking about the site's mark.
	const brand = page.getByRole('link', { name: 'Kashinoga', exact: true });
	await expect(brand).toHaveAttribute('href', '/');
	await expect(
		brand.locator('span[aria-hidden="true"] .mark svg'),
	).toBeAttached();

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

/*
 * THE BAR PICKS THE PAGE UP where the page puts it down. These four are about
 * the swap, and the first one is the one that matters: the LINK'S NAME never
 * changes while it is still a link home, whatever the bar is drawn as.
 */
test('the bar wears the page name once the title has gone under it', async ({
	page,
}) => {
	await page.goto('/emoji-viewer');

	const site = page.locator('.brand-state.site');
	const here = page.locator('.brand-state.page');
	await expect(here).toHaveText('Emoji Viewer');

	// At rest the site's name is the one showing.
	await expect(site).toHaveCSS('opacity', '1');
	await expect(here).toHaveCSS('opacity', '0');

	// The h1 is what decides, so scroll until it has passed the bar's lower edge.
	await page.evaluate(() => scrollTo(0, 600));
	await expect(here).toHaveCSS('opacity', '1');
	await expect(site).toHaveCSS('opacity', '0');
});

test('the brand is a link home by name however it is drawn', async ({
	page,
}) => {
	await page.goto('/emoji-viewer');
	await page.evaluate(() => scrollTo(0, 600));
	await expect(page.locator('.brand-state.page')).toHaveCSS('opacity', '1');

	/*
	 * READING "EMOJI VIEWER" AND GOING HOME would be a link that lies. The label
	 * is pinned to the site's name, so what a screen reader announces and what
	 * the press does still agree.
	 */
	const brand = page.getByRole('link', { name: 'Kashinoga', exact: true });
	await expect(brand).toHaveAttribute('href', '/');
	await brand.click();
	await expect(page).toHaveURL(/\/$/);
});

test('a pointer can ask where the brand goes before pressing it', async ({
	page,
}) => {
	await page.goto('/emoji-viewer');
	await page.evaluate(() => scrollTo(0, 600));

	const brand = page.locator('.brand');
	const site = page.locator('.brand-state.site');
	await expect(site).toHaveCSS('opacity', '0');

	/*
	 * `mouse.move` AND NOT `locator.hover()`, and this is not a preference.
	 * `hover()` scrolls its target into view first, and the bar is sticky — so it
	 * scrolls to where the bar SITS IN THE DOCUMENT, which is the top. Measured:
	 * 600 goes to 192. The name would then come back because the title had
	 * returned, and this test would pass whether or not hovering does anything.
	 */
	const box = (await brand.boundingBox())!;
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);

	// Still scrolled past — so the name came back because of the pointer.
	await expect(brand).toHaveClass(/showing-page/);
	await expect(site).toHaveCSS('opacity', '1');
	expect(await page.evaluate(() => Math.round(scrollY))).toBe(600);
});

test('without a hover to ask with, the brand returns to the top instead', async ({
	browser,
}) => {
	// A touchscreen fires `:hover` on the tap itself, so the rehearsal the
	// pointer gets is not available here. The press does the harmless thing.
	const context = await browser.newContext({ hasTouch: true, isMobile: true });
	const page = await context.newPage();
	await page.goto('/emoji-viewer');
	await page.evaluate(() => scrollTo(0, 600));
	await expect(page.locator('.brand-state.page')).toHaveCSS('opacity', '1');

	// The name follows the deed: it is no longer offering to go home.
	const brand = page.getByRole('link', {
		name: 'Back to the top',
		exact: true,
	});
	await brand.click();

	await expect
		.poll(async () => page.evaluate(() => Math.round(scrollY)))
		.toBe(0);
	// And it did NOT navigate.
	await expect(page).toHaveURL(/\/emoji-viewer$/);

	await context.close();
});

/*
 * A PAGE MAY WEAR ITS OWN MARK IN THE TAB, and the site's is the floor under
 * every page that does not. The order is the whole mechanism — two icons of one
 * type, and the browser takes the last — so the order is what this asserts.
 *
 * Verified against the network as well as the markup while this was written:
 * Firefox fetches favicon-emoji-viewer.svg on that page and favicon.svg
 * elsewhere. Headless Chromium fetches no icon at all, which is why the test
 * asks the document rather than watching for a request.
 */
test('a page with a mark of its own declares it after the site’s', async ({
	page,
}) => {
	await page.goto('/emoji-viewer');

	const icons = await page.evaluate(() =>
		[...document.querySelectorAll('link[rel~="icon"]')].map(
			(link) => new URL((link as HTMLLinkElement).href).pathname,
		),
	);
	expect(icons).toEqual(['/favicon.svg', '/favicon-emoji-viewer.svg']);

	// The drawing is really there, and really an SVG.
	const response = await page.request.get('/favicon-emoji-viewer.svg');
	expect(response.status()).toBe(200);
	expect(response.headers()['content-type']).toContain('image/svg+xml');
});

test('a page with no mark of its own keeps the site’s', async ({ page }) => {
	for (const path of ['/', '/apps']) {
		await page.goto(path);
		const icons = await page.evaluate(() =>
			[...document.querySelectorAll('link[rel~="icon"]')].map(
				(link) => new URL((link as HTMLLinkElement).href).pathname,
			),
		);
		expect(icons, path).toEqual(['/favicon.svg']);
	}
});

/*
 * THE FOOTER IS PAST THE END, and the page that proves it is the HOME page —
 * the one short enough to fit its window. If the rule holding <main> to the
 * window's height ever goes, this is where it shows: the footer would simply be
 * sitting there under the letter, on a page nobody had scrolled.
 */
test('the footer starts where the window stops, on every page', async ({
	page,
}) => {
	for (const path of ['/', '/apps', '/emoji-viewer']) {
		await page.goto(path);

		const seen = await page.evaluate(() => ({
			footerTop: document.querySelector('footer')!.getBoundingClientRect().top,
			viewport: window.innerHeight,
			scrollable: document.documentElement.scrollHeight - window.innerHeight,
		}));

		expect(seen.footerTop, path).toBeGreaterThanOrEqual(seen.viewport);
		// And there is always somewhere to scroll TO, or it could never be read.
		expect(seen.scrollable, path).toBeGreaterThan(0);
	}
});

test('the footer holds a copyright and the two ways out', async ({ page }) => {
	await page.goto('/');
	await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));

	const footer = page.locator('footer');
	await expect(footer).toContainText('Kashinoga');
	await expect(footer).toContainText(String(new Date().getFullYear()));

	await expect(footer.getByRole('link', { name: 'Apps' })).toHaveAttribute(
		'href',
		'/apps',
	);
	await expect(footer.getByRole('link', { name: 'GitHub' })).toHaveAttribute(
		'href',
		'https://github.com/Kashinoga',
	);

	// It is a landmark, so it can be reached without scrolling at all.
	await expect(page.getByRole('contentinfo')).toBeAttached();
});

/*
 * THE FOOTER IS A DIFFERENT SURFACE, in both modes, and this guards a bug that
 * was silent: `--surface` was first mixed `in oklab` like every other colour
 * here, and six percent of the way from black toward white — measured the way
 * the eye works — is still black. Light stepped 255 to 235 and dark stepped 0
 * to 1. The footer simply had no ground of its own in dark mode and nothing
 * said so.
 *
 * A ratio and not a colour, so the two ends can be tuned without editing this.
 */
for (const mode of ['light', 'dark'] as const) {
	test(`the footer stands off the page in ${mode}`, async ({ browser }) => {
		const context = await browser.newContext({ colorScheme: mode });
		const page = await context.newPage();
		await page.goto('/');

		const contrast = await page.evaluate(() => {
			// Painted and read back: `color-mix` computes as oklab, so the string
			// getComputedStyle returns is not the colour that reaches the screen.
			const c = document.createElement('canvas').getContext('2d')!;
			const read = (css: string) => {
				c.fillStyle = css;
				c.fillRect(0, 0, 1, 1);
				return [...c.getImageData(0, 0, 1, 1).data].slice(0, 3);
			};
			const lum = ([r, g, b]: number[]) => {
				const f = (v: number) => {
					v /= 255;
					return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
				};
				return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
			};
			const root = getComputedStyle(document.documentElement);
			const [hi, lo] = [
				lum(read(root.getPropertyValue('--bg').trim())),
				lum(read(root.getPropertyValue('--surface').trim())),
			].sort((x, y) => y - x);
			return (hi + 0.05) / (lo + 0.05);
		});

		// Enough to see. Not so much that the footer reads as a second page.
		expect(contrast).toBeGreaterThan(1.1);
		expect(contrast).toBeLessThan(1.6);

		await context.close();
	});
}

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
