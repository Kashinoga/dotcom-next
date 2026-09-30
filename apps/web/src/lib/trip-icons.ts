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
};
