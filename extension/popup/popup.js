import { targetTab, readRuntime } from '../src/ui-status.js';
import { STORAGE_KEY, emptyConfig, findEnvironmentForOrigin } from '../src/config-schema.js';

const globalEnabledEl = document.getElementById('global-enabled');
const currentUrlEl = document.getElementById('current-url');
const matchedEnvEl = document.getElementById('matched-env');
const adaptersListEl = document.getElementById('adapters-list');

async function loadConfig() {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return result[STORAGE_KEY] || emptyConfig();
}

async function init() {
  const config = await loadConfig();
  globalEnabledEl.checked = !!config.globalEnabled;

  globalEnabledEl.addEventListener('change', async () => {
    config.globalEnabled = globalEnabledEl.checked;
    await chrome.storage.local.set({ [STORAGE_KEY]: config });
    await chrome.runtime.sendMessage({ type: 'MF_DEVTOOLS_SYNC_REGISTRATIONS' });
    const tab = await targetTab(config);
    if (tab?.id) await chrome.tabs.reload(tab.id);
    await refreshTabStatus();
  });

  await refreshTabStatus();
}

function adapterLabel(id) {
  return { 'app-router': '主应用路由', 'exposed-qiankun': '微前端接口' }[id] || id;
}

async function refreshTabStatus() {
  const config = await loadConfig();
  const tab = await targetTab(config);
  currentUrlEl.textContent = tab?.url ? new URL(tab.url).origin : '(无法读取)';

  if (!tab?.url) {
    matchedEnvEl.textContent = '无法检测';
    adaptersListEl.innerHTML = '';
    return;
  }

  const env = findEnvironmentForOrigin(config, tab.url);
  if (env) {
    matchedEnvEl.textContent = env.label || '(未命名环境)';
    matchedEnvEl.classList.add('active');
  } else {
    matchedEnvEl.textContent = '无匹配环境';
    matchedEnvEl.classList.remove('active');
  }

  adaptersListEl.innerHTML = '';
  if (!tab?.id) return;
  try {
    const result = await readRuntime(tab);
    if (!result) {
      adaptersListEl.innerHTML = '<div class="empty-hint">此页面未加载运行时脚本（域名未授权/环境未启用，或需刷新页面）</div>';
      return;
    }
    let entries = Object.entries(result.adapters || {}).filter(([id]) => id !== 'entry-fetch-barrier');
    if (entries.some(([,s]) => s.supported === true)) entries = entries.filter(([,s]) => s.supported === true);
    if (!entries.length) {
      adaptersListEl.innerHTML = '<div class="empty-hint">运行时已就绪，尚无适配器状态</div>';
      return;
    }
    entries.forEach(([id, status]) => {
      const row = document.createElement('div');
      row.className = 'adapter-item';
      const stateLabel = status.supported === true ? '已接管' : status.supported === false ? '不支持' : '检测中';
      const name = document.createElement('span'); name.className = 'adapter-name'; name.textContent = `${adapterLabel(id)}：${stateLabel}`;
      const reason = document.createElement('span'); reason.className = 'adapter-reason'; reason.textContent = status.reason || '';
      row.append(name, reason);
      adaptersListEl.appendChild(row);
    });
  } catch (err) {
    adaptersListEl.textContent = '请授权并刷新主应用后重试';
  }
}

document.getElementById('open-options-btn').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

document.getElementById('refresh-btn').addEventListener('click', refreshTabStatus);

init();
