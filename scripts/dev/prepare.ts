import { execaSync } from 'execa'
import { CYAN, RED, RESET, ROOT } from './constants.ts'

/** 检查 better-sqlite3 原生模块，必要时重建；重建失败则退出进程 */
export async function ensureNativeModule(): Promise<void> {
  console.log(`${CYAN}[dev]${RESET} 🔍 检查 better-sqlite3 原生模块...`)
  const { needsRebuild } = await import('../check-native.ts')
  if (!needsRebuild()) return

  console.log(`${CYAN}[dev]${RESET} 🔧 需要重建原生模块...`)
  // 使用 process.execPath（bun 绝对路径）执行 electron-rebuild，彻底避免
  // 子进程找不到 bun 的问题（bun 生成的 .exe shim 内部会调 bun）。
  // 清除 NODE_OPTIONS / PYTHONPATH 防止 safe-delete shim 干扰 node-gyp。
  try {
    const env = { ...process.env }
    delete env.NODE_OPTIONS
    delete env.PYTHONPATH
    execaSync(process.execPath, ['x', 'electron-rebuild', '-f', '-w', 'better-sqlite3'], {
      cwd: ROOT,
      stdio: 'inherit',
      env,
    })
  } catch {
    console.log(`${RED}✗${RESET} 原生模块重建失败`)
    process.exit(1)
  }
}

/** 从已安装的图标包提取所有 icon 名称，生成图标类型文件（失败非致命） */
export function generateIconTypes(): void {
  console.log(`${CYAN}[dev]${RESET} 🎨 生成图标类型文件...`)
  try {
    // 使用当前 bun 进程路径运行 TS 脚本，不经过 bunx tsx。
    // bunx tsx 在 Bun 1.3.14 Windows 上会 segfault（preload loader 路径解析问题）。
    execaSync(process.execPath, ['scripts/generate-icon-types.ts'], {
      cwd: ROOT,
      stdio: 'inherit',
    })
  } catch {
    console.log(`${RED}✗${RESET} 图标类型生成失败（非致命，继续启动）`)
  }
}
