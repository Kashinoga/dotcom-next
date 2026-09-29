<script lang="ts">
	import type { Snippet } from 'svelte';
	import { blur } from 'svelte/transition';
	import { morphIn, morphOut } from '$lib/motion';

	/*
	 * WORDS THAT CHANGE IN PLACE, morphing from the old to the new: the old
	 * blurs out, and the new blurs in half a beat behind it. Emoji Viewer's
	 * copied line and the Weather app's temperatures both wear it; the recipe
	 * lives here so there is one of it.
	 *
	 * `key` is what the words depend on. When it changes the words are a new
	 * block, which is what gives the transition something to play on — a swap
	 * of text in place leaves nothing on the page to animate.
	 *
	 * Transitions are local to the key here, so a block ABOVE this one being
	 * redrawn — a different city, say — does not play them.
	 */
	let {
		key,
		align = 'start',
		children,
	}: {
		key: unknown;
		/*
		 * Where the two stand in their shared cell while both are drawn: with the
		 * text around them, so a number set flush to the end grows back from it
		 * and a centred one stays centred.
		 */
		align?: 'start' | 'center' | 'end';
		children: Snippet;
	} = $props();
</script>

<!--
	BOTH STAND IN THE SAME CELL, so the one leaving is still drawn while the one
	arriving is already there, and the line keeps its measure the whole time.
	A grid of one cell with both put in it, and not `position: absolute` on the
	outgoing one, which would hand the box no width at the moment it holds two.
-->
<span class="morph" style:justify-items={align}>
	{#key key}
		<span class="line" in:blur={morphIn()} out:blur={morphOut()}>
			{@render children()}
		</span>
	{/key}
</span>

<style>
	.morph {
		display: inline-grid;
	}

	.line {
		grid-area: 1 / 1;
	}
</style>
