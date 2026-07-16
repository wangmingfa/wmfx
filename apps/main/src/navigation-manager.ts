import { isWmfxUrl, wmfxPath } from '@browser/shared'
import { loadInternalView } from './internal-url'
import type { TabManager } from './tab-manager'

export class NavigationManager {
  constructor(private tabManager: TabManager) {}

  goBack(tabId: string): void {
    console.debug(`[NavigationManager] goBack: tabId=${tabId}`)
    const webContents = this.tabManager.getWebContents(tabId)
    if (webContents?.navigationHistory.canGoBack()) {
      webContents.navigationHistory.goBack()
    }
  }

  goForward(tabId: string): void {
    console.debug(`[NavigationManager] goForward: tabId=${tabId}`)
    const webContents = this.tabManager.getWebContents(tabId)
    if (webContents?.navigationHistory.canGoForward()) {
      webContents.navigationHistory.goForward()
    }
  }

  reload(tabId: string): void {
    console.debug(`[NavigationManager] reload: tabId=${tabId}`)
    const webContents = this.tabManager.getWebContents(tabId)
    webContents?.reload()
  }

  stop(tabId: string): void {
    console.debug(`[NavigationManager] stop: tabId=${tabId}`)
    const webContents = this.tabManager.getWebContents(tabId)
    webContents?.stop()
  }

  loadURL(tabId: string, url: string): void {
    console.debug(
      `[NavigationManager] loadURL: tabId=${tabId}, url=${url}, internal=${isWmfxUrl(url)}`
    )
    // 内部地址（wmfx://）：按 internal/external 决策重建视图；
    // 若已是内部页仅切换子路由（didRelaunch=false），需重新加载对应 hash 路由
    if (isWmfxUrl(url)) {
      const { view, didRelaunch } = this.tabManager.relaunchView(tabId, url)
      if (!didRelaunch) {
        this.tabManager.setNavigating(tabId, url)
        loadInternalView(view, wmfxPath(url))
      }
      return
    }

    const webContents = this.tabManager.getWebContents(tabId)
    if (webContents) {
      const normalized =
        url.startsWith('http://') ||
        url.startsWith('https://') ||
        url.startsWith('file://') ||
        url.startsWith('about:')
          ? url
          : `https://${url}`
      this.tabManager.setNavigating(tabId, normalized)
      webContents.loadURL(normalized)
    }
  }
}
