import { execFile } from 'node:child_process'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import type { Connect, Plugin } from 'vite'

const FRONTEND = fileURLToPath(new URL('../..', import.meta.url))

/**
 * Serves the demo kit at `/demo-kit` from the dev and preview servers only, by running
 * `scripts/export-kit.ts` on each request, so the seeds stay in the gitignored `scripts/.env`
 * and never enter the built bundle.
 */
function demoKit(): Plugin {
  const serve: Connect.NextHandleFunction = (
    request: IncomingMessage,
    response: ServerResponse,
    next: Connect.NextFunction,
  ) => {
    if (request.url !== '/demo-kit') return next()
    execFile('node', ['scripts/export-kit.ts'], { cwd: FRONTEND }, (error, stdout, stderr) => {
      response.setHeader('Cache-Control', 'no-store')
      response.statusCode = error === null ? 200 : 500
      response.end(error === null ? stdout : stderr || error.message)
    })
  }
  return {
    name: 'demo-kit',
    configureServer: (server) => void server.middlewares.use(serve),
    configurePreviewServer: (server) => void server.middlewares.use(serve),
  }
}

export default defineConfig({
  plugins: [demoKit()],
  build: {
    // xrpl.js alone puts the entry chunk near 800 kB; code-splitting cannot shrink a single library.
    chunkSizeWarningLimit: 1000,
  },
})
