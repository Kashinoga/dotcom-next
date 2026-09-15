import { fail, redirect, type Cookies } from '@sveltejs/kit';

import {
	passcodeMatches,
	readStored,
	SESSION_COOKIE,
	SESSION_SECONDS,
	signSession,
	tripAt,
	verifySession,
} from '$lib/server/trip';
import { readDevice, readOptionalNickname } from '$lib/trip';
import type { Actions, PageServerLoad } from './$types';

/*
 * THE ONE PAGE ON THIS SITE THAT IS NOT WRITTEN AT BUILD TIME, and it cannot be.
 * A prerendered page is a file anybody can fetch, and what is on this one is for
 * the people who know the passcode. So the Worker renders it per request, and a
 * request without the cookie is sent the lock and nothing else — the itinerary
 * is not in the HTML, hidden or otherwise.
 *
 * And only at the one address `TRIP_SLUG` names. Every other /shared/… is the
 * site's 404; see `tripAt`.
 */
export const prerender = false;

export const load: PageServerLoad = async ({
	cookies,
	params,
	platform,
	setHeaders,
}) => {
	const env = tripAt(platform, params.slug);

	/*
	 * `no-store`, so no cache between here and the visitor keeps an unlocked copy
	 * to hand to the next person who asks. `noindex`, in a header as well as the
	 * page, so a crawler that does not read HTML is told too.
	 */
	setHeaders({ 'cache-control': 'no-store', 'x-robots-tag': 'noindex' });

	/*
	 * NOT SET UP FAILS SHUT. A missing secret must never mean "no passcode
	 * required", which is the reading a line like `if (passcode && …)` gives by
	 * accident.
	 */
	if (!env.passcode || !env.db) return { state: 'unconfigured' as const };

	const session = await verifySession(
		env.passcode,
		cookies.get(SESSION_COOKIE),
	);
	if (!session) return { state: 'locked' as const };

	return {
		state: 'open' as const,
		nickname: session.nickname,
		device: session.device,
		...(await readStored(env.db)),
	};
};

/*
 * `lax` and NOT `strict`, which looks safer and would break the one thing a
 * friend actually does: tap a link to this page in a group chat. A strict cookie
 * is not sent on a navigation that starts on another site, so every one of those
 * would land on the lock. Lax is sent on that and withheld from a cross-site
 * POST, which is where the forgery risk lives.
 *
 * `path` is the trip's own address, so the cookie goes with a request for this
 * page and its API and with nothing else on the site.
 */
function setSession(cookies: Cookies, path: string, value: string) {
	cookies.set(SESSION_COOKIE, value, {
		path,
		httpOnly: true,
		secure: true,
		sameSite: 'lax',
		maxAge: SESSION_SECONDS,
	});
}

export const actions: Actions = {
	unlock: async ({ request, cookies, params, platform, getClientAddress }) => {
		const env = tripAt(platform, params.slug);
		if (!env.passcode) return fail(503, { error: 'unconfigured' as const });

		/*
		 * FIVE GUESSES A MINUTE for each address. A shared passcode is short enough
		 * that friends can type it on a phone, which is short enough to be guessed
		 * quickly; this makes quickly into never.
		 *
		 * A development server without the binding skips the check rather than
		 * failing, and says so by having no limiter — the deployed Worker always
		 * has one, from wrangler.jsonc.
		 */
		if (env.limiter) {
			const { success } = await env.limiter.limit({ key: getClientAddress() });
			if (!success) return fail(429, { error: 'slow-down' as const });
		}

		const form = await request.formData();

		/*
		 * THE NAMES ARE HANDED BACK ON EVERY REFUSAL, so a wrong passcode does not
		 * also cost somebody the names they just typed. They are theirs and not
		 * secrets; the passcode is never handed back.
		 */
		const typed = {
			nickname: String(form.get('nickname') ?? ''),
			device: String(form.get('device') ?? ''),
		};
		const nickname = readOptionalNickname(typed.nickname);
		if (!nickname) return fail(400, { error: 'nickname' as const, ...typed });
		const device = readDevice(typed.device);
		if (device === null) {
			return fail(400, { error: 'device' as const, ...typed });
		}

		const given = form.get('passcode');
		if (
			typeof given !== 'string' ||
			!(await passcodeMatches(given.trim(), env.passcode))
		) {
			return fail(401, { error: 'wrong' as const, ...typed });
		}

		setSession(
			cookies,
			env.path,
			await signSession(env.passcode, nickname, device),
		);
		redirect(303, env.path);
	},

	/*
	 * NEW NAMES FOR THIS BROWSER, without the passcode again: the cookie already
	 * proves it, so this re-signs the same session under the new nickname and
	 * device. The old names stay on the changes they made — history is what
	 * happened, not who somebody is now.
	 */
	nickname: async ({ request, cookies, params, platform }) => {
		const env = tripAt(platform, params.slug);
		if (!env.passcode) return fail(503, { nicknameError: true });
		if (!(await verifySession(env.passcode, cookies.get(SESSION_COOKIE)))) {
			redirect(303, env.path);
		}

		const form = await request.formData();
		const nickname = readOptionalNickname(form.get('nickname'));
		const device = readDevice(form.get('device'));
		if (!nickname || device === null) return fail(400, { nicknameError: true });

		setSession(
			cookies,
			env.path,
			await signSession(env.passcode, nickname, device),
		);
		return { nicknameSaved: true };
	},

	lock: async ({ cookies, params, platform }) => {
		const env = tripAt(platform, params.slug);
		cookies.delete(SESSION_COOKIE, { path: env.path });
		redirect(303, env.path);
	},
};
