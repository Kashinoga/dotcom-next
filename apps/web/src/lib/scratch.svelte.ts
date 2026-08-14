/*
 * THE SCRATCH NOTES — somewhere to type before there is anywhere to keep it.
 *
 * A scratch note has NO FILE behind it and never will. It is not in a folder,
 * it has no name of its own, and nothing on a disk or a server knows it exists;
 * it lives in this browser, on this machine, and that is the whole of it. That
 * is what "ephemeral" is doing in the name — not "will vanish shortly", but
 * "was never anywhere else".
 *
 * It is the first real thing this editor does, and it is deliberately the
 * smallest: a workspace on the disk needs a picker, a permission and a handle
 * that survives a reload, and a workspace on a server needs all of that plus
 * somebody else's password. A note in `localStorage` needs a key.
 *
 * NUMBERED AND NOT NAMED, because a name is a thing you have to think of and
 * the point of a scratch note is to start typing. The number is a SLOT rather
 * than an identity — see `nextId`.
 */
export const STORAGE_KEY = 'text-editor-scratch';

export type Note = {
	id: number;
	text: string;
};

/*
 * EPHEMERAL 0 IS ALWAYS THERE. Closing it empties it rather than removing it,
 * so the editor is never in a state where there is nowhere at all to type — a
 * scratch pad that can be closed down to nothing is a scratch pad that greets
 * somebody with an empty workspace and no way in.
 */
export const PERMANENT = 0;

export const name = (id: number) => `Ephemeral ${id}`;

/*
 * The server and the first client render both see exactly this, so hydration
 * has nothing to correct. What is stored arrives one tick later, from `watch`.
 */
let notes = $state<Note[]>([{ id: PERMANENT, text: '' }]);

/*
 * HAS STORAGE BEEN READ YET. Until it has, the list above is the DEFAULT and not
 * necessarily what is kept — the page is prerendered, so a visitor sees one
 * empty note in the markup before any of this runs, and what they had may be
 * three notes with things in them.
 *
 * It is published because it is a real difference and not a detail: anything
 * acting on the notes before this is true is acting on a guess. The tests wait
 * on it for exactly that reason, which is also why it is not a flag invented for
 * them.
 */
let ready = $state(false);

function save() {
	// A private failure. Storage can be full or refused outright — in a private
	// window, or with site data blocked — and a scratch pad that throws while
	// somebody is typing in it is worse than one that quietly forgets.
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
	} catch {
		/* empty */
	}
}

/** Anything at all could be under that key: another origin's leavings, an older
 * shape of this, or something a person typed into devtools. */
function parse(raw: string | null): Note[] | null {
	if (!raw) return null;

	try {
		const value: unknown = JSON.parse(raw);
		if (!Array.isArray(value)) return null;

		const kept = value.filter(
			(note): note is Note =>
				!!note &&
				typeof note === 'object' &&
				Number.isInteger((note as Note).id) &&
				(note as Note).id >= 0 &&
				typeof (note as Note).text === 'string',
		);

		return kept.length ? kept : null;
	} catch {
		return null;
	}
}

export const scratch = {
	get notes() {
		return notes;
	},

	get ready() {
		return ready;
	},

	text(id: number) {
		return notes.find((note) => note.id === id)?.text ?? '';
	},

	write(id: number, text: string) {
		const note = notes.find((n) => n.id === id);
		if (!note) return;

		note.text = text;
		save();
	},

	/*
	 * THE LOWEST FREE NUMBER, and not one past the highest. These are slots and
	 * not documents: close Ephemeral 1 out of 0, 1, 2 and the next one should be
	 * 1 again, because the number says WHERE in a short list rather than WHICH
	 * note it was. Counting upwards would leave somebody at Ephemeral 47 by the
	 * afternoon, which is a number pretending to mean something.
	 */
	open() {
		const taken = new Set(notes.map((note) => note.id));

		let id = 0;
		while (taken.has(id)) id += 1;

		// IN ORDER, and this is the other half of the slot idea. Appending put a
		// reused number at the END — close Ephemeral 1 out of three and the next
		// one read `0, 2, 1`, which is a list whose numbers no longer say where
		// anything is. If the number means the position, the position has to mean
		// the number.
		notes = [...notes, { id, text: '' }].sort((a, b) => a.id - b.id);
		save();
		return id;
	},

	/*
	 * CLOSING IS TWO DIFFERENT THINGS and the caller does not choose which. The
	 * permanent one is emptied and stays; every other one goes. Both are "close"
	 * from where a person sits — the note they were looking at is not there any
	 * more — and the difference is only whether the row goes with it.
	 */
	close(id: number) {
		if (id === PERMANENT) {
			const note = notes.find((n) => n.id === PERMANENT);
			if (note) note.text = '';
		} else {
			notes = notes.filter((note) => note.id !== id);
		}

		save();
	},

	/* Call inside an $effect. Reads what is stored once; there is nothing to
	 * listen to afterwards, because this browser is the only writer. */
	watch() {
		ready = true;

		const stored = parse(localStorage.getItem(STORAGE_KEY));
		if (!stored) return;

		// The permanent one is restored to existence if the stored shape has lost
		// it — an older version, or a hand edit. Sorted on the way in for the same
		// reason `open` sorts: what is stored is whatever was written last, and
		// this is the one place that can promise the order.
		const whole = stored.some((note) => note.id === PERMANENT)
			? stored
			: [{ id: PERMANENT, text: '' }, ...stored];

		notes = whole.sort((a, b) => a.id - b.id);
	},
};
