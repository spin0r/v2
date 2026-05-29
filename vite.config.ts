import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/text': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/health': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/docs': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/plain': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  build: {
    sourcemap: true,
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (['react', 'react-dom', 'react-router'].some(p => id.includes(`/node_modules/${p}/`))) return 'react';
          if (['zustand', 'clsx', 'react-icons'].some(p => id.includes(`/node_modules/${p}/`))) return 'vendor';
        },
      },
    },
  },
});
