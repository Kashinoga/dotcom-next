/*
 * VS CODE'S KEYS, for what the Text Editor has of VS Code's workbench. Monaco
 * brings the editor's own — find, multiple cursors, moving lines — and these
 * are the ones that belong to the window around it, each from VS Code's source
 * with the key it has there. A browser keeps Ctrl+N, Ctrl+T and Ctrl+W for
 * itself, so where vscode.dev gives a web key instead, this gives the same one.
 *
 * Defined once and read twice: by the page, for a key pressed anywhere on it,
 * and by the sheet, which hands them to Monaco so its own keys do not swallow
 * them and so they are listed in its F1 palette.
 */

/* One press. `mod` is Ctrl, or Cmd on a Mac, as VS Code's CtrlCmd is; `code` is
 * the physical key, since Option on a Mac turns Z into Ω. */
export type Stroke = {
	code: string;
	mod?: boolean;
	shift?: boolean;
	alt?: boolean;
};

/* The ways to reach one command: each a single press, or a chord of two. */
export type Keys = (Stroke | [Stroke, Stroke])[];

export type Shortcut = {
	id: string;
	label: string;
	keys: Keys;
};

const platform = typeof navigator === 'undefined' ? '' : navigator.userAgent;
export const mac = /Mac/.test(platform);
const windows = /Windows/.test(platform);

const K = { code: 'KeyK', mod: true };

export const SHORTCUTS = {
	wordWrap: {
		id: 'editor.action.toggleWordWrap',
		label: 'View: Toggle Word Wrap',
		keys: [{ code: 'KeyZ', alt: true }],
	},
	togglePreview: {
		id: 'markdown.togglePreview',
		label: 'Markdown: Toggle Preview',
		keys: [{ code: 'KeyV', mod: true, shift: true }],
	},
	previewToSide: {
		id: 'markdown.showPreviewToSide',
		label: 'Markdown: Open Preview to the Side',
		keys: [[K, { code: 'KeyV' }]],
	},
	sideBar: {
		id: 'workbench.action.toggleSidebarVisibility',
		label: 'View: Toggle Primary Side Bar Visibility',
		keys: [{ code: 'KeyB', mod: true }],
	},
	secondarySideBar: {
		id: 'workbench.action.toggleAuxiliaryBar',
		label: 'View: Toggle Secondary Side Bar Visibility',
		keys: [{ code: 'KeyB', mod: true, alt: true }],
	},
	explorer: {
		id: 'workbench.view.explorer',
		label: 'View: Show Explorer',
		keys: [{ code: 'KeyE', mod: true, shift: true }],
	},
	save: {
		id: 'workbench.action.files.save',
		label: 'File: Save',
		keys: [{ code: 'KeyS', mod: true }],
	},
	quickOpen: {
		id: 'workbench.action.quickOpen',
		label: 'Go to File…',
		// Ctrl+E as well, except on a Mac, where VS Code gives only the one.
		keys: mac
			? [{ code: 'KeyP', mod: true }]
			: [
					{ code: 'KeyP', mod: true },
					{ code: 'KeyE', mod: true },
				],
	},
	/* vscode.dev's own: Ctrl+K N on Windows, Ctrl+Alt+N elsewhere, and Ctrl+N
	 * too, which a browser lets through only to a site installed as an app. */
	newFile: {
		id: 'workbench.action.files.newUntitledFile',
		label: 'File: New Untitled Text File',
		keys: [
			windows ? [K, { code: 'KeyN' }] : { code: 'KeyN', mod: true, alt: true },
			{ code: 'KeyN', mod: true },
		],
	},
	/* In the explorer this is the row's path; anywhere else, the open file's —
	 * VS Code's two commands for it, under the one chord. */
	copyRelativePath: {
		id: 'workbench.action.files.copyRelativePathOfActiveFile',
		label: 'File: Copy Relative Path of Active File',
		keys: [[K, { code: 'KeyC', mod: true, shift: true }]],
	},
} satisfies Record<string, Shortcut>;

export type ShortcutId = keyof typeof SHORTCUTS;

/* Does this key press match this stroke — no more modifiers and no fewer. */
export function pressed(event: KeyboardEvent, stroke: Stroke) {
	const mod = mac ? event.metaKey : event.ctrlKey;
	return (
		event.code === stroke.code &&
		mod === Boolean(stroke.mod) &&
		event.shiftKey === Boolean(stroke.shift) &&
		event.altKey === Boolean(stroke.alt)
	);
}

/* How a key reads in a tooltip: VS Code's own spelling of it. */
export function label(keys: Keys) {
	const one = (stroke: Stroke) =>
		[
			stroke.mod && (mac ? '⌘' : 'Ctrl'),
			stroke.shift && (mac ? '⇧' : 'Shift'),
			stroke.alt && (mac ? '⌥' : 'Alt'),
			stroke.code.replace(/^Key/, ''),
		]
			.filter(Boolean)
			.join(mac ? '' : '+');
	const first = keys[0];
	return Array.isArray(first) ? first.map(one).join(' ') : one(first);
}
