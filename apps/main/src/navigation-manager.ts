import type { TabManager } from './tab-manager'

export class NavigationManager {
  constructor(private tabManager: TabManager) {}

  goBack(tabId: string): void {
    const webContents = this.tabManager.getWebContents(tabId)
    if (webContents?.navigationHistory.canGoBack()) {
      webContents.navigationHistory.goBack()
    }
  }

  goForward(tabId: string): void {
    const webContents = this.tabManager.getWebContents(tabId)
    if (webContents?.navigationHistory.canGoForward()) {
      webContents.navigationHistory.goForward()
    }
  }

  reload(tabId: string): void {
    const webContents = this.tabManager.getWebContents(tabId)
    webContents?.reload()
  }

  stop(tabId: string): void {
    const webContents = this.tabManager.getWebContents(tabId)
    webContents?.stop()
  }

  loadURL(tabId: string, url: string): void {
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
