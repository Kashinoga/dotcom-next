/*
 * What the visitor chose, and what their machine is set to.
 *
 * This knows no colours. It decides one attribute on <html>; app.css decides
 * what that attribute means.
 */

export type Mode = 'system' | 'light' | 'dark';

/*
 * The inline script in app.html reads this same key before the first paint, and
 * cannot import it — a module would be a second request in front of the paint
 * it exists to prevent. Change one and change the other.
 */
export const STORAGE_KEY = 'display-mode';

const ORDER: Mode[] = ['system', 'light', 'dark'];

function isMode(value: unknown): value is Mode {
	return value === 'system' || value === 'light' || value === 'dark';
}

/*
 * `system` on the server and on the first client render, so the two agree and
 * hydration has nothing to correct. The stored choice arrives one tick later.
 * The colours are already right by then, because app.html set the attribute
 * before the page painted; only the label of a control can change.
 */
let mode = $state<Mode>('system');
let systemDark = $state(false);

export const displayMode = {
	get mode() {
		return mode;
	},

	/* For the label of a control, and for nothing else. Two places holding the
	 * same rule will disagree in the end, so app.css keeps this one. */
	get dark() {
		return mode === 'dark' || (mode === 'system' && systemDark);
	},

	cycle() {
		mode = ORDER[(ORDER.indexOf(mode) + 1) % ORDER.length];
		localStorage.setItem(STORAGE_KEY, mode);
	},

	/* Call inside an $effect. Reads the stored choice once, then follows the
	 * machine for as long as the page lives — which is what `system` has to mean
	 * for it to mean anything. Returns the listener's cleanup. */
	watch() {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (isMode(stored)) mode = stored;

		const query = matchMedia('(prefers-color-scheme: dark)');
		systemDark = query.matches;

		const onChange = (event: MediaQueryListEvent) =>
			(systemDark = event.matches);
		query.addEventListener('change', onChange);
		return () => query.removeEventListener('change', onChange);
	},

	/* Call inside an $effect. No attribute is what `system` means in app.css, so
	 * the setting is removed rather than written: the media query is then free to
	 * answer, and answers again by itself when the machine changes. */
	apply() {
		const root = document.documentElement;
		if (mode === 'system') root.removeAttribute('data-mode');
		else root.dataset.mode = mode;
	},
};
