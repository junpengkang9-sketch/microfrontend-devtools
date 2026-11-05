// Service worker: owns dynamic content-script registration for configured
// environments. No static content_scripts in manifest.json — every origin
// this extension runs on was explicitly granted via chrome.permissions
// (requested from the options page, a real user gesture) and is only
// registered here, scoped to that environment's originPattern. Adding a
// new environment through the UI does NOT require editing manifest.json or
// reloading the extension as unpacked source — it only requires this
// service worker (which is part of the installed extension, invariant
// across environments) to call registerContentScripts with the new match
// pattern, and the chrome.permissions grant for that origin.

const STORAGE_KEY = 'mfDevtoolsConfigV2';
// Keep MAIN-world runtime/matching together and the storage relay isolated.
const ADAPTER_SCRIPTS = [
  'src/main-world-config-bridge.js',
  'src/adapters/adapter-entry-fetch-barrier.js',
  'src/adapters/adapter-app-router.js',
  'src/adapters/adapter-exposed-qiankun.js',
  'src/adapter-status-finalizer.js',
];
const ISOLATED_SCRIPTS = ['src/isolated-config-relay.js'];

function scriptIdForEnv(envId, world) {
  return `mf-devtools-${world}-${envId}`;
}

async function unregisterAllForEnv(envId) {
  const ids = [scriptIdForEnv(envId, 'main'), scriptIdForEnv(envId, 'isolated')];
  try {
    await chrome.scripting.unregisterContentScripts({ ids });
  } catch {
    // ids may not exist yet; that's fine.
  }
}

async function registerForEnvironment(env) {
  await unregisterAllForEnv(env.id);
  if (!env.enabled || !/^https?:\/\/[a-zA-Z0-9.:[\]-]+\/\*$/.test(env.originPattern || '')) return { ok: true, skipped: true };

  const hasPermission = await chrome.permissions.contains({ origins: [env.originPattern] });
  if (!hasPermission) {
    return { ok: false, reason: 'no-permission' };
  }

  await chrome.scripting.registerContentScripts([
    {
      id: scriptIdForEnv(env.id, 'main'),
      matches: [env.originPattern],
      js: ADAPTER_SCRIPTS,
      world: 'MAIN',
      runAt: 'document_start',
      persistAcrossSessions: true,
    },
    {
      id: scriptIdForEnv(env.id, 'isolated'),
      matches: [env.originPattern],
      js: ISOLATED_SCRIPTS,
      world: 'ISOLATED',
      runAt: 'document_start',
      persistAcrossSessions: true,
    },
  ]);
  return { ok: true };
}

// Serializes all syncAllRegistrations() calls: chrome.storage.onChanged AND
// the explicit MF_DEVTOOLS_SYNC_REGISTRATIONS message both fire for the
// same options-page save (storage.set triggers onChanged; the options page
// also explicitly messages after awaiting storage.set), so without this
// queue two concurrent runs can both try to register the same script id
// before the other's unregister completes ("Duplicate script ID").
let syncQueue = Promise.resolve();
function syncAllRegistrations() {
  syncQueue = syncQueue.then(syncAllRegistrationsInternal, syncAllRegistrationsInternal);
  return syncQueue;
}

async function syncAllRegistrationsInternal() {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  const config = result[STORAGE_KEY] || { globalEnabled: false, environments: [] };

  const existing = await chrome.scripting.getRegisteredContentScripts();
  const knownEnvIds = new Set((config.environments || []).map((e) => e.id));
  const staleIds = existing
    .filter((s) => s.id.startsWith('mf-devtools-'))
    .map((s) => s.id)
    .filter((id) => {
      const envId = id.replace(/^mf-devtools-(main|isolated)-/, '');
      return !knownEnvIds.has(envId);
    });
  if (staleIds.length) {
    await chrome.scripting.unregisterContentScripts({ ids: staleIds }).catch(() => {});
  }

  const results = {};
  for (const env of config.environments || []) {
    // eslint-disable-next-line no-await-in-loop
    try { results[env.id] = await registerForEnvironment(env); }
    catch (err) { results[env.id] = {ok:false,reason:err.message}; }
  }
  return results;
}

chrome.runtime.onInstalled.addListener(() => {
  syncAllRegistrations().catch(() => {});
});
chrome.runtime.onStartup.addListener(() => {
  syncAllRegistrations().catch(() => {});
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && changes[STORAGE_KEY]) {
    syncAllRegistrations().catch(() => {});
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'MF_DEVTOOLS_SYNC_REGISTRATIONS') {
    syncAllRegistrations().then((results) => sendResponse({ ok: true, results })).catch(err => sendResponse({ok:false,error:err.message}));
    return true;
  }
  if (message?.type === 'MF_DEVTOOLS_REQUEST_PERMISSION') {
    // Must be called synchronously (no await before it) to use the
    // triggering click's user-gesture window, which survives exactly one
    // sendMessage hop.
    chrome.permissions
      .request({ origins: [message.originPattern] })
      .then((granted) => sendResponse({ granted }))
      .catch((err) => sendResponse({ granted: false, error: err.message }));
    return true;
  }
  if (message?.type === 'MF_DEVTOOLS_REMOVE_PERMISSION') {
    chrome.permissions
      .remove({ origins: [message.originPattern] })
      .then((removed) => sendResponse({ removed }))
      .catch((err) => sendResponse({ removed: false, error: err.message }));
    return true;
  }
  return false;
});
