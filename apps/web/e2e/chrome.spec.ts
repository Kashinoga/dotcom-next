import { expect, test } from '@playwright/test';

import { editor, pixels, words } from './helpers';

/*
 * The furniture the whole site wears: the bar, its frost, the selection, and
 * the gutter that stops the column moving between pages. None of this is
 * visible to `pnpm check`, and all of it is a stylesheet edit away from
 * quietly going.
 */

/*
 * The bar's height is a CONSEQUENCE of the control in it: a control between two
 * panel gaps. The padding is asserted because it is chosen, not derived — it is
 * Modern UI's 4px panel gap, the same step as every gap under the bar.
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
	expect(padding).toBe(4);
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
		// No blur available, so the opaque floor has to be what is showing. The
		// floor is the bar's own shell now rather than the page, so what is
		// asked is that it is OPAQUE — no alpha in the colour at all.
		expect(result.barBackground).not.toMatch(/rgba|\/\s*0?\.\d/);
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
	 * The link's BOX is on the bar's panel-gap edge, as far from the side as the
	 * bar's controls are from its top; the mark sits inside its padding.
	 */
	const mark = (await page.locator('.brand .mark').boundingBox())!;
	expect(Math.round(box.x)).toBe(4);
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

/*
 * A FULLSCREEN APP WEARS NO FOOTER, and the bar is what is left. Asserted
 * against a page that DOES wear one, so this says "these two pages differ" and
 * not "there is no footer anywhere" — which is what a bug in the layout would
 * also look like.
 */
test('a fullscreen app has no footer, and the rest do', async ({ page }) => {
	await page.goto('/emoji-viewer');
	await expect(page.getByRole('contentinfo')).toHaveCount(1);

	await page.goto('/text-editor');
	await expect(page.getByRole('contentinfo')).toHaveCount(0);

	// The bar stays. It is how you leave.
	await expect(page.getByRole('link', { name: 'Kashinoga' })).toBeVisible();
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
 * THE FOOTER IS THE SHELL, like the bar and the ground; the document is the
 * one surface off it. The step is Modern UI's: a few values, with the sheet's
 * frame doing the parting. It first guarded a silent bug — a mix in oklab left
 * dark's step one value wide — so it is asked in both modes.
 *
 * A ratio and not a colour, so the two ends can be tuned without editing this.
 */
for (const mode of ['light', 'dark'] as const) {
	test(`the footer is the shell, a step off the document in ${mode}`, async ({
		browser,
	}) => {
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
				lum(read(root.getPropertyValue('--shell').trim())),
			].sort((x, y) => y - x);
			return {
				ratio: (hi + 0.05) / (lo + 0.05),
				footer: getComputedStyle(document.querySelector('footer')!)
					.backgroundColor,
				ground: getComputedStyle(document.documentElement).backgroundColor,
			};
		});

		// Enough to be there. Not so much that the shell reads as a second page.
		expect(contrast.ratio).toBeGreaterThan(1.02);
		expect(contrast.ratio).toBeLessThan(1.3);
		// The footer and the ground are one shell.
		expect(contrast.footer).toBe(contrast.ground);

		await context.close();
	});
}

/*
 * THE LETTER IS A DOCUMENT PANEL ON THE SHELL — VS Code's Modern UI
 * arrangement. The sheet is the deepest surface (white in light, the darkest
 * grey in dark) and is as wide as what it holds; the ground around it and the
 * bar above are one shell, a small step out; a frame edges the sheet, because
 * that step alone is not enough to part them.
 *
 * Relations and not values, so the palette can be tuned without this being
 * told. The one thing pinned is the CAST: these greys lean a point or two
 * toward blue, and never toward red — which is the warm look this palette was
 * chosen to leave behind.
 */
