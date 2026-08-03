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
        // 开发/构建期直接引用 packages 源码，免去 tsup 单独构建包
        '@browser/shared': resolve(REPO_ROOT, 'packages/shared/src/index.ts'),
        '@browser/ipc-contract': resolve(REPO_ROOT, 'packages/ipc-contract/src/index.ts'),
      },
    },
    optimizeDeps: {
      // 不让 esbuild 预打包这两个包（它们是源码，需由 Vite 实时编译）
      exclude: ['@browser/shared', '@browser/ipc-contract'],
    },
    base: './',
    build: {
      outDir: 'dist',
      emptyOutDir: true,
    },
    server: {
      port: Number(process.env.VITE_DEV_PORT),
      strictPort: true,
      // 允许 Vite 读取 app 目录之外的 packages 源码
      fs: { allow: [REPO_ROOT] },
    },
  }
})
