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

export interface App {
	slug: string;
	name: string;
	description: string;
	href?: string;
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
