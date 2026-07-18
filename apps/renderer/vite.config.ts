import { resolve } from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { codeInspectorPlugin } from 'code-inspector-plugin'
import { defineConfig, loadEnv } from 'vite'
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

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  if (!env.VITE_DEV_PORT) {
    console.error('[vite] VITE_DEV_PORT 未在 .env 文件中配置，请在 .env.local 中设置')
    process.exit(1)
  }
  const devPort = parseInt(env.VITE_DEV_PORT, 10)

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
      },
    },
    base: './',
    build: {
      outDir: 'dist',
      emptyOutDir: true,
    },
    server: {
      port: devPort,
      strictPort: true,
    },
  }
})
