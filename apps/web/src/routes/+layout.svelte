<script lang="ts">
	/*
	 * INTER, hosted by this site and not by anybody else.
	 *
	 * The package holds the woff2 files; Vite bundles them into the build with a
	 * hashed name, so they are served from this origin. No CDN, so no third party
	 * learns who reads this site, and nothing here waits on a server we do not
	 * own.
	 *
	 * `opsz` is the cut with the OPTICAL SIZE axis as well as weight. See
	 * `font-optical-sizing` in app.css for what that buys. The italic file is
	 * declared beside it and is fetched only if the page ever sets italic text —
	 * without it a browser SLANTS the upright letters, which is not the same
	 * thing and looks it.
	 *
	 * Each @font-face in these files carries a `unicode-range`, so a page in
	 * English fetches the Latin subset and none of the others.
	 */
	import '@fontsource-variable/inter/opsz.css';
	import '@fontsource-variable/inter/opsz-italic.css';

	// The reset and the display-mode tokens. This is the root layout, so the
	// import puts them in front of every page.
	import '../app.css';

	/*
	 * ONE IMPORT PER ICON, and never `from '@lucide/svelte'`.
	 *
	 * Each icon is its own module in the package, so a deep import puts that icon
	 * in the bundle and leaves the other 1600 out. The root import gets the same
	 * result in a build, but it makes the dev server pre-bundle the whole set.
	 *
	 * The set is in node_modules to search when you need a name. It never ships.
	 */
	import Monitor from '@lucide/svelte/icons/monitor';
	import Moon from '@lucide/svelte/icons/moon';
	import Sun from '@lucide/svelte/icons/sun';

	let { children } = $props();

	type Mode = 'system' | 'light' | 'dark';

	const KEY = 'display-mode';
	const ORDER: Mode[] = ['system', 'light', 'dark'];

	/*
	 * `system` on the server AND on the first client render, so the two agree and
	 * hydration has nothing to correct. The stored choice arrives one tick later,
	 * in the first effect. The COLOURS are already correct by then, because the
	 * script in app.html sets the attribute before the first paint. Only the label
	 * of the button can change.
	 */
	// `$state<Mode>` and not `let mode: Mode`. With the annotation, TypeScript sees
	// only the initial value and narrows the type to 'system', because each write
	// below happens inside a callback it cannot follow. Every comparison with
	// 'dark' is then an error.
	let mode = $state<Mode>('system');
	let systemDark = $state(false);

	/*
	 * `dark` is for the LABEL of the button, and for nothing else. app.css decides
	 * what the page looks like. Keep it that way: two places that hold the same
	 * rule will disagree in the end.
	 */
	const dark = $derived(mode === 'dark' || (mode === 'system' && systemDark));

	// Read the stored choice once, then follow the system setting for as long as
	// this page lives. The listener is what makes `system` mean "now", and not
	// "what it was when the tab opened".
	$effect(() => {
		const stored = localStorage.getItem(KEY);
		if (stored === 'system' || stored === 'light' || stored === 'dark') mode = stored;

		const query = matchMedia('(prefers-color-scheme: dark)');
		systemDark = query.matches;

		const onChange = (event: MediaQueryListEvent) => (systemDark = event.matches);
		query.addEventListener('change', onChange);
		return () => query.removeEventListener('change', onChange);
	});

	/*
	 * ONE ATTRIBUTE ON <html>, and no colours. app.css reads it. No attribute is
	 * what `System` means there, so the setting is REMOVED rather than written —
	 * the CSS media query is then free to answer, and it answers again by itself
	 * when the machine changes.
	 */
	$effect(() => {
		const root = document.documentElement;
		if (mode === 'system') root.removeAttribute('data-mode');
		else root.dataset.mode = mode;
	});

	function cycle() {
		mode = ORDER[(ORDER.indexOf(mode) + 1) % ORDER.length];
		localStorage.setItem(KEY, mode);
	}

	// The icon shows the SETTING, and not what it resolves to. `Monitor` therefore
	// stays while the system moves between light and dark. A component held in a
	// variable is rendered as <Icon />, which Svelte 5 permits.
	const Icon = $derived(mode === 'system' ? Monitor : mode === 'dark' ? Moon : Sun);

	/*
	 * The button shows an icon and no words, so this sentence IS its name. It is
	 * what a screen reader announces and what the tooltip shows, and without it
	 * the control is a circle that reads as "button".
	 *
	 * It names the state AND the action, because either alone leaves a question:
	 * "Dark" does not say that pressing does anything, and "Change display mode"
	 * does not say what it is now.
	 */
	const label = $derived(
		mode === 'system' ? `System (${dark ? 'Dark' : 'Light'})` : mode === 'dark' ? 'Dark' : 'Light'
	);
</script>

<!--
	<header> and <main> are LANDMARKS. A screen reader can jump between them, and
	a keyboard visitor can skip straight to the content. They cost two tags. The
	button is chrome and belongs to the site, so it sits outside the content.

	The icon draws itself in `currentColor`, so it needs no rule of its own. Note
	that inside a button `currentColor` is the colour of the BUTTON, and not the
	one on <html>. `color-scheme` in app.css is what makes the two agree.
-->
<header>
	<button
		onclick={cycle}
		aria-label="Display mode: {label}. Change it."
		title="Display mode: {label}"
	>
		<Icon size={18} />
	</button>
</header>

<main>
	{@render children()}
</main>

<style>
	/* The rules of this component, which Svelte scopes to it. */

	header {
		display: flex;
		/* The bar holds one control and it sits at the END of the line — `flex-end`
		 * and not `right`, so the bar follows the writing direction of the document
		 * rather than assuming the world reads left to right. */
		justify-content: flex-end;
		padding: var(--space-m);
	}

	button {
		/* A square, so the radius below draws a circle and not an egg. 2.75rem is
		 * 44px, which is the smallest target a finger can hit reliably. The icon is
		 * 18px, and the rest is the room around it. */
		inline-size: 2.75rem;
		block-size: 2.75rem;
		border-radius: var(--radius-round);

		/* Centre the icon on both axes. Without this it would sit on the text
		 * baseline of a line box that has no text in it. */
		display: inline-flex;
		align-items: center;
		justify-content: center;

		/* The chrome stays the browser's, so the control still looks like a button
		 * a visitor's own system drew, and `color-scheme` keeps answering for it in
		 * dark mode. Only the SHAPE is ours. */
	}
</style>