for (const mode of ['light', 'dark'] as const) {
	test(`the letter is a framed document on the shell in ${mode}`, async ({
		browser,
	}) => {
		const context = await browser.newContext({
			colorScheme: mode,
			viewport: { width: 1280, height: 900 },
		});
		const page = await context.newPage();
		await page.goto('/');

		const box = (await page.locator('.sheet').boundingBox())!;
		const midY = Math.floor(box.y + box.height / 2);
		const seen = await pixels(page, {
			page: [Math.floor(box.x / 2), 400],
			sheet: [Math.floor(box.x) + 12, Math.floor(box.y) + 12],
			// Either side of the box's edge: engines place a 1px inset ring on
			// whichever pixel their rounding of a fractional edge lands on.
			frame: [Math.floor(box.x), midY],
			frameNext: [Math.floor(box.x) + 1, midY],
			bar: [640, 4],
		});
		// Cool or neutral, never warm: blue at or above red, by a point or two.
		for (const [r, , b] of Object.values(seen)) {
			expect(b).toBeGreaterThanOrEqual(r);
			expect(b - r).toBeLessThanOrEqual(4);
		}
		const [pageV, sheetV, barV] = [seen.page[0], seen.sheet[0], seen.bar[0]];
		// Whichever of the two pixels the ring fell on is the one furthest out.
		const frameV =
			mode === 'light'
				? Math.min(seen.frame[0], seen.frameNext[0])
				: Math.max(seen.frame[0], seen.frameNext[0]);

		// The ground and the bar are one shell, to within the frost's rounding.
		expect(Math.abs(barV - pageV)).toBeLessThanOrEqual(2);

		// The document is the DEEPEST surface — lighter in light, darker in dark —
		// by a step that is there, and the frame stands out from both.
		const deeper = mode === 'light' ? sheetV - pageV : pageV - sheetV;
		expect(deeper).toBeGreaterThanOrEqual(4);
		const off = (v: number) => (mode === 'light' ? pageV - v : v - pageV);
		expect(off(frameV)).toBeGreaterThanOrEqual(10);

		await context.close();
	});
}

/*
 * THE BAR IS THE FOOTER'S SHADE AT REST, on a letter whose page is the
 * document. Both are the shell, but the bar's is frosted at 85% over whatever
 * lies under it, so nothing but this notices the glass letting too much of the
 * page through. Within two values, because the frost is composited and rounds
 * where the footer's opaque fill does not.
 */
test('at rest the bar and the footer are one shade', async ({ page }) => {
	await page.setViewportSize({ width: 1280, height: 900 });
	await page.goto('/apps');
	await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));

	const footer = (await page.locator('footer').boundingBox())!;
	// A point on the footer's own ground, clear of its links.
	const seen = await pixels(page, {
		bar: [640, 4],
		footer: [640, Math.floor(footer.y + footer.height) - 3],
	});

	expect(Math.abs(seen.bar[0] - seen.footer[0])).toBeLessThanOrEqual(2);
});

/*
 * THE ADDRESS BAR MATCHES THE BAR UNDER IT. The two `theme-color` tags in
 * app.html repeat `--shell` because a <meta> cannot read a custom property,
 * and app.html's own note says to change them together. This is what notices
 * when they were not.
 */
