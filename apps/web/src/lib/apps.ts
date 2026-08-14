/*
 * THE APPS, and none of them are built yet.
 *
 * The names and the descriptions are taken verbatim from the list already
 * standing at kashinoga.com/apps, so the page here shows the real shape of the
 * thing rather than nine repetitions of "Lorem ipsum". `slug` is the path each
 * one will answer to when it exists, and is a key for the list until then.
 *
 * `href` is where an app can be USED, and only the built ones have it. A card
 * with none is not an <a>, because a link that 404s is worse than no link at
 * all. The card becomes a link the moment its app exists.
 *
 * `href` is NOT `/apps/<slug>`. That path is kept for the page ABOUT an app —
 * what it is for, how it was made — and the app itself lives at the top level,
 * where a person can be sent to it without a tour first.
 */

import type { Component } from 'svelte';
// One deep import per icon, as everywhere else — the root `@lucide/svelte`
// makes the dev server pre-bundle all 1600.
import FaceSlightlySmiling from '@lucide/svelte/icons/face-slightly-smiling';
import SquarePen from '@lucide/svelte/icons/square-pen';

export interface App {
	slug: string;
	name: string;
	description: string;
	href?: string;
	/*
	 * THE APP'S OWN MARK, which the bar wears in place of the site's once the
	 * page's title has scrolled under it. It lives here beside the name because
	 * the bar needs both and they are one idea — an app's face — and a second
	 * file holding a slug-to-icon map would be one that could disagree with this
	 * list about which apps exist.
	 *
	 * Only a BUILT app can be looked at, so only a built app needs one, and it
	 * is optional for the same reason `href` is.
	 */
	icon?: Component;
	/*
	 * A FULLSCREEN APP takes the whole window and wears none of the site's
	 * furniture: no masthead above it, no footer below it, and no reading
	 * measure holding it in. What is left is the bar, which carries the app's
	 * name because the page never says it.
	 *
	 * It is a fact about the APP and not about the route, which is why it lives
	 * here beside the name and the mark: the layout looks this list up once and
	 * gets all three, rather than keeping a second list of which paths are
	 * different.
	 *
	 * Absent means no. Most apps are content laid on the site and want the site
	 * around them; the Emoji Viewer is one, and only a working surface is not.
	 */
	fullscreen?: boolean;
}

export const apps: App[] = [
	{
		slug: 'air-traffic',
		name: 'Air Traffic',
		description:
			'A live board of the aircraft arriving, departing, or passing overhead.',
	},
	{
		slug: 'court-of-public-opinion',
		name: 'Court of Public Opinion',
		description:
			'An r/AmItheAsshole reader — judge the story first, then unseal the jury.',
	},
	{
		slug: 'densette',
		name: 'Densette',
		description:
			'The Curriculum — a tabletop RPG from The Peaks University, 2172.',
	},
	{
		slug: 'emoji-viewer',
		name: 'Emoji Viewer',
		description: 'Browse and copy the system emojis, drawn by your own device.',
		href: '/emoji-viewer',
		icon: FaceSlightlySmiling,
	},
	{
		slug: 'intergalactic-park-ranger',
		name: 'Intergalactic Park Ranger',
		description:
			"An idle game — ranger the Pocket Universe Division's parks, gathering Data Shards.",
	},
	{
		slug: 'presentation-builder',
		name: 'Presentation Builder',
		description: 'A visual editor for the route-map slide decks.',
	},
	{
		slug: 'star-map',
		name: 'Star Map',
		description:
			'The constellations overhead right now, from wherever you are.',
	},
	{
		slug: 'text-editor',
		name: 'Text Editor',
		description: 'A Markdown editor, set as a page of the manual it renders.',
		/*
		 * IT HAS AN ADDRESS BEFORE IT HAS AN EDITOR. The page is furniture with
		 * nothing behind it yet — no document opens, nothing is typed, nothing is
		 * kept. `href` is here anyway because the rule it answers to is that a
		 * card must not lead to a 404, and this one leads somewhere real that
		 * plainly says what it is.
		 *
		 * Take it off again if the shell stops being honest about being one.
		 */
		href: '/text-editor',
		icon: SquarePen,
		fullscreen: true,
	},
	{
		slug: 'weather',
		name: 'Weather',
		description:
			'A National Oceanic and Atmospheric Administration data viewer.',
	},
];
