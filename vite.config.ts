import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        background: resolve(__dirname, 'src/background/index.ts'),
        popup: resolve(__dirname, 'src/popup/popup.ts'),
        options: resolve(__dirname, 'src/options/options.ts'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        // CSS files get their original names for HTML reference
        assetFileNames: (info) => {
          if (info.name?.endsWith('.css')) return '[name][extname]';
          return 'assets/[name][extname]';
        },
      },
    },
    target: 'es2020',
    minify: false, // easier debugging; flip to 'esbuild' for production
    sourcemap: false,
    cssCodeSplit: true,
  },
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
      '@scoring': resolve(__dirname, 'src/scoring'),
      '@utils': resolve(__dirname, 'src/utils'),
    },
  },
  // publicDir copies manifest, html pages, and icons to dist/
  publicDir: 'public',
});
