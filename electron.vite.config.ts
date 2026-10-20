import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  main: { plugins: [externalizeDepsPlugin()] },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve('src/preload/index.ts'), remote: resolve('src/preload/remote.ts') },
        output: { format: 'cjs' },
      },
    },
  },
  renderer: {
    plugins: [
      react(),
      {
        name: 'development-refresh-csp',
        apply: 'serve',
        transformIndexHtml: (html) =>
          html.replace("script-src 'self';", "script-src 'self' 'unsafe-inline';"),
      },
    ],
    build: { minify: true },
  },
});
