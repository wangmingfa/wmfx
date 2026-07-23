import { existsSync, mkdirSync, readdirSync, readFileSync, symlinkSync, unlinkSync } from 'node:fs'
import path from 'node:path'
import { CYAN, RESET, ROOT } from './constants.ts'

/**
 * 创建 workspace 包的 node_modules 软链接
 *
 * 原因：bun 的 workspace 解析是虚拟的（不创建 node_modules 里的 symlink），
 * 但 Electron 直接运行时走 Node.js 的 require 机制，无法解析 workspace 包。
 * 需要在 node_modules 下手动建立 symlink，让 @wmfx/database、@browser/proxy 等包可被导入。
 *
 * 扫描 package.json 中的 workspaces 字段（apps/*, packages/*），
 * 读取每个子包的 name 字段，在 node_modules/<scope>/<pkg-name> 创建 symlink。
 */
export function linkWorkspacePackages(): void {
  const nodeModules = path.join(ROOT, 'node_modules')
  const workspaces = ['apps/*', 'packages/*']
  const linked = new Set<string>()

  for (const pattern of workspaces) {
    const parentDir = pattern.split('/')[0]
    for (const entry of readdirSync(path.join(ROOT, parentDir))) {
      const pkgPath = path.join(ROOT, parentDir, entry)
      const pkgJsonPath = path.join(pkgPath, 'package.json')
      if (!existsSync(pkgJsonPath)) continue

      try {
        const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf-8')) as { name?: string }
        const name = pkgJson.name
        if (!name) continue

        const scope = name.split('/')[0]
        const scopedDir = path.join(nodeModules, scope)
        const linkPath = path.join(scopedDir, name.split('/')[1])
        const relativeTarget = path.relative(scopedDir, pkgPath)

        mkdirSync(scopedDir, { recursive: true })
        // 先删除已存在的旧 symlink，避免 symlinkSync 因已存在而抛错
        if (existsSync(linkPath)) unlinkSync(linkPath)
        symlinkSync(relativeTarget, linkPath)
        linked.add(name)
      } catch {
        /* skip packages without valid package.json */
      }
    }
  }

  if (linked.size > 0) {
    console.log(`${CYAN}[dev]${RESET} 🔗 workspace 软链接已创建: ${[...linked].join(', ')}`)
  }
}
