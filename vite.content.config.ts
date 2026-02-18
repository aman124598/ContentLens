// vite.content.config.ts
// Builds the content script as a self-contained IIFE.
// Chrome content scripts cannot use ES module imports, so we must bundle
// everything into a single file with no external chunk references.

import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: false, // main build already populated dist — don't wipe it
    rollupOptions: {
      input: {
        content: resolve(__dirname, 'src/content/index.ts'),
      },
      output: {
        entryFileNames: '[name].js',
        format: 'iife',
        // Inline everything — no chunk splitting for content scripts
        inlineDynamicImports: true,
        // CSS emitted by content script injected via JS anyway, so keep flat
        assetFileNames: 'assets/[name][extname]',
      },
    },
    target: 'es2020',
    minify: false,
    sourcemap: false,
    // No CSS code splitting needed for content script
    cssCodeSplit: false,
  },
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
      '@scoring': resolve(__dirname, 'src/scoring'),
      '@utils': resolve(__dirname, 'src/utils'),
    },
  },
  // Don't re-copy public dir on second pass
  publicDir: false,
});
