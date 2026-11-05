import { loadMicroApp } from 'qiankun';
import { resolveEntry } from './runtime-config.js';
import { getSession, login, logout, authedFetch } from './auth.js';

const ONLINE_ENTRIES = {
  alpha: 'http://127.0.0.1:18080/app-alpha/',
  beta: 'http://127.0.0.1:18080/app-beta/',
};

const sessionInfoEl = document.getElementById('session-info');
const loginScreenEl = document.getElementById('login-screen');
const appSlotsEl = document.getElementById('app-slots');
const mainNavEl = document.getElementById('main-nav');
const wrapAlpha = document.getElementById('wrap-alpha');
const wrapBeta = document.getElementById('wrap-beta');
document.getElementById('host-origin').textContent = location.origin;

// Each entry holds the live qiankun micro-app instance (from loadMicroApp),
// so we can unmount/remount it independently of the other app when routes
// change, without reloading the host page.
const instances = { alpha: null, beta: null };

function currentRoute() {
  return location.hash.replace('#', '') || '/both';
}

function wantedApps(route) {
  if (route === '/alpha') return ['alpha'];
  if (route === '/beta') return ['beta'];
  return ['alpha', 'beta'];
}

async function mountApp(appName) {
  if (instances[appName]) return;
  const containerId = `#container-${appName}`;
  // No opts.pathSuffix here: this demo host has no in-app deep-link state
  // to preserve across an override, so a configured local baseUrl (if the
  // user put a path/query in the popup) is honored exactly as typed. Pass
  // { pathSuffix: '/some/path?x=1' } instead if a future host route needs
  // to force a specific in-app location on top of the configured base.
  const entry = await resolveEntry(appName, ONLINE_ENTRIES[appName]);
  window.__MF_DEVTOOLS_RESOLVED__ = window.__MF_DEVTOOLS_RESOLVED__ || {};
  window.__MF_DEVTOOLS_RESOLVED__[appName] = entry;
  // eslint-disable-next-line no-console
  console.log(`[mf-devtools-host] mounting app-${appName} from`, entry);
  const microApp = loadMicroApp(
    {
      name: `app-${appName}`,
      entry,
      container: containerId,
      props: { basePath: `/${appName}` },
    },
    { sandbox: { experimentalStyleIsolation: true } },
  );
  instances[appName] = microApp;
  // loadMicroApp() returns the single-spa parcel SYNCHRONOUSLY — calling it
  // does not wait for bootstrap/mount, only microApp.mountPromise does. The
  // window.proxy race this function exists to avoid (see applyRoute's
  // comment) happens during bootstrap/script-execution, which runs
  // asynchronously AFTER this function returns if mountPromise isn't
  // awaited. So the caller (applyRoute) MUST await this full mountApp()
  // call, including mountPromise, before starting the next app's mount.
  await microApp.mountPromise;
}

async function unmountApp(appName) {
  const instance = instances[appName];
  if (!instance) return;
  instances[appName] = null;
  await instance.unmount();
}

// Serializes all applyRoute() invocations: a route change (hashchange),
// login's post-boot applyRoute(), and the initial boot() call must never
// run concurrently with each other, or a route change could start a second
// mountApp() for an app whose FIRST mount is still awaiting its
// mountPromise — reintroducing the same window.proxy race applyRouteInternal
// already serializes *within* one call.
let routeQueue = Promise.resolve();
function applyRoute() {
  routeQueue = routeQueue.then(applyRouteInternal, applyRouteInternal);
  return routeQueue;
}

async function applyRouteInternal() {
  const route = currentRoute();
  wrapAlpha.style.display = route === '/beta' ? 'none' : 'flex';
  wrapBeta.style.display = route === '/alpha' ? 'none' : 'flex';
  document.querySelectorAll('#main-nav a').forEach((a) => {
    a.classList.toggle('active', a.dataset.route === route);
  });

  const wanted = new Set(wantedApps(route));

  // IMPORTANT: unmounts can run concurrently, but mounts must NOT. qiankun's
  // loadMicroApp (with the default singular:false) does not serialize two
  // concurrent mounts against each other, and vite-plugin-qiankun's dev-mode
  // entry script reads/writes the single shared `window.proxy` global
  // (import-html-entry's execScripts sets window.proxy = <this app's sandbox
  // proxy> synchronously, then the entry HTML's dynamic import() reads
  // window.proxy.__INJECTED_PUBLIC_PATH_BY_QIANKUN__ asynchronously). If two
  // mounts' script-execution phases interleave, the second app's
  // window.proxy assignment can be read by the first app's still-pending
  // dynamic import, wiring that app's lifecycle onto the WRONG sandbox proxy
  // and leaving its qiankun bootstrap promise unresolved forever (observed
  // as single-spa error code 31). Sequencing mounts here avoids that race;
  // see tests/specs/02-concurrent-mount-and-hmr.spec.js for the regression
  // test and README "Known qiankun + vite-plugin-qiankun concurrency
  // constraint" for the full writeup.
  const toUnmount = Object.keys(instances).filter((appName) => !wanted.has(appName));
  await Promise.all(toUnmount.map(unmountApp));
  for (const appName of Object.keys(instances)) {
    if (wanted.has(appName)) {
      // eslint-disable-next-line no-await-in-loop
      await mountApp(appName);
    }
  }
}

function renderAuthedUI(session) {
  sessionInfoEl.textContent = `signed in as ${session.username}`;
  loginScreenEl.style.display = 'none';
  appSlotsEl.style.display = 'flex';
  mainNavEl.style.display = 'flex';
}

function renderSignedOutUI() {
  sessionInfoEl.textContent = 'not signed in';
  loginScreenEl.style.display = 'flex';
  appSlotsEl.style.display = 'none';
  mainNavEl.style.display = 'none';
}

document.getElementById('login-btn').addEventListener('click', async () => {
  const username = document.getElementById('login-user').value;
  const password = document.getElementById('login-pass').value;
  try {
    const session = await login(username, password);
    renderAuthedUI(session);
    await applyRoute();
  } catch (err) {
    alert(`Login failed: ${err.message}`);
  }
});

document.getElementById('logout-btn')?.addEventListener('click', async () => {
  await Promise.all(Object.keys(instances).map(unmountApp));
  await logout();
  renderSignedOutUI();
});

window.addEventListener('hashchange', applyRoute);

async function boot() {
  const existing = await getSession();
  if (existing) {
    renderAuthedUI(existing);
    await applyRoute();
  } else {
    renderSignedOutUI();
  }
}

window.__mfDevtoolsLogout = logout;
window.__mfDevtoolsAuthedFetch = authedFetch;

boot();
