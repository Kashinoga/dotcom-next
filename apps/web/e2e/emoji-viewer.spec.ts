import { expect, type Page, test } from '@playwright/test';

/*
 * A plain click, once the page is hydrated — see the wait in `beforeEach`,
 * which is the thing that actually makes this reliable.
 */
async function pressCell(page: Page, name: string) {
	const cell = page.getByRole('button', { name, exact: true });
	await cell.click();
	return cell;
}

/*
 * The Emoji Viewer's behaviour. Every one of these was checked by hand once, in
 * a browser, and none of those checks survived the afternoon. That is the whole
 * argument for the file.
 */

test.beforeEach(async ({ page, context, browserName }) => {
	/*
	 * Chromium refuses `writeText` to an automated page unless the permission is
	 * granted, and refuses the `execCommand` fallback with it — so without this a
	 * copy silently does nothing and the page correctly declines to confirm
	 * anything, which reads as a page bug and is a harness one.
	 *
	 * Only Chromium takes these. Firefox and WebKit reject the names outright and
	 * allow `writeText` off a real gesture instead, which is what a click is.
	 */
	if (browserName === 'chromium') {
		await context.grantPermissions(['clipboard-read', 'clipboard-write']);
	}
	await page.goto('/emoji-viewer');

	/*
	 * WAIT FOR THE PAGE TO BE TAKEN OVER, and this is not a nicety.
	 *
	 * Every page here is prerendered, so all 771 buttons are in the HTML and
	 * clickable before Svelte has attached a single handler. A test that clicks
	 * the instant the element is visible presses a button that does nothing yet
	 * — and then reports the page as broken, which cost an hour of hunting the
	 * clipboard for a fault that was never there.
	 *
	 * The TOC's mark is written by an effect that only runs on the client, so its
	 * arrival is the moment the client has the page. `attached` and not `visible`:
	 * the rail is display:none below 70rem, where it is still perfectly hydrated.
	 */
	await page
		.locator('.toc a[aria-current="location"]')
		.first()
		.waitFor({ state: 'attached' });
});

/*
 * THE COUNT IS THE POINT OF THIS TEST, and it is not a vanity assertion.
 *
 * The wall is keyed by the emoji character, so one character appearing twice in
 * a group stops the render partway — which is exactly what the list did when it
 * arrived, with 🐝 in it as both "honeybee" and "bee". The page came up with
 * seven groups and no search field, and finding out why took a browser session.
 * This asks the question in a second.
 */
test('every group and every emoji is on the page', async ({ page }) => {
	await expect(page.locator('.group')).toHaveCount(9);
	await expect(page.locator('.wall button')).toHaveCount(771);
});

test('a search narrows the wall to the groups that still have something in them', async ({
	page,
}) => {
	const search = page.getByRole('searchbox');
	await search.fill('cat');

	await expect(page.locator('.group')).toHaveCount(2);
	await expect(page.locator('.wall button')).toHaveCount(4);
	// The list beside the wall narrows with it, rather than offering a jump to a
	// group that is no longer there.
	await expect(page.locator('.toc a')).toHaveCount(2);
});

test('a search that finds nothing says so', async ({ page }) => {
	await page.getByRole('searchbox').fill('zzzzz');

	await expect(page.locator('.group')).toHaveCount(0);
	await expect(page.getByText('I found nothing for')).toBeVisible();
});

test('escape clears the search without taking the focus away', async ({
	page,
}) => {
	const search = page.getByRole('searchbox');
	await search.fill('cat');
	await expect(page.locator('.group')).toHaveCount(2);

	await search.press('Escape');

	await expect(search).toHaveValue('');
	await expect(page.locator('.group')).toHaveCount(9);
	// Clearing is not leaving. Losing the focus here would drop a keyboard
	// visitor back at the top of the document.
	await expect(search).toBeFocused();
});

test('the search field is named, and not merely placeheld', async ({
	page,
}) => {
	// A placeholder leaves as soon as anyone types and is not announced by every
	// screen reader, so the field carries a real label as well.
	await expect(
		page.getByRole('searchbox', { name: 'Search the emojis by name' }),
	).toBeVisible();
});

test('an emoji is named by its name, and its glyph is not read out', async ({
	page,
}) => {
	const cell = page.getByRole('button', { name: 'thumbs up', exact: true });
	await expect(cell).toBeVisible();
	// The character is inside an aria-hidden span: a screen reader attempting the
	// glyph helps nobody, and the name is what carries the meaning.
	await expect(cell.locator('span[aria-hidden="true"]')).toHaveText('👍');
});

test('choosing an emoji confirms it, in words and on the cell', async ({
	page,
}) => {
	const cell = await pressCell(page, 'grinning face');

	// Said in words for anyone who cannot see the wall...
	const note = page.locator('.note');
	await expect(note).toHaveAttribute('role', 'status');
	await expect(note).toContainText('copied');

	// ...and shown on the thing that was just pressed, for anyone who can.
	await expect(cell).toHaveClass(/copied/);
	await expect(cell).toHaveCSS('background-color', 'rgb(255, 214, 10)');
});

/*
 * The clipboard itself, and only where it can be read. Chromium is the one
 * engine that will hand a test the permission; the others refuse, which is why
 * the test above checks what the page SAYS happened and this one checks what
 * actually did.
 */
test('the emoji really reaches the clipboard', async ({
	page,
	context,
	browserName,
}) => {
	test.skip(
		browserName !== 'chromium',
		'Only Chromium grants clipboard-read to a test.',
	);
	// The permission is already granted in beforeEach; `context` is named here so
	// the reason this test is Chromium-only stays next to the test.
	void context;

	await pressCell(page, 'grinning face');

	const clipboard = await page.evaluate(() => navigator.clipboard.readText());
	expect(clipboard).toBe('😀');
});

test('the confirmation line holds its height, so the wall never jumps', async ({
	page,
}) => {
	const note = page.locator('.note');
	const before = await note.boundingBox();

	await pressCell(page, 'grinning face');
	await expect(note).toContainText('copied');

	const after = await note.boundingBox();
	expect(after?.height).toBe(before?.height);
});
