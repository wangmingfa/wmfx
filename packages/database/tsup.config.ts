import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs'],
  dts: true,
  clean: true,
  shims: true,
  splitting: false,
  target: 'node20',
  platform: 'node',
  external: ['electron', 'better-sqlite3'],
})
