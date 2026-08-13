<script lang="ts">
	import Search from '@lucide/svelte/icons/search';
	import X from '@lucide/svelte/icons/x';

	/*
	 * A SEARCH FIELD, and the first control on this site that takes typing.
	 *
	 * `value` is bindable, so the page that owns the query keeps owning it. This
	 * component decides how a search looks and behaves and holds no state of its
	 * own beyond the element it draws.
	 */
	let {
		value = $bindable(''),
		label,
		placeholder = '',
	}: { value?: string; label: string; placeholder?: string } = $props();

	let input: HTMLInputElement | undefined = $state();

	/*
	 * Escape clears the field, which is what every search box a reader has ever
	 * used already does. The focus stays put: clearing is not leaving.
	 */
	function onkeydown(event: KeyboardEvent) {
		if (event.key === 'Escape' && value !== '') {
			value = '';
			event.preventDefault();
		}
	}

	// Focus goes back to the field after the clear button removes itself, or it
	// would fall to the top of the document and the next Tab would start over.
	function clear() {
		value = '';
		input?.focus();
	}
</script>

<div class="field">
	<!--
		The icon is decoration: the field is already named by its <label>, and a
		screen reader announcing "search, search" helps nobody.
	-->
	<span class="icon" aria-hidden="true"><Search /></span>

	<!--
		`type="search"`, so a browser treats it as one — mobile keyboards offer a
		Search key, and password managers leave it alone.

		The label is visually hidden rather than absent. A placeholder is not a
		label: it leaves as soon as anyone types, and it is not announced by every
		screen reader.
	-->
	<label class="visually-hidden" for="search-field">{label}</label>
	<input
		bind:this={input}
		bind:value
		id="search-field"
		type="search"
		{placeholder}
		autocomplete="off"
		autocapitalize="off"
		spellcheck="false"
		{onkeydown}
	/>

	{#if value}
		<button type="button" onclick={clear} aria-label="Clear the search">
			<X />
		</button>
	{/if}
</div>

<style>
	/*
	 * The box is drawn on this wrapper and not on the <input>, so the icon and the
	 * clear button sit INSIDE the same rectangle as the text. An input cannot hold
	 * another element, and a border on the input alone would leave the two
	 * standing outside the field they belong to.
	 */
	.field {
		display: flex;
		align-items: center;
		gap: var(--space-xs);

		padding-inline: var(--space-s);
		/* 2.75rem is 44px, the same target the header controls take. */
		block-size: 2.75rem;
		border: 1px solid color-mix(in oklab, var(--fg) 16%, transparent);
	}

	/* The ring goes on the BOX, because the box is what reads as the control. The
	 * input's own outline would draw inside the border and look like a mistake. */
	.field:focus-within {
		outline: 2px solid var(--fg);
		outline-offset: 2px;
	}

	.icon {
		display: inline-flex;
		flex: none;
	}

	.icon :global(svg),
	button :global(svg) {
		inline-size: 1.125rem;
		block-size: 1.125rem;
	}

	input {
		flex: 1;
		/* Without this a flex item refuses to shrink below its content, and a long
		 * query would push the clear button out of the box. */
		min-inline-size: 0;

		border: none;
		background: none;
		color: inherit;
		font: inherit;
		/* The box already draws the ring, on `:focus-within` above. */
		outline: none;
	}

	/* WebKit draws its own clear button on a search input, and it is not the one
	 * above. Two of them is one too many. */
	input::-webkit-search-cancel-button {
		display: none;
	}

	button {
		display: inline-flex;
		flex: none;
		appearance: none;
		border: none;
		background: none;
		padding: 0;
		color: inherit;
		cursor: pointer;
	}

	/*
	 * Off the screen but NOT out of the accessibility tree. `display: none` and
	 * `visibility: hidden` would take the label away from a screen reader too,
	 * which is the one thing it is here for.
	 */
	.visually-hidden {
		position: absolute;
		inline-size: 1px;
		block-size: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
</style>
