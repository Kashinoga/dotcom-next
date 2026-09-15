import { expect, test, type Page } from '@playwright/test';

import { signSession, verifySession } from '../src/lib/server/trip';
import {
	applyOp,
	describeOp,
	HISTORY_LIMIT,
	IDEAS,
	NICKNAME_ANONYMOUS,
	NICKNAME_MAX,
	readDevice,
	readNickname,
	readOptionalNickname,
	readOp,
	readTrip,
	type Item,
	type Trip,
	whoIs,
} from '../src/lib/trip';

/*
 * THE TRIP: what a change does, who may make one, and whether two people making
 * them at once both get what they did.
 *
 * The first half asks the pure functions directly, the way login.spec.ts does —
 * no page, no server. The second half drives the real page against the local
 * database, and needs the address and passcode the development server was given:
 *
 *     TRIP_SLUG=… TRIP_PASSCODE=… pnpm test:e2e trip
 *
 * with the same values in apps/web/.dev.vars. Without them those tests skip
 * rather than fail, because a suite that fails on a fresh clone for want of a
 * secret is a suite that teaches people to ignore it.
 */

const item = (id: string, title = id): Item => ({
	id,
	title,
	category: 'food',
	time: '',
	place: '',
	notes: '',
	prep: '',
	prepDone: false,
});

const sample = (): Trip => ({
	title: 'Test',
	tagline: '',
	days: [
		{
			id: 'd1',
			date: '2026-10-15',
			title: '',
			items: [item('a'), item('b'), item('c')],
		},
		{ id: 'd2', date: '2026-10-16', title: '', items: [item('d')] },
	],
	ideas: [item('e')],
});

const ids = (items: Item[]) => items.map((i) => i.id);

test.describe('changes', () => {
	test('a move within a day counts the gap the item left', () => {
		// "a" to index 2 of [b, c] — after "c", which is what a person dropping it
		// under "c" sees.
		const trip = applyOp(sample(), {
			type: 'move',
			id: 'a',
			to: 'd1',
			index: 2,
		});
		expect(ids(trip.days[0].items)).toEqual(['b', 'c', 'a']);
	});

	test('a move carries an item to another day and back to the ideas', () => {
		let trip = applyOp(sample(), { type: 'move', id: 'e', to: 'd2', index: 0 });
		expect(ids(trip.days[1].items)).toEqual(['e', 'd']);
		expect(trip.ideas).toEqual([]);

		trip = applyOp(trip, { type: 'move', id: 'b', to: IDEAS, index: 99 });
		expect(ids(trip.ideas)).toEqual(['b']);
	});

	test('the trip handed in is left as it was', () => {
		const before = sample();
		const copy = JSON.stringify(before);
		applyOp(before, { type: 'remove', id: 'a' });
		expect(JSON.stringify(before)).toBe(copy);
	});

	test('an op aimed at nothing changes nothing, and says so by identity', () => {
		const trip = sample();
		expect(applyOp(trip, { type: 'remove', id: 'gone' })).toBe(trip);
		expect(
			applyOp(trip, { type: 'move', id: 'gone', to: 'd1', index: 0 }),
		).toBe(trip);
		expect(
			applyOp(trip, { type: 'edit', id: 'gone', fields: { title: 'x' } }),
		).toBe(trip);
	});

	test('an add sent twice adds once', () => {
		const op = { type: 'add', to: 'd2', item: item('new') } as const;
		const trip = applyOp(applyOp(sample(), op), op);
		expect(ids(trip.days[1].items)).toEqual(['d', 'new']);
	});

	test('removing a day sends its plans back to the ideas', () => {
		const trip = applyOp(sample(), { type: 'removeDay', id: 'd1' });
		expect(trip.days.map((d) => d.id)).toEqual(['d2']);
		expect(ids(trip.ideas)).toEqual(['e', 'a', 'b', 'c']);
	});

	test('two people moving different things both keep their move', () => {
		/*
		 * THE CLAIM THE WHOLE DESIGN RESTS ON, in miniature: the server applies each
		 * op to the trip as it is when the op arrives, so the order they land in
		 * does not decide whose work survives.
		 */
		const one = { type: 'move', id: 'a', to: 'd2', index: 0 } as const;
		const two = { type: 'move', id: 'e', to: 'd1', index: 0 } as const;

		for (const order of [
			[one, two],
			[two, one],
		]) {
			const trip = order.reduce((t, op) => applyOp(t, op), sample());
			expect(trip.days[1].items[0].id).toBe('a');
			expect(trip.days[0].items[0].id).toBe('e');
		}
	});
});

