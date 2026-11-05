import renderWithQiankun, { qiankunWindow } from 'vite-plugin-qiankun/dist/helper';
import './style.css';

// Bumped manually during HMR-proof edits in tests; also shown on screen.
const EDIT_MARKER = 'alpha-edit-marker-v1';

// import.meta.url reflects where THIS MODULE was actually fetched from
// (the real module-origin evidence). location.origin/document.origin is
// always the qiankun HOST document's origin and is expected to stay
// constant regardless of which origin child-app modules load from — qiankun
// evals child scripts inside the host document, it does not navigate.
const MODULE_ORIGIN = import.meta.env.PROD ? location.origin : new URL(import.meta.url).origin;

// HMR correctness note: import.meta.hot.accept(cb) re-registers `cb` on
// EVERY module re-execution, but relying on a closure captured inside that
// cb (e.g. `accept(() => render())`) is wrong — it captures THIS module
// instance's `render`/state, yet the callback that fires for update N+1 is
// the one registered during update N's re-execution, which closes over
// update N's state, not N+1's. Net effect: the UI always lags one edit
// behind. The fix is to export render() and have accept's callback invoke
// the NEW module's own export (import.meta.hot.accept's first argument),
// and to persist state that must survive across swaps (currentContainer,
// mountCount, the live counter) in import.meta.hot.data instead of
// re-initializing it in module-local `let`s that reset on every swap.
const hotData = (import.meta.hot && import.meta.hot.data) || {};
let currentContainer = hotData.currentContainer || null;
let mountCount = hotData.mountCount || 0;
let counter = hotData.counter || 0;

async function fetchApiResult() {
  try {
    const res = await fetch('/api/alpha/data', { credentials: 'same-origin' });
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
    ? currentContainer.querySelector('#app-alpha-root')
    : document.getElementById('app-alpha-root');
  if (!el) return;
  el.innerHTML = `
    <div class="alpha-card" data-testid="alpha-card">
      <h2>App Alpha</h2>
      <p data-testid="alpha-module-origin">module origin: ${MODULE_ORIGIN}</p>
      <p data-testid="alpha-document-origin">document origin: ${location.origin}</p>
      <p data-testid="alpha-mount-count">mount count: ${mountCount}</p>
      <p data-testid="alpha-edit-marker">${EDIT_MARKER}</p>
      <p data-testid="alpha-api-result" data-status="pending">api: loading...</p>
      <button id="alpha-inc">alpha increment</button>
      <p data-testid="alpha-local-counter">local counter: <span id="alpha-counter-val">${counter}</span></p>
    </div>
  `;

  el.querySelector('#alpha-inc').addEventListener('click', () => {
    counter += 1;
    el.querySelector('#alpha-counter-val').textContent = String(counter);
  });

  refreshApiResult(el);
}

async function refreshApiResult(el) {
  const target = el || document.querySelector('[data-testid="alpha-api-result"]');
  if (!target) return;
  const result = await fetchApiResult();
  const node = currentContainer
    ? currentContainer.querySelector('[data-testid="alpha-api-result"]')
    : document.querySelector('[data-testid="alpha-api-result"]');
  if (!node) return;
  node.textContent = result.text;
  node.dataset.status = result.ok ? 'ok' : String(result.status);
}

export function bootstrap() {
  // eslint-disable-next-line no-console
  console.log('[app-alpha] bootstrap');
}

export function mount(props) {
  // eslint-disable-next-line no-console
  console.log('[app-alpha] mount', props);
  render(props?.container);
}

export function unmount(props) {
  // eslint-disable-next-line no-console
  console.log('[app-alpha] unmount', props);
  const el = props?.container ? props.container.querySelector('#app-alpha-root') : document.getElementById('app-alpha-root');
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

window.__appAlphaRefreshApi = () => refreshApiResult();

if (import.meta.hot) {
  import.meta.hot.accept((newModule) => {
    // eslint-disable-next-line no-console
    console.log('[app-alpha] HMR accept: re-rendering in place with the NEW module, no host reload');
    newModule?.render(currentContainer);
  });
  import.meta.hot.dispose((data) => {
    data.currentContainer = currentContainer;
    data.mountCount = mountCount;
    data.counter = counter;
  });
}
