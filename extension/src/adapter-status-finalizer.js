// Loaded LAST among the MAIN-world scripts. After a grace period (to let
// a host's bundle finish its startup and assign window.APP / window.qiankun),
// any adapter still reporting supported:null (still waiting) is finalized
// to supported:false with an honest "not detected" reason, so the popup
// never shows a perpetual "等待中" for a host that simply does not expose
// either supported pattern.
(() => {
  const GRACE_MS = 4000;
  const runtime = window.__MF_DEVTOOLS_RUNTIME__;
  if (!runtime) return;

  setTimeout(() => {
    const adapters = runtime._state.adapters;
    Object.keys(adapters).forEach((id) => {
      if (adapters[id].supported === null) {
        runtime.reportAdapterStatus(id, {
          supported: false,
          reason: '未发现可接入的主应用接口，请查看兼容性说明',
        });
      }
    });
    if (Object.keys(adapters).length === 0) {
      runtime.log({ level: 'warn', message: '未加载任何适配器（可能当前环境未启用）' });
    }
  }, GRACE_MS);
})();
