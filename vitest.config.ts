import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      /**
       * `server-only` is a bundler guard, not a runtime dependency: Next maps it
       * to an empty module when it builds the server bundle, and to a throwing
       * one for client bundles. Tests run outside both, so they need the same
       * empty module — otherwise importing the modules that enforce
       * confidentiality is the one thing the test suite cannot do.
       */
      'server-only': fileURLToPath(
        new URL(
          './node_modules/next/dist/compiled/server-only/empty.js',
          import.meta.url
        )
      ),
    },
  },
})
