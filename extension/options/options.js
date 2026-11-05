import { targetTab, readRuntime } from '../src/ui-status.js';
import {
  STORAGE_KEY,
  emptyConfig,
  makeEnvironment,
  makeRule,
  validateConfig,
  originPatternMatches,
  normalizeOriginPattern,
} from '../src/config-schema.js';

let config = emptyConfig();
let activeEnvId = null;
let pendingRefresh = false;

const globalEnabledEl = document.getElementById('global-enabled');
const envListEl = document.getElementById('env-list');
const envEditorEl = document.getElementById('env-editor');
const emptyStateEl = document.getElementById('empty-state');
const envTemplate = document.getElementById('environment-template');
const ruleTemplate = document.getElementById('rule-template');
const validationBox = document.getElementById('validation-box');
const saveStatusEl = document.getElementById('save-status');

async function loadConfig() {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  config = result[STORAGE_KEY] || emptyConfig();
  activeEnvId = config.environments?.[0]?.id || null;
  render();
}

async function persist() {
  const problems = validateConfig(config);
  if (problems.length) {
    validationBox.hidden = false;
    validationBox.innerHTML = `<strong>配置存在问题，已保存但可能无法生效：</strong><ul>${problems
      .map((p) => `<li>${escapeHtml(p)}</li>`)
      .join('')}</ul>`;
  } else {
    validationBox.hidden = true;
  }
  await chrome.storage.local.set({ [STORAGE_KEY]: config });
  const sync = await chrome.runtime.sendMessage({ type: 'MF_DEVTOOLS_SYNC_REGISTRATIONS' });
  if (!sync?.ok) throw new Error(sync?.error || '站点脚本注册失败');
  pendingRefresh = true;
  saveStatusEl.textContent = '已保存 · 刷新主应用后生效';
  refreshRuleStatus();
}

function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

async function checkPermission(originPattern) {
  if (!originPattern) return false;
  try {
    return await chrome.permissions.contains({ origins: [originPattern] });
  } catch {
    return false;
  }
}

function render() {
  globalEnabledEl.checked = !!config.globalEnabled;
  renderSidebar();
  const envs = config.environments || [];
  if (!envs.length) {
    emptyStateEl.hidden = false;
    envEditorEl.hidden = true;
    return;
  }
  emptyStateEl.hidden = true;
  envEditorEl.hidden = false;
  if (!envs.find((e) => e.id === activeEnvId)) activeEnvId = envs[0].id;
  renderEditor();
}

function renderSidebar() {
  envListEl.innerHTML = '';
  (config.environments || []).forEach((env) => {
    const li = document.createElement('li');
    li.className = `env-list-item${env.id === activeEnvId ? ' active' : ''}`;
    li.tabIndex = 0;
    li.innerHTML = `<span class="dot ${env.enabled ? 'on' : 'off'}"></span><span class="env-item-label">${escapeHtml(
      env.label || '(未命名环境)',
    )}</span>`;
    li.addEventListener('click', () => {
      activeEnvId = env.id;
      render();
    });
    li.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        activeEnvId = env.id;
        render();
      }
    });
    envListEl.appendChild(li);
  });
}

