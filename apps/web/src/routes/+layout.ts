/*
 * Every page here is static, so the build writes HTML for each one. Cloudflare
 * then serves them from the assets binding and the Worker is never woken to
 * render a page that never changes. It stays available for anything dynamic
 * added later.
 */
export const prerender = true;
