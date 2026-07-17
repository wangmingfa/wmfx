import { defineConfig } from 'tsup'
import {
  isInstrumentEnabled,
  REPO_ROOT,
  sourceLocationEsbuildPlugin,
} from '../../scripts/source-location'

const devPlugins = isInstrumentEnabled() ? [sourceLocationEsbuildPlugin(REPO_ROOT)] : []

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
  esbuildPlugins: devPlugins,
})
