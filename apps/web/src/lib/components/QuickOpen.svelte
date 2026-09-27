<!--
	GO TO FILE, VS Code's Quick Open: a box at the top of the window, the files
	and notes under it, narrowed as a name is typed. Monaco's own picker lists
	only the editor's commands and cannot be handed files, so this is its own.

	A popover, so the browser gives it the top layer, a light dismiss and Escape.
	The list is a listbox the input controls, as VS Code's is.
-->
<script lang="ts" module>
	export type Item = {
		key: string;
		label: string;
		detail: string;
		run: () => void;
	};
</script>

<script lang="ts">
	import { tick } from 'svelte';

	let { items }: { items: Item[] } = $props();

	let box = $state<HTMLElement | null>(null);
	let input = $state<HTMLInputElement | null>(null);
	let query = $state('');
	let active = $state(0);
	let returnTo: HTMLElement | null = null;

	/*
	 * VS CODE'S KIND OF MATCH: the letters typed, in order, not necessarily
	 * together — `crm` finds "The Curriculum.md". A run of them together ranks
	 * above letters scattered, and an earlier run above a later one. The name is
	 * tried before the folder it is in, and only the name is marked.
	 */
	function lettersIn(query: string, text: string) {
		const q = query.toLowerCase();
		const t = text.toLowerCase();
		const at = t.indexOf(q);
		if (at >= 0) return { hits: [...q].map((_, i) => at + i), rank: at };

		const hits: number[] = [];
		for (let i = 0; i < t.length && hits.length < q.length; i += 1) {
			if (t[i] === q[hits.length]) hits.push(i);
		}
		if (hits.length < q.length) return null;
		return { hits, rank: 100 + hits[hits.length - 1] - hits[0] };
	}

	const shown = $derived.by(() => {
		const q = query.trim();
		if (!q) return items.map((item) => ({ item, hits: new Set<number>() }));

		return items
			.map((item) => {
				const name = lettersIn(q, item.label);
				if (name) return { item, hits: new Set(name.hits), rank: name.rank };
				const path = lettersIn(q, `${item.detail}/${item.label}`);
				return path
					? { item, hits: new Set<number>(), rank: 1000 + path.rank }
					: null;
			})
			.filter((found) => found !== null)
			.sort((a, b) => a.rank - b.rank);
	});

	export async function show() {
		returnTo = document.activeElement as HTMLElement | null;
		query = '';
		active = 0;
		await tick();
		box?.showPopover();
		input?.focus();
	}

	function choose(item: Item | undefined) {
		if (!item) return;
		returnTo = null;
		box?.hidePopover();
		item.run();
	}

	function keys(event: KeyboardEvent) {
		const count = shown.length;
		if (event.key === 'ArrowDown' && count) {
			event.preventDefault();
			active = (active + 1) % count;
		} else if (event.key === 'ArrowUp' && count) {
			event.preventDefault();
			active = (active - 1 + count) % count;
		} else if (event.key === 'Enter') {
			event.preventDefault();
			choose(shown[active]?.item);
		}
	}
</script>

<div
	bind:this={box}
	class="quick"
	popover="auto"
	role="dialog"
	aria-label="Go to File"
	ontoggle={(event) => {
		if ((event as ToggleEvent).newState !== 'closed') return;
		// Dismissed rather than chosen: the focus goes back where it was.
		returnTo?.focus();
		returnTo = null;
	}}
>
	<input
		bind:this={input}
		bind:value={query}
		type="text"
		role="combobox"
		aria-expanded="true"
		aria-controls="quick-list"
		aria-activedescendant={shown.length ? `quick-${active}` : undefined}
		aria-label="Search files by name"
		placeholder="Search files by name"
		autocomplete="off"
		spellcheck="false"
		oninput={() => (active = 0)}
		onkeydown={keys}
	/>

	<ul id="quick-list" role="listbox" aria-label="Files">
		{#each shown as { item, hits }, i (item.key)}
			<!-- The input keeps the focus and the keys; a pointer may still choose. -->
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<li
				id="quick-{i}"
				role="option"
				aria-selected={i === active}
				onclick={() => choose(item)}
				onpointermove={() => (active = i)}
			>
				<span class="label"
					>{#each [...item.label] as letter, at (at)}{#if hits.has(at)}<mark
								>{letter}</mark
							>{:else}{letter}{/if}{/each}</span
				>
				<span class="detail">{item.detail}</span>
			</li>
		{:else}
			<li class="none" role="option" aria-selected="false" aria-disabled="true">
				No matching results
			</li>
		{/each}
	</ul>
</div>

<style>
	/* At the top of the window and in its middle, where VS Code puts it. */
	.quick {
		position: fixed;
		inset: var(--space-8) 0 auto;
		margin: 0 auto;
		inline-size: min(36rem, calc(100vw - var(--space-32)));
		padding: var(--space-4);
		border: none;
		border-radius: var(--radius-m);
		background-color: var(--bg);
		color: var(--fg);
		box-shadow:
			0 0 0 1px var(--frame),
			0 var(--space-4) var(--space-16) rgb(0 0 0 / 16%);
		font-size: var(--text-label1);
	}

	.quick:popover-open {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}

	input {
		padding: var(--space-4) var(--space-8);
		border: none;
		border-radius: var(--radius-s);
		outline: 1px solid var(--fg);
		background-color: var(--bg);
		color: inherit;
		font: inherit;
	}

	ul {
		max-block-size: 60dvh;
		overflow-y: auto;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	li {
		display: flex;
		align-items: baseline;
		gap: var(--space-8);
		padding: var(--space-4) var(--space-8);
		border-radius: var(--radius-s);
		cursor: pointer;
	}

	li[aria-selected='true'] {
		background-color: var(--selected);
	}

	.none {
		color: color-mix(in oklab, var(--fg) 60%, transparent);
		cursor: default;
	}

	.detail {
		overflow: hidden;
		color: color-mix(in oklab, var(--fg) 60%, transparent);
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	/* The letters that matched, as VS Code marks them: in weight, not a box. */
	mark {
		background: none;
		color: inherit;
		font-weight: 600;
	}
</style>
