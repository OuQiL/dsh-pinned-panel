/**
 * Host half of dsh-pinned-panel.
 *
 * The feature is entirely browser-side: `lib/client.js` registers a global
 * sidebar panel entry (`sidebar.panellist`) plus its page (`main`). The Host
 * has nothing to serve, so this plugin body is deliberately empty; it stays so
 * the bundle still has a valid Host row that the profile patch can load.
 */
export function apply() {}
