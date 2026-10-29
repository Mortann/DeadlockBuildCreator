import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
// @ts-expect-error Shared plain-Node middleware; deliberately has no runtime TS dependency.
import { apiMiddleware } from './server/api.mjs'

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'deadlock-api',
      configureServer(server) {
        server.middlewares.use(apiMiddleware)
      },
    },
  ],
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
})
