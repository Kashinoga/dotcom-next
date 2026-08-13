<script lang="ts">
	/*
	 * One deep import per icon. Each is its own module, so this puts three icons
	 * in the bundle and leaves the other 1600 out. The root import gets the same
	 * build, but makes the dev server pre-bundle the whole set.
	 */
	import Monitor from '@lucide/svelte/icons/monitor';
	import Moon from '@lucide/svelte/icons/moon';
	import Sun from '@lucide/svelte/icons/sun';

	import { displayMode } from '$lib/display-mode.svelte';

	$effect(() => displayMode.watch());
	$effect(() => displayMode.apply());

	// The icon shows the setting and not what it resolves to, so Monitor stays
	// while the machine moves between light and dark.
	const Icon = $derived(
		displayMode.mode === 'system'
			? Monitor
			: displayMode.mode === 'dark'
				? Moon
				: Sun,
	);

	// The button has no words, so this is its name. It gives the state and the
	// action, because either alone leaves a question: "Dark" does not say that
	// pressing does anything.
	const label = $derived(
		displayMode.mode === 'system'
			? `System (${displayMode.dark ? 'Dark' : 'Light'})`
			: displayMode.mode === 'dark'
				? 'Dark'
				: 'Light',
	);
</script>

<!--
	`type="button"` because the default is `submit`. There is no form here today,
	and this costs nothing to be right about before there is one.
-->
<button
	type="button"
	onclick={() => displayMode.cycle()}
	aria-label="Display mode: {label}. Change it."
	title="Display mode: {label}"
>
	<Icon />
</button>

<style>
	button {
		/* The chrome is ours, all of it. `ButtonFace` and `ButtonBorder` resolve to
		 * different colours in each engine, so a browser-drawn circle would not
		 * match itself between Chrome, Safari and Firefox. */
		appearance: none;
		background: none;
		border: none;
		padding: 0;
		color: inherit;
		cursor: pointer;

		/* Square, so the radius draws a circle and not an egg. 2.75rem is 44px,
		 * the smallest target a finger hits reliably. */
		inline-size: 2.75rem;
		block-size: 2.75rem;
		border-radius: var(--radius-round);

		/* Centre the icon. Without this it sits on the baseline of a line box with
		 * no text in it. */
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}

	button:hover {
		background-color: var(--surface-hover);
	}

	/* The browser's focus ring left with `appearance`, so draw one. The offset
	 * keeps it clear of the circle instead of tracing its edge. */
	button:focus-visible {
		outline: 2px solid var(--fg);
		outline-offset: 2px;
	}

	/* In rem, so the icon grows with the button when a visitor sets a larger text
	 * size. Lucide's `size` prop would fix it in pixels while the button moved. */
	button :global(svg) {
		inline-size: 1.125rem;
		block-size: 1.125rem;
	}
</style>
