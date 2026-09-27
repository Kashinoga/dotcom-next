<!--
	THE SHEET, AS VS CODE DRAWS IT: Monaco, on a computer. A phone keeps the
	textarea, because Monaco's own README says it does not support mobile
	browsers — see the page.
-->
<script lang="ts">
	import { onMount } from 'svelte';

	import { displayMode } from '$lib/display-mode.svelte';
	import Placeholder from './Placeholder.svelte';

	type Loaded = typeof import('$lib/monaco');
	type Editor = import('monaco-editor/editor').editor.IStandaloneCodeEditor;

	let {
		key,
		value,
		language,
		label,
		readOnly = false,
		placeholder = '',
		oninput,
	}: {
		/* Which document: a model is kept per key, and its undo history with it. */
		key: string;
		value: string;
		language: 'markdown' | 'plaintext';
		label: string;
		readOnly?: boolean;
		placeholder?: string;
		oninput?: (value: string) => void;
	} = $props();

	let host: HTMLElement;
	let loaded = $state.raw<Loaded | null>(null);
	let editor = $state.raw<Editor | null>(null);

	/* True while the page, not the person, is changing the words, so the change
	 * is not handed back up as typing. */
	let quiet = false;

	onMount(() => {
		let gone = false;
		void import('$lib/monaco').then((module) => {
			if (gone) return;
			module.applyTheme(displayMode.dark);

			// The sheet's own face, size and leading, read off it.
			const style = getComputedStyle(host);
			const made = module.monaco.editor.create(host, {
				model: module.modelFor(key, value, language),
				ariaLabel: label,
				readOnly,
				placeholder,
				automaticLayout: true,
				fontFamily: style.fontFamily,
				fontSize: Number.parseFloat(style.fontSize),
				// Below 8, Monaco reads a line height as a multiple of the size.
				lineHeight:
					Number.parseFloat(style.lineHeight) /
					Number.parseFloat(style.fontSize),
				// VS Code's own defaults for Markdown: wrapped, and no suggestions.
				wordWrap: 'on',
				quickSuggestions: false,
			});
			made.onDidChangeModelContent(() => {
				if (!quiet) oninput?.(made.getValue());
			});

			loaded = module;
			editor = made;
		});

		return () => {
			gone = true;
			editor?.dispose();
		};
	});

	/* Another document, or new words for this one from outside — a note read
	 * back from storage, a file read again. */
	$effect(() => {
		if (!editor || !loaded) return;
		const model = loaded.modelFor(key, value, language);
		if (editor.getModel() !== model) editor.setModel(model);
		if (model.getValue() !== value) {
			quiet = true;
			model.setValue(value);
			quiet = false;
		}
	});

	$effect(() => {
		editor?.updateOptions({ readOnly, ariaLabel: label, placeholder });
	});

	/* The display mode, followed. A frame late, so the page's own colours have
	 * changed before they are read. */
	$effect(() => {
		const dark = displayMode.dark;
		if (!loaded) return;
		const module = loaded;
		const frame = requestAnimationFrame(() => module.applyTheme(dark));
		return () => cancelAnimationFrame(frame);
	});

	/* The caret to a line, and the line to the top of the sheet: what VS Code
	 * does when a heading in its outline is pressed. Zero-based, as the parse
	 * counts lines. */
	export function goTo(line: number) {
		if (!editor) return;
		editor.setPosition({ lineNumber: line + 1, column: 1 });
		editor.revealLineNearTop(line + 1);
		editor.focus();
	}
</script>

<div class="monaco">
	<div class="host" bind:this={host}></div>
	{#if !editor}
		<div class="waiting">
			<Placeholder
				shape="lines"
				label="Opening the editor."
				widths={[92, 88, 95, 60, 0, 85, 90, 40]}
			/>
		</div>
	{/if}
</div>

<style>
	/* The whole sheet: Monaco scrolls itself, and measures what it is given. */
	.monaco {
		position: relative;
		block-size: 100%;
	}

	.host {
		block-size: 100%;
		font-family: ui-monospace, monospace;
		font-size: var(--text-label1);
		line-height: var(--leading-prose);
	}

	.waiting {
		position: absolute;
		inset: 0;
	}
</style>
