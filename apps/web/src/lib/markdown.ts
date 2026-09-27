/*
 * MARKDOWN, SET THE WAY VS CODE SETS IT. The Text Editor takes vscode.dev as
 * the reference for what is underneath, so a document looks here as it does
 * there: the same parser, markdown-it, with the defaults of VS Code's preview —
 * raw HTML allowed, bare URLs linked but not bare domains, no hard breaks from
 * single newlines, no typographer.
 *
 * One parse answers both panes. The proof gets the HTML and the outline gets
 * the headings, each carrying the SOURCE LINE it was found on, which is how
 * VS Code puts a caret on a heading and scrolls its preview to one.
 */
import GithubSlugger from 'github-slugger';
import DOMPurify from 'dompurify';
import markdownit, { type StateBlock, type Token } from 'markdown-it';

export type Heading = {
	text: string;
	/* 1 for `#`, 6 for `######`. */
	depth: number;
	/* Zero-based, the line the heading starts on in the source. */
	line: number;
	id: string;
};

export type Rendered = { html: string; headings: Heading[] };

const md = markdownit({
	html: true,
	linkify: true,
	breaks: false,
	typographer: false,
});

// VS Code's own setting: `example.com` stays text, `https://example.com` links.
md.linkify.set({ fuzzyLink: false });

/*
 * FRONT MATTER IS HIDDEN, VS Code's default. Without this the opening `---`
 * reads as a rule and the YAML under it as a paragraph set in the proof.
 */
md.block.ruler.before(
	'table',
	'front_matter',
	(state: StateBlock, start: number, end: number, silent: boolean) => {
		if (start !== 0 || lineAt(state, 0) !== '---') return false;

		let close = 1;
		while (close < end && lineAt(state, close) !== '---') close++;
		if (close >= end) return false;
		if (silent) return true;

		const token = state.push('front_matter', '', 0);
		token.map = [0, close + 1];
		token.hidden = true;
		state.line = close + 1;
		return true;
	},
);
md.renderer.rules.front_matter = () => '';

function lineAt(state: StateBlock, line: number) {
	return state.src.slice(state.bMarks[line], state.eMarks[line]).trimEnd();
}

/*
 * THE LINE EACH BLOCK CAME FROM, as `data-line`: VS Code's source-map plugin.
 * An attribute and not an id, because DOMPurify strips an id that shares a
 * name with a property of `document` — a heading called "Title" would lose it.
 */
md.core.ruler.push('source_line', (state) => {
	for (const token of state.tokens) {
		if (token.map && token.type !== 'inline') {
			token.attrSet('data-line', String(token.map[0]));
			token.attrJoin('dir', 'auto');
		}
	}
});

function plain(token: Token): string {
	return token.children
		? token.children.map(plain).join('')
		: token.type === 'text' || token.type === 'code_inline'
			? token.content
			: '';
}

/*
 * VS CODE'S NOTEBOOK SETTINGS. Its preview is a sandboxed iframe and needs no
 * sanitising; a Markdown cell in a notebook is not, and neither is this proof.
 * A document from a shared drive can carry a script, and here it would run on
 * the site's own origin.
 */
function clean(html: string) {
	// The page is prerendered with nothing in it. Only a browser has words to set.
	if (typeof window === 'undefined') return '';
	return DOMPurify.sanitize(html);
}

/*
 * LINKS OUT OPEN BESIDE THE EDITOR, and not over it, as VS Code opens them in a
 * browser. A link within the workspace is the page's to handle — see the proof.
 */
if (typeof window !== 'undefined') {
	DOMPurify.addHook('afterSanitizeAttributes', (node) => {
		if (
			node.tagName === 'A' &&
			/^https?:/i.test(node.getAttribute('href') ?? '')
		) {
			node.setAttribute('target', '_blank');
			node.setAttribute('rel', 'noopener noreferrer');
		}
	});
}

export function set(source: string): Rendered {
	const env = {};
	const tokens = md.parse(source, env);
	const slugger = new GithubSlugger();
	const headings: Heading[] = [];

	tokens.forEach((token, i) => {
		if (token.type !== 'heading_open' || !token.map) return;
		const text = plain(tokens[i + 1]);
		const id = slugger.slug(text);
		token.attrSet('id', id);
		headings.push({
			text,
			depth: Number(token.tag.slice(1)),
			line: token.map[0],
			id,
		});
	});

	return {
		html: clean(md.renderer.render(tokens, md.options, env)),
		headings,
	};
}

/* What VS Code opens in its Markdown preview. Anything else has nothing to set. */
export function isMarkdown(path: string) {
	return /\.(md|markdown|mdown|mkd|mkdn|mdwn)$/i.test(path);
}
