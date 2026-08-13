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
	class="control"
	type="button"
	onclick={() => displayMode.cycle()}
	aria-label="Display mode: {label}. Change it."
	title="Display mode: {label}"
>
	<Icon />
</button>
