// Supports hosts that already call window.qiankun.loadMicroApp. A private
// imported copy of qiankun cannot be patched through this adapter.
(() => {
  const runtime = window.__MF_DEVTOOLS_RUNTIME__, matching = window.__MF_DEVTOOLS_MATCHING__;
  if (!runtime || !matching) return;
  const ID = 'exposed-qiankun', patched = new WeakSet();
  function attach(qk) {
    if (!qk || typeof qk.loadMicroApp !== 'function' || patched.has(qk)) return;
    patched.add(qk);
    const load = qk.loadMicroApp;
    const replacement = function(config, ...rest) {
      const self = this;
      let instance;
      const ready = runtime.ready().then(() => {
        const env = matching.findEnvironmentForOrigin(runtime.getConfig(), location.href);
        const rule = matching.findMatchingRule(env, config?.name, config?.entry);
        let effective = config;
        if (rule && ['auto', ID, undefined].includes(rule.adapter)) {
          effective = {...config, entry:matching.resolveLocalEntry(rule, config.entry)};
          runtime._state.entries[config.name] = config.entry;
          runtime._state.resolvedEntries[config.name] = effective.entry;
          runtime.recordApplied(ID, {appIdentifier:config.name,onlineEntry:config.entry,resolvedUrl:effective.entry,ruleId:rule.id,environmentId:env.id});
        }
        instance = load.call(self, effective, ...rest);
        return instance;
      });
      // Keep single-spa's parcel-shaped synchronous return contract.
      const proxy = { getStatus: () => instance?.getStatus() || 'NOT_LOADED' };
      for (const field of ['mountPromise','unmountPromise','bootstrapPromise','loadPromise']) Object.defineProperty(proxy, field, {get:()=>ready.then(p=>p[field])});
      for (const method of ['mount','unmount','update']) proxy[method] = (...args)=>ready.then(p=>p[method](...args));
      return proxy;
    };
    try { qk.loadMicroApp = replacement; } catch {}
    if (qk.loadMicroApp !== replacement) { runtime.reportAdapterStatus(ID,{supported:false,reason:'公开加载接口只读，请使用主应用路由接入方式'}); return; }
    runtime.reportAdapterStatus(ID,{supported:true,reason:'已连接页面公开的微前端加载接口'});
  }
  let current = window.qiankun;
  const descriptor = Object.getOwnPropertyDescriptor(window,'qiankun');
  if (!descriptor || descriptor.configurable) Object.defineProperty(window,'qiankun',{
    configurable:true,enumerable:true,get:()=>current,set(value){current=value;attach(value);},
  });
  runtime.reportAdapterStatus(ID,{supported:null,reason:'正在检测微前端加载接口'});
  attach(current);
})();
