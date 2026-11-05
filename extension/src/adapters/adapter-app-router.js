// Supported runtime contract: an existing window.APP.router exposing the
// Vue Router 3/4 addRoute/getRoutes API. No host-side extension API is used.
// Keep normalized records intact: replacing them by addRoute loses parent,
// aliases, guards and the current matched record. Only entry-bearing props
// and meta are reconciled against their original values.
(() => {
  const runtime = window.__MF_DEVTOOLS_RUNTIME__;
  const matching = window.__MF_DEVTOOLS_MATCHING__;
  if (!runtime || !matching) return;
  const ID = 'app-router';
  const installed = new WeakSet();
  const baselines = new WeakMap();
  let router;
  let refreshQueued = false;

  function rewrite(value, path = [], depth = 0) {
    if (depth > 6 || value == null) return value;
    if (typeof value === 'function') return value;
    if (typeof value !== 'object') return value;
    if (typeof value.name === 'string' && typeof value.entry === 'string') {
      runtime._state.entries[value.name] = value.entry;
      const env = matching.findEnvironmentForOrigin(runtime.getConfig(), location.href);
      const rule = matching.findMatchingRule(env, value.name, value.entry);
      if (!rule || !['auto', ID, undefined].includes(rule.adapter)) return value;
      const local = matching.resolveLocalEntry(rule, value.entry);
      runtime._state.resolvedEntries[value.name] = local;
      runtime.recordApplied(ID, { appIdentifier: value.name, onlineEntry: value.entry,
        resolvedUrl: local, ruleId: rule.id, environmentId: env.id, via: path.join('.') });
      return { ...value, entry: local };
    }
    let changed = false;
    const copy = Array.isArray(value) ? [...value] : { ...value };
    // Do not traverse component instances: only the route's props/meta tree.
    for (const key of Object.keys(value)) {
      const next = rewrite(value[key], [...path, key], depth + 1);
      if (next !== value[key]) { copy[key] = next; changed = true; }
    }
    return changed ? copy : value;
  }

  function entries(value, result = [], path = '', depth = 0) {
    if (!value || typeof value !== 'object' || depth > 6) return result;
    if (typeof value.name === 'string' && typeof value.entry === 'string') result.push(`${path}:${value.name}:${value.entry}`);
    else Object.keys(value).forEach(k => entries(value[k], result, `${path}.${k}`, depth + 1));
    return result;
  }

  const factoryWrappers = new WeakMap();
  function wrapFactory(factory) {
    if (!factoryWrappers.has(factory)) factoryWrappers.set(factory, function(...args) { return rewrite(factory.apply(this, args)); });
    return factoryWrappers.get(factory);
  }
  function routeValue(record, field, value) {
    if (field !== 'props') return rewrite(value, [field]);
    if (typeof value === 'function') return wrapFactory(value);
    let result = rewrite(value, [field]);
    for (const view of Object.keys(record.components || {})) if (typeof value?.[view] === 'function') result = {...result, [view]:wrapFactory(value[view])};
    return result;
  }
  function reconcile(records) {
    let changed = false;
    for (const record of records || []) {
      if (!baselines.has(record)) baselines.set(record, { props: record.props, meta: record.meta });
      const base = baselines.get(record);
      for (const field of ['props', 'meta']) {
        const desired = routeValue(record, field, base[field]);
        const before = JSON.stringify(entries(record[field]));
        const after = JSON.stringify(entries(desired));
        if (before !== after || containsFactory(base[field])) {
          record[field] = desired;
          if (before !== after) changed = true;
        }
      }
    }
    return changed;
  }

  function containsFactory(value, depth = 0) {
    if (typeof value === 'function') return true;
    return depth < 6 && value && typeof value === 'object' && Object.values(value).some(v => containsFactory(v, depth + 1));
  }

  function refreshCurrent() {
    if (refreshQueued || !router || typeof router.replace !== 'function') return;
    refreshQueued = true;
    Promise.resolve(router.isReady?.()).then(async () => {
      const current = router.currentRoute?.value || router.currentRoute;
      if (current?.fullPath) await router.replace({ path: current.fullPath, force: true, replace: true });
    }).catch(err => runtime.log({ level: 'error', adapterId: ID, message: err.message }))
      .finally(() => { refreshQueued = false; });
  }

  function attach(candidate) {
    if (!candidate || typeof candidate.addRoute !== 'function' || typeof candidate.getRoutes !== 'function') {
      runtime.reportAdapterStatus(ID, { supported: false, reason: '未发现可适配的主应用路由，请选择其他适配器' });
      return;
    }
    router = candidate;
    if (installed.has(candidate)) return;
    installed.add(candidate);
    const add = candidate.addRoute;
    candidate.addRoute = function (...args) {
      const remove = add.apply(this, args);
      reconcile(candidate.getRoutes());
      return remove;
    };
    if (typeof candidate.beforeEach === 'function') candidate.beforeEach(async (to, _from, next) => {
      await runtime.ready();
      reconcile(candidate.getRoutes());
      // `to` may already have matched before config arrived. The normalized
      // record identities are preserved, so its props now contain the entries.
      reconcile(to.matched);
      if (next) next();
    });
    reconcile(candidate.getRoutes());
    runtime.ready().then(() => {
      if (reconcile(candidate.getRoutes())) refreshCurrent();
    });
    runtime.reportAdapterStatus(ID, { supported: true, reason: '已连接主应用路由；仅改写匹配规则的子应用入口' });
  }

  runtime.reportAdapterStatus(ID, { supported: null, reason: '正在检测主应用路由' });
  const descriptor = Object.getOwnPropertyDescriptor(window, 'APP');
  let app = window.APP;
  if (!descriptor || descriptor.configurable) Object.defineProperty(window, 'APP', {
    configurable: true, enumerable: descriptor?.enumerable ?? true,
    get() { return descriptor?.get ? descriptor.get.call(window) : app; },
    set(value) {
      if (descriptor?.set) descriptor.set.call(window, value); else app = value;
      attach(value?.router);
    },
  });
  if (app?.router) attach(app.router);
  // Existing APP objects may acquire a router later without being reassigned.
  const timer = setInterval(() => {
    if (window.APP?.router && !installed.has(window.APP.router)) attach(window.APP.router);
  }, 50);
  setTimeout(() => clearInterval(timer), 10000);
  window.addEventListener('mf-devtools:config-updated', () => {
    if (router) reconcile(router.getRoutes());
  });
})();
