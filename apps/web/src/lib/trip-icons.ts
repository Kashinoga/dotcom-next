import type { Component } from 'svelte';

// One deep import per icon, for the reason given in DisplayModeButton.
import Bike from '@lucide/svelte/icons/bike';
import Bus from '@lucide/svelte/icons/bus';
import Car from '@lucide/svelte/icons/car';
import Footprints from '@lucide/svelte/icons/footprints';
import Plane from '@lucide/svelte/icons/plane';
import Sailboat from '@lucide/svelte/icons/sailboat';
import Ship from '@lucide/svelte/icons/ship';
import TrainFront from '@lucide/svelte/icons/train-front';
import TreePalm from '@lucide/svelte/icons/tree-palm';
import Umbrella from '@lucide/svelte/icons/umbrella';
import Trees from '@lucide/svelte/icons/trees';
import MountainSnow from '@lucide/svelte/icons/mountain-snow';
import Tent from '@lucide/svelte/icons/tent';
import Snowflake from '@lucide/svelte/icons/snowflake';
import Caravan from '@lucide/svelte/icons/caravan';
import Backpack from '@lucide/svelte/icons/backpack';
import Binoculars from '@lucide/svelte/icons/binoculars';
import Fish from '@lucide/svelte/icons/fish';
import Building2 from '@lucide/svelte/icons/building-2';
import Landmark from '@lucide/svelte/icons/landmark';
import Castle from '@lucide/svelte/icons/castle';
import Wine from '@lucide/svelte/icons/wine';
import PartyPopper from '@lucide/svelte/icons/party-popper';
import Music from '@lucide/svelte/icons/music';
import FerrisWheel from '@lucide/svelte/icons/ferris-wheel';

import type { TripIconId } from './trip';

/* The drawing for each of TRIP_ICONS. Kept apart from $lib/trip, which the
 * seed script runs in plain Node, where a .svelte file cannot be imported. */
export const tripIcons: Record<TripIconId, Component> = {
	plane: Plane,
	car: Car,
	train: TrainFront,
	bus: Bus,
	ship: Ship,
	sailboat: Sailboat,
	bike: Bike,
	walk: Footprints,
	beach: TreePalm,
	parasol: Umbrella,
	forest: Trees,
	mountains: MountainSnow,
	camping: Tent,
	snow: Snowflake,
	'road-trip': Caravan,
	backpacking: Backpack,
	wildlife: Binoculars,
	fishing: Fish,
	city: Building2,
	sights: Landmark,
	castles: Castle,
	wine: Wine,
	festival: PartyPopper,
	music: Music,
	'theme-park': FerrisWheel,
};
