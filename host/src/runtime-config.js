/**
 * Integration contract (documented, not hidden):
 *
 * The MF DevTools extension drives micro-app entry selection by REPLACING
 * `window.__MF_DEVTOOLS__.resolveEntry` from a MAIN-world content script
 * injected at document_start, before this module's IIFE runs. This is the
 * seam a host app must expose to be compatible with this extension — it is
 * a one-line integration requirement, not automatic/zero-code.
 *
 * If the extension is not installed, or disabled, `resolveEntry` keeps its
 * default identity behavior and the host always uses the online entry URL.
 */
if (!window.__MF_DEVTOOLS__) {
  window.__MF_DEVTOOLS__ = {
    // Default (no extension / extension disabled): always return the online URL unchanged.
    resolveEntry: async (_appName, onlineUrl, _opts) => onlineUrl,
  };
}

/**
 * @param {string} appName
 * @param {string} onlineUrl
 * @param {{pathSuffix?: string}} [opts] - in-app path+query+hash to preserve
 *   across an override (see extension's resolveEntry contract comment).
 */
export async function resolveEntry(appName, onlineUrl, opts) {
  return window.__MF_DEVTOOLS__.resolveEntry(appName, onlineUrl, opts);
}
