import type { IpcContract, ThemeMode } from '@browser/ipc-contract'
import { BrowserWindow, ipcMain, nativeTheme } from 'electron'
import type { BrowserWindowInstance } from '../window-manager'

declare global {
  var browserInstances: Map<string, BrowserWindowInstance>
}

/** 类型安全的 handle 包装：约束通道名与处理函数签名一致。 */
function handle<K extends keyof IpcContract>(
  channel: K,
  handler: (
    ...args: Parameters<IpcContract[K]>
  ) => ReturnType<IpcContract[K]> | Promise<ReturnType<IpcContract[K]>>
): void {
  ipcMain.handle(channel, (_event, ...args) => handler(...(args as Parameters<IpcContract[K]>)))
}

/** 从聚焦窗口获取对应的 BrowserWindowInstance。 */
function getInstance(): BrowserWindowInstance | null {
  const focused = BrowserWindow.getFocusedWindow()
  if (!focused) return null
  const key = String(focused.id)
  return globalThis.browserInstances?.get(key) ?? null
}

export function registerIpcHandlers(): void {
  handle('app:ping', (message) => `pong: ${message}`)

  handle('tab:create', (opts) => {
    const inst = getInstance()
    if (!inst) return {} as ReturnType<IpcContract['tab:create']>
    return inst.tabManager.create(opts)
  })

  handle('tab:close', (tabId) => {
    const inst = getInstance()
    if (!inst) return
    inst.tabManager.close(tabId)
  })

  handle('tab:activate', (tabId) => {
    const inst = getInstance()
    if (!inst) return
    inst.tabManager.activate(tabId)
  })

  handle('tab:getState', (tabId) => {
    const inst = getInstance()
    if (!inst) return {} as ReturnType<IpcContract['tab:getState']>
    const state = inst.tabManager.getState(tabId)
    if (!state) return {} as ReturnType<IpcContract['tab:getState']>
    return state
  })

  handle('tab:getList', () => {
    const inst = getInstance()
    if (!inst) return []
    return inst.tabManager.getList()
  })

  ipcMain.on('tab:setViewportBounds', (_event, tabId, bounds) => {
    const inst = getInstance()
    if (!inst) return
    inst.tabManager.setViewportBounds(tabId, bounds)
  })

  handle('tab:setSidebarOpen', (open) => {
    const inst = getInstance()
    if (!inst) return
    inst.tabManager.setSidebarOpen(open)
  })

  handle('nav:goBack', (tabId) => {
    const inst = getInstance()
    if (!inst) return
    inst.navigationManager.goBack(tabId)
  })

  handle('nav:goForward', (tabId) => {
    const inst = getInstance()
    if (!inst) return
    inst.navigationManager.goForward(tabId)
  })

  handle('nav:reload', (tabId) => {
    const inst = getInstance()
    if (!inst) return
    inst.navigationManager.reload(tabId)
  })

  handle('nav:stop', (tabId) => {
    const inst = getInstance()
    if (!inst) return
    inst.navigationManager.stop(tabId)
  })

  handle('nav:loadURL', (tabId, url) => {
    const inst = getInstance()
    if (!inst) return
    inst.navigationManager.loadURL(tabId, url)
  })

  handle('session:getPartitions', () => {
    return ['default', 'incognito']
  })

  handle('download:create', (opts) => {
    const inst = getInstance()
    if (!inst) return {} as ReturnType<IpcContract['download:create']>
    return inst.downloadManager.create(opts)
  })

  handle('download:pause', (id) => {
    const inst = getInstance()
    if (!inst) return
    inst.downloadManager.pause(id)
  })

  handle('download:resume', (id) => {
    const inst = getInstance()
    if (!inst) return
    inst.downloadManager.resume(id)
  })

  handle('download:cancel', (id) => {
    const inst = getInstance()
    if (!inst) return
    inst.downloadManager.cancel(id)
  })

  handle('download:get', (id) => {
    const inst = getInstance()
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

  handle('download:getList', (opts) => {
    const inst = getInstance()
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

  handle('download:setPath', (path) => {
    const inst = getInstance()
    if (!inst) return
    inst.settingsManager.set('downloadPath', path)
  })

  handle('history:add', (opts) => {
    const inst = getInstance()
    if (!inst) return
    inst.historyManager.add(opts)
  })

  handle('history:delete', (id) => {
    const inst = getInstance()
    if (!inst) return
    inst.historyManager.delete(id)
  })

  handle('history:search', (opts) => {
    const inst = getInstance()
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

  handle('history:getList', (opts) => {
    const inst = getInstance()
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

  handle('history:clear', () => {
    const inst = getInstance()
    if (!inst) return
    inst.historyManager.clear()
  })

  handle('bookmark:add', (opts) => {
    const inst = getInstance()
    if (!inst) return {} as ReturnType<IpcContract['bookmark:add']>
    return inst.bookmarkManager.create(opts)
  })

  handle('bookmark:delete', (id) => {
    const inst = getInstance()
    if (!inst) return
    inst.bookmarkManager.delete(id)
  })

  handle('bookmark:rename', (opts) => {
    const inst = getInstance()
    if (!inst) return
    inst.bookmarkManager.rename(opts.id, opts.title)
  })

  handle('bookmark:getList', (parentId) => {
    const inst = getInstance()
    if (!inst) return []
    return inst.bookmarkManager.getList(parentId)
  })

  handle('bookmark:search', (opts) => {
    const inst = getInstance()
    if (!inst) return []
    return inst.bookmarkManager.search(opts.query)
  })

  handle('bookmark:import', (html) => {
    const inst = getInstance()
    if (!inst) return
    inst.bookmarkManager.importHTML(html)
  })

  handle('bookmark:export', () => {
    const inst = getInstance()
    if (!inst) return { html: '' }
    return inst.bookmarkManager.exportHTML()
  })

  handle('page:print', (opts) => {
    const inst = getInstance()
    if (!inst) return
    const wc = inst.tabManager.getWebContents(opts.tabId)
    if (wc) wc.print(opts.options)
  })

  handle('page:printToPDF', async (opts) => {
    const inst = getInstance()
    if (!inst) return { path: '' }
    const wc = inst.tabManager.getWebContents(opts.tabId)
    if (!wc) return { path: '' }
    const buffer = await wc.printToPDF(opts.options ?? {})
    return { path: `data:application/pdf;base64,${buffer.toString('base64')}` }
  })

  handle('page:setZoom', (opts) => {
    const inst = getInstance()
    if (!inst) return
    const wc = inst.tabManager.getWebContents(opts.tabId)
    if (wc) wc.setZoomFactor(opts.factor)
  })

  handle('page:getZoom', (tabId) => {
    const inst = getInstance()
    if (!inst) return { factor: 1 }
    const wc = inst.tabManager.getWebContents(tabId)
    if (!wc) return { factor: 1 }
    return { factor: wc.getZoomFactor() }
  })

  handle('settings:get', (key) => {
    const inst = getInstance()
    if (!inst) return undefined
    return inst.settingsManager.get(key as never)
  })

  handle('settings:set', (opts) => {
    const inst = getInstance()
    if (!inst) return
    inst.settingsManager.set(opts.key as never, opts.value as never)
  })

  handle('settings:getAll', () => {
    const inst = getInstance()
    if (!inst) return {}
    return inst.settingsManager.getAll()
  })

  handle('theme:get', () => {
    return nativeTheme.themeSource as ThemeMode
  })

  handle('theme:set', (theme) => {
    nativeTheme.themeSource = theme
    const inst = getInstance()
    if (inst) inst.settingsManager.set('theme' as never, theme as never)
  })
}