function renderEditor() {
  envEditorEl.innerHTML = '';
  const env = (config.environments || []).find((e) => e.id === activeEnvId);
  if (!env) return;

  const node = envTemplate.content.cloneNode(true);
  const card = node.querySelector('[data-env-card]');
  card.dataset.envId = env.id;

  const enabledBox = card.querySelector('.env-enabled');
  const labelInput = card.querySelector('.env-label');
  const originInput = card.querySelector('.env-origin');
  const permStatus = card.querySelector('[data-field="permission-status"]');
  const tabStatus = card.querySelector('[data-field="tab-status"]');
  const grantBtn = card.querySelector('.grant-permission-btn');
  const removeBtn = card.querySelector('.remove-env-btn');
  const rulesContainer = card.querySelector('.rules-container');
  const addRuleBtn = card.querySelector('.add-rule-btn');

  enabledBox.checked = env.enabled;
  labelInput.value = env.label;
  originInput.value = env.originPattern;

  enabledBox.addEventListener('change', () => {
    env.enabled = enabledBox.checked;
    renderSidebar();
    persist();
  });
  labelInput.addEventListener('change', () => {
    env.label = labelInput.value.trim();
    renderSidebar();
    persist();
  });
  originInput.addEventListener('change', () => {
    try { env.originPattern = normalizeOriginPattern(originInput.value); originInput.value = env.originPattern; } catch { env.originPattern = originInput.value.trim(); }
    refreshPermissionStatus();
    persist();
  });

  async function refreshPermissionStatus() {
    const granted = await checkPermission(env.originPattern);
    permStatus.textContent = granted ? '已授权' : '未授权';
    permStatus.classList.toggle('granted', granted);
  }
  refreshPermissionStatus();

  grantBtn.addEventListener('click', async () => {
    if (!env.originPattern?.trim()) {
      alert('请先填写线上域名匹配规则');
      return;
    }
    let response;
    try { response = { granted: await chrome.permissions.request({ origins: [env.originPattern.trim()] }) }; } catch (err) { response = { error: err.message }; }
    if (response?.granted) {
      await refreshPermissionStatus();
      await persist();
    } else {
      alert(`未获得授权：${response?.error || '用户拒绝或格式不被 Chrome 接受'}`);
    }
  });

  removeBtn.addEventListener('click', async () => {
    if (!confirm(`确定删除环境「${env.label || env.originPattern}」吗？`)) return;
    if (env.originPattern && !config.environments.some(e => e.id !== env.id && e.originPattern === env.originPattern)) {
      await chrome.runtime.sendMessage({ type: 'MF_DEVTOOLS_REMOVE_PERMISSION', originPattern: env.originPattern });
    }
    config.environments = config.environments.filter((e) => e.id !== env.id);
    activeEnvId = config.environments[0]?.id || null;
    render();
    persist();
  });

  addRuleBtn.addEventListener('click', () => {
    env.rules = env.rules || [];
    env.rules.push(makeRule());
    renderRules();
    persist();
  });

  function renderRules() {
    rulesContainer.innerHTML = '';
    (env.rules || []).forEach((rule) => renderRule(rule, env, rulesContainer));
  }
  renderRules();

  refreshTabStatus(env, tabStatus);

  envEditorEl.appendChild(node);
}

function renderRule(rule, env, container) {
  const node = ruleTemplate.content.cloneNode(true);
  const row = node.querySelector('[data-rule-row]');
  row.dataset.ruleId = rule.id;

  const enabledBox = row.querySelector('.rule-enabled');
  const appIdInput = row.querySelector('.rule-app-identifier');
  const onlineMatchInput = row.querySelector('.rule-online-match');
  const localUrlInput = row.querySelector('.rule-local-url');
  const adapterSelect = row.querySelector('.rule-adapter');
  const removeBtn = row.querySelector('.remove-rule-btn');

  enabledBox.checked = rule.enabled;
  appIdInput.value = rule.appIdentifier;
  onlineMatchInput.value = rule.onlineMatch;
  localUrlInput.value = rule.localEntryUrl;
  adapterSelect.value = rule.adapter || 'auto';

  enabledBox.addEventListener('change', () => {
    rule.enabled = enabledBox.checked;
    persist();
  });
  appIdInput.addEventListener('change', () => {
    rule.appIdentifier = appIdInput.value.trim();
    persist();
  });
  onlineMatchInput.addEventListener('change', () => {
    rule.onlineMatch = onlineMatchInput.value.trim();
    persist();
  });
  localUrlInput.addEventListener('change', () => {
    rule.localEntryUrl = localUrlInput.value.trim();
    persist();
  });
  adapterSelect.addEventListener('change', () => {
    rule.adapter = adapterSelect.value;
    persist();
  });
  removeBtn.addEventListener('click', () => {
    env.rules = env.rules.filter((r) => r.id !== rule.id);
    container.innerHTML = '';
    (env.rules || []).forEach((r) => renderRule(r, env, container));
    persist();
  });

  container.appendChild(node);
}

