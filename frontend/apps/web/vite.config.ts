import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    // xrpl.js alone puts the entry chunk near 800 kB; code-splitting cannot shrink a single library.
    chunkSizeWarningLimit: 1000,
  },
})
