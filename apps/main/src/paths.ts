import path from 'node:path'

// __dirname 在 CJS 产物中可用；用 path 计算渲染进程产物位置。
declare const __dirname: string

/** 开发模式下由 dev 脚本注入 vite 服务地址。 */
export function getRendererDevServerUrl(): string | undefined {
  return process.env.VITE_DEV_SERVER_URL
}

/** 生产/E2E：渲染进程构建产物 index.html 的绝对路径。 */
export function getRendererIndexHtml(): string {
  // apps/main/dist -> apps/renderer/dist/index.html
  return path.join(__dirname, '..', '..', 'renderer', 'dist', 'index.html')
}

/** preload 脚本产物绝对路径。 */
export function getPreloadPath(): string {
  return path.join(__dirname, 'preload.cjs')
}
