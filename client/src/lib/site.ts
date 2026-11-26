/**
 * Optional name for where this deployment's fountain is, e.g. "Office".
 *
 * One codebase can run as several sites, one per fountain (see
 * docs/second-site.md). Setting VITE_LOCATION_NAME on a deployment labels it in
 * the page title, the sidebar, the phone header and the sign-in card, so the
 * sites can be told apart. Left unset, the app looks exactly as it always has.
 *
 * Vite reads it at build time (the page title too, in vite.config.ts), so a
 * change only shows after a rebuild, not a plain redeploy of the last build.
 */
export const LOCATION_NAME: string = String(
  import.meta.env.VITE_LOCATION_NAME ?? ""
).trim();
