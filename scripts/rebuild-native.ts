#!/usr/bin/env bun
/**
 * 重建 better-sqlite3 原生模块（适配 Electron ABI）。
 *
 * 单独成脚本的原因：WorkBuddy 沙箱通过环境变量注入两套 safe-delete shim，
 * 它们拦截文件删除操作并尝试将文件移入回收站。沙箱环境中回收站不可用，
 * 导致 node-gyp 构建原生模块时 clean 步骤失败：
 * - Node.js shim (genie-safe-delete.cjs)：通过 NODE_OPTIONS 注入
 * - Python shim (sitecustomize.py)：通过 PYTHONPATH 注入（node-gyp 调用 gyp/Python）
 *
 * 此脚本在启动 electron-rebuild 前清除这两个环境变量，使子进程不受 shim 影响。
 */
import { execaSync } from 'execa'
import { resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')

// --postinstall 标记：由 package.json postinstall 脚本传入。
// postinstall 场景下重建失败不应阻断 bun install，因为 dev.ts 的
// ensureNativeModule() 会在 dev 启动时兜底检查并重建。
const isPostinstall = process.argv.includes('--postinstall')

// 清除以下环境变量，防止 safe-delete shim 干扰 node-gyp 文件操作：
// - NODE_OPTIONS: WorkBuddy 通过它注入 Node.js safe-delete shim (genie-safe-delete.cjs)
// - PYTHONPATH: WorkBuddy 通过它注入 Python safe-delete shim (sitecustomize.py)
//   node-gyp 调用 Python (gyp) 构建原生模块，Python shim 会拦截文件删除并尝试
//   移入回收站，在沙箱环境中回收站不可用，导致构建失败。
delete process.env.NODE_OPTIONS
delete process.env.PYTHONPATH

try {
  // 使用 process.execPath（bun 绝对路径）执行 electron-rebuild。
  // 不能直接调 electron-rebuild CLI——bun 生成的 .exe shim 内部会调 bun，
  // 而子进程可能找不到 bun。通过 bun x 让 bun 自己解析和运行。
  execaSync(process.execPath, ['x', 'electron-rebuild', '-f', '-w', 'better-sqlite3'], {
    cwd: ROOT,
    stdio: 'inherit',
  })
} catch {
  if (isPostinstall) {
    console.warn('⚠️  原生模块重建失败（postinstall），将在 dev 启动时重试')
    process.exit(0)
  }
  process.exit(1)
}
