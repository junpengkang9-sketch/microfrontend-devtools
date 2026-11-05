import { defineConfig } from 'vite';
export default defineConfig({ resolve: { alias: { 'vite-plugin-qiankun/dist/helper': new URL('./src/production-helper.js', import.meta.url).pathname } }, build: { outDir: 'dist', lib: { entry: 'src/production-entry.js', name: 'app-alpha', formats: ['umd'], fileName: () => 'app.umd.js' }, cssCodeSplit: false } });
