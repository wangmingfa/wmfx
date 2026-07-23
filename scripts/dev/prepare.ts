import { execaCommandSync } from 'execa'
import { CYAN, RED, RESET, ROOT } from './constants.ts'

/** 检查 better-sqlite3 原生模块，必要时重建；重建失败则退出进程 */
export async function ensureNativeModule(): Promise<void> {
  console.log(`${CYAN}[dev]${RESET} 🔍 检查 better-sqlite3 原生模块...`)
  const { needsRebuild } = await import('../check-native.ts')
  if (!needsRebuild()) return

  console.log(`${CYAN}[dev]${RESET} 🔧 需要重建原生模块...`)
  try {
    execaCommandSync('bun run rebuild', { cwd: ROOT, stdio: 'inherit' })
  } catch {
    console.log(`${RED}✗${RESET} 原生模块重建失败`)
    process.exit(1)
  }
}

/** 从已安装的图标包提取所有 icon 名称，生成图标类型文件（失败非致命） */
export function generateIconTypes(): void {
  console.log(`${CYAN}[dev]${RESET} 🎨 生成图标类型文件...`)
  try {
    execaCommandSync('bunx tsx scripts/generate-icon-types.ts', { cwd: ROOT, stdio: 'inherit' })
  } catch {
    console.log(`${RED}✗${RESET} 图标类型生成失败（非致命，继续启动）`)
  }
}
