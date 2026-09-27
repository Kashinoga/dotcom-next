import adapter from '@sveltejs/adapter-cloudflare';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true,
			},
			adapter: adapter(),
		}),
	],

	/*
	 * THE TEXT EDITOR'S LIBRARIES, bundled when the dev server starts rather than
	 * found on the first visit. They are imported late, so the server otherwise
	 * meets them mid-page, bundles them, and reloads the page under whoever is
	 * using it — a test, as often as not.
	 */
	optimizeDeps: {
		include: [
			'monaco-editor/editor',
			'monaco-editor/features/register.all',
			'monaco-editor/languages/definitions/markdown/register',
			'highlight.js/lib/common',
		],
	},
});
