// Internal business component. Bundled, not exported, not aware of any
// devtools/extension concept. Mirrors a real pattern: a wrapper that
// receives {name, entry, container, baseRoute} as COMPONENT PROPS (via the
// route record's static `props` object, as vue-router passes straight
// through to the rendered component — NOT read from route.meta) and calls
// qiankun's loadMicroApp directly. loadMicroApp is imported directly from
// the qiankun package; qiankun itself is NOT exposed on window by this
// host (see main.js). Nothing here is reachable or patchable from outside
// without intercepting the route record's props/meta before this
// component renders, or intercepting loadMicroApp on window (not possible
// here, since it's a private module import).
import { loadMicroApp } from 'qiankun';
import { h, defineComponent, onMounted, onBeforeUnmount, ref, watch } from 'vue';

export default defineComponent({
  name: 'MicroAppWrapper',
  props: {
    name: { type: String, required: true },
    entry: { type: String, required: true },
    baseRoute: { type: String, default: '/' },
  },
  setup(props) {
    const containerRef = ref(null);
    let microApp = null;

    async function mount() {
      if (!props.name || !props.entry || !containerRef.value) return;
      // eslint-disable-next-line no-console
      console.log(`[host-v2] MicroAppWrapper mounting "${props.name}" from`, props.entry, 'baseRoute:', props.baseRoute);
      microApp = loadMicroApp(
        {
          name: props.name,
          entry: props.entry,
          container: containerRef.value,
          props: { basePath: props.baseRoute },
        },
        { sandbox: { experimentalStyleIsolation: true } },
      );
      await microApp.mountPromise;
    }

    async function unmount() {
      if (microApp) {
        const toUnmount = microApp;
        microApp = null;
        await toUnmount.unmount();
      }
    }

    onMounted(mount);
    onBeforeUnmount(unmount);
    watch(
      () => props.entry,
      async (newEntry, oldEntry) => {
        if (newEntry === oldEntry) return;
        await unmount();
        await mount();
      },
    );

    return () => h('div', { class: 'micro-slot', ref: containerRef });
  },
});
