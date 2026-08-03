import { resolve } from 'node:path'
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
    'sharp',
    'electron-updater',
    '@iconify/utils',
    /@iconify-json\/.*/,
  ],
  // 主进程直接引用 packages 源码（alias → src），不再单独 tsup 构建包
  noExternal: ['@browser/ipc-contract', '@browser/shared', '@browser/proxy', '@wmfx/database'],
  // 直接把 workspace 包解析到源码，dev/prod 都不再需要单独构建 packages
  alias: {
    '@browser/shared': resolve(REPO_ROOT, 'packages/shared/src/index.ts'),
    '@browser/ipc-contract': resolve(REPO_ROOT, 'packages/ipc-contract/src/index.ts'),
    '@browser/proxy': resolve(REPO_ROOT, 'packages/proxy/src/index.ts'),
    '@wmfx/database': resolve(REPO_ROOT, 'packages/database/src/index.ts'),
  },
  esbuildPlugins: devPlugins,
})
