import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';

const target = process.env.TARGET || 'chrome';

export default defineConfig({
  plugins: [
    react(),
    wasm(),
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
    exclude: ['cofhejs']
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
      }
    }
  }
});