test.describe('reading what arrived', () => {
	test('a well-formed op is read, and nothing it did not name comes with it', () => {
		const op = readOp({
			type: 'edit',
			id: 'a',
			fields: { title: 'Dinner', sneaky: 'x' },
		});
		expect(op).toEqual({ type: 'edit', id: 'a', fields: { title: 'Dinner' } });
	});

	test('a malformed op is refused rather than guessed at', () => {
		expect(
			readOp({ type: 'edit', id: 'a', fields: { title: null } }),
		).toBeNull();
		expect(
			readOp({ type: 'edit', id: 'a', fields: { title: '   ' } }),
		).toBeNull();
		expect(
			readOp({ type: 'edit', id: 'a', fields: { time: '25:00' } }),
		).toBeNull();
		expect(
			readOp({ type: 'edit', id: 'a', fields: { category: 'nope' } }),
		).toBeNull();
		expect(readOp({ type: 'move', id: 'a', to: 'd1', index: -1 })).toBeNull();
		expect(readOp({ type: 'move', id: '../x', to: 'd1', index: 0 })).toBeNull();
		expect(readOp({ type: 'addDay', day: { id: IDEAS } })).toBeNull();
		expect(readOp({ type: 'drop-table' })).toBeNull();
		expect(readOp('move')).toBeNull();
	});

	test('a trip file with a repeated id is refused', () => {
		const trip = sample();
		trip.ideas.push(item('a'));
		expect(readTrip(trip)).toBeNull();
		expect(readTrip(sample())).toEqual(sample());
	});
});

test.describe('who changed what', () => {
	test('each change is said in one sentence, from the trip before it', () => {
		const trip = sample();
		const cases: [Parameters<typeof describeOp>[1], string][] = [
			[{ type: 'move', id: 'a', to: 'd1', index: 2 }, 'Reordered a on Day 1'],
			[
				{ type: 'move', id: 'a', to: 'd2', index: 0 },
				'Moved a from Day 1 to Day 2',
			],
			[
				{ type: 'move', id: 'a', to: IDEAS, index: 0 },
				'Unscheduled a from Day 1',
			],
			[{ type: 'move', id: 'e', to: 'd2', index: 0 }, 'Scheduled e on Day 2'],
			[
				{ type: 'edit', id: 'b', fields: { title: 'Dinner' } },
				'Renamed b to Dinner',
			],
			[
				{ type: 'edit', id: 'b', fields: { time: '19:30' } },
				'Set b for 7:30 pm',
			],
			[{ type: 'remove', id: 'd' }, 'Deleted d from Day 2'],
			[
				{ type: 'removeDay', id: 'd1' },
				'Removed Day 1 and unscheduled 3 things',
			],
			[
				{ type: 'addDay', day: { id: 'd3', date: '2026-10-17', title: '' } },
				'Added Day 3, Sat, Oct 17',
			],
		];
		for (const [op, sentence] of cases) {
			expect(describeOp(trip, op)).toBe(sentence);
		}
	});

	test('a nickname is tidied, and refused when it cannot be seen or is too long', () => {
		expect(readNickname('  Kai   Lani ')).toBe('Kai Lani');
		expect(readNickname('👩‍💻 Sam')).toBe('👩‍💻 Sam');
		expect(readNickname('')).toBeNull();
		expect(readNickname('   ')).toBeNull();
		expect(readNickname('x'.repeat(NICKNAME_MAX + 1))).toBeNull();
		// A right-to-left override would let one name display as another.
		expect(readNickname('Al' + String.fromCharCode(0x202e) + 'ex')).toBeNull();
		expect(readNickname(42)).toBeNull();
	});

	test('a blank nickname signs as Anonymous, and a bad one is still refused', () => {
		expect(readOptionalNickname('')).toBe(NICKNAME_ANONYMOUS);
		expect(readOptionalNickname('   ')).toBe(NICKNAME_ANONYMOUS);
		expect(readOptionalNickname(null)).toBe(NICKNAME_ANONYMOUS);
		expect(readOptionalNickname(' Kai ')).toBe('Kai');
		expect(readOptionalNickname('x'.repeat(NICKNAME_MAX + 1))).toBeNull();
	});
});

