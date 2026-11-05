import * as hooks from './main.js';
export async function bootstrap(p) { return hooks.bootstrap(p); }
export async function mount(p) { return hooks.mount(p); }
export async function unmount(p) { return hooks.unmount(p); }
