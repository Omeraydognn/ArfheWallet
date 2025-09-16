import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteStaticCopy } from 'vite-plugin-static-copy';

const target = process.env.TARGET || "chrome";

export default defineConfig({
  plugins: [
    react(),
    viteStaticCopy({
      targets: [
        {
          src: `public/${target}/manifest.json`,
          dest: "."
        },
      ],
    }),
  ],
  base: './', // '/' olarak ayarla, yoksa hash routing oluşabilir
  server: {
    historyApiFallback: true,
    proxy: {
      '/api/1inch': {
        target: 'https://api.1inch.io/v5.0/1', 
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/api\/1inch/, ''),
      },
    }, // Tarayıcının yönlendirme işlemini düzgün yapmasını sağlar
  },
  build: {
    outDir: 'dist', // Çıktıyı "dist" klasörüne yönlendir
    emptyOutDir: true, // Eski dosyaları temizle
    rollupOptions: {
      input: 'index.html', // DOĞRU KULLANIM
      output: {
        dir: 'dist',
        entryFileNames: '[name].js',
        manualChunks: {
          vendor: ["react", "react-dom", "ethers", "antd"],
        },
      }
    }
  }
});
