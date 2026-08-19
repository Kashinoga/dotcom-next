<script lang="ts">
	/*
	 * Inter, hosted by this site and not by anybody else. The package holds the
	 * woff2 files and Vite bundles them with hashed names, so they come from this
	 * origin: no CDN learns who reads this site, and nothing waits on a server we
	 * do not own.
	 *
	 * `opsz` is the cut with the optical size axis as well as weight. The italic
	 * file is declared beside it and fetched only if a page sets italic text —
	 * without it a browser slants the upright letters, which is not the same
	 * thing and looks it.
	 */
	import '@fontsource-variable/inter/opsz.css';
	import '@fontsource-variable/inter/opsz-italic.css';

	// The reset and the display-mode tokens, in front of every page.
	import '../app.css';

	/*
	 * One deep import per icon, for the reason given in DisplayModeButton.
	 *
	 * `heart-handshake` is the SITE MARK, the same drawing as static/favicon.svg
	 * — and it is imported here rather than pointed at that file on purpose. The
	 * favicon carries CSS answering `prefers-color-scheme`, because a browser tab
	 * is painted in the SYSTEM's colours. In the page that rule is wrong: a
	 * visitor reading in light while their machine is set to dark would get a
	 * white mark on a white bar. As a component it inherits `currentColor` and so
	 * follows this site's display mode, which is the thing it sits on.
	 */
	import ExternalLink from '@lucide/svelte/icons/external-link';
	import HeartHandshake from '@lucide/svelte/icons/heart-handshake';
	import LayoutGrid from '@lucide/svelte/icons/layout-grid';
	import PanelLeftClose from '@lucide/svelte/icons/panel-left-close';
	import PanelLeftOpen from '@lucide/svelte/icons/panel-left-open';
	import PanelRightClose from '@lucide/svelte/icons/panel-right-close';
	import PanelRightOpen from '@lucide/svelte/icons/panel-right-open';

	import { page } from '$app/state';
	import { MediaQuery } from 'svelte/reactivity';

	import { apps } from '$lib/apps';
	import DisplayModeButton from '$lib/components/DisplayModeButton.svelte';
	import { outline, workspace } from '$lib/panel.svelte';
	import { view, VIEWS } from '$lib/view.svelte';
	import { site } from '$lib/site';

	let { children } = $props();

	// `startsWith` and not `===`, so /apps/star-map still counts as being in Apps
	// once those pages exist.
	const onApps = $derived(page.url.pathname.startsWith('/apps'));

	/*
	 * WHAT THIS PAGE CALLS ITSELF, for the bar to wear once the page has stopped
	 * saying it. Null means the bar keeps the site's own name and nothing moves.
	 *
	 * The home page is null on purpose and not by omission: its title IS the site
	 * name, so a swap there would blur `Kashinoga` into `Kashinoga` and be a
	 * flicker with nothing on the other side of it.
	 *
	 * The apps read their name and their mark from $lib/apps, which is already
	 * the one list of what exists. Apps itself is named here because it is a page
	 * of this site rather than an app in that list.
	 */
	const here = $derived.by(() => {
		const path = page.url.pathname;
		if (onApps) return { name: 'Apps', Icon: LayoutGrid, fullscreen: false };

		const app = apps.find((a) => a.href === path);
		return app?.icon
			? { name: app.name, Icon: app.icon, fullscreen: !!app.fullscreen }
			: null;
	});

	/*
	 * A FULLSCREEN APP WEARS NO FOOTER. The footer is the site's furniture and a
	 * working surface is not a page of the site to be furnished — it is the whole
	 * window, and the copyright under it would be a line of chrome the app has to
	 * scroll past to reach nothing.
	 *
	 * The bar stays. It is how you leave.
	 */
	const fullscreen = $derived(!!here?.fullscreen);

	/*
	 * THE TITLE HAS GONE UNDER THE BAR, which is the moment the bar has something
	 * to say. Keyed to the <h1> itself rather than to a scroll distance: the bar
	 * says the page's name exactly when the page has stopped saying it, whatever
	 * the title's size or the window's.
	 *
	 * Both edges are ASKED FOR rather than worked out. The bar publishes its
	 * height as a token, but its lower edge is where it actually is on the
	 * screen, and those differ the moment anything above it changes.
	 */
	let scrolledPast = $state(false);

	$effect(() => {
		// Named so the effect re-runs when a navigation changes the heading.
		const current = here;
		if (!current) {
			scrolledPast = false;
			return;
		}

		let frame = 0;

		const update = () => {
			frame = 0;
			const header = document.querySelector('header');
			if (!header) return;

			/*
			 * A PAGE THAT NEVER SAYS ITS NAME leaves the bar saying it always. The
			 * Text Editor is one: it has no masthead at all, because a working
			 * surface with a title above it is a surface with less room to work in.
			 *
			 * `[data-page-title]` and not `h1`, which is what this asked for before
			 * and was a guess that held only while every page was a letter. An
			 * editor's PREVIEW renders a document that has an h1 of its own, and
			 * mistaking that for the page's masthead would put the bar's name back
			 * on a page that still is not saying it.
			 */
			const title = document.querySelector('[data-page-title]');
			if (!title) {
				scrolledPast = true;
				return;
			}

			scrolledPast =
				title.getBoundingClientRect().bottom <=
				header.getBoundingClientRect().bottom;
		};

		// The handler runs on every scroll event; the work waits for a frame, so a
		// fast scroll measures once per paint instead of once per event.
		const onScroll = () => {
			if (!frame) frame = requestAnimationFrame(update);
		};

		update();
		addEventListener('scroll', onScroll, { passive: true });
		addEventListener('resize', onScroll, { passive: true });

		return () => {
			cancelAnimationFrame(frame);
			removeEventListener('scroll', onScroll);
			removeEventListener('resize', onScroll);
		};
	});

	/*
	 * CAN THIS VISITOR ASK BEFORE THEY PRESS?
	 *
	 * With a pointer, hovering the brand turns it back into the site's name, so
	 * the link says where it goes before anybody commits to it. A touchscreen has
	 * no such rehearsal — the press IS the question — so there the brand does the
	 * harmless thing instead and returns to the top of the page.
	 *
	 * `hover` and not `any-pointer`, which is the opposite of the choice the
	 * stylesheet makes for target sizes and is right for the opposite reason:
	 * sizing asks "could a finger be used", and this asks "is a rehearsal
	 * available at all". A laptop with a touchscreen has a pointer, so it keeps
	 * the hover.
	 *
	 * The fallback is `true`, which is what the server renders and what the first
	 * paint therefore shows: the link behaves as a link until a browser says
	 * otherwise.
	 */
	const canHover = new MediaQuery('(hover: hover)', true);

	// The page's name is showing AND there is no way to have checked first.
	const scrollsToTop = $derived(!!here && scrolledPast && !canHover.current);

	/*
	 * THE YEAR IS THE BUILD'S, and that is a consequence of prerendering rather
	 * than an oversight: every page here is rendered once, at build, so this is
	 * evaluated then and baked into the HTML. It corrects itself on the next
	 * deploy, and a site that has not been deployed in over a year has a staler
	 * problem than its footer.
	 *
	 * Read once into a constant and not written inline, so the prerendered HTML
	 * and the hydrated page cannot disagree about it mid-render.
	 */
	const year = new Date().getFullYear();

	function onBrandClick(event: MouseEvent) {
		if (!scrollsToTop) return;

		event.preventDefault();
		// `scrollTo` and not a hash: a hash would put `#` in the address bar and
		// give the back button a step that goes nowhere.
		scrollTo({ top: 0, behavior: 'smooth' });
	}
