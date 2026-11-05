// Shared config schema + matching logic, used by the options page, popup,
// background worker, and adapters. Kept dependency-free (plain JS, no
// build step) so every extension context can import it directly.

export const STORAGE_KEY = 'mfDevtoolsConfigV2';

/**
 * @typedef {Object} AppRule
 * @property {string} id - stable rule id (uuid-ish)
 * @property {string} appIdentifier - matched against whatever the host
 *   calls the app (qiankun app "name", route meta "name", etc.)
 * @property {string} onlineMatch - substring or URL prefix the rule's
 *   online entry must contain to apply (safety check against the
 *   appIdentifier alone matching something unrelated)
 * @property {string} localEntryUrl - FULL local entry URL, including path
 *   and query, honored as-is (no normalization to root)
 * @property {boolean} enabled
 * @property {string} [adapter] - adapter id this rule prefers, or "auto"
 */

/**
 * @typedef {Object} Environment
 * @property {string} id
 * @property {string} label - Chinese display name
 * @property {string} originPattern - match pattern for the online host,
 *   e.g. "http://127.0.0.1:18080/*" — used both as the requested Chrome
 *   host permission AND as content-script matches.
 * @property {boolean} enabled - per-environment master switch
 * @property {AppRule[]} rules
 */

/**
 * @typedef {Object} RootConfig
 * @property {boolean} globalEnabled
 * @property {Environment[]} environments
 */

export function emptyConfig() {
  return { globalEnabled: false, environments: [] };
}

export function makeId(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

export function makeEnvironment(partial = {}) {
  return {
    id: partial.id || makeId('env'),
    label: partial.label || '',
    originPattern: partial.originPattern || '',
    enabled: partial.enabled !== undefined ? partial.enabled : true,
    rules: partial.rules || [],
  };
}

export function makeRule(partial = {}) {
  return {
    id: partial.id || makeId('rule'),
    appIdentifier: partial.appIdentifier || '',
    onlineMatch: partial.onlineMatch || '',
    localEntryUrl: partial.localEntryUrl || '',
    enabled: partial.enabled !== undefined ? partial.enabled : true,
    adapter: partial.adapter || 'auto',
  };
}

/**
 * Finds the environment whose originPattern matches the given page URL.
 * Mirrors main-world-config-bridge.js's originPatternMatches exactly —
 * exact origin match + explicit path-segment boundary, NOT a bare
 * startsWith/substring check (which would let "18080" match "180800", or
 * "host.example" match "host.example.evil"). Keep both copies in sync.
 */
export function findEnvironmentForOrigin(config, pageUrl) {
  if (!config?.globalEnabled) return null;
  for (const env of config.environments || []) {
    if (!env.enabled) continue;
    if (originPatternMatches(env.originPattern, pageUrl)) return env;
  }
  return null;
}

export function originPatternMatches(pattern, url) {
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

/**
 * Finds the first enabled rule in an environment whose appIdentifier
 * matches, and whose onlineMatch (if set) is contained in the candidate
 * online entry string. Returns null if nothing matches.
 */
export function findMatchingRule(env, appIdentifier, onlineEntryHint) {
  if (!env) return null;
  for (const rule of env.rules || []) {
    if (!rule.enabled) continue;
    if (rule.appIdentifier !== appIdentifier) continue;
    if (rule.onlineMatch && (!onlineEntryHint || !onlineEntryHint.includes(rule.onlineMatch))) continue;
    return rule;
  }
  return null;
}

/**
 * Validates a RootConfig, returning a list of human-readable (Chinese)
 * problems. Empty array means valid.
 */
export function validateConfig(config) {
  const problems = [];
  if (!config || typeof config !== 'object' || !Array.isArray(config.environments) || typeof config.globalEnabled !== 'boolean') return ['配置格式不正确'];
  const envIds = new Set();
  const origins = new Set();
  for (const env of config.environments || []) {
    if (!env || typeof env !== 'object' || !Array.isArray(env.rules)) { problems.push('环境规则必须是数组'); continue; }
    if (!/^[A-Za-z0-9_-]+$/.test(env.id || '')) problems.push('环境 ID 格式不正确');
    if (!env.label?.trim()) problems.push('存在未命名的环境');
    if (!env.originPattern?.trim()) {
      problems.push(`环境「${env.label || '(未命名)'}」缺少匹配的线上域名`);
    } else if (!/^https?:\/\/[a-zA-Z0-9.:[\]-]+\/\*$/.test(env.originPattern.trim())) {
      problems.push(`环境「${env.label || '(未命名)'}」的域名格式应形如 http://example.com/*`);
    }
    if (origins.has(env.originPattern)) problems.push('同一线上域名请合并到一个环境中');
    origins.add(env.originPattern);
    if (envIds.has(env.id)) problems.push(`存在重复的环境 ID：${env.id}`);
    envIds.add(env.id);

    const ruleKeys = new Set();
    const ruleIds = new Set();
    for (const rule of env.rules || []) {
      if (!rule || typeof rule !== 'object') { problems.push('应用规则格式不正确'); continue; }
      if (!/^[A-Za-z0-9_-]+$/.test(rule.id || '') || ruleIds.has(rule.id)) problems.push('规则 ID 无效或重复');
      ruleIds.add(rule.id);
      if (!['auto', 'app-router', 'exposed-qiankun'].includes(rule.adapter || 'auto')) problems.push('接入方式无效');
      if (!rule.appIdentifier?.trim()) {
        problems.push(`环境「${env.label}」中存在未填写应用标识的规则`);
      }
      if (!rule.localEntryUrl?.trim()) {
        problems.push(`环境「${env.label}」规则「${rule.appIdentifier || '(未命名)'}」缺少本地入口地址`);
      } else {
        try {
          // eslint-disable-next-line no-new
          const u = new URL(rule.localEntryUrl);
          if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password) throw new Error('仅支持不含凭据的 HTTP/HTTPS 地址');
        } catch {
          problems.push(`环境「${env.label}」规则「${rule.appIdentifier}」的本地入口地址不是合法 URL`);
        }
      }
      const key = `${rule.appIdentifier}::${rule.onlineMatch}`;
      if (ruleKeys.has(key)) {
        problems.push(`环境「${env.label}」中规则「${rule.appIdentifier}」与另一条规则重复（应用标识+匹配条件相同）`);
      }
      ruleKeys.add(key);
    }
  }
  return problems;
}

export function normalizeOriginPattern(raw) {
  const url = new URL(raw.trim().replace(/\/\*$/, ''));
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hostname.includes('*')) throw new Error('请填写一个具体的 HTTP/HTTPS 主应用地址');
  return `${url.origin}/*`;
}
