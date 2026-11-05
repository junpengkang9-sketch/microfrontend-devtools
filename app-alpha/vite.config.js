import { defineConfig } from 'vite';
import qiankun from 'vite-plugin-qiankun';

export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/app-alpha/' : '/',
  plugins: [qiankun('app-alpha', { useDevMode: true })],
  server: {
    host: '127.0.0.1',
    port: 18001,
    strictPort: true,
    cors: true,
    origin: 'http://127.0.0.1:18001',
    hmr: {
      host: '127.0.0.1',
      port: 18001,
    },
  },
  build: {
    outDir: 'dist',
  },
}));
