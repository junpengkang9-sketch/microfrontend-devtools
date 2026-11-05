import renderWithQiankun, { qiankunWindow } from 'vite-plugin-qiankun/dist/helper';
import './style.css';

const EDIT_MARKER = 'beta-edit-marker-v1';

// See app-alpha/src/main.js for why module origin (import.meta.url) and
// document origin (location.origin) are reported separately, and for the
// HMR correctness note on accept()/hot.data below.
const MODULE_ORIGIN = import.meta.env.PROD ? location.origin : new URL(import.meta.url).origin;

const hotData = (import.meta.hot && import.meta.hot.data) || {};
let currentContainer = hotData.currentContainer || null;
let mountCount = hotData.mountCount || 0;
let counter = hotData.counter || 0;

async function fetchApiResult() {
  try {
    const res = await fetch('/api/beta/data', { credentials: 'same-origin' });
    if (res.status === 401) {
      return { ok: false, status: 401, text: 'api: 401 unauthenticated' };
    }
    if (!res.ok) {
      return { ok: false, status: res.status, text: `api error: status ${res.status}` };
    }
    const data = await res.json();
    return { ok: true, status: 200, text: `api: ${JSON.stringify(data)}` };
  } catch (err) {
    return { ok: false, status: 0, text: `api error: ${err.message}` };
  }
}

export function render(container) {
  currentContainer = container || currentContainer;
  mountCount += 1;
  const el = currentContainer
    ? currentContainer.querySelector('#app-beta-root')
    : document.getElementById('app-beta-root');
  if (!el) return;
  el.innerHTML = `
    <div class="beta-card" data-testid="beta-card">
      <h2>App Beta</h2>
      <p data-testid="beta-module-origin">module origin: ${MODULE_ORIGIN}</p>
      <p data-testid="beta-document-origin">document origin: ${location.origin}</p>
      <p data-testid="beta-mount-count">mount count: ${mountCount}</p>
      <p data-testid="beta-edit-marker">${EDIT_MARKER}</p>
      <p data-testid="beta-api-result" data-status="pending">api: loading...</p>
      <button id="beta-inc">beta increment</button>
      <p data-testid="beta-local-counter">local counter: <span id="beta-counter-val">${counter}</span></p>
    </div>
  `;

  el.querySelector('#beta-inc').addEventListener('click', () => {
    counter += 1;
    el.querySelector('#beta-counter-val').textContent = String(counter);
  });

  refreshApiResult(el);
}

async function refreshApiResult(el) {
  const target = el || document.querySelector('[data-testid="beta-api-result"]');
  if (!target) return;
  const result = await fetchApiResult();
  const node = currentContainer
    ? currentContainer.querySelector('[data-testid="beta-api-result"]')
    : document.querySelector('[data-testid="beta-api-result"]');
  if (!node) return;
  node.textContent = result.text;
  node.dataset.status = result.ok ? 'ok' : String(result.status);
}

export function bootstrap() {
  // eslint-disable-next-line no-console
  console.log('[app-beta] bootstrap');
}

export function mount(props) {
  // eslint-disable-next-line no-console
  console.log('[app-beta] mount', props);
  render(props?.container);
}

export function unmount(props) {
  // eslint-disable-next-line no-console
  console.log('[app-beta] unmount', props);
  const el = props?.container ? props.container.querySelector('#app-beta-root') : document.getElementById('app-beta-root');
  if (el) el.innerHTML = '';
  currentContainer = null;
  counter = 0;
}

renderWithQiankun({
  bootstrap,
  mount,
  unmount,
  update() {},
});

if (!qiankunWindow.__POWERED_BY_QIANKUN__) {
  render();
}

window.__appBetaRefreshApi = () => refreshApiResult();

if (import.meta.hot) {
  import.meta.hot.accept((newModule) => {
    // eslint-disable-next-line no-console
    console.log('[app-beta] HMR accept: re-rendering in place with the NEW module, no host reload');
    newModule?.render(currentContainer);
  });
  import.meta.hot.dispose((data) => {
    data.currentContainer = currentContainer;
    data.mountCount = mountCount;
    data.counter = counter;
  });
}
