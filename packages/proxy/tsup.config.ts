import { defineConfig } from 'tsup'
import {
  isInstrumentEnabled,
  REPO_ROOT,
  sourceLocationEsbuildPlugin,
} from '../../scripts/source-location'

const devPlugins = isInstrumentEnabled() ? [sourceLocationEsbuildPlugin(REPO_ROOT)] : []

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  external: ['ws'],
  esbuildPlugins: devPlugins,
})
