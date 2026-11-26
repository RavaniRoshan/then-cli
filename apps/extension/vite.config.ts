import { defineConfig } from 'vite';

export default defineConfig({
  // Self-contained MV3 scaffold; shared core lives in ../../src for now
  // (extraction to packages/core is a follow-up; see docs/re-examination-extension.md §8).
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      // MV3 service worker entry; manifest + icons come from public/.
      input: 'src/background.ts',
      output: { format: 'es', entryFileNames: 'background.js' },
    },
  },
  server: { fs: { allow: ['..', '../..'] } },
});
