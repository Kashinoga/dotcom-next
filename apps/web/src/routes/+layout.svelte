<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';

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
	 * script in app.html sets them before the first paint. Only the label of the
	 * button can change, and it is below the fold of a visitor's attention.
	 */
	// `$state<Mode>` and not `let mode: Mode`. With the annotation, TypeScript sees
	// only the initial value and narrows the type to 'system', because each write
	// below happens inside a callback it cannot follow. Every comparison with
	// 'dark' is then an error.
	let mode = $state<Mode>('system');
	let systemDark = $state(false);

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
	 * The colours go on <html>, and not on a wrapper element around the page. The
	 * background of <html> fills the whole window, so the default margin of <body>
	 * shows no white edge in dark mode. This is also why there is no stylesheet:
	 * three properties on one element need none.
	 *
	 * `colorScheme` is the third, and it is not decoration. A <button> does not
	 * inherit `color`: the browser paints it with its own system colours, which
	 * are the LIGHT ones until this property says otherwise. Without it the site
	 * went black and the one button on it stayed a light grey slab with black
	 * text — measured, in a screenshot. It also fixes the scrollbar and each form
	 * control the site will grow later.
	 */
	$effect(() => {
		const root = document.documentElement;
		root.style.backgroundColor = dark ? '#000' : '#fff';
		root.style.color = dark ? '#fff' : '#000';
		root.style.colorScheme = dark ? 'dark' : 'light';
	});

	function cycle() {
		mode = ORDER[(ORDER.indexOf(mode) + 1) % ORDER.length];
		localStorage.setItem(KEY, mode);
	}

	// The icon shows the SETTING, and not what it resolves to. `Monitor` therefore
	// stays while the system moves between light and dark. A component held in a
	// variable is rendered as <Icon />, which Svelte 5 permits.
	const Icon = $derived(mode === 'system' ? Monitor : mode === 'dark' ? Moon : Sun);
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<!--
	The icon draws itself in `currentColor`, so it needs no rule of its own. Note
	that inside a button `currentColor` is the colour of the BUTTON, and not the
	one set on <html>. `colorScheme` above is what makes the two agree.
-->
<button onclick={cycle}>
	<Icon size={16} />
	Display Mode: {mode === 'system' ? `System (${dark ? 'Dark' : 'Light'})` : mode === 'dark' ? 'Dark' : 'Light'}
</button>

{@render children()}
