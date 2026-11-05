import { defineConfig } from 'vite';
import qiankun from 'vite-plugin-qiankun';

export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/app-beta/' : '/',
  plugins: [qiankun('app-beta', { useDevMode: true })],
  server: {
    host: '127.0.0.1',
    port: 18002,
    strictPort: true,
    cors: true,
    origin: 'http://127.0.0.1:18002',
    hmr: {
      host: '127.0.0.1',
      port: 18002,
    },
  },
  build: {
    outDir: 'dist',
  },
}));