test.describe('the session', () => {
	test('a session carries the name it was signed with', async () => {
		const value = await signSession('aloha', 'Kai.Lani 🌺');
		expect(await verifySession('aloha', value)).toEqual({
			nickname: 'Kai.Lani 🌺',
			device: '',
		});
	});

	test('a session carries the device it was signed with', async () => {
		const value = await signSession('aloha', 'Kashinoga', 'Artemis');
		const session = await verifySession('aloha', value);
		expect(session).toEqual({ nickname: 'Kashinoga', device: 'Artemis' });
		expect(whoIs(session!.nickname, session!.device)).toBe(
			'Kashinoga on Artemis',
		);
		expect(whoIs('Kashinoga', '')).toBe('Kashinoga');
	});

	test('a device name is optional, and refused like a nickname', () => {
		expect(readDevice('')).toBe('');
		expect(readDevice('  ')).toBe('');
		expect(readDevice(' Artemis ')).toBe('Artemis');
		expect(readDevice('x'.repeat(NICKNAME_MAX + 1))).toBeNull();
	});

	test('changing the passcode ends every session', async () => {
		const value = await signSession('aloha', 'Kai');
		expect(await verifySession('mahalo', value)).toBeNull();
	});

	test('an expired or altered session is refused', async () => {
		const old = await signSession(
			'aloha',
			'Kai',
			'',
			Date.now() - 31 * 24 * 60 * 60 * 1000,
		);
		expect(await verifySession('aloha', old)).toBeNull();

		const value = await signSession('aloha', 'Kai', 'Artemis');
		const [expires, name, device, mac] = value.split('.');
		const other = (await signSession('aloha', 'Lani')).split('.')[1];
		const otherDevice = (await signSession('aloha', 'Kai', 'Apollo')).split(
			'.',
		)[2];

		// A later expiry, somebody else's name or device, or no device at all,
		// under the old signature.
		expect(
			await verifySession(
				'aloha',
				`${Number(expires) + 1}.${name}.${device}.${mac}`,
			),
		).toBeNull();
		expect(
			await verifySession('aloha', `${expires}.${other}.${device}.${mac}`),
		).toBeNull();
		expect(
			await verifySession('aloha', `${expires}.${name}.${otherDevice}.${mac}`),
		).toBeNull();
		expect(
			await verifySession('aloha', `${expires}.${name}.${mac}`),
		).toBeNull();
		expect(
			await verifySession(
				'aloha',
				`${expires}.${name}.${device}.${mac.slice(0, -1)}`,
			),
		).toBeNull();
		expect(await verifySession('aloha', undefined)).toBeNull();
		expect(await verifySession('aloha', 'nonsense')).toBeNull();
	});
});

/* ─── The page ───────────────────────────────────────────────────────────── */

test('an address that is not the trip is the site’s ordinary 404', async ({
	request,
}) => {
	/*
	 * Whatever the slug is set to, this is not it — so the answer must be the same
	 * one a mistyped URL gets, for the page and for its API alike.
	 */
	for (const path of [
		'/shared/definitely-not-the-trip',
		'/shared/definitely-not-the-trip/api',
		'/trip',
		'/api/trip',
	]) {
		expect((await request.get(path)).status(), path).toBe(404);
	}
});

const SLUG = process.env.TRIP_SLUG;
const PASSCODE = process.env.TRIP_PASSCODE;
const PAGE = `/shared/${SLUG}`;
const API = `${PAGE}/api`;

test.describe('at the trip’s address', () => {
	test.skip(
		!SLUG || !PASSCODE,
		'Set TRIP_SLUG and TRIP_PASSCODE to the development values to run these.',
	);

	test('the locked page carries nothing of the trip', async ({
		page,
		request,
	}) => {
		/*
		 * ASKED OF THE RAW HTML and of the API, not of what is drawn — hiding a trip
		 * with CSS would pass a test that looked at the screen.
		 */
		const response = await request.get(PAGE);
		const html = await response.text();
		expect(response.status()).toBe(200);
		expect(response.headers()['cache-control']).toContain('no-store');
		expect(html).not.toContain('"days"');
		expect(html).not.toContain('Kuhio');

		expect((await request.get(API)).status()).toBe(401);
		expect(
			(
				await request.post(API, {
					data: { type: 'editTrip', fields: { title: 'Owned' } },
				})
			).status(),
		).toBe(401);

		await page.goto(PAGE);
		await expect(page.locator('meta[name=robots]')).toHaveAttribute(
			'content',
			/noindex/,
		);
	});

	test('the passcode opens it, and a wrong one is told so', async ({
		page,
	}) => {
		await page.goto(PAGE);
		await page.locator('form[data-ready]').waitFor({ state: 'attached' });

		await page.getByLabel('Nickname').fill('E2E Kai');
		await page.getByLabel('Passcode').fill(`${PASSCODE}-wrong`);
		await page.getByRole('button', { name: 'Unlock' }).click();
		await expect(page.getByRole('alert')).toHaveText('That isn’t it.');
		await expect(page.locator('[data-drop]')).toHaveCount(0);

		// The name survives the wrong passcode; only the passcode is asked again.
		await expect(page.getByLabel('Nickname')).toHaveValue('E2E Kai');
		await page.getByLabel('Passcode').fill(PASSCODE!);
		await page.getByRole('button', { name: 'Unlock' }).click();
		await expect(page.getByRole('status')).toHaveText('All changes saved.');

		// The cookie is kept to the trip's address, and goes with nothing else.
		const cookie = (await page.context().cookies()).find(
			(c) => c.name === 'trip_session',
		);
		expect(cookie?.path).toBe(PAGE);
		expect(cookie?.httpOnly).toBe(true);

		// And the page knows who signed in.
		await expect(page.getByLabel('Your nickname')).toHaveValue('E2E Kai');
	});
});

