// Shared MAIN-world matching, configuration and status. Kept in one file
// to avoid redundant shared-file registrations across isolated worlds.
(() => {
  const MSG_TAG = '__MF_DEVTOOLS_CONFIG_V2__';

  // --- matching logic (formerly matching-lib.js) ---
  function originPatternMatches(pattern, url) {
    if (!pattern) return false;
    try {
      const patternUrl = new URL(pattern.endsWith('/*') ? pattern.slice(0, -2) || '/' : pattern.replace(/\*$/, ''));
      const candidateUrl = new URL(url);
      if (patternUrl.origin !== candidateUrl.origin) return false;
      const patternPath = patternUrl.pathname === '/' ? '' : patternUrl.pathname.replace(/\/$/, '');
      if (!patternPath) return true;
      const candidatePath = candidateUrl.pathname;
      return candidatePath === patternPath || candidatePath.startsWith(`${patternPath}/`);
    } catch {
      return false;
    }
  }

  function findEnvironmentForOrigin(config, pageUrl) {
    if (!config || !config.globalEnabled) return null;
    const environments = config.environments || [];
    for (let i = 0; i < environments.length; i += 1) {
      const env = environments[i];
      if (!env.enabled) continue;
      if (originPatternMatches(env.originPattern, pageUrl)) return env;
    }
    return null;
  }

  function findMatchingRule(env, appIdentifier, onlineEntryHint) {
    if (!env) return null;
    const rules = env.rules || [];
    for (let i = 0; i < rules.length; i += 1) {
      const rule = rules[i];
      if (!rule.enabled || rule.unavailable) continue;
      if (rule.appIdentifier !== appIdentifier) continue;
      if (rule.onlineMatch && (!onlineEntryHint || onlineEntryHint.indexOf(rule.onlineMatch) === -1)) continue;
      return rule;
    }
    return null;
  }

  function resolveLocalEntry(rule, onlineEntry) {
    const local = new URL(rule.localEntryUrl);
    try { for (const [key, value] of new URL(onlineEntry, location.href).searchParams) if (!local.searchParams.has(key)) local.searchParams.append(key, value); } catch {}
    return local.href;
  }
  window.__MF_DEVTOOLS_MATCHING__ = { originPatternMatches, findEnvironmentForOrigin, findMatchingRule, resolveLocalEntry };

  // --- config bridge + status/log API ---
  const state = {
    config: null,
    configReady: false,
    adapters: {}, // adapterId -> { supported: bool, reason, applied: [ {appIdentifier, resolvedUrl, ruleId} ] }
    log: [],
    entries: {},
    resolvedEntries: {},
  };
  let readyResolve;
  const ready = new Promise((resolve) => { readyResolve = resolve; });

  function log(entry) {
    state.log.push({ ts: Date.now(), ...entry });
    if (state.log.length > 200) state.log.shift();
    window.dispatchEvent(new CustomEvent('mf-devtools:log', { detail: entry }));
  }

  let configRevision = 0;
  window.addEventListener('message', async (event) => {
    if (event.source !== window || event.data?.tag !== MSG_TAG) return;
    const revision = ++configRevision;
    const config = event.data.config;
    const effective = structuredClone(config);
    const env = matchingEnvironment(effective);
    if (env) await Promise.all((env.rules || []).filter(r => r.enabled).map(async (rule) => {
      try {
        const response = await rawFetch(resolveLocalEntry(rule, state.entries[rule.appIdentifier]), { credentials: 'omit', cache: 'no-store', signal: AbortSignal.timeout(2500) });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
      } catch (err) {
        rule.unavailable = `本地服务不可用：${err.name === 'TimeoutError' ? '连接超时' : err.message}`;
      }
    }));
    if (revision !== configRevision) return;
    state.config = effective;
    state.configReady = true;
    state.rules = Object.fromEntries((env?.rules || []).map(r => [r.id, { available: !r.unavailable, message: r.unavailable || '本地服务可访问' }]));
    readyResolve();
    window.dispatchEvent(new CustomEvent('mf-devtools:config-updated'));
  });
  const rawFetch = window.fetch.bind(window);
  function matchingEnvironment(config) { return findEnvironmentForOrigin(config, location.href); }

  function getConfig() {
    return state.config;
  }

  function reportAdapterStatus(adapterId, status) {
    state.adapters[adapterId] = { ...(state.adapters[adapterId] || {}), ...status };
  }

  function recordApplied(adapterId, record) {
    reportAdapterStatus(adapterId, {});
    state.adapters[adapterId].applied = state.adapters[adapterId].applied || [];
    state.adapters[adapterId].applied.push(record);
    if (state.adapters[adapterId].applied.length > 50) state.adapters[adapterId].applied.shift();
    log({ level: 'info', adapterId, ...record });
  }

  window.__MF_DEVTOOLS_RUNTIME__ = {
    _state: state,
    getConfig,
    ready: () => Promise.race([ready, new Promise((resolve) => setTimeout(resolve, 3500))]),
    reportAdapterStatus,
    recordApplied,
    log,
  };
})();
