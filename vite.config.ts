import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

// LiteRT.js loads its runtime from a directory at run time. Serve it from our own
// origin instead of the jsDelivr default (ARCHITECTURE §7). Only the two
// single-threaded builds are needed: relaxed-SIMD and the compat fallback.
const LITERT_FILES = [
  'litert_wasm_internal.js',
  'litert_wasm_internal.wasm',
  'litert_wasm_compat_internal.js',
  'litert_wasm_compat_internal.wasm',
];

function copyLiteRt(): Plugin {
  return {
    name: 'copy-litert-wasm',
    buildStart() {
      const from = resolve(import.meta.dirname, 'node_modules/@litertjs/core/wasm');
      const to = resolve(import.meta.dirname, 'public/litert');
      mkdirSync(to, { recursive: true });
      for (const file of LITERT_FILES) {
        if (!existsSync(resolve(to, file))) copyFileSync(resolve(from, file), resolve(to, file));
      }
    },
  };
}

export default defineConfig({
  base: '/clear-speech-enhancement-web/',
  plugins: [react(), copyLiteRt()],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      input: { main: resolve(import.meta.dirname, 'index.html'), spike: resolve(import.meta.dirname, 'spike.html') },
    },
  },
  worker: { format: 'es' },
  // Pre-bundling would break the SDK's `new URL('ClearWeb.wasm', import.meta.url)`.
  optimizeDeps: { exclude: ['@desert-ant-labs/clear', '@desert-ant-labs/core'] },
  test: { include: ['src/**/*.test.ts'] },
});
