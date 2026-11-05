// ISOLATED-world content script: reads the extension's config from
// chrome.storage.local and relays it into the page's MAIN world via
// postMessage, since MAIN-world scripts cannot call chrome.storage
// directly. Re-posts on every chrome.storage.onChanged event so a live
// config edit reaches the page without a reload (though an already-running
// adapter may only apply it to FUTURE route registrations — see each
// adapter's own doc comment).
(() => {
  const MSG_TAG = '__MF_DEVTOOLS_CONFIG_V2__';
  const STORAGE_KEY = 'mfDevtoolsConfigV2';

  function postConfig(config) {
    window.postMessage({ tag: MSG_TAG, config }, window.location.origin);
  }

  chrome.storage.local.get(STORAGE_KEY, (result) => {
    postConfig(result[STORAGE_KEY] || { globalEnabled: false, environments: [] });
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return;
    if (changes[STORAGE_KEY]) {
      postConfig(changes[STORAGE_KEY].newValue || { globalEnabled: false, environments: [] });
    }
  });
})();
