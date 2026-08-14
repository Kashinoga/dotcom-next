/*
 * THE SIDE PANELS, and where their switches live.
 *
 * A switch is in the BAR and the panel is on the PAGE, which is why this exists
 * at all: they are in two components that do not contain one another, so the
 * thing they share has to sit outside both.
 *
 * On a fullscreen app the bar is the app's chrome rather than the site's
 * furniture, and it had a great deal of empty middle. Moving the panels' names
 * up there took a heading off the workspace rail — where "Workspace" sat
 * directly above "Scratch", two dimmed lines of the same size reading as one —
 * and turned it into the control it had always been describing.
 *
 * TWO OF THEM AND NOT A LIST OF THEM. There are exactly two sides to a working
 * surface and they are named for what they hold rather than for where they sit,
 * because a page has a workspace and an outline — not a left and a right. A
 * general shape can be cut from this the day a second fullscreen app wants one,
 * which is the rule the rest of this repository follows.
 */
function side() {
	/*
	 * A page with this panel CLAIMS the switch while it is mounted, and the bar
	 * draws one only while somebody has. A control for a panel that is not on the
	 * page would be a control for nothing.
	 */
	let present = $state(false);

	/*
	 * OPEN TO BEGIN WITH. The workspace is how you reach a document and the
	 * outline is how you move around one; an editor that opens with both put away
	 * asks a visitor to find the switches before they can find anything else.
	 *
	 * Not kept between visits, deliberately, and not for long: whether this is a
	 * preference or a gesture is a question about how people use it, and that is
	 * not answerable yet.
	 */
	let open = $state(true);

	return {
		get present() {
			return present;
		},

		get open() {
			return open;
		},

		toggle() {
			open = !open;
		},

		/* Call inside an $effect from the page that owns the panel. Returns the
		 * cleanup, so leaving the page takes the switch out of the bar with it. */
		claim() {
			present = true;
			return () => {
				present = false;
			};
		},
	};
}

export const workspace = side();
export const outline = side();
