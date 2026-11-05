import { createApp, h, defineComponent, ref, onMounted } from 'vue';
import { createRouter, createWebHashHistory, RouterView, RouterLink } from 'vue-router';
import MicroAppWrapper from './MicroAppWrapper.js';
import BothView from './BothView.js';
import { getSession, login, logout } from './auth.js';

// Online entries this bundled host was built to use. A real app would read
// these from its own remote config/env, not from any devtools concept.
const ONLINE_ENTRIES = {
  alpha: new URL('/app-alpha/', location.origin).href,
  beta: new URL('/app-beta/', location.origin).href,
};

const Home = defineComponent({
  name: 'Home',
  render: () => h('div', { style: 'padding:20px;color:#9ca3af;font-size:13px' }, 'Select a section above.'),
});

const router = createRouter({
  history: createWebHashHistory(),
  routes: [{ path: '/', name: 'home', component: Home }],
});

// Real-world pattern this fixture reproduces: micro-app routes are added
// DYNAMICALLY at runtime via router.addRoute(), carrying
// {name, entry, baseRoute} as the route's STATIC component PROPS (not
// meta) — the primary target pattern this project supports. This call
// happens from the host's own bundled code, at a time of the host's
// choosing (here: immediately at startup, but in a real app it could be
// after fetching a remote app registry) — nothing here is a devtools hook.
function registerMicroAppRoute(appKey, path) {
  router.addRoute({
    path,
    name: `micro-${appKey}`,
    component: MicroAppWrapper,
    props: {
      name: `app-${appKey}`,
      entry: ONLINE_ENTRIES[appKey],
      baseRoute: path,
    },
  });
}

registerMicroAppRoute('alpha', '/alpha');
registerMicroAppRoute('beta', '/beta');

// Ordinary business "overview" route embedding BOTH micro-apps on one
// screen at once, via nested static props (props.first / props.second),
// proving the adapter handles a props collection shape too, not just a
// single flat {name,entry}.
router.addRoute({
  path: '/both',
  name: 'micro-both',
  component: BothView,
  props: {
    first: { name: 'app-alpha', entry: ONLINE_ENTRIES.alpha, baseRoute: '/alpha' },
    second: { name: 'app-beta', entry: ONLINE_ENTRIES.beta, baseRoute: '/beta' },
  },
});

const Shell = defineComponent({
  name: 'Shell',
  setup() {
    const session = ref(null);
    const username = ref('demo-user');
    const password = ref('demo-pass');
    const error = ref('');

    async function refreshSession() {
      session.value = await getSession();
    }

    async function doLogin() {
      error.value = '';
      try {
        session.value = await login(username.value, password.value);
      } catch (err) {
        error.value = err.message;
      }
    }

    async function doLogout() {
      await logout();
      session.value = null;
    }

    onMounted(refreshSession);

    return () => {
      if (!session.value) {
        return h('div', { id: 'login-box' }, [
          h('h2', { style: 'margin-top:0;font-size:16px' }, 'Synthetic Sign-in'),
          h('input', {
            placeholder: 'username',
            value: username.value,
            onInput: (e) => (username.value = e.target.value),
          }),
          h('input', {
            placeholder: 'password',
            type: 'password',
            value: password.value,
            onInput: (e) => (password.value = e.target.value),
          }),
          h('button', { onClick: doLogin }, 'Sign in'),
          error.value ? h('p', { style: 'color:#f87171;font-size:12px' }, error.value) : null,
        ]);
      }
      return h('div', [
        h('header', [
          h('h1', 'MF DevTools Demo Host v2 — Vue Router, bundled qiankun (no extension hooks)'),
          h('div', { style: 'display:flex;align-items:center;gap:10px' }, [
            h('span', { style: 'font-size:12px;color:#9ca3af' }, `signed in as ${session.value.username}`),
            h('button', { onClick: doLogout, style: 'font-size:11px;padding:4px 8px;cursor:pointer' }, 'Sign out'),
          ]),
        ]),
        h('nav', [
          h(RouterLink, { to: '/alpha' }, () => 'App Alpha'),
          h(RouterLink, { to: '/beta' }, () => 'App Beta'),
          h(RouterLink, { to: '/both' }, () => 'Both (overview)'),
          h(RouterLink, { to: '/' }, () => 'Home'),
        ]),
        h(RouterView),
        h('footer', [
          'host origin: ',
          window.location.origin,
          ' · built with Vue Router, dynamic addRoute(), bundled qiankun — no devtools/extension integration anywhere in this file.',
        ]),
      ]);
    };
  },
});

const app = createApp(Shell);
app.use(router);
app.mount('#app');

// Real-world pattern: the host exposes its own router/app instance on
// window for legitimate reasons (devtools, SSR hydration helpers, QA
// scripts, micro-frontend coordination) — NOT for any extension. This is
// the ONLY thing on window related to routing; there is no resolveEntry,
// no MF_DEVTOOLS global, no handshake of any kind.
window.APP = { router };
