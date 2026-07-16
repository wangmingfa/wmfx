import process from 'node:process'
import type {
  AutocompleteSuggestion,
  IpcContract,
  QuickLink,
  ThemeMode,
} from '@browser/ipc-contract'
import { app, BrowserWindow, dialog, type Event, ipcMain, nativeTheme } from 'electron'
import { isDefaultBrowser, setAsDefaultBrowser } from '../default-browser'
import { getFavicon, setFaviconByKey } from '../favicon-cache'
import { handleFrontendLog } from '../logger'
import { SettingsManager } from '../settings-manager'
import { updater } from '../updater'
import type { BrowserWindowInstance } from '../window-manager'

/** Type for raw WebContents event methods (TS overloads don't cover 'found-in-page') */
interface WebContentsEventTarget {
  removeListener(event: string, listener?: (...args: never[]) => void): void
  on(event: string, listener: (...args: never[]) => void): WebContentsEventTarget
}

/** Tracks found-in-page handlers per webContents id for cleanup in endFind */
const foundHandlers = new Map<string, (_: Event, result: Electron.FoundInPageResult) => void>()
/** 每个 webContents 当前的查找关键字，findNext/findPrevious 必须复用它（Electron findInPage 翻页要求 text 与上次一致） */
const findQueries = new Map<string, string>()

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
    console.debug('[IPC] tab:create: url=%s sessionId=%s', opts?.url, opts?.sessionId)
    const inst = getInstance(event)
    if (!inst) return {} as ReturnType<IpcContract['tab:create']>
    return inst.tabManager.create(opts)
  })

  handle('tab:close', (event, tabId) => {
    console.debug('[IPC] tab:close: tabId=%s', tabId)
    const inst = getInstance(event)
    if (!inst) return
    inst.tabManager.close(tabId)
    // 关闭最后一个标签页时退出应用
    if (inst.tabManager.getList().length === 0) {
      app.quit()
    }
  })

  handle('tab:activate', (event, tabId) => {
    console.debug('[IPC] tab:activate: tabId=%s', tabId)
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
    const list = inst.tabManager.getList()
    // 向请求方（外壳渲染进程）重新广播全部标签，确保即便初始 tab:created
    // 在监听器注册前已发出、被错过，外壳仍能通过 getList 拿到完整标签列表。
    for (const state of list) {
      event.sender.send('tab:created', state)
    }
    return list
  })

  ipcMain.on('tab:setViewportBounds', (event, tabId, bounds) => {
    const inst = getInstance(event)
    if (!inst) return
    inst.tabManager.setViewportBounds(tabId, bounds)
  })

  handle('tab:createNewTab', (event, sessionId) => {
    console.debug('[IPC] tab:createNewTab: sessionId=%s', sessionId)
    const inst = getInstance(event)
    if (!inst) return {} as ReturnType<IpcContract['tab:create']>
    return inst.tabManager.createNewTab(sessionId)
  })

  handle('nav:loadURLCurrent', (event, url) => {
    const inst = getInstance(event)
    if (!inst) return
    const tabId = inst.tabManager.getTabIdByWebContents(event.sender)
    if (tabId) inst.navigationManager.loadURL(tabId, url)
  })

  handle('nav:goBack', (event, tabId) => {
    console.debug('[IPC] nav:goBack: tabId=%s', tabId)
    const inst = getInstance(event)
    if (!inst) return
    inst.navigationManager.goBack(tabId)
  })

  handle('nav:goForward', (event, tabId) => {
    console.debug('[IPC] nav:goForward: tabId=%s', tabId)
    const inst = getInstance(event)
    if (!inst) return
    inst.navigationManager.goForward(tabId)
  })

  handle('nav:reload', (event, tabId) => {
    console.debug('[IPC] nav:reload: tabId=%s', tabId)
    const inst = getInstance(event)
    if (!inst) return
    inst.navigationManager.reload(tabId)
  })

  handle('nav:stop', (event, tabId) => {
    console.debug('[IPC] nav:stop: tabId=%s', tabId)
    const inst = getInstance(event)
    if (!inst) return
    inst.navigationManager.stop(tabId)
  })

  handle('nav:loadURL', (event, tabId, url) => {
    console.debug('[IPC] nav:loadURL: tabId=%s url=%s', tabId, url)
    const inst = getInstance(event)
    if (!inst) return
    inst.navigationManager.loadURL(tabId, url)
  })

  handle('session:getPartitions', () => {
    return ['default', 'incognito']
  })

  handle('download:create', (event, opts) => {
    console.debug('[IPC] download:create: url=%s', opts?.url)
    const inst = getInstance(event)
    if (!inst) return {} as ReturnType<IpcContract['download:create']>
    return inst.downloadManager.create(opts)
  })

  handle('download:pause', (event, id) => {
    console.debug('[IPC] download:pause: id=%s', id)
    const inst = getInstance(event)
    if (!inst) return
    inst.downloadManager.pause(id)
  })

  handle('download:resume', (event, id) => {
    console.debug('[IPC] download:resume: id=%s', id)
    const inst = getInstance(event)
    if (!inst) return
    inst.downloadManager.resume(id)
  })

  handle('download:cancel', (event, id) => {
    console.debug('[IPC] download:cancel: id=%s', id)
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

  handle('download:setPath', (_event, path) => {
    SettingsManager.getInstance().set('downloadPath', path)
  })

  // Dialog：系统文件夹选择
  handle('dialog:selectFolder', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const options: Electron.OpenDialogSyncOptions = {
      title: '选择下载文件夹',
      properties: ['openDirectory', 'createDirectory'],
    }
    const result = win
      ? dialog.showOpenDialogSync(win, options)
      : dialog.showOpenDialogSync(options)
    return result && result.length > 0 ? result[0] : null
  })

  // Favicon：缓存查询 / 写入
  handle('favicon:get', (_event, key) => {
    return getFavicon(key)
  })

  handle('favicon:set', (_event, key, url) => {
    setFaviconByKey(key, url)
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

  handle('settings:get', (_event, key) => {
    return SettingsManager.getInstance().get(key as never)
  })

  handle('settings:set', (_event, opts) => {
    console.debug('[IPC] settings:set: key=%s', opts.key)
    SettingsManager.getInstance().set(opts.key as never, opts.value as never)
  })

  handle('settings:getAll', () => {
    return SettingsManager.getInstance().getAll()
  })

  handle('theme:get', () => {
    return SettingsManager.getInstance().get('theme')
  })

  /** 根据主题设置解析实际背景色 */
  function resolveBackgroundColor(t: ThemeMode): string {
    const isDark = t === 'dark' || (t === 'system' && nativeTheme.shouldUseDarkColors)
    return isDark ? '#1a1a1a' : '#ffffff'
  }

  function notifyThemeChange(theme: ThemeMode) {
    const bgColor = resolveBackgroundColor(theme)
    // 遍历所有窗口的所有 internal tabs
    for (const inst of globalThis.browserInstances.values()) {
      for (const tab of inst.tabManager.getInternalTabs()) {
        tab.webContents.send('theme:change', theme)
      }
      // 同步所有标签页 WebContentsView 的背景色，防止导航时闪烁旧底色
      inst.tabManager.updateAllViewBackgrounds()
      // popover 面板（独立 WebContentsView）也需同步主题
      inst.popoverManager.sendTheme(theme)
    }
    // 广播到所有窗口的渲染进程，并同步窗口背景色
    for (const win of BrowserWindow.getAllWindows()) {
      if (win.isDestroyed()) continue
      win.setBackgroundColor(bgColor)
      win.webContents.send('theme:change', theme)
    }
  }

  handle('theme:set', (_event, theme) => {
    console.debug('[IPC] theme:set: theme=%s', theme)
    SettingsManager.getInstance().set('theme', theme)
    notifyThemeChange(theme)
  })

  nativeTheme.on('updated', () => {
    const theme = SettingsManager.getInstance().get('theme')
    // 如果是跟随系统，才需要通知
    if (theme === 'system') {
      notifyThemeChange(theme)
    }
  })

  // QuickLinks
  handle('settings:getQuickLinks', () => {
    return SettingsManager.getInstance().get('quickLinks') as QuickLink[]
  })

  handle('settings:setQuickLinks', (_event, links) => {
    SettingsManager.getInstance().set('quickLinks' as never, links as never)
  })

  // Default browser（设置为默认浏览器）
  handle('default-browser:set', () => {
    return setAsDefaultBrowser()
  })

  handle('default-browser:isDefault', () => {
    return isDefaultBrowser()
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
    return Array.from(unique.values())
      .slice(0, limit)
      .filter((s) => s.url)
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
    console.debug('[IPC] page:startFind: tabId=%s', opts.tabId)
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
    const prev = foundHandlers.get(wcId)
    if (prev) wcEventTarget.removeListener('found-in-page', prev)
    wcEventTarget.on('found-in-page', foundHandler)
    foundHandlers.set(wcId, foundHandler)

    // findNext:false 表示新搜索会话，Chromium 会重置匹配集。不能在此前同步调 stopFindInPage：
    // 二者同一 tick 提交会产生竞态，导致本次 findInPage 被取消、拿不到 found-in-page 结果
    // （表现为“输入后不搜索、按回车再触发一次才出结果”）。
    findQueries.set(wcId, opts.searchText)
    wc.findInPage(opts.searchText, { findNext: false, forward: true })
  })

  handle('page:endFind', (event, tabId) => {
    console.debug('[IPC] page:endFind: tabId=%s', tabId)
    const inst = getInstance(event)
    if (!inst) return
    const wc = inst.tabManager.getWebContents(tabId)
    if (wc) {
      const wcId = String(wc.id)
      const wcEventTarget = wc as unknown as WebContentsEventTarget
      const prev = foundHandlers.get(wcId)
      if (prev) wcEventTarget.removeListener('found-in-page', prev)
      foundHandlers.delete(wcId)
      findQueries.delete(wcId)
      wc.stopFindInPage('clearSelection')
    }
  })

  handle('page:findNext', (event, opts) => {
    const inst = getInstance(event)
    if (!inst) return
    const wc = inst.tabManager.getWebContents(opts.tabId)
    if (!wc) return
    // findInPage 翻页要求 text 非空且与当前搜索一致；传空串不会翻页（旧 bug）。复用已存关键字。
    const text = findQueries.get(String(wc.id))
    if (text) wc.findInPage(text, { forward: opts.forward, findNext: true })
  })

  handle('page:findPrevious', (event, opts) => {
    const inst = getInstance(event)
    if (!inst) return
    const wc = inst.tabManager.getWebContents(opts.tabId)
    if (!wc) return
    const text = findQueries.get(String(wc.id))
    if (text) wc.findInPage(text, { forward: !opts.forward, findNext: true })
  })

  // --- Error Page ---
  handle('page:getErrorInfo', (event) => {
    const inst = getInstance(event)
    if (!inst) return null
    const tabId = inst.tabManager.getTabIdByWebContents(event.sender)
    if (!tabId) return null
    const nav = inst.tabManager.getNavigationState(tabId)
    if (!nav?.error) return null
    return {
      code: nav.error.code,
      description: nav.error.description,
      requestedUrl: nav.requestedUrl,
    }
  })

  handle('page:retry', (event) => {
    const inst = getInstance(event)
    if (!inst) return
    const tabId = inst.tabManager.getTabIdByWebContents(event.sender)
    if (!tabId) return
    const nav = inst.tabManager.getNavigationState(tabId)
    if (!nav) return
    inst.navigationManager.loadURL(tabId, nav.requestedUrl)
  })

  // --- Cert Warning ---
  handle('page:getCertWarningInfo', (event) => {
    const inst = getInstance(event)
    if (!inst) return null
    const tabId = inst.tabManager.getTabIdByWebContents(event.sender)
    if (!tabId) return null
    return inst.tabManager.getCertPending(tabId)
  })

  handle('page:trustCertAndContinue', (event, scope) => {
    const inst = getInstance(event)
    if (!inst) return
    const tabId = inst.tabManager.getTabIdByWebContents(event.sender)
    if (!tabId) return
    const pending = inst.tabManager.getCertPending(tabId)
    if (!pending) return
    inst.certTrustStore.add(pending.host, pending.errorText, scope)
    inst.navigationManager.loadURL(tabId, pending.requestedUrl)
  })

  // Tab reorder
  handle('tab:reorder', (event, ids) => {
    console.debug('[IPC] tab:reorder: ids=%o', ids)
    const inst = getInstance(event)
    if (!inst) return
    inst.tabManager.reorder(ids)
  })

  // Tab pin / mute / batch close
  handle('tab:setPinned', (event, tabId, pinned) => {
    console.debug('[IPC] tab:setPinned: tabId=%s pinned=%s', tabId, pinned)
    const inst = getInstance(event)
    if (!inst) return
    inst.tabManager.setPinned(tabId, pinned)
  })

  handle('tab:setMuted', (event, tabId, muted) => {
    console.debug('[IPC] tab:setMuted: tabId=%s muted=%s', tabId, muted)
    const inst = getInstance(event)
    if (!inst) return
    inst.tabManager.setMuted(tabId, muted)
  })

  handle('tab:closeMany', (event, ids) => {
    console.debug('[IPC] tab:closeMany: count=%d', ids.length)
    const inst = getInstance(event)
    if (!inst) return
    inst.tabManager.closeMany(ids)
    // 关闭后若无标签则退出应用（与 tab:close 一致）
    if (inst.tabManager.getList().length === 0) {
      app.quit()
    }
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
    console.debug('[IPC] proxy:start')
    const inst = getInstance(event)
    if (!inst?.proxyManager) return
    await inst.proxyManager.start()
  })

  handle('proxy:stop', (event) => {
    console.debug('[IPC] proxy:stop')
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
    console.debug('[IPC] proxy:switchNode: group=%s node=%s', groupName, nodeName)
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
    console.debug('[IPC] proxy:setMode: mode=%s', mode)
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
    console.debug('[IPC] proxy:addSubscription: url=%s name=%s', url, name)
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
    console.debug('[IPC] proxy:activateSubscription: id=%s', id)
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
    console.debug('[IPC] proxy:deactivateSubscription: id=%s', id)
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

  // 应用信息：版本号 / 架构 / 平台，关于页展示
  handle('app:info', () => {
    return { version: app.getVersion(), arch: process.arch, platform: process.platform }
  })

  // Updater：自动更新状态查询 / 手动检查 / 退出安装
  handle('updater:check', () => {
    updater.checkForUpdates()
  })

  handle('updater:getStatus', () => {
    return updater.getStatus()
  })

  handle('updater:restart', () => {
    updater.restartAndInstall()
  })

  // Popover
  handle('popover:open', (event, popoverId, options) => {
    getInstance(event)?.popoverManager.open(popoverId, options)
  })
  handle('popover:close', (event, popoverId) => {
    getInstance(event)?.popoverManager.close(popoverId)
  })
  handle('popover:data', (event, popoverId, data) => {
    getInstance(event)?.popoverManager.sendData(popoverId, data)
  })
  ipcMain.on('popover:panel-event', (event, payload) => {
    const { popoverId, eventName, eventData } = payload as {
      popoverId: string
      eventName: string
      eventData?: unknown
    }
    getInstance(event)?.popoverManager.notifyEvent(popoverId, eventName, eventData)
  })
  ipcMain.on('popover:measure', (event, popoverId, size) => {
    getInstance(event)?.popoverManager.applyMeasure(
      popoverId,
      size as { width: number; height: number; gutter?: number }
    )
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
