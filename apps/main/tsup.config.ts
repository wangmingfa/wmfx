import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    preload: 'src/preload.ts',
  },
  format: ['cjs'],
  outExtension: () => ({ js: '.cjs' }),
  platform: 'node',
  target: 'node20',
  external: ['electron', 'better-sqlite3'],
  noExternal: ['@browser/ipc-contract', '@browser/shared'],
  clean: true,
})
