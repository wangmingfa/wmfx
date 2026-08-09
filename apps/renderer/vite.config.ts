import { resolve } from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { codeInspectorPlugin } from 'code-inspector-plugin'
import { defineConfig } from 'vite'
import {
  isInstrumentEnabled,
  REPO_ROOT,
  sourceLocationEsbuildPlugin,
  sourceLocationVuePlugin,
} from '../../scripts/source-location'

const devInstr = isInstrumentEnabled()
const sourcePlugins = devInstr
  ? [sourceLocationEsbuildPlugin(REPO_ROOT), sourceLocationVuePlugin(REPO_ROOT)]
  : []

/**
 * 直接指向 packages 源码的 TS 文件，跳过 packages 的 tsup 构建步骤。
 * Vite 的 esbuild 原生支持 TS，无需额外配置。
 */
const workspaceAliases: Record<string, string> = {
  '@browser/shared': resolve(REPO_ROOT, 'packages/shared/src/index.ts'),
  '@browser/ipc-contract': resolve(REPO_ROOT, 'packages/ipc-contract/src/index.ts'),
  '@browser/proxy': resolve(REPO_ROOT, 'packages/proxy/src/index.ts'),
  '@wmfx/database': resolve(REPO_ROOT, 'packages/database/src/index.ts'),
}

export default defineConfig(() => {
  return {
    plugins: [
      vue(),
      tailwindcss(),
      codeInspectorPlugin({
        bundler: 'vite',
        editor: 'webstorm',
      }),
      ...sourcePlugins,
    ],
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
        ...workspaceAliases,
      },
    },
    base: './',
    build: {
      outDir: 'dist',
      emptyOutDir: true,
    },
    server: { port: Number(process.env.VITE_DEV_PORT), strictPort: true },
  }
})