</script>

<!--
	<header> and <main> are landmarks, so a screen reader can jump between them.
	The bar is chrome and belongs to the site, so it sits outside the content.

	The link is inside a <nav> and the button is not. One navigates and the other
	changes a setting, and a screen reader offering "navigation" should find only
	the first inside it.

	THE LINK IS A TOGGLE and not a destination: pressing it on Apps comes back
	here. So it carries no `aria-current`, which would be a lie — that attribute
	marks the link POINTING AT the page you are on, and this one points away from
	it. The state is in `data-open`, which the stylesheet fills with the accent,
	and in the name, which says both where you are and what pressing does. The
	icon does not change, because the icon is which control this is and the fill
	is whether it is open.

	Two controls stand in front of the content, which is two presses of Tab. A
	skip link earns its place when that number grows, and not yet.
-->
<header class="frost">
	<!--
		THE MARK AND THE NAME, and they are ONE link rather than two beside each
		other. Two would be two tab stops and two announcements to the same place.

		The mark is hidden from the reading: the word next to it already names the
		link, and "heart handshake Kashinoga" is not what anybody wants read out.
		The name is therefore the accessible name, and it comes from $lib/site so
		the bar and the title cannot end up spelling it differently.
	-->
	<!--
		THE FACE CHANGES; THE NAME DOES NOT. `aria-label` pins the accessible name
		to the site's, so the link is announced as what it does whatever it is
		currently drawn as — and the two drawings inside are hidden from the
		reading, which they can be, because neither adds anything the label has
		not already said.

		Without this the bar would offer a link reading "Emoji Viewer" that goes
		to the home page. That is the same untruth the Apps control refuses a few
		lines down when it declines `aria-current` for pointing away from the page
		you are on.

		Where the press cannot be rehearsed the label says the other thing, because
		there the link does the other thing.
	-->
	<a
		class="brand"
		class:showing-page={scrolledPast}
		href="/"
		aria-label={scrollsToTop ? 'Back to the top' : site.name}
		aria-current={page.url.pathname === '/' ? 'page' : undefined}
		onclick={onBrandClick}
	>
		<span class="brand-face" aria-hidden="true">
			<span class="brand-state site">
				<span class="mark"><HeartHandshake /></span>
				{site.name}
			</span>

			{#if here}
				<span class="brand-state page">
					<span class="page-mark"><here.Icon /></span>
					{here.name}
				</span>
			{/if}
		</span>
	</a>

	<!--
		THE PANEL'S SWITCH, and it stands at the START of the bar because that is
		the side the panel is on — the drawing says which edge it moves and the
		position agrees with it.

		Drawn only while a page has claimed it, and only where the panel it
		controls can be shown: below 64rem the workspace has nowhere to stand, and
		a control that does nothing is worse than no control. See the rule.

		`aria-expanded` is the state and `aria-controls` names what it moves, so it
		is announced as "Workspace, button, expanded" rather than as two icons that
		a sighted reader has to tell apart.
	-->
	{#if workspace.present}
		<button
			type="button"
			class="control panel"
			aria-expanded={workspace.open}
			aria-controls="workspace"
			aria-label="Workspace"
			title={workspace.open ? 'Put the workspace away' : 'Show the workspace'}
			onclick={() => workspace.toggle()}
		>
			{#if workspace.open}
				<PanelLeftClose />
			{:else}
				<PanelLeftOpen />
			{/if}
		</button>
	{/if}

	<!--
		THE VIEW KEYS, AND THEY LEAD THE END CLUSTER. They were on the desk, in a
		row over the sheet; the argument for that was that a control belonging to
		the document should not sit among controls belonging to the site. On a
		fullscreen app the bar carries the APP — its name, its mark, its panel
		switches — so up here they are already among their own kind, and the row
		they left is desk being worked on again.

		AN ISLAND, drawn on the bar rather than in it: one object cut from the same
		stock as the panes in the rails, so a group of three keys reads as a group
		before anybody has to notice they are three. Every other control in this bar
		is a bare mark on the field; this is the only one that is a set.

		FIRST OF THE END CLUSTER, so the order runs outward from the document: how
		you are looking at it, then what is beside it, then the site. See the
		margin rules — whichever end-side thing comes first is what splits the bar.
	-->
	{#if view.present}
		<!--
			`--slot` IS WHICH KEY IS PRESSED, as a number, and it is the whole of what
			the sliding ground needs to know. `--count` is how many there are, so the
			stylesheet can work out a key's width without being told it.

			Both are written here rather than measured on the client, which is what
			keeps this honest on the first paint: the page is prerendered, the pressed
			key is already the pressed one in the markup, and the ground is drawn
			under it before any script has run.
		-->
		<div
			class="views"
			role="group"
			aria-label="How to look at the document"
			style="--count: {VIEWS.length}; --slot: {VIEWS.findIndex(
				(candidate) => candidate.id === view.current,
			)}"
		>
			<!--
				THE GROUND THE PRESSED KEY STANDS ON, and it is ONE thing that moves
				rather than three that take turns being coloured. Aria-hidden because
				it says nothing a reader has not already been told by `aria-pressed`.
			-->
			<span class="thumb" aria-hidden="true"></span>

			{#each VIEWS as { id, name, hint, Icon } (id)}
				<button
					type="button"
					class="view"
					aria-pressed={view.current === id}
					title={hint}
					onclick={() => view.show(id)}
				>
					<Icon aria-hidden="true" />
					<span class="name visually-hidden">{name}</span>
				</button>
			{/each}
		</div>
	{/if}

	<!--
		AND THE OUTLINE'S, for the same reason the workspace's stands beside the
		brand: each switch is on the side of the bar that its panel is on, so the
		drawing and the position say the same thing.

		It comes BEFORE the site's own controls. Apps and the display mode belong
		to the site and are on every page; this belongs to the app and is on one.
	-->
	{#if outline.present}
		<button
			type="button"
			class="control panel end"
			aria-expanded={outline.open}
			aria-controls="outline"
			aria-label="Outline"
			title={outline.open ? 'Put the outline away' : 'Show the outline'}
			onclick={() => outline.toggle()}
		>
			{#if outline.open}
				<PanelRightClose />
			{:else}
				<PanelRightOpen />
			{/if}
		</button>
	{/if}

	<nav aria-label="Site">
		<a
			class="control"
			href={onApps ? '/' : '/apps'}
			data-open={onApps || undefined}
			title={onApps ? 'Apps — back to the home page' : 'Apps'}
			aria-label={onApps ? 'Apps, open. Go back to the home page.' : 'Apps'}
		>
			<LayoutGrid />
		</a>
	</nav>

	<DisplayModeButton />
</header>

<!--
	`data-fullscreen` IS FOR THE STYLESHEET TO READ, and it is on <main> because
	that is the nearest thing to <html> this component owns. The one rule that
	wants it — the scrollbar gutter — belongs to the scrolling element, which is
	<html>, and a page cannot reach up there; `:has()` is what lets the sheet ask
	downwards instead. See the note beside `scrollbar-gutter` in src/app.css.

	An attribute and not a class, and it says WHAT THE PAGE IS rather than what to
	do about it — the same arrangement as `data-mode` on <html>, where the app
	states the mode and the stylesheet decides what the mode means.
-->
<main data-fullscreen={fullscreen || undefined}>
	{@render children()}
</main>

<!--
	THE FOOTER IS PAST THE END, always. It is the last thing in the flow and it
	begins exactly where the window stops, so a page short enough to fit — the
	home page is — does not show it until somebody goes looking. Nothing hides
	it and nothing reveals it; it is simply below, and <main> above is what puts
	it there. See the rule.

	`<footer>` here is a landmark, `contentinfo`, because it is a direct child of
	the layout rather than of an article. A screen reader can jump to it without
	scrolling at all, which is the right answer: this is furniture that happens
	to be placed low, not a secret.

	The links are in a <nav> for the same reason the bar's are, and the copyright
	is not — it names the site rather than leading anywhere.
-->
{#if !fullscreen}
	<footer>
		<p class="copyright">© {year} {site.name}</p>

		<nav aria-label="Elsewhere">
			<a href="/apps">Apps</a>
			<!--
			THE MARK SAYS THE LINK LEAVES. It is not `target="_blank"` and never
			has been: taking the tab away is the visitor's decision and their
			browser already offers it. What the mark does is say, before the
			press, that this one goes somewhere else — which is the same courtesy
			the brand does by turning back into "Kashinoga" under a pointer.

			`aria-hidden`, and the word beside it is not made to carry "external"
			as well. A screen reader announces the href's host itself, so the
			drawing here is for the eye that cannot hear it.
		-->
			<a class="external" href={site.github} rel="me">
				GitHub<ExternalLink aria-hidden="true" /></a
			>
		</nav>
	</footer>
{/if}

<style>
	header {
		display: flex;
		align-items: center;
		gap: var(--space-2xs);
		/*
		 * TIGHT ON THE BLOCK EDGES, ordinary on the inline ones, and they are two
		 * different jobs. The block padding is what the bar is MADE of — a control
		 * between two of them — and the lower one is also the space between the bar
		 * and the first thing under it, which is why it is the small rung. The
		 * inline padding is where the site's column starts, and the footer answers
		 * it; that line does not move.
		 */
		padding: var(--space-xs) var(--space-m);

		/* Asserted, not left to add up. --bar-block-size is this same sum, and the
		 * page and the emoji TOC both measure themselves against it — so the bar
		 * states the number rather than happening to reach it. */
		block-size: var(--bar-block-size);

		/*
		 * STICKY, so the controls are reachable from anywhere in a long page
		 * without a journey back to the top.
		 *
		 * `sticky` and not `fixed`. A fixed bar leaves the flow, and the first
		 * line of every page would then start underneath it; this one holds its
		 * place until the page scrolls out from under it, and nothing has to be
		 * pushed down to make room.
		 *
		 * `inset-block-start` and not `top`, for the same reason `flex-end` is not
		 * `right`.
		 *
		 * WHAT IT IS MADE OF is `.frost`, in src/app.css. The letter goes soft as it
		 * passes under the bar rather than being cut off by it. That recipe moved
		 * out when the Emoji Viewer's search field started wearing it too — a
		 * component's <style> is scoped to that component, so a thing two of them
		 * are made of cannot live in either.
		 *
		 * `z-index` because the rule beside the prose is positioned too, and comes
		 * later in the document. Positioned things with no z-index paint in
		 * document order, so without this the yellow line would slide over the
		 * bar rather than under it.
		 */
		position: sticky;
		inset-block-start: 0;
		z-index: 1;
	}

	/*
	 * THE MARK AND THE NAME, on one line and centred against each other. The
	 * `align-items: center` is what does that: the two are flex items in the same
	 * row, so their centres are put on the same axis whatever either one's height
	 * turns out to be. `line-height: 1` makes the word's box the height of its
	 * letters rather than a leaded line, so the centre being matched is the
	 * centre of the WORD and not of the space around it.
	 *
	 * `block-size` gives the pair a 44px target even though the word is 16px
	 * tall, which is the smallest a finger hits reliably — the same measure every
	 * other control in this bar takes.
	 */
	.brand {
		display: inline-flex;
		align-items: center;
		gap: var(--space-xs);

		block-size: var(--control-block-size);
		font-size: var(--text-m);
		font-weight: 600;
		line-height: 1;
		color: inherit;
		text-decoration: none;

		/*
		 * THE WASH NEEDS ROOM, and the mark must not move to give it any. The
		 * padding opens the box out; the negative margin takes exactly that back
		 * off the start edge, so the drawing still begins on the bar's own 16px
		 * line and only the highlight reaches further out.
		 *
		 * `--radius-round` draws a PILL here and a circle on the controls, from
		 * one value — see the note beside the token. That is the shape a wash
		 * around a word wants.
		 */
		padding-inline: var(--space-xs);
		margin-inline-start: calc(-1 * var(--space-xs));
		border-radius: var(--radius-round);
	}

	/*
	 * THE TWO NAMES STAND IN ONE CELL, so the one leaving is still drawn while
	 * the one arriving is already there — the same arrangement the Emoji Viewer's
	 * confirmation line uses, and for the same reason.
	 *
	 * `justify-items: start` matters more than it looks. The cell is as wide as
	 * the LONGER of the two names, and without this each name would be stretched
	 * to fill it — so the wash below would be drawn at "Emoji Viewer" width while
	 * the word under it still said "Kashinoga". At `start` each name is its own
	 * width and the wash hugs whichever one is showing.
	 */
	.brand-face {
		display: grid;
		justify-items: start;
	}

	.brand-state {
		grid-area: 1 / 1;

		display: inline-flex;
		align-items: center;
		gap: var(--space-xs);

		/*
		 * AS TALL AS THE LINK IT FILLS, and therefore as tall as every other
		 * control in the bar. The wash is drawn on this rather than on the link,
		 * and a wash is what a pointer reads as the target — so without this the
		 * brand ANSWERS at 32px and LOOKS 20px, which is the height of the word
		 * and its mark and nothing to do with what can be pressed.
		 */
		block-size: var(--control-block-size);

		/*
		 * THE WASH MOVED IN HERE from the link, because the link's box is now as
		 * wide as the longer name and a pill that trails 100px past a short one
		 * reads as a mistake. The padding and the matching negative margin let the
		 * background reach the same 8px either side it always did without moving
		 * the drawing off the bar's 16px line.
		 */
		padding-inline: var(--space-xs);
		margin-inline: calc(-1 * var(--space-xs));
		border-radius: var(--radius-round);

		transition:
			opacity var(--motion-morph),
			filter var(--motion-morph);
	}

	/* The name that is not being shown is still THERE, holding the cell and
	 * waiting to be faded back in. */
	.brand-state.page {
		opacity: 0;
		filter: blur(4px);
	}

	.brand.showing-page .brand-state.site {
		opacity: 0;
		filter: blur(4px);
	}

	.brand.showing-page .brand-state.page {
		opacity: 1;
		filter: blur(0);
	}

	/*
	 * ASKING BEFORE PRESSING. Hovering or tabbing to the brand turns it back into
	 * the site's name, which is where the link actually goes — so nobody has to
	 * press to find out.
	 *
	 * Behind `(hover: hover)` because a touchscreen fires `:hover` on a tap and
	 * keeps it there afterwards: the name would flip as the press landed, which
	 * is the one moment it must not. Those devices get the scroll to the top
	 * instead, which needs no rehearsal because it takes nothing away.
	 */
	@media (hover: hover) {
		.brand.showing-page:hover .brand-state.site,
		.brand.showing-page:focus-visible .brand-state.site {
			opacity: 1;
			filter: blur(0);
		}

		.brand.showing-page:hover .brand-state.page,
		.brand.showing-page:focus-visible .brand-state.page {
			opacity: 0;
			filter: blur(4px);
		}
	}

	/* The same wash the circular controls take, so everything in the bar answers
	 * a pointer the same way. */
	.brand:hover .brand-state {
		background-color: var(--surface-hover);
		box-shadow: inset 0 0 0 1px var(--edge);
	}

	.brand:focus-visible {
		outline: none;
	}

	.brand:focus-visible .brand-state {
		outline: 2px solid var(--fg);
		outline-offset: 2px;
	}

	.mark,
	.page-mark {
		display: inline-flex;
	}

	/* `:global`, because the drawing comes from a component of its own and
	 * Svelte's scoping does not reach into one. In rem, so the mark grows with
	 * the word when a visitor sets a larger text size. */
	.mark :global(svg),
	.page-mark :global(svg) {
		inline-size: 1.25rem;
		block-size: 1.25rem;
	}

	/*
	 * The <nav> is a landmark and not a layout, so it must not add a line box of
	 * its own between the bar and the control inside it.
	 *
	 * `margin-inline-start: auto` is what splits the bar: the mark stays at the
	 * start edge and everything from here on is pushed to the end. Logical, so it
	 * follows the writing direction rather than assuming the world reads left to
	 * right — which is what the `flex-end` it replaced was for.
	 */
	header nav {
		display: flex;
		margin-inline-start: auto;
	}

	/*
	 * WHAT SPLITS THE BAR is whichever thing on the end side comes first. The nav
	 * carries the auto margin by default, and where an end-side switch stands in
	 * front of it, the switch takes the job and the nav gives it up.
	 *
	 * Two plain rules, and they replaced a clever one that was wrong: it tried to
	 * say "the nav, unless a panel precedes it" with `:not(.panel ~ nav)`, and
	 * `:not()` takes the SPECIFICITY OF ITS ARGUMENT — so that selector outranked
	 * the fallback beside it and zeroed the margin on every page that has no
	 * panel at all. Every page but the editor lost its right-aligned controls,
	 * and nothing failed: the bar was still a valid bar, just wrong.
	 */
	.views,
	.panel.end {
		margin-inline-start: auto;
	}

	.views ~ .panel.end,
	.views ~ nav,
	.panel.end ~ nav {
		margin-inline-start: 0;
	}

	/*
	 * THE ISLAND. `--rail` is the stock every object in an app is cut from — the
	 * panes in the rails wear it too — and it is declared in src/app.css under the
	 * fullscreen page, which is the only place it means anything.
	 *
	 * NO BLOCK PADDING. The bar is a control between two paddings and the keys are
	 * that control, so the island is exactly as tall as what is in it. Any padding
	 * over or under would make the bar taller than the height it publishes, and
	 * every region measured off `--bar-block-size` would follow it down the page.
	 *
	 * The inline padding is the step that keeps the pressed key's own pill off the
	 * island's rounded ends, so one shape sits inside the other instead of the two
	 * running together at the edge.
	 */
	/*
	 * EQUAL COLUMNS, and they are not a matter of taste — they are what lets the
	 * ground below be placed by a NUMBER. "Preview" is wider than "Edit", so with
	 * keys at their own widths the second slot's offset is not twice the first's,
	 * and finding it means measuring three boxes on the client and measuring them
	 * again whenever the window resizes or the webfont lands.
	 *
	 * `grid-auto-columns: 1fr` in a grid that is sized by its content gives every
	 * column the width of the widest, which is the one arrangement where slot n
	 * begins at n times a constant. The island is about 26px wider for it.
	 */
	.views {
		position: relative;

		display: grid;
		grid-auto-flow: column;
		grid-auto-columns: 1fr;
		gap: var(--space-2xs);

		padding-inline: var(--space-2xs);
		border-radius: var(--radius-round);
		background-color: var(--rail);
	}

	/*
	 * ONE GROUND THAT TRAVELS. It was three grounds taking turns, and switching
	 * views put the accent out in one place and on in another with nothing in
	 * between — the two keys never being the same shape at the same moment is
	 * exactly what a morph is for.
	 *
	 * The same gesture as the close opening out of a scratch row, over the same
	 * `--motion-morph`, because they are the same kind of event: a shape becoming
	 * another shape rather than a thing appearing. Reduced motion drops that token
	 * to zero and this arrives instantly, on the same path.
	 *
	 * THE TWO PERCENTAGES ARE DIFFERENT PERCENTAGES, which is worth saying out
	 * loud. In `inline-size` it is the island's padding box, so the island's own
	 * padding and its gaps come out before the division. In `translate` it is this
	 * element's own width — one column — so a step of one slot is a column plus
	 * the gap after it.
	 *
	 * It is absolutely positioned, so it is not a grid item and takes no column of
	 * its own; and it is FIRST in the markup, so the keys paint over it without
	 * either needing a `z-index`.
	 */
	.thumb {
		position: absolute;
		inset-block: var(--space-2xs);
		inset-inline-start: var(--space-2xs);
		inline-size: calc(
			(100% - var(--space-2xs) * 2 - var(--space-2xs) * (var(--count) - 1)) /
				var(--count)
		);
		translate: calc(var(--slot) * (100% + var(--space-2xs)));

		border-radius: var(--radius-round);
		background-color: var(--accent);

		transition: translate var(--motion-morph);
	}

	/*
	 * THE KEY IS THE CONTROL'S FULL HEIGHT and its GROUND is drawn a step inside
	 * it, which are two different things and were one before this.
	 *
	 * A ground that filled the key was flush with the island's top and bottom
	 * while standing a step in from its ends — one shape inside another on two
	 * sides and level with it on the other two, which reads as a mistake rather
	 * than as a decision. The step is `--space-2xs` on all four now: at the ends
	 * it is the island's own padding, between the keys it is the gap, and above
	 * and below it is the inset on `::before`.
	 *
	 * THE BUTTON DID NOT SHRINK TO DO IT, and that is the point of drawing this
	 * with a pseudo-element rather than by padding the island. Padding the island
	 * would take the step out of the CONTROL: 32px down to 24 for a pointer, and
	 * on a touchscreen 44 down to 36 — under the size this site gives a finger,
	 * for the sake of four pixels of drawing. What a finger has to hit is not what
	 * the eye has to see.
	 *
	 * `isolation: isolate` is what lets `z-index: -1` mean "behind this key's own
	 * label" rather than "behind everything": the key becomes a stacking context,
	 * so the ground cannot fall through it and end up under the island.
	 */
	.view {
		position: relative;
		isolation: isolate;

		display: inline-flex;
		align-items: center;
		/*
		 * CENTRED, because the key is no longer the width of what is in it. Every
		 * column is as wide as the widest — see `.views` — so "Edit" and "Split"
		 * are given room "Preview" needed, and left where they fell they sat at
		 * the start of a box a third wider than their own words while the ground
		 * under them filled the whole of it.
		 *
		 * `padding-inline` stops being what places them and becomes a floor: the
		 * least room a label may have at either end, on the narrow bar where the
		 * keys hold nothing but a mark.
		 */
		justify-content: center;
		gap: var(--space-2xs);

		block-size: var(--control-block-size);
		padding-inline: var(--space-xs);
		border: none;
		background: none;
		color: inherit;
		font-size: var(--text-s);
		cursor: pointer;

		/* WITH THE GROUND AND NOT AHEAD OF IT. The label flips to `--accent-fg` as
		 * it becomes the pressed one, and snapping that while the ground is still
		 * on its way turns the colour black before the yellow arrives under it. In
		 * light both colours are already black and nothing here shows; in dark it
		 * is white becoming black, and it shows. */
		transition: color var(--motion-morph);
	}

	.view::before {
		content: '';
		position: absolute;
		z-index: -1;
		inset-block: var(--space-2xs);
		inset-inline: 0;

		border-radius: var(--radius-round);
	}

	.view :global(svg) {
		inline-size: 1em;
		block-size: 1em;
	}

	/*
	 * A KEY IS A MARK, AND A WIDE BAR GAINS ITS NAME. Under the width where they
	 * all fit, the line shrinks what it can, and what it can is the island — which
	 * pays out of its own MARKS. Measured at 380 before this rule: 224px down to
	 * 182, the three marks gone to nothing, three bare words left behind. A control
	 * that drops its icon to keep its label has given up the wrong half.
	 *
	 * So the names are what is given up instead. Every key keeps its mark, its
	 * `title` and its name in the reading, and a key with only its mark is exactly
	 * `--control-block-size` square, which is what every other control in this bar
	 * already is. Measured after: 106px at 380, with nothing compressed.
	 *
	 * 33rem BECAUSE THE PARTS COME TO 510px, and that is a sum to re-add rather
	 * than a number to keep: the brand at 128, this island at 274, Apps and the
	 * display mode at 32 each, three gaps of 4, and the bar's own 32 of padding.
	 * It was 30rem when the island was 224 wide, and the island grew 50px the day
	 * its keys became equal columns — so at 481 the labels were being held onto at
	 * a width that could not hold them, and a mark was down to 13px again. If the
	 * island changes width, this is the line that has to be re-added.
	 *
	 * WRITTEN AS A GAIN AND NOT A LOSS, both because that is what the rest of this
	 * stylesheet does and because it is what keeps the recipe in one place: the
	 * span wears the site's own `.visually-hidden` from src/app.css, and this
	 * takes it back off. The other way round — hiding it here under `max-width` —
	 * meant a second copy of those five declarations that could not check itself
	 * against the first.
	 */
	@media (min-width: 33rem) {
		.view .name {
			position: static;
			inline-size: auto;
			block-size: auto;
			clip-path: none;
		}
	}

	.view:hover::before {
		background-color: var(--surface-hover);
		box-shadow: inset 0 0 0 1px var(--edge);
	}

	/* ON THE GROUND AND NOT ON THE KEY, so the ring follows the shape a reader can
	 * see. Drawn at the key's own edge it would stand four pixels outside the pill
	 * and cross the island's edge at the ends. */
	.view:focus-visible {
		outline: none;
	}

	.view:focus-visible::before {
		outline: 2px solid var(--fg);
		outline-offset: 0;
	}

	/* THE ONE IN USE. `aria-pressed` is the state and this draws it, so the mark
	 * and the announcement cannot disagree — they are the same attribute read
	 * twice. The colour stays on the KEY because it belongs to the label, and the
	 * label is not what is inset. */
	.view[aria-pressed='true'] {
		color: var(--accent-fg);
	}

	/*
	 * THE PRESSED KEY DRAWS NOTHING. The travelling ground is under it, and a
	 * hover wash painted on top of the accent would be a grey film over the yellow
	 * for as long as the pointer sat there.
	 *
	 * `:hover::before` is the only thing this is taking back, so it is written as
	 * the pair rather than as `background: none` — which would also have to undo
	 * the ring, and then keep undoing whatever a later rule adds.
	 */
	.view[aria-pressed='true']:hover::before {
		background-color: transparent;
		box-shadow: none;
	}

	/*
	 * THE SWITCH APPEARS WITH THE PANEL AND GOES WITH IT. Below 64rem the
	 * workspace has no column to stand in — the same breakpoint the page's own
	 * rule uses — so the control that moves it is not drawn either. Two rules
	 * holding one number is a thing this repo warns about, and this is that: if
	 * the page's breakpoint moves, this has to move with it.
	 *
	 * The alternative was a switch that is always there and does nothing on a
	 * phone, which is worse than the duplication.
	 */
	.panel {
		display: none;
	}

	@media (min-width: 64rem) {
		.panel {
			display: inline-flex;
		}
	}

	/*
	 * WHAT KEEPS THE FOOTER PAST THE END. The content is at least the window
	 * minus the bar, so the bar and the content together fill the screen exactly
	 * and the footer begins on the line where the window stops.
	 *
	 * `--bar-block-size` and not a number: the bar publishes its height, and a
	 * copy here would be one more pair that has to agree and cannot check.
	 *
	 * `dvh` and not `vh`, for the reason the reset gives: a phone's bars move,
	 * and `vh` measures the window as though they never do — which on a phone
	 * would push the footer a bar's height further down than intended and leave
	 * a strip of nothing under the content on every page.
	 *
	 * This is also what makes every page scroll a little. That is the ask: a
	 * short page should not show its footer until somebody looks for it.
	 */
	main {
		min-block-size: calc(100dvh - var(--bar-block-size));
	}

	/*
	 * The footer answers the bar: the same inline padding, the same split, the
	 * name at the start and the links at the end. Two pieces of furniture from
	 * one drawing, at opposite ends of the page.
	 */
	footer {
		display: flex;
		align-items: center;
		gap: var(--space-m);
		padding: var(--space-m);

		/*
		 * A SURFACE AND NOT A LINE. There was a hairline here, and a line drawn
		 * between two identical grounds is the weaker of the two ways to say the
		 * same thing: this says the footer is a different KIND of place, rather
		 * than the same place with a rule across it.
		 *
		 * The content above keeps `--bg` and is never anything else. That is the
		 * arrangement — the thing being read is white or black, and everything
		 * supporting it steps off that.
		 */
		background-color: var(--surface);
		font-size: var(--text-s);
	}

	footer nav {
		display: flex;
		gap: var(--space-m);
		margin-inline-start: auto;
	}

	/* The copyright names the site and leads nowhere, so it steps back from the
	 * links beside it. Mixed from --fg, so it flips with the display mode. */
	.copyright {
		color: color-mix(in oklab, var(--fg) 60%, transparent);
	}

	/*
	 * THE UNDERLINE STAYS, unlike every other link on this site, which takes one
	 * only on hover. Those sit alone or in a list and are obviously links by
	 * where they are. These sit in a line of text beside a copyright, and colour
	 * is the only other thing telling them apart from it — which is not enough
	 * for a reader who cannot see the difference between 60% and full strength.
	 *
	 * So hover thickens the line rather than drawing one. `--edge`-thin at rest,
	 * definite under the pointer, and never a state where the link looks like
	 * the prose next to it.
	 */
	footer a {
		color: inherit;
		text-underline-offset: 0.2em;
	}

	footer a:hover {
		text-decoration-thickness: 2px;
	}

	/*
	 * THE MARK RIDES WITH THE WORD. `inline-flex` puts the two on one line and
	 * centres them against each other, and the gap is the smallest step there is
	 * — the mark belongs to the word rather than standing beside it.
	 *
	 * `1em` and not a rem: this one is punctuation on a word, so it takes the
	 * size of the text it is attached to and grows with it. The marks in the bar
	 * are in rem because they are drawings in their own right.
	 */
	.external {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2xs);
	}

	.external :global(svg) {
		inline-size: 1em;
		block-size: 1em;
	}

	footer a:focus-visible {
		outline: 2px solid var(--fg);
		outline-offset: 2px;
	}
</style>
