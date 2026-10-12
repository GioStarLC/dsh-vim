/**
 * dsh-vim — Host face.
 *
 * The plugin is entirely browser-side: scrolling is a DOM concern and the
 * keyboard listener lives in `lib/client.js`. This module exists so the Loader
 * has a real host entry to mount for the `dsh-vim` row in `cordis.patch.yml`;
 * the mounted row is what makes the client bundle part of the boot graph.
 */

/** Loader-facing plugin name. */
export const name = 'dsh-vim'

/** No host services are required. */
export const inject = []

/**
 * Host activation. Intentionally empty: the plugin contributes no host
 * capability and must not touch the Host beyond being mounted.
 */
export function apply() {}
