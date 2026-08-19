import { expect, test, type Page } from '@playwright/test';

/*
 * The furniture the whole site wears: the bar, its frost, the selection, and
 * the gutter that stops the column moving between pages. None of this is
 * visible to `pnpm check`, and all of it is a stylesheet edit away from
 * quietly going.
 */

/*
 * The bar's height is a CONSEQUENCE of the control in it, not a number of its
 * own: a control between two --space-xs paddings. Asserting the relationship
 * rather than the figure is what lets the control be resized — as it was, from
 * 44px to 32px for a pointer — without a test having to be told.
 *
 * The padding IS asserted, because it is the one number here that was chosen
 * rather than derived, and because the lower of the two is also the space
 * between the bar and whatever is under it — on the editor, the app's top edge.
 * It went 16 to 8 to put that edge on the same step as the gaps inside the app.
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
	expect(padding).toBe(8);
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

		// 3. The bar is the same field, so the app has no seam along its top.
		expect(seen.bar).toBe(seen.desk);

		await context.close();
	});
}

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

	// Translucent, and blurring what goes under it.
	expect(seen.background).toContain('0.5');
	expect(seen.blur).toContain('blur');
});

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
	await page.locator('.add').click();

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

	const seen = await page.evaluate(() => {
		const text = (node: Node) => {
			const range = document.createRange();
			range.selectNodeContents(node);
			return Math.round(range.getBoundingClientRect().x);
		};

		return [...document.querySelectorAll('.rail .section')].map((pane) => {
			const heading = pane.querySelector('h2')!;
			const row = pane.querySelector('li button')!;
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

	expect(seen).toHaveLength(3);
	for (const pane of seen) expect(pane.heading).toBe(pane.row);
});

/*
 * EVERY PANE'S HEAD IS THE SAME HEIGHT, and only one of them has a reason to
 * be. "Scratch" carries the button that opens a note; "Files" and "Outline"
 * carry a word. Left alone, the first came out a control taller than the other
 * two and three panes down one window each had a differently sized head.
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
			const last = [...pane.querySelectorAll('li')]
				.pop()!
				.getBoundingClientRect();
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

	const [scratch, ...rest] = seen;

	// Scratch is the one with a control in its head, and it sets the height.
	expect(scratch.control).toBeGreaterThan(0);
	for (const pane of rest) {
		expect(pane.control).toBe(0);
		expect(pane.head).toBe(scratch.head);
	}

	// The foot answers the head rather than the padding, so it is the larger step.
	for (const pane of seen) expect(pane.foot).toBeGreaterThan(0);
	expect(new Set(seen.map((p) => p.foot)).size).toBe(1);
});

/*
 * THE VIEW KEYS ARE AN ISLAND IN THE BAR, first of the end cluster, so the order
 * runs outward from the document: how you are looking at it, then what is beside
 * it, then the site.
 *
 * Position asserted as an ORDER and not as coordinates. What matters is which
 * side of which, and a bar whose controls are resized should not have to be told.
 */
