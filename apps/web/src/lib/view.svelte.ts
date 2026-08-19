/*
 * HOW THE DOCUMENT IS BEING LOOKED AT, and where the keys that change it are
 * drawn.
 *
 * The keys are in the BAR and the panes are on the PAGE, which is why this
 * exists at all — the same reason $lib/panel.svelte.ts does, and it is worth
 * saying why they are two files rather than one. A panel is a switch: it is on
 * or it is off, there are exactly two of them, and neither knows the other. This
 * is a CHOICE OF ONE FROM A LIST, and the list is part of it. Folding them
 * together would mean a shape general enough to be both and specific enough to
 * be neither.
 *
 * THEY WERE ON THE DESK BEFORE THIS, in a row above the sheet, on the argument
 * that a control belonging to the document should not sit among controls
 * belonging to the site. That argument was about a bar that carries the SITE.
 * On a fullscreen app it carries the app — its name, its mark, its panel
 * switches — so the keys are already among their own kind up there, and the row
 * they left behind was a strip of desk not being worked on.
 */

import type { Component } from 'svelte';
// One deep import per icon, as everywhere else — the root `@lucide/svelte`
// makes the dev server pre-bundle all 1600.
import Columns2 from '@lucide/svelte/icons/columns-2';
import Eye from '@lucide/svelte/icons/eye';
import SquarePen from '@lucide/svelte/icons/square-pen';

export type ViewId = 'edit' | 'preview' | 'split';

/*
 * THE THREE WAYS TO LOOK AT A DOCUMENT. `split` is the one that costs a decision
 * in the stylesheet — it wants a window wide enough to hold two columns of
 * readable text, and below that width it stacks them rather than halving one.
 *
 * The list lives here and not on the page because the BAR draws it now. The page
 * reads `current` and nothing else; it does not need to know how many there are.
 */
export const VIEWS: {
	id: ViewId;
	name: string;
	hint: string;
	Icon: Component;
}[] = [
	{ id: 'edit', name: 'Edit', hint: 'Type on the sheet', Icon: SquarePen },
	{ id: 'preview', name: 'Preview', hint: 'Read it set', Icon: Eye },
	{ id: 'split', name: 'Split', hint: 'Both at once', Icon: Columns2 },
];

/*
 * A page with these keys CLAIMS them while it is mounted, and the bar draws them
 * only while somebody has. Keys for a document that is not on the page would be
 * keys for nothing.
 */
let present = $state(false);

/*
 * SPLIT IS WHERE IT OPENS. The source and the setting are the two halves of what
 * this app is for, and showing one of them first would be a claim about which
 * half matters — made on a visitor's behalf, before they have said anything.
 *
 * On a narrow window the two stack rather than standing side by side, so this is
 * a sensible thing to open with at any size.
 */
let current = $state<ViewId>('split');

export const view = {
	get present() {
		return present;
	},

	get current() {
		return current;
	},

	show(id: ViewId) {
		current = id;
	},

	/* Call inside an $effect from the page that owns the panes. Returns the
	 * cleanup, so leaving the page takes the keys out of the bar with it. */
	claim() {
		present = true;
		return () => {
			present = false;
		};
	},
};
