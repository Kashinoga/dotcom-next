<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';

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
	 * The two colours go on <html>, and not on a wrapper element around the page.
	 * The background of <html> fills the whole window, so the default margin of
	 * <body> shows no white edge in dark mode. This is also why there is no
	 * stylesheet: two properties on one element need none.
	 */
	$effect(() => {
		const root = document.documentElement;
		root.style.backgroundColor = dark ? '#000' : '#fff';
		root.style.color = dark ? '#fff' : '#000';
	});

	function cycle() {
		mode = ORDER[(ORDER.indexOf(mode) + 1) % ORDER.length];
		localStorage.setItem(KEY, mode);
	}
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<button onclick={cycle}>
	Display Mode: {mode === 'system' ? `System (${dark ? 'Dark' : 'Light'})` : mode === 'dark' ? 'Dark' : 'Light'}
</button>

{@render children()}
