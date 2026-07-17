import { existsSync } from 'node:fs'
import path from 'node:path'

// __dirname 在 CJS 产物中可用；用 path 计算渲染进程产物位置。
declare const __dirname: string

/**
 * 向上查找项目根目录。
 *
 * 背景：主进程经 tsup 打包后，源码 apps/main/src/*.ts 被打进 apps/main/dist/index.cjs，
 * 运行时 __dirname 指向打包产物目录，其相对仓库根的层级并不固定。为避免写死
 * `../../..` 这种脆弱的相对层级，这里从模块目录开始逐级向上查找，直到找到包含
 * `resources/` 目录的那一层（仓库根）为止。
 *
 * 打包（asar）环境下 resources/ 不在父目录链上，此时回退到 process.resourcesPath；
 * 若仍找不到，则退化为基于 __dirname 的三级回退，保证始终返回一个可用路径。
 */
function findProjectRoot(): string {
  let dir = __dirname
  while (true) {
    if (existsSync(path.join(dir, 'resources'))) {
      console.debug('[Paths] findProjectRoot: found root', dir)
      return dir
    }
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  if (process.resourcesPath && existsSync(process.resourcesPath)) {
    console.debug('[Paths] findProjectRoot: fallback resourcesPath', process.resourcesPath)
    return process.resourcesPath
  }
  const fallback = path.resolve(__dirname, '..', '..', '..')
  console.debug('[Paths] findProjectRoot: fallback dir', fallback)
  return fallback
}

/** 项目根目录（模块加载时确定一次，避免重复查找） */
const PROJECT_ROOT = findProjectRoot()

/**
 * 将「相对项目根目录的路径」解析为绝对路径。
 *
 * 调用方只需传入相对仓库根的路径（例如 'resources/icons/macos/icon.png'），
 * 无需关心 dist 层级、cwd 或是否打包。内部自动定位项目根：
 * - 开发期：从当前模块目录向上查找 resources/ 锚点
 * - 打包期：使用 process.resourcesPath
 */
export function resolveFromRoot(relativePath: string): string {
  const resolved = path.join(PROJECT_ROOT, relativePath)
  console.debug('[Paths] resolveFromRoot: relative resolved', relativePath, resolved)
  return resolved
}

/** 开发模式下由 dev 脚本注入 vite 服务地址。 */
export function getRendererDevServerUrl(): string | undefined {
  console.debug(
    '[Paths] getRendererDevServerUrl: url',
    process.env.VITE_DEV_SERVER_URL ?? 'undefined'
  )
  return process.env.VITE_DEV_SERVER_URL
}

/** 生产/E2E：渲染进程构建产物 index.html 的绝对路径。 */
export function getRendererIndexHtml(): string {
  const p = resolveFromRoot('apps/renderer/dist/index.html')
  console.debug('[Paths] getRendererIndexHtml', p)
  return p
}

/** preload 脚本产物绝对路径。 */
export function getPreloadPath(): string {
  const p = resolveFromRoot('apps/main/dist/preload.cjs')
  console.debug('[Paths] getPreloadPath', p)
  return p
}
