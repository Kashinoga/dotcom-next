/*
 * THE DURATION, READ OFF THE PAGE rather than repeated in it.
 *
 * `--motion-morph` is declared in src/app.css, and a media query there drops it
 * to zero for a visitor who has asked for less motion. A CSS transition reads it
 * by writing `var(--motion-morph)`; a Svelte transition cannot, because it wants
 * a number. This is how it gets one — from the same declaration, so the two
 * cannot drift apart and the reduced-motion answer is given once.
 */
export function morphDuration() {
	// Transitions only ever run in the browser, but a component may evaluate this
	// while being rendered on the server, where there is no document to ask.
	if (typeof document === 'undefined') return 0;

	const raw = getComputedStyle(document.documentElement).getPropertyValue(
		'--motion-morph',
	);

	// '180ms' parses to 180; '0ms' to 0. A missing token parses to NaN, and a
	// transition given NaN never finishes — so an unreadable value means no
	// animation rather than a stuck one.
	const ms = Number.parseFloat(raw);
	return Number.isFinite(ms) ? ms : 0;
}
