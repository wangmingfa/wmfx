import { isWmfxUrl, WMFX_SCHEME, wmfxPath } from '@browser/shared'
import type { WebContentsView } from 'electron'

import { getRendererDevServerUrl, getRendererIndexHtml } from './paths'

export { isWmfxUrl, WMFX_SCHEME, wmfxPath }

/**
 * 把 wmfx://<path> 内部页加载进指定 WebContentsView。
 * dev 用 vite dev server + hash 路由；prod 用 loadFile + hash 选项。
 * 内部页复用单一 SPA 产物，由渲染进程 vue-router 按 hash 决定渲染外壳还是内部页。
 */
export function loadInternalView(view: WebContentsView, path: string): void {
  const dev = getRendererDevServerUrl()
  if (dev) {
    view.webContents.loadURL(`${dev.replace(/\/+$/, '')}/#/${path}`)
  } else {
    view.webContents.loadFile(getRendererIndexHtml(), { hash: `/${path}` })
  }
}