async function refreshTabStatus(env, el) {
  try {
    const tab = await targetTab(config);
    if (!tab?.url) {
      el.textContent = '当前标签页：无法读取';
      return;
    }
    if (originPatternMatches(env.originPattern, tab.url)) {
      el.textContent = `当前标签页匹配（${new URL(tab.url).origin}）`;
    } else {
      el.textContent = '当前标签页不匹配此环境';
    }
  } catch {
    el.textContent = '当前标签页：检测失败';
  }
}

function addEnvironment() {
  config.environments = config.environments || [];
  const env = makeEnvironment();
  config.environments.push(env);
  activeEnvId = env.id;
  render();
  persist();
}

document.getElementById('add-env-btn').addEventListener('click', addEnvironment);
document.getElementById('empty-add-env-btn').addEventListener('click', addEnvironment);

globalEnabledEl.addEventListener('change', () => {
  config.globalEnabled = globalEnabledEl.checked;
  persist();
});

document.getElementById('export-btn').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `mf-devtools-config-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

document.getElementById('import-input').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    if (typeof parsed !== 'object' || !Array.isArray(parsed.environments)) {
      throw new Error('文件格式不正确：缺少 environments 数组');
    }
    const problems = validateConfig(parsed);
    if (problems.length) throw new Error(problems.join('；'));
    config = parsed;
    activeEnvId = config.environments?.[0]?.id || null;
    render();
    await persist();
    alert('导入成功');
  } catch (err) {
    alert(`导入失败：${err.message}`);
  }
  e.target.value = '';
});

async function refreshRuleStatus() {
  const output = document.getElementById('status-output');
  try {
    const tab = await targetTab(config);
    const state = await readRuntime(tab).catch(() => null);
    output.textContent = !tab ? '请打开已配置的主应用页面' : !state ? '请授权此域名并刷新主应用页面' :
      `${new URL(tab.url).origin} · ${state.configReady ? '配置已同步' : '正在连接'}\n` +
      Object.entries(state.adapters || {}).filter(([id]) => id !== 'entry-fetch-barrier').map(([id,s]) => `${id === 'app-router' ? '主应用路由' : '微前端接口'}：${s.reason}`).join('\n');
    const env = config.environments.find(e => e.id === activeEnvId);
    document.querySelectorAll('[data-rule-row]').forEach(row => {
      const rule = env?.rules.find(r => r.id === row.dataset.ruleId);
      const label = row.querySelector('.rule-status');
      const health = state?.rules?.[rule?.id];
      let text = !config.globalEnabled || !env?.enabled || !rule?.enabled ? '已关闭' :
        pendingRefresh ? '刷新后生效' : health?.available === false ? '服务不可用' : !state ? '待刷新页面' :
        Object.values(state.adapters || {}).some(s => s.applied?.some(a => a.ruleId === rule?.id)) ? '规则已匹配' : '等待应用';
      label.textContent = text; label.title = health?.message || text;
      label.dataset.state = text === '服务不可用' ? 'error' : text === '规则已匹配' ? 'active' : 'idle';
    });
  } catch { output.textContent = '请在已授权的主应用页面中查看状态'; }
}
document.getElementById('refresh-status-btn').addEventListener('click', refreshRuleStatus);
document.getElementById('reload-host-btn').addEventListener('click', async () => {
  try {
    await persist();
    const tab = await targetTab(config);
    if (tab?.id) { await chrome.tabs.reload(tab.id); pendingRefresh = false; saveStatusEl.textContent = '已保存，主应用正在刷新'; }
    else saveStatusEl.textContent = '已保存，请打开主应用页面';
  } catch (err) { saveStatusEl.textContent = `保存失败：${err.message}`; }
});
window.addEventListener('unhandledrejection', event => { saveStatusEl.textContent = `操作失败：${event.reason?.message || '请检查配置'}`; });
setInterval(refreshRuleStatus, 2000);
loadConfig();
