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
	},
	{
		slug: 'weather',
		name: 'Weather',
		description:
			'A National Oceanic and Atmospheric Administration data viewer.',
	},
];
