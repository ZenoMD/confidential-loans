import { defineConfig, searchForWorkspaceRoot } from 'vite'

export default defineConfig({
  build: {
    // xrpl.js alone puts the entry chunk near 800 kB; code-splitting cannot shrink a single library.
    chunkSizeWarningLimit: 1000,
  },
  server: {
    // The spec page imports SPEC.md from the repository root, outside the pnpm workspace.
    fs: { allow: [searchForWorkspaceRoot(process.cwd()), '../../../SPEC.md'] },
  },
})
