import type {
  AutocompleteSuggestion,
  IpcContract,
  QuickLink,
  ThemeMode,
} from '@browser/ipc-contract'
import { BrowserWindow, type Event, ipcMain, nativeTheme } from 'electron'
import { handleFrontendLog } from '../logger'
import { updater } from '../updater'
import type { BrowserWindowInstance } from '../window-manager'

/** Type for raw WebContents event methods (TS overloads don't cover 'found-in-page') */
interface WebContentsEventTarget {
  removeListener(event: string, listener?: (...args: never[]) => void): void
  on(event: string, listener: (...args: never[]) => void): WebContentsEventTarget
}

/** Tracks found-in-page handlers per webContents id for cleanup in endFind */
const foundHandlers = new Map<string, (_: Event, result: Electron.FoundInPageResult) => void>()

declare global {
  var browserInstances: Map<string, BrowserWindowInstance>
}

/** 类型安全的 handle 包装：约束通道名与处理函数签名一致。 */
function handle<K extends keyof IpcContract>(
  channel: K,
  handler: (
    event: Electron.IpcMainInvokeEvent,
    ...args: Parameters<IpcContract[K]>
  ) => ReturnType<IpcContract[K]> | Promise<ReturnType<IpcContract[K]>>
): void {
  ipcMain.handle(channel, (event, ...args) =>
    handler(event, ...(args as Parameters<IpcContract[K]>))
  )
}

/** 从 IPC 事件的 sender 获取对应的 BrowserWindowInstance。 */
function getInstance(event?: Electron.IpcMainInvokeEvent): BrowserWindowInstance | null {
  if (event) {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win) {
      return globalThis.browserInstances?.get(String(win.id)) ?? null
    }
  }
  const focused = BrowserWindow.getFocusedWindow()
  if (!focused) return null
  const key = String(focused.id)
  return globalThis.browserInstances?.get(key) ?? null
}

