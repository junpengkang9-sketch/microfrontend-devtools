// Ordinary business "both microapps on one screen" view — not a devtools
// concept, just a dashboard-style page a real app might have (e.g. an
// overview screen embedding two independent micro-apps side by side).
// Receives both apps' {name, entry, baseRoute} as static component props,
// exactly like MicroAppWrapper, and renders two independent
// MicroAppWrapper instances so both mount concurrently in the same page.
import { h, defineComponent } from 'vue';
import MicroAppWrapper from './MicroAppWrapper.js';

export default defineComponent({
  name: 'BothView',
  props: {
    first: { type: Object, required: true },
    second: { type: Object, required: true },
  },
  setup(props) {
    return () =>
      h('div', [
        h('div', { class: 'micro-wrap' }, [
          h('div', { class: 'micro-label' }, `section: ${props.first.name}`),
          h(MicroAppWrapper, { key: props.first.name, ...props.first }),
        ]),
        h('div', { class: 'micro-wrap' }, [
          h('div', { class: 'micro-label' }, `section: ${props.second.name}`),
          h(MicroAppWrapper, { key: props.second.name, ...props.second }),
        ]),
      ]);
  },
});
