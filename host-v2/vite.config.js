import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  server: {
    host: '127.0.0.1',
    port: 18010,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    rollupOptions: { input: {main: new URL('./index.html',import.meta.url).pathname, exposed: new URL('./exposed.html',import.meta.url).pathname} },
  },
});
