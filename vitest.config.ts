import { defineConfig } from 'vitest/config';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const ikaNodeEntry = require.resolve("@ika.xyz/ika-wasm");
const ikaDistDir = path.dirname(path.dirname(ikaNodeEntry));
const ikaBundlerEntry = path.join(ikaDistDir, "bundler", "dwallet_mpc_wasm.js");
const ikaBundlerBg = path.join(ikaDistDir, "bundler", "dwallet_mpc_wasm_bg.js");

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/__tests__/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    // Prevent vite-plugin-node-polyfills Buffer override from breaking ethers.js
    server: {
      deps: {
        inline: ['ethers'],
      },
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/backend/**/*.ts'],
      exclude: [
        'src/backend/**/index.ts',
        'src/**/*.d.ts',
      ],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@ika.xyz/ika-wasm': path.resolve(__dirname, './src/shims/ikaWasm.ts'),
      '@ika-wasm-bundler-entry': ikaBundlerEntry,
      '@ika-wasm-bundler-bg': ikaBundlerBg,
    },
  },
});
