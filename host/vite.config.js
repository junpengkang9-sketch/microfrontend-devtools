import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: '127.0.0.1',
    port: 18000,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
  },
});
