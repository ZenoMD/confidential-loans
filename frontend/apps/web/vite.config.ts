import { defineConfig } from 'vite'

export default defineConfig({
  // The xrpl.js fork is linked, so Vite serves its CommonJS build unbundled unless told to
  // pre-bundle it; without this the dev server fails on `import { Client } from 'xrpl'`.
  optimizeDeps: { include: ['@confidential-loans/core > xrpl'] },
  build: {
    // xrpl.js alone puts the entry chunk near 800 kB; code-splitting cannot shrink a single library.
    chunkSizeWarningLimit: 1000,
  },
})