export function registerIpcHandlers(): void {
  handle('app:ping', (_event, message) => `pong: ${message}`)

  handle('tab:create', (event, opts) => {
    const inst = getInstance(event)
    if (!inst) return {} as ReturnType<IpcContract['tab:create']>
    return inst.tabManager.create(opts)
  })

  handle('tab:close', (event, tabId) => {
    const inst = getInstance(event)
    if (!inst) return
    inst.tabManager.close(tabId)
  })

  handle('tab:activate', (event, tabId) => {
    const inst = getInstance(event)
    if (!inst) return
    inst.tabManager.activate(tabId)
  })

  handle('tab:getState', (event, tabId) => {
    const inst = getInstance(event)
    if (!inst) return {} as ReturnType<IpcContract['tab:getState']>
    const state = inst.tabManager.getState(tabId)
    if (!state) return {} as ReturnType<IpcContract['tab:getState']>
    return state
  })

  handle('tab:getList', (event) => {
    const inst = getInstance(event)
    if (!inst) return []
    return inst.tabManager.getList()
  })

  ipcMain.on('tab:setViewportBounds', (event, tabId, bounds) => {
    const inst = getInstance(event)
    if (!inst) return
    inst.tabManager.setViewportBounds(tabId, bounds)
  })

  handle('tab:setSidebarOpen', (event, open) => {
    const inst = getInstance(event)
    if (!inst) return
    inst.tabManager.setSidebarOpen(open)
  })

  handle('nav:goBack', (event, tabId) => {
    const inst = getInstance(event)
    if (!inst) return
    inst.navigationManager.goBack(tabId)
  })

  handle('nav:goForward', (event, tabId) => {
    const inst = getInstance(event)
    if (!inst) return
    inst.navigationManager.goForward(tabId)
  })

  handle('nav:reload', (event, tabId) => {
    const inst = getInstance(event)
    if (!inst) return
    inst.navigationManager.reload(tabId)
  })

  handle('nav:stop', (event, tabId) => {
    const inst = getInstance(event)
    if (!inst) return
    inst.navigationManager.stop(tabId)
  })

  handle('nav:loadURL', (event, tabId, url) => {
    const inst = getInstance(event)
    if (!inst) return
    inst.navigationManager.loadURL(tabId, url)
  })

  handle('session:getPartitions', () => {
    return ['default', 'incognito']
  })

  handle('download:create', (event, opts) => {
    const inst = getInstance(event)
    if (!inst) return {} as ReturnType<IpcContract['download:create']>
    return inst.downloadManager.create(opts)
  })

  handle('download:pause', (event, id) => {
    const inst = getInstance(event)
    if (!inst) return
    inst.downloadManager.pause(id)
  })

  handle('download:resume', (event, id) => {
    const inst = getInstance(event)
    if (!inst) return
    inst.downloadManager.resume(id)
  })

  handle('download:cancel', (event, id) => {
    const inst = getInstance(event)
    if (!inst) return
    inst.downloadManager.cancel(id)
  })

  handle('download:get', (event, id) => {
    const inst = getInstance(event)
    if (!inst) return null
    const item = inst.downloadManager.get(id)
    if (!item) return null
    return {
      id: item.id,
      url: item.url,
      filename: item.filename,
      path: item.path,
      state: item.state,
      receivedBytes: item.received_bytes,
      totalBytes: item.total_bytes,
      createdAt: item.created_at,
      errorMsg: item.error_msg,
    }
  })

  handle('download:getList', (event, opts) => {
    const inst = getInstance(event)
    if (!inst) return []
    return inst.downloadManager.getList(opts).map((item) => ({
      id: item.id,
      url: item.url,
      filename: item.filename,
      path: item.path,
      state: item.state,
      receivedBytes: item.received_bytes,
      totalBytes: item.total_bytes,
      createdAt: item.created_at,
      errorMsg: item.error_msg,
    }))
  })

  handle('download:setPath', (event, path) => {
    const inst = getInstance(event)
    if (!inst) return
    inst.settingsManager.set('downloadPath', path)
  })

  handle('history:add', (event, opts) => {
    const inst = getInstance(event)
    if (!inst) return
    inst.historyManager.add(opts)
  })

  handle('history:delete', (event, id) => {
    const inst = getInstance(event)
    if (!inst) return
    inst.historyManager.delete(id)
  })

  handle('history:search', (event, opts) => {
    const inst = getInstance(event)
    if (!inst) return []
    const { query = '', limit = 50, offset = 0 } = opts
    const results = inst.historyManager.search(query, limit, offset)
    return results.map((item) => ({
      id: item.id,
      url: item.url,
      title: item.title,
      favicon: item.favicon,
      visitTime: item.visit_time,
      visitCount: item.visit_count,
    }))
  })

  handle('history:getList', (event, opts) => {
    const inst = getInstance(event)
    if (!inst) return []
    const { limit = 50, offset = 0 } = opts ?? {}
    const results = inst.historyManager.getList(limit, offset)
    return results.map((item) => ({
      id: item.id,
      url: item.url,
      title: item.title,
      favicon: item.favicon,
      visitTime: item.visit_time,
      visitCount: item.visit_count,
    }))
  })

  handle('history:clear', (event) => {
    const inst = getInstance(event)
    if (!inst) return
    inst.historyManager.clear()
  })

  handle('bookmark:add', (event, opts) => {
    const inst = getInstance(event)
    if (!inst) return {} as ReturnType<IpcContract['bookmark:add']>
    return inst.bookmarkManager.create(opts)
  })

  handle('bookmark:delete', (event, id) => {
    const inst = getInstance(event)
    if (!inst) return
    inst.bookmarkManager.delete(id)
  })

  handle('bookmark:rename', (event, opts) => {
    const inst = getInstance(event)
    if (!inst) return
    inst.bookmarkManager.rename(opts.id, opts.title)
  })

  handle('bookmark:getList', (event, parentId) => {
    const inst = getInstance(event)
    if (!inst) return []
    return inst.bookmarkManager.getList(parentId)
  })

  handle('bookmark:search', (event, opts) => {
    const inst = getInstance(event)
    if (!inst) return []
    return inst.bookmarkManager.search(opts.query)
  })

  handle('bookmark:import', (event, html) => {
    const inst = getInstance(event)
    if (!inst) return
    inst.bookmarkManager.importHTML(html)
  })

  handle('bookmark:export', (event) => {
    const inst = getInstance(event)
    if (!inst) return { html: '' }
    return inst.bookmarkManager.exportHTML()
  })

  handle('page:print', (event, opts) => {
    const inst = getInstance(event)
    if (!inst) return
    const wc = inst.tabManager.getWebContents(opts.tabId)
    if (wc) wc.print(opts.options)
  })

  handle('page:printToPDF', async (event, opts) => {
    const inst = getInstance(event)
    if (!inst) return { path: '' }
    const wc = inst.tabManager.getWebContents(opts.tabId)
    if (!wc) return { path: '' }
    const buffer = await wc.printToPDF(opts.options ?? {})
    return { path: `data:application/pdf;base64,${buffer.toString('base64')}` }
  })

  handle('page:setZoom', (event, opts) => {
    const inst = getInstance(event)
    if (!inst) return
    const wc = inst.tabManager.getWebContents(opts.tabId)
    if (wc) wc.setZoomFactor(opts.factor)
  })

  handle('page:getZoom', (event, tabId) => {
    const inst = getInstance(event)
    if (!inst) return { factor: 1 }
    const wc = inst.tabManager.getWebContents(tabId)
    if (!wc) return { factor: 1 }
    return { factor: wc.getZoomFactor() }
  })

  handle('settings:get', (event, key) => {
    const inst = getInstance(event)
    if (!inst) return undefined
    return inst.settingsManager.get(key as never)
  })

  handle('settings:set', (event, opts) => {
    const inst = getInstance(event)
    if (!inst) return
    inst.settingsManager.set(opts.key as never, opts.value as never)
  })

  handle('settings:getAll', (event) => {
    const inst = getInstance(event)
    if (!inst) return {}
    return inst.settingsManager.getAll()
  })

  handle('theme:get', () => {
    return nativeTheme.themeSource as ThemeMode
  })

  handle('theme:set', (event, theme) => {
    nativeTheme.themeSource = theme
    const inst = getInstance(event)
    if (inst) inst.settingsManager.set('theme' as never, theme as never)
  })

  // QuickLinks
  handle('settings:getQuickLinks', (event) => {
    const inst = getInstance(event)
    if (!inst) return []
    return inst.settingsManager.get('quickLinks') as QuickLink[]
  })

  handle('settings:setQuickLinks', (event, links) => {
    const inst = getInstance(event)
    if (!inst) return
    inst.settingsManager.set('quickLinks' as never, links as never)
  })

  // Autocomplete
  handle('autocomplete:suggestions', (event, opts) => {
    const inst = getInstance(event)
    if (!inst) return []
    const { query = '', limit = 6 } = opts
    const historyResults = inst.historyManager.search(query, limit, 0).map((item) => ({
      type: 'history' as const,
      title: item.title ?? item.url,
      url: item.url,
    }))
    const bookmarkResults = inst.bookmarkManager.search(query).map((item) => ({
      type: 'bookmark' as const,
      title: item.title,
      url: item.url ?? '',
    }))
    const results = [...historyResults, ...bookmarkResults]
    const unique = new Map<string, AutocompleteSuggestion>()
    for (const r of results) {
      if (!unique.has(r.url)) {
        unique.set(r.url, r)
      }
    }
    const suggestions = Array.from(unique.values())
      .slice(0, limit)
      .filter((s) => s.url)
    return suggestions
  })

  // Bookmark
  handle('bookmark:isBookmarked', (event, url) => {
    const inst = getInstance(event)
    if (!inst) return { isBookmarked: false, id: null }
    return inst.bookmarkManager.isBookmarked(url)
  })

  // Find in Page — use ipcMain.on (not handle) because found-in-page is an async event
  // that must be broadcast back to the renderer
  ipcMain.on('page:startFind', (event, opts) => {
    const inst = getInstance(event)
    if (!inst) return
    const wc = inst.tabManager.getWebContents(opts.tabId)
    if (!wc) return
    const wcId = String(wc.id)

    const foundHandler = (_: Event, result: Electron.FoundInPageResult) => {
      event.sender.send('page:foundInPage', {
        matches: result.matches,
        activeMatch: result.activeMatchOrdinal,
        tabId: opts.tabId,
      })
    }

    const wcEventTarget = wc as unknown as WebContentsEventTarget
    wcEventTarget.removeListener('found-in-page', foundHandlers.get(wcId))
    wcEventTarget.on('found-in-page', foundHandler)
    foundHandlers.set(wcId, foundHandler)
    wc.findInPage(opts.searchText)
  })

  handle('page:endFind', (event, tabId) => {
    const inst = getInstance(event)
    if (!inst) return
    const wc = inst.tabManager.getWebContents(tabId)
    if (wc) {
      const wcId = String(wc.id)
      const wcEventTarget = wc as unknown as WebContentsEventTarget
      wcEventTarget.removeListener('found-in-page', foundHandlers.get(wcId))
      foundHandlers.delete(wcId)
      wc.stopFindInPage('clearSelection')
    }
  })

  handle('page:findNext', (event, opts) => {
    const inst = getInstance(event)
    if (!inst) return
    const wc = inst.tabManager.getWebContents(opts.tabId)
    if (wc) wc.findInPage('', { forward: opts.forward, findNext: true })
  })

  handle('page:findPrevious', (event, opts) => {
    const inst = getInstance(event)
    if (!inst) return
    const wc = inst.tabManager.getWebContents(opts.tabId)
    if (wc) wc.findInPage('', { forward: !opts.forward, findNext: true })
  })

  // Tab reorder
  handle('tab:reorder', (event, ids) => {
    const inst = getInstance(event)
    if (!inst) return
    inst.tabManager.reorder(ids)
  })

  // Window controls
  handle('window:minimize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win) win.minimize()
  })

  handle('window:maximize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
  })

  handle('window:close', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win) win.close()
  })

  // Proxy
  handle('proxy:start', async (event) => {
    const inst = getInstance(event)
    if (!inst?.proxyManager) return
    await inst.proxyManager.start()
  })

  handle('proxy:stop', (event) => {
    const inst = getInstance(event)
    inst?.proxyManager?.stop()
  })

  handle('proxy:status', (event) => {
    const inst = getInstance(event)
    return inst?.proxyManager?.getStatus() ?? { running: false }
  })

  handle('proxy:getProxies', async (event) => {
    try {
      const inst = getInstance(event)
      return (await inst?.proxyManager?.getProxies()) ?? {}
    } catch {
      return {}
    }
  })

  handle('proxy:switchNode', async (event, groupName, nodeName) => {
    try {
      const inst = getInstance(event)
      await inst?.proxyManager?.switchNode(groupName, nodeName)
    } catch {
      /* proxy not running */
    }
  })

  handle('proxy:mode', async (event) => {
    try {
      const inst = getInstance(event)
      return (await inst?.proxyManager?.getMode()) ?? 'rule'
    } catch {
      return 'rule'
    }
  })

  handle('proxy:setMode', async (event, mode) => {
    try {
      const inst = getInstance(event)
      await inst?.proxyManager?.setMode(mode)
    } catch {
      /* proxy not running */
    }
  })

  handle('proxy:checkDelay', async (event, groupName) => {
    try {
      const inst = getInstance(event)
      return (await inst?.proxyManager?.checkDelay(groupName)) ?? []
    } catch {
      return []
    }
  })

  // Subscription
  handle('proxy:getSubscriptions', (event) => {
    const inst = getInstance(event)
    return inst?.subscriptionManager.getSubscriptions() ?? []
  })

  handle('proxy:addSubscription', async (event, url, name) => {
    const inst = getInstance(event)
    if (!inst) throw new Error('No window instance')
    const id = await inst.subscriptionManager.addSubscription(url, name)
    return { id }
  })

  handle('proxy:removeSubscription', async (event, id) => {
    const inst = getInstance(event)
    await inst?.subscriptionManager.removeSubscription(id)
  })

  handle('proxy:updateSubscription', async (event, id) => {
    const inst = getInstance(event)
    await inst?.subscriptionManager.updateSubscription(id)
  })

  handle('proxy:activateSubscription', async (event, id) => {
    const inst = getInstance(event)
    if (!inst) throw new Error('No window instance')
    inst.subscriptionManager.activateSubscription(id)
    const sub = inst.subscriptionManager.getActiveSubscription()
    if (sub && inst.proxyManager) {
      try {
        const data = await inst.subscriptionManager.fetchSubscriptionData(sub.url)
        await inst.proxyManager.injectProxies(data.proxies, data.proxyGroups, data.rules)
      } catch {
        /* proxy not running or fetch failed */
      }
    }
  })

  handle('proxy:deactivateSubscription', async (event, id) => {
    const inst = getInstance(event)
    if (!inst) throw new Error('No window instance')
    inst.subscriptionManager.deactivateSubscription(id)
    if (inst.proxyManager) {
      try {
        await inst.proxyManager.resetConfig()
      } catch {
        /* proxy not running */
      }
    }
  })

  // Log：渲染进程转发来的日志（fire-and-forget，无需返回值）
  ipcMain.on('log:frontend', (_event, entry) => {
    handleFrontendLog(entry)
  })

  // Updater：自动更新状态查询 / 手动检查
  handle('updater:check', () => {
    updater.checkForUpdates()
  })

  handle('updater:getStatus', () => {
    return updater.getStatus()
  })

  // 更新状态变更时广播到所有渲染进程窗口
  updater.onStatus((status) => {
    for (const inst of globalThis.browserInstances.values()) {
      try {
        inst.window.webContents.send('updater:status', status)
      } catch {
        /* webContents 已销毁 */
      }
    }
  })
}
