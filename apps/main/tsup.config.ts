import { resolve } from 'node:path'
import { defineConfig } from 'tsup'
import {
  isInstrumentEnabled,
  REPO_ROOT,
  sourceLocationEsbuildPlugin,
} from '../../scripts/source-location'

const devPlugins = isInstrumentEnabled() ? [sourceLocationEsbuildPlugin(REPO_ROOT)] : []

/**
 * 直接指向 packages 源码的 TS 文件，跳过 packages 的 tsup 构建步骤。
 * 这样只需要 build apps/main 一个包，dev 启动更快。
 */
const workspaceAliases: Record<string, string> = {
  '@browser/shared': resolve(REPO_ROOT, 'packages/shared/src/index.ts'),
  '@browser/ipc-contract': resolve(REPO_ROOT, 'packages/ipc-contract/src/index.ts'),
  '@browser/proxy': resolve(REPO_ROOT, 'packages/proxy/src/index.ts'),
  '@wmfx/database': resolve(REPO_ROOT, 'packages/database/src/index.ts'),
}

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
    'ws',
    'electron-updater',
    '@iconify/utils',
    /@iconify-json\/.*/,
  ],
  // workspace 包在 node_modules 中有软链接，esbuild 默认视为 external。
  // 必须用 noExternal 强制 bundle，配合 esbuild alias 指向源码 TS 文件。
  noExternal: [/@browser\//, /@wmfx\//],
  esbuildOptions: (options) => {
    options.alias = { ...options.alias, ...workspaceAliases }
  },
  esbuildPlugins: devPlugins,
})
