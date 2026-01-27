import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import wasmPlugin from '@rollup/plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';

const target = process.env.TARGET || 'chrome';

export default defineConfig({
  plugins: [
    react(),
    wasmPlugin({
      targetEnv: 'browser',
      maxFileSize: 10000000 // 10MB for large WASM files
    }),
    topLevelAwait(),
    nodePolyfills({
      protocolImports: true,
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
    }),
    viteStaticCopy({
      targets: [
        {
          src: `public/${target}/manifest.json`,
          dest: '.'
        },
      ],
    }),
  ],
  assetsInclude: ['**/*.wasm'],
  resolve: {
    alias: {
      // Fix fhenixjs WASM bindings resolution
      'wbg': 'fhenixjs/lib/esm/sdk/fhe/tfhe_bg.js'
    }
  },
  base: './',
  server: {
    historyApiFallback: true,
    proxy: {
      '/api/1inch': {
        target: 'https://api.1inch.io/v5.0/1', 
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/1inch/, ''),
      },
      '/api/0x-mainnet': {
        target: 'https://api.0x.org/swap/v1',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/0x-mainnet/, ''),
      },
      '/api/0x-sepolia': {
        target: 'https://sepolia.api.0x.org/swap/v1',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/0x-sepolia/, ''),
      },
      '/api/coingecko': {
        target: 'https://api.coingecko.com/api/v3',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/coingecko/, ''),
      },
    },
    fs: {
      allow: ['..']
    }
  },
  optimizeDeps: {
    exclude: ['fhenixjs'],
    esbuildOptions: {
      target: 'esnext'
    }
  },
  build: {
    target: 'esnext',
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: 'index.html',
      output: {
        dir: 'dist',
        entryFileNames: '[name].js',
        manualChunks: {
          vendor: ['react', 'react-dom', 'ethers', 'antd'],
        },
      },
      external: (id) => {
        // Don't bundle WASM files
        if (id.endsWith('.wasm')) return false;
        return false;
      }
    }
  },
  worker: {
    format: 'es',
    plugins: () => [
      wasmPlugin({ targetEnv: 'browser', maxFileSize: 10000000 }),
      topLevelAwait()
    ]
  }
});
