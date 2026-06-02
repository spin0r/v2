import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  appType: 'mpa',
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'html-rewrite',
      configureServer(server) {
        server.middlewares.use((req, _res, next) => {
          if (req.url === '/markdown' || req.url === '/markdown/') req.url = '/markdown.html';
          if (req.url === '/text' || req.url === '/text/') req.url = '/text.html';
          if (req.url === '/imx' || req.url === '/imx/') req.url = '/imx.html';
          if (req.url?.startsWith('/plain') && !req.url.startsWith('/plain/api') && !req.url.startsWith('/plain/raw')) req.url = '/plain.html';
          next();
        });
      },
    },
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:3001', changeOrigin: true },
      '/health': { target: 'http://localhost:3001', changeOrigin: true },
      '/docs': { target: 'http://localhost:3001', changeOrigin: true },
      '/plain/api': { target: 'http://localhost:3001', changeOrigin: true },
      '/plain/raw': { target: 'http://localhost:3001', changeOrigin: true },
    },
  },
  build: {
    sourcemap: true,
    cssCodeSplit: true,
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        markdown: path.resolve(__dirname, 'markdown.html'),
        text: path.resolve(__dirname, 'text.html'),
        plain: path.resolve(__dirname, 'plain.html'),
        imx: path.resolve(__dirname, 'imx.html'),
      },
      output: {
        manualChunks: (id) => {
          if (['react', 'react-dom', 'react-router'].some(p => id.includes(`/node_modules/${p}/`))) return 'react';
          if (['zustand', 'clsx', 'react-icons'].some(p => id.includes(`/node_modules/${p}/`))) return 'vendor';
        },
      },
    },
  },
});
