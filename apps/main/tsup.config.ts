import { defineConfig } from 'tsup'
import {
  isInstrumentEnabled,
  REPO_ROOT,
  sourceLocationEsbuildPlugin,
} from '../../scripts/source-location'

const devPlugins = isInstrumentEnabled() ? [sourceLocationEsbuildPlugin(REPO_ROOT)] : []

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    preload: 'src/preload.ts',
  },
  format: ['cjs'],
  outExtension: () => ({ js: '.cjs' }),
  platform: 'node',
  target: 'node20',
  external: [
    'electron',
    'better-sqlite3',
    '@wmfx/database',
    'electron-updater',
    '@iconify/utils',
    /@iconify-json\/.*/,
  ],
  noExternal: ['@browser/ipc-contract', '@browser/shared', '@browser/proxy'],
  esbuildPlugins: devPlugins,
})
