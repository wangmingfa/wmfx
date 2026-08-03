import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  // 单元测试直接引用 packages 源码（与 dev/构建一致），不再依赖 packages dist 构建
  resolve: {
    alias: {
      '@browser/shared': resolve(__dirname, 'packages/shared/src/index.ts'),
      '@browser/ipc-contract': resolve(__dirname, 'packages/ipc-contract/src/index.ts'),
      '@browser/proxy': resolve(__dirname, 'packages/proxy/src/index.ts'),
      '@wmfx/database': resolve(__dirname, 'packages/database/src/index.ts'),
    },
  },
  test: {
    include: ['packages/**/*.test.ts', 'apps/**/*.test.ts'],
    exclude: ['node_modules', 'dist', 'e2e', '**/e2e/**'],
  },
})
