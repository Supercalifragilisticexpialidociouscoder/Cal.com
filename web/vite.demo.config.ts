import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

/**
 * Builds the static, server-free demo of the client (web/demo). Relative asset
 * paths and a single bundle keep it publishable as plain files anywhere.
 */
export default defineConfig({
  root: fileURLToPath(new URL('./demo', import.meta.url)),
  base: './',
  plugins: [react()],
  build: {
    outDir: fileURLToPath(new URL('./demo-dist', import.meta.url)),
    emptyOutDir: true,
    target: 'es2020',
    sourcemap: false,
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
        entryFileNames: 'app.js',
        assetFileNames: 'app.[ext]',
      },
    },
  },
});
