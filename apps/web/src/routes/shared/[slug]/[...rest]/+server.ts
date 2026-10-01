import { redirect } from '@sveltejs/kit';

import {
	SESSION_COOKIE,
	setSession,
	tripAt,
	verifySession,
} from '$lib/server/trip';
import type { RequestHandler } from './$types';

/*
 * WHERE THE TRIP USED TO BE, and still is for every link already pasted into a
 * chat. Everything under the old address, the page and its API alike, is sent
 * on to the same place under /trip-planner, with 308 so a change being saved
 * keeps its method and its body on the way.
 *
 * THE SIGN-IN COMES TOO. The cookie was kept to the old address, so the browser
 * still sends it here and nowhere else; it is checked, set again at the new
 * address, and taken off the old one. Nobody types the passcode twice.
 *
 * A wrong slug is the site's 404 here as it is there; see `tripAt`.
 */
export const prerender = false;

export const fallback: RequestHandler = async ({
	params,
	cookies,
	platform,
	url,
}) => {
	const env = tripAt(platform, params.slug);
	const session = cookies.get(SESSION_COOKIE);

	if (env.passcode && session && (await verifySession(env.passcode, session))) {
		setSession(cookies, env.path, session);
		cookies.delete(SESSION_COOKIE, { path: `/shared/${params.slug}` });
	}

	const rest = params.rest ? `/${params.rest}` : '';
	redirect(308, `${env.path}${rest}${url.search}`);
};
