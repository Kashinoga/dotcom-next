import { expect, test, type Page } from '@playwright/test';

/*
 * WHAT MORE THAN ONE SPEC NEEDS: opening the editor, typing into it, and
 * reading pixels back off the page. Not a spec itself, so Playwright does not
 * run it.
 */

/*
 * WHAT REACHES THE SCREEN, read back from a screenshot. `color-mix`, a tint
 * laid over a frost and a blur all compute to strings that are not the pixel,
 * so a claim about how things LOOK side by side is asked of the pixels.
 */
export async function pixels(
	page: Page,
	points: Record<string, [number, number]>,
) {
	const shot = (await page.screenshot()).toString('base64');
	return page.evaluate(
		async ({ shot, points }) => {
			const img = new Image();
			img.src = `data:image/png;base64,${shot}`;
			await img.decode();
			const c = document.createElement('canvas');
			c.width = img.width;
			c.height = img.height;
			const ctx = c.getContext('2d')!;
			ctx.drawImage(img, 0, 0);
			return Object.fromEntries(
				Object.entries(points).map(([name, [x, y]]) => [
					name,
					[...ctx.getImageData(x, y, 1, 1).data.slice(0, 3)],
				]),
			);
		},
		{ shot, points },
	);
}

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
export async function editor(page: Page) {
	await page.goto('/text-editor');
	await page.locator('.workspace[data-ready]').waitFor({ state: 'attached' });
}

/*
 * THE SHEET, WHICH ON A COMPUTER IS MONACO once it has loaded — and these run
 * as a computer. Words go in as a paste, which is how a block of text arrives
 * in an editor; in Firefox they are typed a line at a time instead, since its
 * test driver neither hands Monaco a made-up paste nor types a line break into
 * it only once. Nothing written here is indented, so Monaco's keeping of the
 * last line's indent on Enter changes nothing.
 */
export async function monaco(page: Page) {
	const sheet = page.locator('.sheet .monaco-editor');
	await expect(sheet).toBeVisible();
	return sheet;
}

/* What the sheet says, as Monaco draws it — which is only the lines in view,
 * so this is for a document short enough to be seen whole. */
export async function words(page: Page) {
	const lines = (await monaco(page)).locator('.view-lines');
	return (await lines.innerText()).replace(/\u00a0/g, ' ');
}

/*
 * THE KEYS AS THE PAGE KNOWS THEM, read off its user agent as $lib/shortcuts
 * and Monaco read it, and not off the machine. The suite's device profiles
 * say Windows wherever they run, and Desktop Safari says Mac, so a Mac host
 * pressing ⌘ at a page that believes it is on Windows is ignored.
 */
export async function modifier(page: Page) {
	const mac = /Mac/.test(await page.evaluate(() => navigator.userAgent));
	return {
		key: mac ? 'Meta' : 'Control',
		// Monaco's start and end of a document: ⌘↑ and ⌘↓ on a Mac.
		documentStart: mac ? 'Meta+ArrowUp' : 'Control+Home',
		documentEnd: mac ? 'Meta+ArrowDown' : 'Control+End',
		// A copying drag: Option on a Mac, as the page's `copying` reads it.
		copy: mac ? 'Alt' : 'Control',
	};
}
