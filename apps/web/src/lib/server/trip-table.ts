/*
 * THE TABLES THE TRIP IS KEPT IN, in a file of their own and importing nothing.
 *
 * Two readers need them and they do not live in the same world: the Worker, which
 * resolves `$lib`, and scripts/trip-seed.ts, which runs under plain Node and
 * does not. A file with no imports is the one thing both can load, and one copy
 * of a schema is the only number of copies that cannot disagree.
 *
 * MADE ON FIRST USE, rather than by a migration somebody has to remember to run
 * before the page works. `IF NOT EXISTS` is a no-op after the first time — and it
 * is also what brings a database made before the history existed up to date,
 * without anybody doing anything.
 */

export const TRIP_ROW = 'trip';

export const CREATE_TABLE = `CREATE TABLE IF NOT EXISTS trip (
	id TEXT PRIMARY KEY,
	version INTEGER NOT NULL,
	doc TEXT NOT NULL,
	updated_at INTEGER NOT NULL
)`;

/*
 * ONE ROW PER CHANGE, newest last by `id`. `AUTOINCREMENT` and not a bare integer
 * key, because a bare one reuses the largest id after that row is deleted — and
 * the oldest rows are deleted constantly, so "newest by id" would stop being true.
 */
export const CREATE_HISTORY_TABLE = `CREATE TABLE IF NOT EXISTS trip_history (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	version INTEGER NOT NULL,
	at INTEGER NOT NULL,
	who TEXT NOT NULL,
	summary TEXT NOT NULL
)`;
