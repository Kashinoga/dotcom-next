/*
 * PUT A TRIP IN THE DATABASE, from a JSON file kept OUTSIDE this repository.
 *
 *     pnpm --filter web trip:seed <trip.json>             the local database
 *     pnpm --filter web trip:seed <trip.json> --remote    the deployed one
 *     … --replace                                         over one already there
 *
 * OUTSIDE, because this repository is public and a trip is where people will be
 * sleeping on which nights. The file is read, checked against the shape in
 * src/lib/trip.ts, and handed to wrangler; nothing of it is written anywhere
 * git can see. The SQL goes to .wrangler/, which is ignored, and is deleted
 * after.
 *
 * IT WILL NOT OVERWRITE WITHOUT BEING TOLD. Once friends have been moving things
 * around, the database is the trip and the file is an old draft of it, and a
 * seed run by habit would put the draft back over their work. `--replace` is
 * the saying so.
 *
 * Plain Node, which runs TypeScript itself since 23.6 — see .node-version. That
 * is why the two imports below are relative and name their extensions: there is
 * no Vite here to resolve `$lib`.
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

import {
	CREATE_HISTORY_TABLE,
	CREATE_TABLE,
	TRIP_ROW,
} from '../src/lib/server/trip-table.ts';
import { readTrip } from '../src/lib/trip.ts';

const args = process.argv.slice(2);
const file = args.find((arg) => !arg.startsWith('--'));
const remote = args.includes('--remote');
const replace = args.includes('--replace');

if (!file) {
	console.error('Usage: trip:seed <trip.json> [--remote] [--replace]');
	process.exit(2);
}

const trip = readTrip(JSON.parse(readFileSync(file, 'utf8')));
if (!trip) {
	console.error(
		`${file} is not a trip this site can read. Check it against src/lib/trip.ts.`,
	);
	process.exit(1);
}

/* SQL has one escape inside a string, and it is a doubled quote. */
const quote = (text: string) => `'${text.replaceAll("'", "''")}'`;

const SQL_DIR = '.wrangler/trip-seed';
mkdirSync(SQL_DIR, { recursive: true });

function execute(sql: string) {
	const path = `${SQL_DIR}/seed.sql`;
	writeFileSync(path, sql);
	try {
		/*
		 * ONE COMMAND STRING, through a shell, so Windows finds `pnpm.cmd`. Node
		 * warns about an argument list with `shell` because it joins the list without
		 * quoting it; written as a string that joining is visible, and nothing in it
		 * came from outside this file.
		 */
		const result = spawnSync(
			`pnpm exec wrangler d1 execute TRIP_DB ${remote ? '--remote' : '--local'} --json --yes --file ${path}`,
			{ encoding: 'utf8', shell: true },
		);
		if (result.status !== 0) {
			console.error(result.stderr || result.stdout);
			process.exit(1);
		}
		return JSON.parse(result.stdout) as {
			results: Record<string, unknown>[];
		}[];
	} finally {
		rmSync(path, { force: true });
	}
}

const where = remote ? 'the deployed database' : 'the local database';

const existing = execute(
	`${CREATE_TABLE};\n${CREATE_HISTORY_TABLE};\nSELECT version FROM trip WHERE id = ${quote(TRIP_ROW)};`,
);
const version = existing.at(-1)?.results[0]?.version;

if (version !== undefined && !replace) {
	console.error(
		`${where} already has a trip (version ${version}). Pass --replace to put this file over it — and everything friends have changed since.`,
	);
	process.exit(1);
}

/*
 * THE VERSION GOES UP, and is not set back to 1. A page already open is waiting
 * for a version newer than the one it has, and a replaced trip that reused an old
 * number would never reach it.
 *
 * AND IT GOES IN THE HISTORY, as a change like any other, so friends reading
 * the history can see where everything before this line went.
 */
const now = Date.now();
execute(
	`INSERT INTO trip (id, version, doc, updated_at) VALUES (${quote(TRIP_ROW)}, 1, ${quote(JSON.stringify(trip))}, ${now})
ON CONFLICT (id) DO UPDATE SET doc = excluded.doc, version = trip.version + 1, updated_at = excluded.updated_at;
INSERT INTO trip_history (version, at, who, summary)
SELECT version, ${now}, 'trip:seed', ${quote(version === undefined ? 'Loaded the trip from a file' : 'Replaced the whole trip from a file')} FROM trip WHERE id = ${quote(TRIP_ROW)};`,
);

const items = trip.days.reduce((n, d) => n + d.items.length, trip.ideas.length);
console.log(
	`Put “${trip.title}” in ${where}: ${trip.days.length} days, ${items} things.`,
);