/*
 * UNLOCKED WITHOUT THE FORM, by signing a session the way the server does. The
 * form is tested once above; going through it before every test would spend the
 * five guesses a minute the limiter allows, and the suite would lock itself out.
 */
async function open(page: Page, nickname = 'E2E') {
	// The development server Playwright starts, from playwright.config.ts.
	const hostname = 'localhost';
	await page.context().addCookies([
		{
			name: 'trip_session',
			value: await signSession(PASSCODE!, nickname),
			domain: hostname,
			path: PAGE,
			httpOnly: true,
			secure: true,
			sameSite: 'Lax',
		},
	]);
	await page.goto(PAGE);
	await page.locator('.board[data-ready]').waitFor({ state: 'attached' });
}

test.describe('unlocked', () => {
	test.skip(
		!SLUG || !PASSCODE,
		'Set TRIP_SLUG and TRIP_PASSCODE to the development values to run these.',
	);

	/*
	 * EACH TEST WORKS ON A DAY OF ITS OWN, added and removed through the API, so it
	 * leaves the seeded trip as it found it and does not depend on what is in it.
	 */
	const DAY = 'e2e-day';
	const THINGS = ['e2e-one', 'e2e-two', 'e2e-three'];

	test.beforeEach(async ({ page }) => {
		await open(page);
		const api = page.request;
		await api.post(API, {
			data: { type: 'addDay', day: { id: DAY, date: '', title: 'E2E day' } },
		});
		for (const id of THINGS) {
			await api.post(API, {
				data: { type: 'add', to: DAY, item: item(id, `E2E ${id}`) },
			});
		}
		await page.reload();
		await page.locator('.board[data-ready]').waitFor({ state: 'attached' });
	});

	test.afterEach(async ({ page }) => {
		const api = page.request;
		await api.post(API, { data: { type: 'removeDay', id: DAY } });
		for (const id of THINGS) {
			await api.post(API, { data: { type: 'remove', id } });
		}
	});

	const dayList = (page: Page) =>
		page.locator(`[data-drop="${DAY}"]`).locator(':scope > [data-item]');

	const storedDay = async (page: Page): Promise<Item[]> => {
		const body = await (await page.request.get(API)).json();
		return body.trip.days.find((d: { id: string }) => d.id === DAY).items;
	};

	test('dragging a row reorders the day, for everyone', async ({ page }) => {
		const rows = dayList(page);
		await expect(rows).toHaveCount(3);

		const grip = page.locator('[data-grip="e2e-one"]');
		await grip.scrollIntoViewIfNeeded();

		const from = (await grip.boundingBox())!;
		const to = (await rows.nth(2).boundingBox())!;
		await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
		await page.mouse.down();
		// In steps, because a drag is decided a frame at a time.
		await page.mouse.move(from.x + from.width / 2, to.y + to.height - 2, {
			steps: 12,
		});
		await page.waitForTimeout(100);
		await page.mouse.up();

		await expect(page.getByRole('status')).toHaveText('All changes saved.');
		expect(ids(await storedDay(page))).toEqual([
			'e2e-two',
			'e2e-three',
			'e2e-one',
		]);
	});

	test('the arrow keys move a row, and focus goes with it', async ({
		page,
	}) => {
		await page.locator('[data-grip="e2e-three"]').focus();
		await page.keyboard.press('ArrowUp');
		await page.keyboard.press('ArrowUp');

		await expect(page.getByRole('status')).toHaveText('All changes saved.');
		await expect(page.locator('[data-grip="e2e-three"]')).toBeFocused();
		expect(ids(await storedDay(page))).toEqual([
			'e2e-three',
			'e2e-one',
			'e2e-two',
		]);
	});

	test('something added on a day is there after a reload', async ({ page }) => {
		const section = page.locator('section.card', {
			has: page.locator(`[data-drop="${DAY}"]`),
		});
		await section.getByRole('button', { name: /^Add to Day / }).click();
		await section.getByLabel('What').fill('E2E added');
		await section.getByRole('button', { name: 'Add', exact: true }).click();
		await expect(page.getByRole('status')).toHaveText('All changes saved.');

		await page.reload();
		await expect(dayList(page)).toHaveCount(4);
		await expect(dayList(page).nth(3)).toContainText('E2E added');

		// Its id was made by the page, so it is found by title and removed here;
		// the day's own removal would otherwise send it to the ideas.
		const added = (await storedDay(page)).find((i) => i.title === 'E2E added')!;
		await page.request.post(API, { data: { type: 'remove', id: added.id } });
	});

	test('two people changing things at the same moment both keep them', async ({
		page,
		browser,
	}) => {
		/*
		 * THE RACE, run for real: two sessions, each firing edits at the server
		 * together, so the database sees writes land between each other's reads.
		 * Every one of them has to survive.
		 */
		const other = await browser.newPage();
		await open(other, 'E2E Other');

		const edits = THINGS.flatMap((id) => [
			page.request.post(API, {
				data: { type: 'edit', id, fields: { notes: `notes for ${id}` } },
			}),
			other.request.post(API, {
				data: { type: 'edit', id, fields: { place: `place for ${id}` } },
			}),
		]);
		for (const response of await Promise.all(edits)) {
			expect(response.status()).toBe(200);
		}

		for (const found of await storedDay(page)) {
			expect(found.notes).toBe(`notes for ${found.id}`);
			expect(found.place).toBe(`place for ${found.id}`);
		}

		// And the page that did nothing catches up on its own.
		await other.evaluate(() =>
			document.dispatchEvent(new Event('visibilitychange')),
		);
		await expect(other.getByText('notes for e2e-one')).toBeVisible();
		await other.close();
	});

	test('each change is written into the history under its author’s name', async ({
		page,
		browser,
	}) => {
		const other = await browser.newPage();
		await open(other, 'E2E Other');

		await page.request.post(API, {
			data: { type: 'move', id: 'e2e-one', to: DAY, index: 2 },
		});
		await other.request.post(API, {
			data: { type: 'edit', id: 'e2e-two', fields: { title: 'E2E renamed' } },
		});
		// A change that changes nothing is not a change, and is not written down.
		await page.request.post(API, {
			data: { type: 'remove', id: 'no-such-thing' },
		});

		const { history } = await (await page.request.get(API)).json();
		expect(history[0].who).toBe('E2E Other');
		expect(history[0].summary).toBe('Renamed E2E e2e-two to E2E renamed');
		expect(history[1].who).toBe('E2E');
		// The day's number depends on how many days the seeded trip has.
		expect(history[1].summary).toMatch(/^Reordered E2E e2e-one on Day [0-9]+$/);

		// The page shows it, newest first, with the name beside it.
		await other.reload();
		await other.locator('.board[data-ready]').waitFor({ state: 'attached' });
		const first = other.locator('.revision').first();
		await expect(first).toContainText('Renamed E2E e2e-two to E2E renamed');
		await expect(first).toContainText('E2E Other');
		await other.close();
	});

	test('the history keeps the newest hundred and no more', async ({ page }) => {
		for (let i = 0; i < HISTORY_LIMIT + 5; i++) {
			const response = await page.request.post(API, {
				data: { type: 'edit', id: 'e2e-one', fields: { notes: `note ${i}` } },
			});
			expect(response.status()).toBe(200);
		}

		const { history, version } = await (await page.request.get(API)).json();
		expect(history).toHaveLength(HISTORY_LIMIT);
		expect(history[0].version).toBe(version);
		expect(history[0].summary).toBe('Edited the notes on E2E e2e-one');
	});

	test('a new nickname signs every change after it', async ({ page }) => {
		await page.getByLabel('Your nickname').fill('E2E Renamed');
		await page.getByRole('button', { name: 'Save names' }).click();
		await expect(page.getByLabel('Your nickname')).toHaveValue('E2E Renamed');

		await page.request.post(API, {
			data: {
				type: 'edit',
				id: 'e2e-three',
				fields: { notes: 'after rename' },
			},
		});
		const { history } = await (await page.request.get(API)).json();
		expect(history[0].who).toBe('E2E Renamed');
	});
});