test('the view keys lead the end cluster, on the app and nowhere else', async ({
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
			outline: x('.panel.end'),
			apps: x('header nav a'),
			mode: x('header > button.control:not(.panel)'),
			bar: document.querySelector('header')!.getBoundingClientRect(),
		};
	});

	// After the brand, and pushed to the end rather than sitting in the middle.
	expect(seen.island).toBeGreaterThan(seen.brandEnd);
	expect(seen.island - seen.brandEnd).toBeGreaterThan(seen.bar.width / 3);

	// Then the outline's switch, then the site's own two.
	expect(seen.outline).toBeGreaterThan(seen.islandEnd);
	expect(seen.apps).toBeGreaterThan(seen.outline);
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
		// the key it is drawn in and the insets it is given.
		const ground = (el: Element) => {
			const g = getComputedStyle(el, '::before');
			const k = el.getBoundingClientRect();
			return {
				top: k.top + parseFloat(g.insetBlockStart),
				bottom: k.bottom - parseFloat(g.insetBlockEnd),
				left: k.left + parseFloat(g.insetInlineStart),
				right: k.right - parseFloat(g.insetInlineEnd),
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
 * A RAIL IS PANES, ONE PER GROUP, EACH THE HEIGHT OF WHAT IS IN IT — and the
 * rail is what scrolls when they will not all fit.
 *
 * Asked in a SHORT window with enough notes to overflow, because that is the
 * only place the claim can fail. With room to spare a pane is its content's
 * height whatever the rules say; it is when there is not enough that a pane
 * either holds its size or gets squeezed.
 *
 * This is also the test for `block-size` on `.app`. With `min-block-size` there
 * — which is what it said, and looked right — the rail had no definite height
 * above it, so an auto grid row took the whole list, the page grew past its end,
 * and the rail's `overflow-y` never ran. Measured at 112px of page past the
 * window before it was found. Nothing else in the suite was asking.
 */
test('a rail scrolls; its panes keep the height of their content', async ({
	page,
}) => {
	await page.setViewportSize({ width: 1280, height: 320 });
	await page.goto('/text-editor');
	await expect(page.locator('.workspace[data-ready]')).toBeVisible();

	// Enough notes that the two panes together cannot fit the rail.
	for (let i = 0; i < 4; i += 1) await page.locator('.add').click();

	const seen = await page.evaluate(() => {
		const rail = document.querySelector('#workspace')!;
		return {
			pageScroll: document.documentElement.scrollHeight - window.innerHeight,
			railScroll: rail.scrollHeight - rail.clientHeight,
			panes: [...rail.querySelectorAll('.section')].map((pane) => ({
				drawn: Math.round(pane.getBoundingClientRect().height),
				content: pane.scrollHeight,
			})),
		};
	});

	// The app is still exactly the window, and the rail took the overflow.
	expect(seen.pageScroll).toBe(0);
	expect(seen.railScroll).toBeGreaterThan(0);

	// Two panes, and each is its own content's height — not squeezed to fit.
	expect(seen.panes).toHaveLength(2);
	for (const pane of seen.panes) expect(pane.drawn).toBe(pane.content);
});

/*
 * ONE SHADE FOR EVERY PANE IN A RAIL, and it is neither the desk's nor the
 * document's. Three layers: the sheet at the far end, the desk furthest in, the
 * lists between. A rail pane cut from the DESK would have nothing left to round
 * — its corners would dissolve into the gutter — and one cut from the SHEET
 * would stand the file names level with the document they only point at.
 */
for (const mode of ['light', 'dark'] as const) {
	test(`every rail pane is one shade, off both the desk and the sheet in ${mode}`, async ({
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
				desk: bg(document.querySelector('.app')!),
				sheet: bg(document.querySelector('.sheet')!),
			};
		});

		// Scratch, Files, Outline — each its own pane with its own corners.
		expect(seen.count).toBe(3);
		expect(seen.radii).toHaveLength(1);
		expect(seen.radii[0]).not.toBe('0px');

		// All one shade, and that shade is a third one.
		expect(seen.shades).toHaveLength(1);
		expect(seen.shades[0]).not.toBe(seen.desk);
		expect(seen.shades[0]).not.toBe(seen.sheet);

		await context.close();
	});
}

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

/*
 * THE SCRATCH NOTES — the first thing this editor actually does. A note here
 * has no file behind it: it lives in this browser and nowhere else, which is
 * why it can exist before any of the storage does.
 *
 * WAIT FOR STORAGE TO HAVE BEEN READ, and this is the same trap the Emoji
 * Viewer's suite documents, arriving a third time. The page is prerendered, so
 * the textarea is in the HTML and accepts typing before Svelte has attached the
 * handler that keeps it — the text went in, nothing was stored, and the reload
 * showed an empty note. The page publishes `data-ready` for exactly this.
 */
async function editor(page: Page) {
	await page.goto('/text-editor');
	await page.locator('.workspace[data-ready]').waitFor({ state: 'attached' });
}

test('a scratch note is there to type in, and survives a reload', async ({
	page,
}) => {
	await editor(page);

	const sheet = page.locator('textarea.sheet');
	await expect(sheet).toBeVisible();

	await sheet.fill('The terrain is unforgiving by design.');
	await page.reload();
	await page.locator('.workspace[data-ready]').waitFor({ state: 'attached' });
	await expect(page.locator('textarea.sheet')).toHaveValue(
		'The terrain is unforgiving by design.',
	);
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

	await page.locator('textarea.sheet').fill('Take care.');

	const zero = page.locator('.row', { hasText: 'Ephemeral 0' });
	await zero.hover();
	// The label says CLEAR here and CLOSE everywhere else.
	await zero.getByRole('button', { name: 'Clear Ephemeral 0' }).click();

	await expect(
		page.locator('.workspace section').first().locator('.file .name'),
	).toHaveText(['Ephemeral 0']);
	await expect(page.locator('textarea.sheet')).toHaveValue('');
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
