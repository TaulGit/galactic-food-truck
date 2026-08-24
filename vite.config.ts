import { defineConfig } from 'vitest/config'

export default defineConfig({
  // Star-letter serves published games from a CDN subdirectory.
  base: './',
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
