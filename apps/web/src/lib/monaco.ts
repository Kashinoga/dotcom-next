/*
 * MONACO, VS CODE'S OWN EDITOR, from the parts a Markdown editor needs: the
 * editor, every editing feature VS Code has, and the Markdown language. Not
 * the TypeScript, CSS, HTML and JSON services, which it would carry for
 * nothing. The sheet loads this, and only in a browser: Monaco has no server
 * side, and this page is prerendered.
 */
import * as monaco from 'monaco-editor/editor';
import 'monaco-editor/features/register.all';
import 'monaco-editor/languages/definitions/markdown/register';
import EditorWorker from 'monaco-editor/editor/editor.worker?worker';

/* One worker, the editor's own. There is no language service to need another. */
self.MonacoEnvironment = { getWorker: () => new EditorWorker() };

export { monaco };

/*
 * ONE MODEL PER DOCUMENT, kept for as long as the page is, so each keeps its
 * own undo history across switching documents and views — as a tab in VS Code
 * does. Keyed by what the page calls the document: a scratch note's number or
 * a file's path.
 */
const models = new Map<string, monaco.editor.ITextModel>();

export function modelFor(key: string, value: string, language: string) {
	let model = models.get(key);
	if (!model || model.isDisposed()) {
		/* Line endings as VS Code's `files.eol: auto` has them: a document keeps
		 * the ones it has, and one that has none yet takes the machine's. A phone
		 * is never Windows, so its textarea's LF agrees. */
		model = monaco.editor.createModel(value, language);
		models.set(key, model);
	}
	if (model.getLanguageId() !== language) {
		monaco.editor.setModelLanguage(model, language);
	}
	return model;
}

/* A colour Monaco can take: it wants #rrggbb, and a token may be #rgb. */
function hex(value: string) {
	const short = /^#([\da-f])([\da-f])([\da-f])$/i.exec(value.trim());
	return short
		? `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`
		: value.trim();
}

/*
 * THE SHEET'S OWN INK, read off the page rather than copied, and NO GROUND OF
 * ITS OWN: the editor is transparent and the sheet shows through, as it did
 * through the textarea, so the two can never be two different colours. On VS
 * Code's own light and dark themes otherwise, which is where its colours for a
 * cursor, a selection and a match come from.
 *
 * The exceptions: the heading that sticks to the top while scrolling, which
 * sits over the words and has to hide them; and the minimap and the overview
 * ruler beside the scrollbar, canvases with no alpha, where "transparent" is
 * drawn as black.
 */
const CLEAR = '#00000000';

export function applyTheme(dark: boolean) {
	const style = getComputedStyle(document.documentElement);
	const bg = hex(style.getPropertyValue('--bg'));
	const fg = hex(style.getPropertyValue('--fg'));
	const name = dark ? 'sheet-dark' : 'sheet-light';

	monaco.editor.defineTheme(name, {
		base: dark ? 'vs-dark' : 'vs',
		inherit: true,
		rules: [],
		colors: {
			'editor.background': CLEAR,
			'editorGutter.background': CLEAR,
			'minimap.background': bg,
			'editorOverviewRuler.background': bg,
			'editorStickyScroll.background': bg,
			'editor.foreground': fg,
			'editorLineNumber.foreground': `${fg}66`,
			'editorLineNumber.activeForeground': fg,
		},
	});
	monaco.editor.setTheme(name);
}
