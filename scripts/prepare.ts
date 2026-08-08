/**
 * prepare 脚本——由 package.json "prepare" 触发（bun install 后执行）。
 *
 * husky（bun 编译的二进制约 .exe）执行时需要 bun 在 PATH 中，但在 WorkBuddy
 * 沙箱等环境中 bun 不在子进程 PATH 里。这里直接调用 husky 的 bin.js（Node.js
 * 脚本），绕过 bun 依赖。
 */
import { execaSync } from 'execa'
import { resolve } from 'node:path'

const HUSKY_BIN = resolve(import.meta.dirname, '..', 'node_modules/husky/bin.js')

try {
  execaSync('node', [HUSKY_BIN], { stdio: 'inherit' })
} catch (e: any) {
  console.warn('[prepare] husky init skipped:', e.message?.slice(0, 80))
}
