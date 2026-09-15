/*
 * THE TRIP AS THIS PAGE SEES IT: what the server last said, with this page's own
 * changes laid on top until the server has taken each one.
 *
 * TWO LAYERS AND NOT ONE. A change shows the moment it is made — a dragged row
 * lands where it was dropped, not a network trip later — but it is not yet true,
 * and a copy of the trip with it already folded in could not be corrected when
 * the server's answer comes back holding a friend's change as well. So `base` is
 * the server's word and `pending` is this page's, and what is drawn is one
 * applied over the other. When the server answers, its trip becomes the base and
 * the change it took comes off the pending list — and anything still pending is
 * laid over the new base, friend's change and all.
 *
 * ONE CHANGE IN FLIGHT AT A TIME, in the order they were made. A move and then
 * an edit of the thing moved must reach the server in that order, and a queue of
 * one is the simplest arrangement that promises it.
 *
 * `$state.raw` and not `$state`, because nothing here is ever changed in place:
 * `applyOp` hands back new trips and the queue is replaced rather than pushed
 * to. A deep proxy would be paying to watch for mutations that do not happen.
 */

import { applyOp, type Revision, type Trip, type TripOp } from '$lib/trip';

/* What the server answers with, every time: the trip, its version, its history. */
type Answer = { trip: Trip; version: number; history: Revision[] };

export type SyncState =
	'saved' | 'saving' | 'offline' | 'refreshed' | 'refused';

/* How often an open page asks whether anybody else has changed anything. */
const POLL_MS = 15_000;

/* How long to wait before sending again, when the server could not be reached. */
const RETRY_MS = 3_000;

export class TripSync {
	#base: Trip = $state.raw({ title: '', tagline: '', days: [], ideas: [] });
	#pending: TripOp[] = $state.raw([]);

	/*
	 * THE SERVER'S HISTORY, as of its last answer — and ONLY the server's. A change
	 * still on its way is not in it: the history is a record of what happened, and
	 * a change that has not reached the server has not happened yet.
	 */
	history: Revision[] = $state.raw([]);
	#version = 0;
	#sending = false;

	/* Whether a friend's change should wait: see `hold` in the constructor. */
	#hold: () => boolean;

	/* The trip's API, under the page's own unlisted address. */
	#endpoint: string;

	state: SyncState = $state('saved');

	trip = $derived(
		this.#pending.reduce((trip, op) => applyOp(trip, op), this.#base),
	);

	/*
	 * `hold` answers "would replacing the trip under this person right now take
	 * something from them" — a field with a cursor in it, a row mid-drag. While it
	 * says yes, a friend's change waits for the next poll rather than rewriting a
	 * word being typed.
	 *
	 * `endpoint` is handed in rather than written here, because the address is a
	 * secret of the deployment and this file is in a public repository.
	 */
	constructor(
		{ trip, version, history }: Answer,
		endpoint: string,
		hold: () => boolean,
	) {
		this.#base = trip;
		this.#version = version;
		this.history = history;
		this.#endpoint = endpoint;
		this.#hold = hold;
	}

	/** Make a change: shown now, sent in turn. */
	do(op: TripOp) {
		this.#pending = [...this.#pending, op];
		this.state = 'saving';
		void this.#flush();
	}

	#accept(body: Answer) {
		// An answer can arrive after a newer one — a poll overtaken by a save — and
		// must not wind the trip back.
		if (body.version < this.#version) return;
		this.#base = body.trip;
		this.#version = body.version;
		this.history = body.history;
	}

	async #flush() {
		if (this.#sending) return;
		const op = this.#pending[0];
		if (!op) return;

		this.#sending = true;
		let retry = false;

		try {
			const response = await fetch(this.#endpoint, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(op),
			});

			if (response.status === 401) {
				/*
				 * THE COOKIE RAN OUT, or the passcode changed. Reloading shows the lock,
				 * which is the truth; the unsent change is lost with the page, which is
				 * also the truth — somebody changed the passcode so that this page
				 * could no longer write.
				 */
				location.reload();
				return;
			}

			if (response.ok) {
				this.#accept(await response.json());
				this.#pending = this.#pending.slice(1);
			} else if (response.status === 409 || response.status >= 500) {
				retry = true;
			} else {
				/* The server refused the change itself, and will refuse it again. It is
				 * dropped, and the trip drawn goes back to what is really there. */
				this.#pending = this.#pending.slice(1);
				this.state = 'refused';
			}
		} catch {
			retry = true;
		}

		this.#sending = false;

		if (retry) {
			this.state = 'offline';
			setTimeout(() => void this.#flush(), RETRY_MS);
			return;
		}

		if (this.#pending.length) void this.#flush();
		else if (this.state !== 'refused') this.state = 'saved';
	}

	/** Ask for the trip as it is now, and take it if it is newer and nobody is mid-change. */
	async refresh() {
		const busy = () =>
			this.#sending || this.#pending.length > 0 || this.#hold();
		if (busy()) return;

		try {
			const response = await fetch(this.#endpoint);
			if (response.status === 401) return location.reload();
			if (!response.ok) return;

			const body: Answer = await response.json();
			// Asked again, because a change may have been started while this waited.
			if (busy() || body.version <= this.#version) return;

			this.#accept(body);
			this.state = 'refreshed';
		} catch {
			/* A poll that fails is a poll that will happen again in fifteen seconds. */
		}
	}

	/*
	 * KEEP UP WITH THE OTHERS: on a timer, and the moment the page is looked at
	 * again — a phone taken out of a pocket is the likeliest time for a trip to
	 * have changed and the likeliest time for somebody to act on a stale one.
	 * Returns the teardown, so it can be handed straight back from an `$effect`.
	 */
	start() {
		const timer = setInterval(() => {
			if (document.visibilityState === 'visible') void this.refresh();
		}, POLL_MS);

		const onVisible = () => {
			if (document.visibilityState === 'visible') void this.refresh();
		};
		const onOnline = () => void this.#flush();

		document.addEventListener('visibilitychange', onVisible);
		addEventListener('online', onOnline);

		return () => {
			clearInterval(timer);
			document.removeEventListener('visibilitychange', onVisible);
			removeEventListener('online', onOnline);
		};
	}
}