for (const mode of ['light', 'dark'] as const) {
	test(`theme-color is the shell in ${mode}`, async ({ browser }) => {
		const context = await browser.newContext({ colorScheme: mode });
		const page = await context.newPage();
		await page.goto('/');

		const seen = await page.evaluate((mode) => {
			const meta = [
				...document.querySelectorAll<HTMLMetaElement>(
					'meta[name="theme-color"]',
				),
			].find((m) => m.media.includes(mode))!;
			// Both through the same canvas, so "#191A1B" and "#191a1b" are
			// compared as colours rather than as spellings.
			const c = document.createElement('canvas').getContext('2d')!;
			const norm = (css: string) => {
				c.fillStyle = css;
				return c.fillStyle;
			};
			return {
				meta: norm(meta.content),
				shell: norm(
					getComputedStyle(document.documentElement)
						.getPropertyValue('--shell')
						.trim(),
				),
			};
		}, mode);

		expect(seen.meta).toBe(seen.shell);

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

/*
 * A LETTER IS CAPPED AT THE MEASURE; AN APP IS NOT. The editor was inside the
 * reading measure at first, which gave Split two 300px panes and wrapped the
 * source mid-line.
 *
 * Compared against a page that IS a letter, so neither number is written here
 * and `--measure` can move without this being told.
 */
test('the editor takes the window; a letter takes the measure', async ({
	page,
}) => {
	await page.setViewportSize({ width: 1500, height: 1000 });

	await page.goto('/emoji-viewer');
	const letter = (await page.locator('.hero').boundingBox())!;

	await page.goto('/text-editor');
	const app = (await page.locator('.app').boundingBox())!;

	expect(app.width).toBeGreaterThan(letter.width * 2);

	/*
	 * THE PANE BEGINS ON THE BAR'S OWN LINE. It is the pane's EDGE that is asked
	 * about now, and not what is drawn inside it.
	 *
	 * It used to be the row's mark against the bar's mark, and that held while a
	 * rail was bare content standing on the app's own padding. A rail is panes
	 * now, and a pane insets what it holds — so the row's mark sits a pane's
	 * padding further in than the bar's, and asking them to agree would be asking
	 * the pane not to have a padding. What is still true, and worth holding, is
	 * that the OBJECT starts where the bar's own drawing does.
	 *
	 * (The row's mark has not stopped lining up with anything: it lines up with
	 * the heading over it, which is the test below.)
	 */
	const mark = (await page.locator('.brand .mark').boundingBox())!;
	const pane = (await page
		.locator('.workspace .section')
		.first()
		.boundingBox())!;
	expect(Math.round(pane.x)).toBeLessThan(Math.round(mark.x));

	// Three columns, and nothing pushed the page sideways.
	await expect(page.locator('.workspace')).toBeVisible();
	await expect(page.locator('.outline')).toBeVisible();
	expect(
		await page.evaluate(
			() =>
				document.documentElement.scrollWidth -
				document.documentElement.clientWidth,
		),
	).toBeLessThanOrEqual(0);
});

/*
 * ...AND THE SITE'S OWN PAGES KEEP THE FROST. The rule above reaches the bar
 * through `:has()` on <main>, which is a wide net; this is what would notice it
 * catching a letter.
 */
test('a letter keeps a frosted bar, not the desk', async ({ page }) => {
	await page.goto('/apps');

	const seen = await page.evaluate(() => {
		const bar = getComputedStyle(document.querySelector('header')!);
		return {
			background: bar.backgroundColor,
			blur: bar.backdropFilter || 'none',
		};
	});

	// Translucent, and blurring what goes under it. The amount is the bar's own
	// (85% of the shell), so this asks only that there IS an alpha below one.
	expect(seen.background).toMatch(/\/\s*0?\.\d|rgba/);
	expect(seen.blur).toContain('blur');
});

/*
 * AN APP RESERVES NOTHING FOR A SCROLLBAR IT WILL NEVER SHOW, and a page of the
 * site still does.
 *
 * Asserted as a RELATIONSHIP and not as fifteen pixels, because the figure is
 * the engine's and not ours: Chromium draws classic scrollbars headless and
 * Firefox draws overlay ones, so the reservation is 15px on one and 0 on the
 * other. "The app fills the window" is true on both, and on the engine where a
 * scrollbar takes room it is the whole point.
 *
 * The letter is the control. Without it this would pass on Firefox for the
 * wrong reason — nothing reserves anything there — and would not notice the
 * rule being deleted outright.
 */
test('a fullscreen app fills the window; a letter leaves the gutter', async ({
	page,
}) => {
	await page.setViewportSize({ width: 1280, height: 900 });

	const reserved = async (path: string) => {
		await page.goto(path);
		return page.evaluate(() => {
			const d = document.documentElement;
			return {
				reserved: d.clientWidth - document.body.getBoundingClientRect().width,
				scrolls: d.scrollHeight > window.innerHeight,
			};
		});
	};

	const app = await reserved('/text-editor');
	const letter = await reserved('/apps');

	// The app does not scroll, so nothing is held back from it.
	expect(app.scrolls).toBe(false);
	expect(app.reserved).toBe(0);

	/*
	 * The letter DOES scroll, so its scrollbar is really there and takes whatever
	 * that engine gives it. Only the app is asked to give the room back.
	 */
	expect(letter.scrolls).toBe(true);
	expect(letter.reserved).toBeGreaterThanOrEqual(app.reserved);
});

/*
 * THE SITE'S CONTROLS SIT AT THE END OF THE BAR, on every page, and this is a
 * regression test rather than a precaution.
 *
 * `margin-inline-start: auto` on the <nav> is what splits the bar. When the
 * editor's end-side panel switch arrived, the nav stopped being the first thing
 * over there and the rule was rewritten as "the nav, unless a panel precedes
 * it" — `:not(.panel ~ nav)`. `:not()` takes the SPECIFICITY OF ITS ARGUMENT,
 * so that outranked the fallback beside it and zeroed the margin on every page
 * with no panel. Apps and the display mode slid back to the middle, and nothing
 * failed: the bar was still a valid bar, just wrong.
 *
 * Asked of all four pages, because the one that kept working was the one the
 * change had been made for.
 */
test('the site controls stay at the end of the bar, on every page', async ({
	page,
}) => {
	await page.setViewportSize({ width: 1400, height: 800 });

	for (const path of ['/', '/apps', '/emoji-viewer', '/text-editor']) {
		await page.goto(path);

		const bar = (await page.locator('header').boundingBox())!;
		const nav = (await page.locator('header nav').boundingBox())!;

		// Past the halfway line is the whole claim: the split either happened or
		// it did not, and no number here has to follow the bar's contents.
		expect(nav.x, path).toBeGreaterThan(bar.x + bar.width / 2);
	}
});

/*
 * THE WORKSPACE'S SWITCH LIVES IN THE BAR, on a fullscreen app where the bar is
 * the app's chrome rather than the site's furniture. It is drawn only while a
 * page has claimed it — a control for a panel that is not on the page would be
 * a control for nothing.
 */
test('the panel switches are in the bar, and only where there are panels', async ({
	page,
}) => {
	await page.setViewportSize({ width: 1400, height: 800 });

	await page.goto('/emoji-viewer');
	await expect(page.locator('header .panel')).toHaveCount(0);

	await page.goto('/text-editor');
	await expect(page.locator('header .panel')).toHaveCount(2);

	for (const [name, controls] of [
		['Workspace', 'workspace'],
		['Outline', 'outline'],
	]) {
		const button = page.getByRole('button', { name, exact: true });
		await expect(button, name).toBeVisible();
		await expect(button, name).toHaveAttribute('aria-controls', controls);
	}
});

/*
 * THE RULE AND NOT THE ROSTER. This asserted a count of one and named Emoji
 * Viewer, and the day a second app was built it failed — having found nothing
 * wrong. What it is FOR is the rule that a card with nowhere to go is not an
 * anchor, because a link that 404s is worse than no link; that rule holds at
 * any number of apps, so it is what gets asserted.
 */
test('every built app is reachable from its card, and only those', async ({
	page,
}) => {
	await page.goto('/apps');

	const built = page.locator('.app.built');
	const count = await built.count();
	expect(count).toBeGreaterThan(0);

	// As many links as there are built cards: none of the others is one.
	await expect(page.locator('.app a')).toHaveCount(count);

	for (let i = 0; i < count; i++) {
		const card = built.nth(i);
		const name = await card.locator('a').textContent();
		const href = await card.locator('a').getAttribute('href');

		// An app lives at the top level, not under /apps — that path is kept for
		// the page ABOUT an app.
		expect(href, name ?? '').toMatch(/^\/[a-z0-9-]+$/);

		// The whole card is pressable even though only the name is the link — the
		// ::after sheet covers the card, so the accessible name stays short. The
		// corner is the part furthest from the words.
		//
		// Brought into view first: `mouse.click` takes VIEWPORT coordinates, and
		// the apps page is long enough now that a card further down the list has
		// a box the pointer cannot reach. The click landed on nothing and the test
		// read it as a card that does not navigate.
		await card.scrollIntoViewIfNeeded();
		const box = (await card.boundingBox())!;
		await page.mouse.click(box.x + box.width - 6, box.y + box.height - 6);
		await expect(page).toHaveURL(new RegExp(`${href}$`));

		await page.goBack();
	}
});
