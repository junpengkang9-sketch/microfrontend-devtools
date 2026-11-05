export async function targetTab(config) {
  const tabs = await chrome.tabs.query({ currentWindow: true });
  const web = tabs.filter(t => /^https?:\/\//.test(t.url || ''));
  const active = web.find(t => t.active);
  if (active) return active;
  const origins = (config.environments || []).map(e => e.originPattern?.replace(/\/\*$/, ''));
  return web.filter(t => origins.includes(new URL(t.url).origin)).sort((a,b) => (b.lastAccessed || 0) - (a.lastAccessed || 0))[0];
}
export async function readRuntime(tab) {
  if (!tab?.id) return null;
  const [entry] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, world: 'MAIN', func: () => {
    const s = window.__MF_DEVTOOLS_RUNTIME__?._state;
    return s ? { adapters: s.adapters, rules: s.rules, configReady: s.configReady } : null;
  } });
  return entry?.result;
}
