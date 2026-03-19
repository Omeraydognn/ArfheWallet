import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import wasmPlugin from '@rollup/plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  plugins: [
    react(),
    // Serve tfhe WASM file with correct MIME type from node_modules
    {
      name: 'serve-tfhe-wasm',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url && req.url.endsWith('tfhe_bg.wasm')) {
            const wasmPath = path.resolve(__dirname, 'node_modules/tfhe/tfhe_bg.wasm');
            if (fs.existsSync(wasmPath)) {
              res.setHeader('Content-Type', 'application/wasm');
              res.setHeader('Cache-Control', 'public, max-age=3600');
              const wasmFile = fs.readFileSync(wasmPath);
              res.end(wasmFile);
              return;
            }
          }
          next();
        });
      }
    },
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
          src: 'extension/manifest.json',
          dest: '.'
        },
        {
          src: 'service-worker.js',
          dest: '.'
        },
        {
          src: 'extension/content-script.js',
          dest: '.'
        },
        {
          src: 'extension/inpage.js',
          dest: '.'
        },
        {
          src: 'images/icon32.png',
          dest: '.'
        },
        {
          src: 'images/icon48.png',
          dest: '.'
        },
        {
          src: 'images/icon128.png',
          dest: '.'
        },
      ],
    }),
  ],
  assetsInclude: ['**/*.wasm'],
  resolve: {
    alias: {
      // cofhejs web binding support
    }
  },
  base: './',
  server: {
    historyApiFallback: true,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin-allow-popups'
    },
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
    include: ['tweetnacl'],
    exclude: ['tfhe'],
    esbuildOptions: {
      target: 'esnext'
    }
  },
  build: {
    target: 'esnext',
    outDir: 'dist',
    emptyOutDir: true,
    minify: 'esbuild',
    // Remove all console output and debugger in production builds
    esbuild: {
      drop: ['debugger'],
      pure: [
        'console.log',
        'console.warn',
        'console.error',
        'console.info',
        'console.debug',
        'console.trace',
      ],
    },
    rollupOptions: {
      input: 'index.html',
      output: {
        dir: 'dist',
        entryFileNames: '[name].js',
        manualChunks(id) {
          // ── React + MUI + Emotion (core UI — merged to avoid circular deps) ──
          if (id.includes('/react-dom/') || id.includes('/react/') ||
              id.includes('/react-router/') || id.includes('/react-toastify/') ||
              id.includes('/react-i18next/') || id.includes('/i18next/') ||
              id.includes('/scheduler/') ||
              id.includes('/@mui/material/') || id.includes('/@mui/system/') ||
              id.includes('/@mui/utils/') || id.includes('/@mui/styled-engine/') ||
              id.includes('/@mui/private-theming/') || id.includes('/@mui/icons-material/') ||
              id.includes('/@emotion/')) {
            return 'react-framework';
          }
          // ── Charting (recharts + d3 + MUI charts — lazy) ──
          if (id.includes('/recharts/') || id.includes('/d3-') ||
              id.includes('/@mui/x-charts/') || id.includes('/victory-vendor/')) {
            return 'charting';
          }
          // ── ethers (blockchain core) ──
          if (id.includes('/ethers/') || id.includes('/@noble/') || id.includes('/@adraffy/')) {
            return 'ethers';
          }
          // ── WalletConnect (lazy — only when connecting dApps) ──
          if (id.includes('/@walletconnect/') || id.includes('/@stablelib/') ||
              id.includes('/uint8arrays/') || id.includes('/multiformats/')) {
            return 'walletconnect';
          }
          // ── Cytoscape (graph explorer only) ──
          if (id.includes('/cytoscape')) {
            return 'cytoscape';
          }
          // ── Alchemy SDK + Crypto polyfills + Node polyfills (merged to avoid circular deps) ──
          if (id.includes('/alchemy-sdk/') ||
              id.includes('/elliptic/') || id.includes('/bn.js/') ||
              id.includes('/hash.js/') || id.includes('/hmac-drbg/') ||
              id.includes('/minimalistic-assert/') || id.includes('/minimalistic-crypto-utils/') ||
              id.includes('/brorand/') || id.includes('/browserify-') ||
              id.includes('/create-hash/') || id.includes('/create-hmac/') ||
              id.includes('/cipher-base/') || id.includes('/md5.js/') ||
              id.includes('/sha.js/') || id.includes('/ripemd160/') ||
              id.includes('/des.js/') || id.includes('/diffie-hellman/') ||
              id.includes('/public-encrypt/') || id.includes('/randomfill/') ||
              id.includes('/randombytes/') || id.includes('/pbkdf2/') ||
              id.includes('/parse-asn1/') || id.includes('/asn1.js/') ||
              id.includes('/evp_bytestokey/') || id.includes('/vm-browserify/') ||
              id.includes('/crypto-browserify/') ||
              id.includes('/node_modules/buffer/') || id.includes('/node_modules/stream-') ||
              id.includes('/node_modules/readable-stream/') || id.includes('/node_modules/events/') ||
              id.includes('/node_modules/process/') || id.includes('/node_modules/util/') ||
              id.includes('/node_modules/inherits/') || id.includes('/node_modules/safe-buffer/') ||
              id.includes('/node_modules/string_decoder/') || id.includes('/node-polyfills')) {
            return 'polyfills';
          }
          if (id.includes('/@web3auth/')) {
            return 'web3auth';
          }
          // ── FHE / cofhejs (encryption layer) ──
          if (id.includes('/cofhejs/') || id.includes('/tfhe/')) {
            return 'fhe';
          }
          // ── Unstoppable Domains (lazy — domain resolution only) ──
          if (id.includes('/@unstoppabledomains/') || id.includes('/uns-resolver/')) {
            return 'unstoppable';
          }
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
