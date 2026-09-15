/*
 * WHAT A PAGE ASKS THE BAR TO SAY: a name to stand beside the site's once the
 * page's own title has scrolled away, and a line of status at the end.
 *
 * The words belong to the PAGE and the bar is in the LAYOUT, which is the reason
 * $lib/panel.svelte.ts and $lib/view.svelte.ts exist, and this is the same
 * arrangement: a page claims what it wants shown while it is mounted, and the
 * claim's cleanup takes it back out when the page goes.
 *
 * NOT THE APPS' NAME. An app in $lib/apps has its name REPLACE the site's in the
 * bar, because on a fullscreen app the bar is the app's chrome. A page claiming a
 * title here is still a page of the site, so its name is ADDED after the site's
 * — "Kashinoga | GG in Hawaii '26" — and the site's name never leaves.
 */

export type BarTone = 'quiet' | 'busy' | 'alert';

export interface BarStatus {
	text: string;
	/*
	 * `quiet` is nothing to act on, `busy` is work under way, and `alert` is the
	 * one a reader must see — which is why, on a narrow bar where the words give
	 * way to a mark, an alert keeps its words.
	 */
	tone: BarTone;
}

let title = $state<string | null>(null);
let status = $state<BarStatus | null>(null);

export const bar = {
	get title() {
		return title;
	},

	get status() {
		return status;
	},

	/* Call inside an $effect. Returns the cleanup, so the name leaves with the page
	 * — and so an effect re-run with a new name replaces the old one in a step. */
	name(value: string) {
		title = value;
		return () => {
			title = null;
		};
	},

	/* The same, for the status line. */
	report(value: BarStatus) {
		status = value;
		return () => {
			status = null;
		};
	},
};
