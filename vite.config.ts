import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'src/popup/index.html'),
        engine: resolve(__dirname, 'src/content/engine.ts'),
      },
      output: {
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === 'engine') {
            return 'content/engine.js';
          }
          return 'assets/[name].js';
        },
      },
    },
  },
});