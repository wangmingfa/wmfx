import vue from '@vitejs/plugin-vue'
import { codeInspectorPlugin } from 'code-inspector-plugin'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    vue(),
    codeInspectorPlugin({
      bundler: 'vite',
      editor: 'webstorm',
    }),
  ],
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    strictPort: true,
  },
})
