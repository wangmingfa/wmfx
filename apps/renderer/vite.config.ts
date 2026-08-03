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
