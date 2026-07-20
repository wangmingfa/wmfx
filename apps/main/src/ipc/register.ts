import fs from 'node:fs'
import process from 'node:process'
import type {
  AutocompleteSuggestion,
  CommandPaletteData,
  InterceptorRule,
  IpcContract,
  QuickLink,
  SearchEngine,
  ThemeMode,
} from '@browser/ipc-contract'
import { resolveAddressBarTarget } from '@browser/shared'
import { BrowserWindow, clipboard, dialog, type Event, ipcMain, nativeTheme, shell } from 'electron'
import { getAppVersion } from '../app-version'
import { isDefaultBrowser, setAsDefaultBrowser } from '../default-browser'
import { clearDragBookmark, getDragBookmark, setDragBookmark } from '../drag-state'
import { getFavicon, setFaviconByKey } from '../favicon-cache'
import { FileBrowserManager } from '../file-browser-manager'
import { handleFrontendLog } from '../logger'
import { NativeIconManager } from '../native-icon-manager'
import { NativeMenuManager } from '../native-menu-manager'
import { PasswordManager } from '../password-manager'
import { getSearchSuggestions } from '../search-suggestions'
import { SettingsManager } from '../settings-manager'
import { SHORTCUT_REGISTRY } from '../shortcut-registry'
import { updater } from '../updater'
import type { BrowserWindowInstance } from '../window-manager'
import {
  openIncognitoWindow,
  openNormalWindow,
  requireAdBlocker,
  requireRequestCapturer,
} from '../window-manager'

/** Type for raw WebContents event methods (TS overloads don't cover 'found-in-page') */
interface WebContentsEventTarget {
  removeListener(event: string, listener?: (...args: never[]) => void): void
  on(event: string, listener: (...args: never[]) => void): WebContentsEventTarget
}

/** Tracks found-in-page handlers per webContents id for cleanup in endFind */
const foundHandlers = new Map<string, (_: Event, result: Electron.FoundInPageResult) => void>()
/** 每个 webContents 当前的查找关键字，findNext/findPrevious 必须复用它（Electron findInPage 翻页要求 text 与上次一致） */
const findQueries = new Map<string, string>()

let nativeMenuManager: NativeMenuManager | null = null

/** 每个窗口独立维护一个 NativeMenuManager（多窗口下菜单需按触发窗口弹出） */
const nativeMenuManagers = new Map<number, NativeMenuManager>()

export function initNativeMenu(win: BrowserWindow): void {
  const iconManager = new NativeIconManager()
  const manager = new NativeMenuManager(win, iconManager)
  nativeMenuManager = manager
  nativeMenuManagers.set(win.id, manager)
  console.info('[IPC] initNativeMenu: initialized for window', win.id)
}

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
    console.debug('[IPC] tab:create: url sessionId', opts?.url, opts?.sessionId)
    const inst = getInstance(event)
    if (!inst) return {} as ReturnType<IpcContract['tab:create']>
    return inst.tabManager.create(opts)
  })

  handle('tab:close', (event, tabId) => {
    console.debug('[IPC] tab:close: tabId', tabId)
    const inst = getInstance(event)
    if (!inst) return
    inst.tabManager.close(tabId)
    // 多窗口支持：关末标签不再强制退出应用，而是关闭当前窗口（若还有其它窗口）。
    // macOS 下关掉最后窗口也保持应用驻留，由 Dock 重新激活。
    if (inst.tabManager.getList().length === 0) {
      inst.window.close()
    }
  })

  handle('tab:activate', (event, tabId) => {
    console.debug('[IPC] tab:activate: tabId', tabId)
    const inst = getInstance(event)
    if (!inst) return
    inst.tabManager.activate(tabId)
  })

  handle('page:enterReadingMode', async (event, tabId) => {
    console.info(`[IPC] page:enterReadingMode: tabId=${tabId}`)
    const inst = getInstance(event)
    if (!inst) return
    await inst.tabManager.enterReadingMode(tabId)
  })

  handle('page:exitReadingMode', (event, tabId) => {
    console.info(`[IPC] page:exitReadingMode: tabId=${tabId}`)
    const inst = getInstance(event)
    if (!inst) return
    inst.tabManager.exitReadingMode(tabId)
  })

  handle('reader:requestArticle', (event, tabId) => {
    console.debug(`[IPC] reader:requestArticle: tabId=${tabId}`)
    const inst = getInstance(event)
    if (!inst) return null
    return inst.tabManager.getReaderArticle(tabId)
  })

  handle('tab:getState', (event, tabId) => {
    console.debug('[IPC] tab:getState: tabId', tabId)
    const inst = getInstance(event)
    if (!inst) {
      console.debug('[IPC] tab:getState: no instance')
      return {} as ReturnType<IpcContract['tab:getState']>
    }
    const state = inst.tabManager.getState(tabId)
    if (!state) {
      console.debug('[IPC] tab:getState: no state tabId', tabId)
      return {} as ReturnType<IpcContract['tab:getState']>
    }
    return state
  })

  handle('tab:getList', (event) => {
    console.debug('[IPC] tab:getList')
    const inst = getInstance(event)
    if (!inst) {
      console.debug('[IPC] tab:getList: no instance')
      return []
    }
    const list = inst.tabManager.getList()
    // 向请求方（外壳渲染进程）重新广播全部标签，确保即便初始 tab:created
    // 在监听器注册前已发出、被错过，外壳仍能通过 getList 拿到完整标签列表。
    for (const state of list) {
      event.sender.send('tab:created', state)
    }
    return list
  })

  ipcMain.on('tab:setViewportBounds', (event, tabId, bounds) => {
    console.debug('[IPC] tab:setViewportBounds: tabId', tabId)
    const inst = getInstance(event)
    if (!inst) return
    inst.tabManager.setViewportBounds(tabId, bounds)
  })

  handle('tab:createNewTab', (event, sessionId) => {
    console.debug('[IPC] tab:createNewTab: sessionId', sessionId)
    const inst = getInstance(event)
    if (!inst) return {} as ReturnType<IpcContract['tab:create']>
    return inst.tabManager.createNewTab(sessionId)
  })

  handle('nav:loadURLCurrent', (event, url) => {
    console.debug('[IPC] nav:loadURLCurrent: url', url)
    const inst = getInstance(event)
    if (!inst) return
    // 优先用 sender 反查（标签页内调用）；外壳渲染进程（命令面板/ChromeUI）调用时
    // sender 不是某个 tab 的 webContents，回退到当前活动 tab，确保内部页导航始终可用。
    const tabId =
      inst.tabManager.getTabIdByWebContents(event.sender) ?? inst.tabManager.getActiveTabId()
    if (tabId) {
      console.debug('[IPC] nav:loadURLCurrent: tabId', tabId)
      inst.navigationManager.loadURL(tabId, url)
    } else {
      console.debug('[IPC] nav:loadURLCurrent: no tabId (no active tab either)')
    }
  })

  handle('nav:goBack', (event, tabId) => {
    console.debug('[IPC] nav:goBack: tabId', tabId)
    const inst = getInstance(event)
    if (!inst) return
    inst.navigationManager.goBack(tabId)
  })

  handle('nav:goForward', (event, tabId) => {
    console.debug('[IPC] nav:goForward: tabId', tabId)
    const inst = getInstance(event)
    if (!inst) return
    inst.navigationManager.goForward(tabId)
  })

  handle('nav:reload', (event, tabId) => {
    console.debug('[IPC] nav:reload: tabId', tabId)
    const inst = getInstance(event)
    if (!inst) return
    inst.navigationManager.reload(tabId)
  })

  handle('nav:stop', (event, tabId) => {
    console.debug('[IPC] nav:stop: tabId', tabId)
    const inst = getInstance(event)
    if (!inst) return
    inst.navigationManager.stop(tabId)
  })

  handle('nav:loadURL', (event, tabId, url) => {
    console.debug('[IPC] nav:loadURL: tabId url', tabId, url)
    const inst = getInstance(event)
    if (!inst) return
    inst.navigationManager.loadURL(tabId, url)
  })

  handle('session:getPartitions', () => {
    console.debug('[IPC] session:getPartitions')
    return ['default', 'incognito']
  })

  handle('download:create', (event, opts) => {
    console.debug('[IPC] download:create: url', opts?.url)
    const inst = getInstance(event)
    if (!inst) return {} as ReturnType<IpcContract['download:create']>
    return inst.downloadManager.create(opts)
  })

  handle('download:pause', (event, id) => {
    console.debug('[IPC] download:pause: id', id)
    const inst = getInstance(event)
    if (!inst) return
    inst.downloadManager.pause(id)
  })

  handle('download:resume', (event, id) => {
    console.debug('[IPC] download:resume: id', id)
    const inst = getInstance(event)
    if (!inst) return
    inst.downloadManager.resume(id)
  })

  handle('download:cancel', (event, id) => {
    console.debug('[IPC] download:cancel: id', id)
    const inst = getInstance(event)
    if (!inst) return
    inst.downloadManager.cancel(id)
  })

  handle('download:get', (event, id) => {
    console.debug('[IPC] download:get: id', id)
    const inst = getInstance(event)
    if (!inst) {
      console.debug('[IPC] download:get: no instance')
      return null
    }
    const item = inst.downloadManager.get(id)
    if (!item) {
      console.debug('[IPC] download:get: not found id', id)
      return null
    }
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
    console.debug('[IPC] download:getList: opts', opts)
    const inst = getInstance(event)
    if (!inst) {
      console.debug('[IPC] download:getList: no instance')
      return []
    }
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
    console.debug('[IPC] download:setPath: path', path)
    SettingsManager.getInstance().set('downloadPath', path)
  })

  handle('download:delete', (_event, id) => {
    console.debug('[IPC] download:delete: id', id)
    const inst = getInstance()
    if (!inst) return
    inst.downloadManager.delete(id)
  })

  // Dialog：系统文件夹选择
  handle('dialog:selectFolder', (event) => {
    console.debug('[IPC] dialog:selectFolder')
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

  // 文件系统：文件存在性检查
  handle('fs:fileExists', (_event, filePath) => {
    console.debug('[IPC] fs:fileExists: path', filePath)
    return fs.existsSync(filePath)
  })

  // 文件浏览器：目录读写 / 文件操作 / 系统目录 / 书签 / 预览
  const fileBrowser = FileBrowserManager.getInstance()
  handle('fs:readDir', (_event, dirPath) => {
    console.info('[IPC] fs:readDir: dirPath', dirPath)
    return fileBrowser.readDir(dirPath)
  })
  handle('fs:stat', (_event, filePath) => {
    console.debug('[IPC] fs:stat: filePath', filePath)
    return fileBrowser.stat(filePath)
  })
  handle('fs:mkdir', (_event, dirPath) => {
    console.info('[IPC] fs:mkdir: dirPath', dirPath)
    return fileBrowser.mkdir(dirPath)
  })
  handle('fs:rename', (_event, oldPath, newPath) => {
    console.info('[IPC] fs:rename: oldPath → newPath', oldPath, newPath)
    return fileBrowser.rename(oldPath, newPath)
  })
  handle('fs:delete', (_event, paths) => {
    console.info('[IPC] fs:delete: paths', paths)
    return fileBrowser.delete(paths)
  })
  handle('fs:copy', (_event, sources, dest) => {
    console.info('[IPC] fs:copy: sources → dest', sources, dest)
    return fileBrowser.copy(sources, dest)
  })
  handle('fs:cut', (_event, sources, dest) => {
    console.info('[IPC] fs:cut: sources → dest', sources, dest)
    return fileBrowser.cut(sources, dest)
  })
  handle('fs:paste', (_event, dest) => {
    console.info('[IPC] fs:paste: dest', dest)
    return fileBrowser.paste(dest)
  })
  handle('fs:search', (_event, dirPath, query) => {
    console.info('[IPC] fs:search: dirPath query', dirPath, query)
    return fileBrowser.searchDir(dirPath, query)
  })
  handle('fs:readPreview', (_event, filePath) => {
    console.debug('[IPC] fs:readPreview: filePath', filePath)
    return fileBrowser.readFilePreview(filePath)
  })
  handle('fs:getSystemDirs', () => {
    console.debug('[IPC] fs:getSystemDirs')
    return fileBrowser.getSystemDirs()
  })
  // 实时目录监听：渲染进程按当前目录建立/释放 watcher
  handle('fs:watch', (_event, dirPath) => {
    console.info('[IPC] fs:watch: dirPath', dirPath)
    fileBrowser.watchDir(dirPath)
  })
  handle('fs:unwatch', (_event, dirPath) => {
    console.info('[IPC] fs:unwatch: dirPath', dirPath)
    fileBrowser.unwatchDir(dirPath)
  })
  handle('fs:getBookmarks', () => {
    console.debug('[IPC] fs:getBookmarks')
    return fileBrowser.getBookmarks()
  })
  handle('fs:addBookmark', (_event, dirPath, name) => {
    console.info('[IPC] fs:addBookmark: dirPath name', dirPath, name)
    return fileBrowser.addBookmark(dirPath, name)
  })
  handle('fs:removeBookmark', (_event, id) => {
    console.info('[IPC] fs:removeBookmark: id', id)
    return fileBrowser.removeBookmark(id)
  })
  handle('fs:renameBookmark', (_event, id, name) => {
    console.info('[IPC] fs:renameBookmark: id name', id, name)
    return fileBrowser.renameBookmark(id, name)
  })
  handle('fs:reorderBookmarks', (_event, ids) => {
    console.debug('[IPC] fs:reorderBookmarks: ids', ids)
    return fileBrowser.reorderBookmarks(ids)
  })

  // 剪贴板：复制文本
  handle('clipboard:copy', (_event, text) => {
    console.debug('[IPC] clipboard:copy: text length', text.length)
    clipboard.writeText(text)
  })

  // Favicon：缓存查询 / 写入
  handle('favicon:get', (_event, key) => {
    console.debug('[IPC] favicon:get: key', key)
    return getFavicon(key)
  })

  handle('favicon:set', (_event, key, url) => {
    console.debug('[IPC] favicon:set: key url', key, url)
    setFaviconByKey(key, url)
  })

  handle('history:add', (event, opts) => {
    console.debug('[IPC] history:add: url title', opts?.url, opts?.title)
    const inst = getInstance(event)
    if (!inst) {
      console.debug('[IPC] history:add: no instance')
      return
    }
    inst.historyManager.add(opts)
  })

  handle('history:delete', (event, id) => {
    console.debug('[IPC] history:delete: id', id)
    const inst = getInstance(event)
    if (!inst) {
      console.debug('[IPC] history:delete: no instance')
      return
    }
    inst.historyManager.delete(id)
  })

  handle('history:search', (event, opts) => {
    console.debug(
      '[IPC] history:search: query limit offset',
      opts?.query,
      opts?.limit,
      opts?.offset
    )
    const inst = getInstance(event)
    if (!inst) {
      console.debug('[IPC] history:search: no instance')
      return []
    }
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
    console.debug('[IPC] history:getList: opts', opts)
    const inst = getInstance(event)
    if (!inst) {
      console.debug('[IPC] history:getList: no instance')
      return []
    }
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

  handle('history:getAll', (event) => {
    console.debug('[IPC] history:getAll')
    const inst = getInstance(event)
    if (!inst) {
      console.debug('[IPC] history:getAll: no instance')
      return []
    }
    const results = inst.historyManager.getAll()
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
    console.debug('[IPC] history:clear')
    const inst = getInstance(event)
    if (!inst) {
      console.debug('[IPC] history:clear: no instance')
      return
    }
    inst.historyManager.clear()
  })

  handle('privacy:clearData', async (event, opts) => {
    console.info(`[IPC] privacy:clearData: types=${JSON.stringify(opts?.types)}`)
    const inst = getInstance(event)
    if (!inst) {
      console.debug(`[IPC] privacy:clearData: no instance`)
      return
    }
    await inst.privacyManager.clear(opts)
  })

  handle('bookmark:add', (event, opts) => {
    console.debug('[IPC] bookmark:add: url title parentId', opts?.url, opts?.title, opts?.parentId)
    const inst = getInstance(event)
    if (!inst) {
      console.debug('[IPC] bookmark:add: no instance')
      return {} as ReturnType<IpcContract['bookmark:add']>
    }
    const result = inst.bookmarkManager.create(opts)
    notifyBookmarksChanged()
    return result
  })

  handle('bookmark:delete', (event, id) => {
    console.debug('[IPC] bookmark:delete: id', id)
    const inst = getInstance(event)
    if (!inst) {
      console.debug('[IPC] bookmark:delete: no instance')
      return
    }
    inst.bookmarkManager.delete(id)
    notifyBookmarksChanged()
  })

  handle('bookmark:rename', (event, opts) => {
    console.debug('[IPC] bookmark:rename: id title', opts?.id, opts?.title)
    const inst = getInstance(event)
    if (!inst) {
      console.debug('[IPC] bookmark:rename: no instance')
      return
    }
    inst.bookmarkManager.rename(opts.id, opts.title)
    notifyBookmarksChanged()
  })

  handle('bookmark:getList', (event, parentId) => {
    console.debug('[IPC] bookmark:getList: parentId', parentId)
    const inst = getInstance(event)
    if (!inst) {
      console.debug('[IPC] bookmark:getList: no instance')
      return []
    }
    return inst.bookmarkManager.getList(parentId)
  })

  handle('bookmark:search', (event, opts) => {
    console.debug('[IPC] bookmark:search: query', opts?.query)
    const inst = getInstance(event)
    if (!inst) {
      console.debug('[IPC] bookmark:search: no instance')
      return []
    }
    return inst.bookmarkManager.search(opts.query)
  })

  handle('bookmark:import', (event, html) => {
    console.debug('[IPC] bookmark:import: length', html?.length)
    const inst = getInstance(event)
    if (!inst) {
      console.debug('[IPC] bookmark:import: no instance')
      return
    }
    inst.bookmarkManager.importHTML(html)
    notifyBookmarksChanged()
  })

  handle('bookmark:export', (event) => {
    console.debug('[IPC] bookmark:export')
    const inst = getInstance(event)
    if (!inst) {
      console.debug('[IPC] bookmark:export: no instance')
      return { html: '' }
    }
    return inst.bookmarkManager.exportHTML()
  })

  handle('bookmark:move', (event, opts) => {
    console.debug(
      '[IPC] bookmark:move: id parentId position',
      opts?.id,
      opts?.parentId,
      opts?.position
    )
    const inst = getInstance(event)
    if (!inst) {
      console.debug('[IPC] bookmark:move: no instance')
      return
    }
    inst.bookmarkManager.move(opts.id, opts.parentId ?? null, opts.position)
    notifyBookmarksChanged()
  })

  handle('bookmark:drag-start', (_event, id) => {
    console.debug('[IPC] bookmark:drag-start: id', id)
    setDragBookmark(id)
  })

  handle('bookmark:drag-drop', (_event, opts) => {
    const id = getDragBookmark()
    if (!id) {
      console.debug('[IPC] bookmark:drag-drop: no drag id')
      return
    }
    console.debug(
      '[IPC] bookmark:drag-drop: id targetParentId targetPosition',
      id,
      opts?.targetParentId,
      opts?.targetPosition
    )
    const inst = globalThis.browserInstances.values().next().value as
      | BrowserWindowInstance
      | undefined
    inst?.bookmarkManager.move(id, opts.targetParentId ?? null, opts.targetPosition)
    clearDragBookmark()
    notifyBookmarksChanged()
  })

  handle('bookmark:drag-get', () => {
    console.debug('[IPC] bookmark:drag-get')
    return getDragBookmark()
  })

  handle('bookmark:openFolder', (event, folderId) => {
    console.debug('[IPC] bookmark:openFolder: folderId', folderId)
    const inst = getInstance(event)
    if (!inst) return
    inst.popoverManager.open('bookmark-folder', {
      type: 'bookmark-folder',
      anchor: { type: 'cursor' },
      mode: 'bounded',
      data: { folderId },
    })
  })

  handle('page:print', (event, opts) => {
    console.debug('[IPC] page:print: tabId', opts?.tabId)
    const inst = getInstance(event)
    if (!inst) {
      console.debug('[IPC] page:print: no instance')
      return
    }
    const wc = inst.tabManager.getWebContents(opts.tabId)
    if (wc) wc.print(opts.options)
    else console.debug('[IPC] page:print: no webContents tabId', opts?.tabId)
  })

  handle('page:printToPDF', async (event, opts) => {
    console.debug('[IPC] page:printToPDF: tabId', opts?.tabId)
    const inst = getInstance(event)
    if (!inst) {
      console.debug('[IPC] page:printToPDF: no instance')
      return { path: '' }
    }
    const wc = inst.tabManager.getWebContents(opts.tabId)
    if (!wc) {
      console.debug('[IPC] page:printToPDF: no webContents tabId', opts?.tabId)
      return { path: '' }
    }
    const buffer = await wc.printToPDF(opts.options ?? {})
    return { path: `data:application/pdf;base64,${buffer.toString('base64')}` }
  })

  handle('page:setZoom', (event, opts) => {
    console.debug('[IPC] page:setZoom: tabId factor', opts?.tabId, opts?.factor)
    const inst = getInstance(event)
    if (!inst) {
      console.debug('[IPC] page:setZoom: no instance')
      return
    }
    const wc = inst.tabManager.getWebContents(opts.tabId)
    if (wc) wc.setZoomFactor(opts.factor)
    else console.debug('[IPC] page:setZoom: no webContents tabId', opts?.tabId)
  })

  handle('page:getZoom', (event, tabId) => {
    console.debug('[IPC] page:getZoom: tabId', tabId)
    const inst = getInstance(event)
    if (!inst) {
      console.debug('[IPC] page:getZoom: no instance')
      return { factor: 1 }
    }
    const wc = inst.tabManager.getWebContents(tabId)
    if (!wc) {
      console.debug('[IPC] page:getZoom: no webContents tabId', tabId)
      return { factor: 1 }
    }
    return { factor: wc.getZoomFactor() }
  })

  handle('settings:get', (_event, key) => {
    console.debug('[IPC] settings:get: key', key)
    return SettingsManager.getInstance().get(key as never)
  })

  handle('settings:set', (_event, opts) => {
    console.debug('[IPC] settings:set: key', opts.key)
    SettingsManager.getInstance().set(opts.key as never, opts.value as never)
    if (opts.key === 'forceDark') {
      const inst = getInstance(_event)
      if (inst) inst.tabManager.setForceDark(!!opts.value)
    }
    if (opts.key === 'showBookmarkBar') {
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) win.webContents.send('bookmarkBar:changed')
      }
    }
    if (opts.key === 'tabBarPosition') {
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) win.webContents.send('tabBarPosition:changed')
      }
    }
  })

  handle('settings:getAll', () => {
    console.debug('[IPC] settings:getAll')
    return SettingsManager.getInstance().getAll()
  })

  // Keyboard shortcuts
  handle('shortcuts:list', () => {
    console.debug('[IPC] shortcuts:list')
    return SHORTCUT_REGISTRY
  })

  // ---- Password manager ----
  const passwordManager = PasswordManager.getInstance()

  /** 变更后广播给所有窗口（含内部页与 popover），渲染端据此刷新列表 */
  function notifyPasswordsChanged(): void {
    console.debug('[IPC] passwords:changed: broadcast')
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send('passwords:changed')
    }
  }

  handle('password:list', () => {
    console.debug('[IPC] password:list')
    return passwordManager.list()
  })

  handle('password:search', (_event, opts) => {
    console.debug('[IPC] password:search: query', opts?.query)
    return passwordManager.search(opts?.query ?? '')
  })

  handle('password:save', (_event, entry) => {
    console.debug('[IPC] password:save: id', entry?.id ?? '(new)')
    const saved = passwordManager.save(entry)
    notifyPasswordsChanged()
    return saved
  })

  handle('password:delete', (_event, id) => {
    console.debug('[IPC] password:delete: id', id)
    passwordManager.delete(id)
    notifyPasswordsChanged()
  })

  handle('theme:get', () => {
    console.debug('[IPC] theme:get')
    return SettingsManager.getInstance().get('theme')
  })

  /** 根据主题设置解析实际背景色 */
  function resolveBackgroundColor(t: ThemeMode): string {
    const isDark = t === 'dark' || (t === 'system' && nativeTheme.shouldUseDarkColors)
    return isDark ? '#1a1a1a' : '#ffffff'
  }

  function notifyBookmarksChanged(): void {
    console.debug('[IPC] bookmarks:changed: broadcast')
    for (const inst of globalThis.browserInstances.values()) {
      for (const tab of inst.tabManager.getInternalTabs()) {
        tab.webContents.send('bookmarks:changed')
      }
      inst.popoverManager.sendBookmarksChanged()
    }
    for (const win of BrowserWindow.getAllWindows()) {
      if (win.isDestroyed()) continue
      win.webContents.send('bookmarks:changed')
    }
  }

  function notifyThemeChange(theme: ThemeMode) {
    const bgColor = resolveBackgroundColor(theme)
    const isDark = theme === 'dark' || (theme === 'system' && nativeTheme.shouldUseDarkColors)
    // 遍历所有窗口的所有 internal tabs
    for (const inst of globalThis.browserInstances.values()) {
      for (const tab of inst.tabManager.getInternalTabs()) {
        tab.webContents.send('theme:change', theme)
      }
      // 阅读页（readerView 子视图）为独立渲染实例，需单独广播主题，否则切换后残留旧色
      for (const wc of inst.tabManager.getReaderWebContents()) {
        wc.send('theme:change', theme)
      }
      // 同步所有标签页 WebContentsView 的背景色，防止导航时闪烁旧底色
      inst.tabManager.updateAllViewBackgrounds()
      // 外部页重注入暗色 CSS，跟随主题切换
      inst.tabManager.reapplyDarkForTheme(isDark)
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
    console.debug('[IPC] theme:set: theme', theme)
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
    console.debug('[IPC] settings:getQuickLinks')
    return SettingsManager.getInstance().get('quickLinks') as QuickLink[]
  })

  handle('settings:setQuickLinks', (_event, links) => {
    console.debug('[IPC] settings:setQuickLinks: count', links?.length)
    SettingsManager.getInstance().set('quickLinks' as never, links as never)
  })

  // Default browser（设置为默认浏览器）
  handle('default-browser:set', () => {
    console.debug('[IPC] default-browser:set')
    return setAsDefaultBrowser()
  })

  handle('default-browser:isDefault', () => {
    console.debug('[IPC] default-browser:isDefault')
    return isDefaultBrowser()
  })

  // ---- Ad blocker ----
  const adBlocker = requireAdBlocker()
  handle('adblock:getStatus', () => {
    console.debug('[IPC] adblock:getStatus')
    return {
      enabled: adBlocker.isEnabled(),
      blockedCount: adBlocker.getBlockedCount(),
      ruleCount: adBlocker.getRuleCount(),
    }
  })
  handle('adblock:setEnabled', (_event, enabled: boolean) => {
    console.debug('[IPC] adblock:setEnabled: enabled', enabled)
    adBlocker.setEnabled(enabled)
  })
  handle('adblock:getRules', () => {
    console.debug('[IPC] adblock:getRules')
    return adBlocker.getRules()
  })
  handle('adblock:getLog', () => {
    console.debug('[IPC] adblock:getLog')
    return adBlocker.getBlockLog()
  })

  // ---- Request Interceptor ----
  const capturer = requireRequestCapturer()
  const settingsManager = SettingsManager.getInstance()
  handle('interceptor:getStatus', () => {
    console.debug('[IPC] interceptor:getStatus')
    const rules = (settingsManager.get('interceptorRules') as InterceptorRule[]) ?? []
    return {
      enabled: capturer.isEnabled(),
      capturedCount: capturer.getCapturedCount(),
      ruleCount: rules.length,
    }
  })
  handle('interceptor:setEnabled', (_event, enabled: boolean) => {
    console.debug('[IPC] interceptor:setEnabled', enabled)
    settingsManager.set('interceptorEnabled' as never, enabled as never)
    capturer.setEnabled(enabled)
  })
  handle('interceptor:getRules', () => {
    console.debug('[IPC] interceptor:getRules')
    return (settingsManager.get('interceptorRules') as InterceptorRule[]) ?? []
  })
  handle('interceptor:addRule', (_event, rule) => {
    console.debug('[IPC] interceptor:addRule', rule.name)
    const rules = ((settingsManager.get('interceptorRules') as InterceptorRule[]) ??
      []) as InterceptorRule[]
    rules.push(rule)
    settingsManager.set('interceptorRules' as never, rules as never)
  })
  handle('interceptor:updateRule', (_event, rule) => {
    console.debug('[IPC] interceptor:updateRule', rule.id)
    const rules = ((settingsManager.get('interceptorRules') as InterceptorRule[]) ??
      []) as InterceptorRule[]
    const idx = rules.findIndex((r: InterceptorRule) => r.id === rule.id)
    if (idx >= 0) {
      rules[idx] = rule
      settingsManager.set('interceptorRules' as never, rules as never)
    }
  })
  handle('interceptor:deleteRule', (_event, ruleId) => {
    console.debug('[IPC] interceptor:deleteRule', ruleId)
    const rules = ((settingsManager.get('interceptorRules') as InterceptorRule[]) ??
      []) as InterceptorRule[]
    const idx = rules.findIndex((r: InterceptorRule) => r.id === ruleId)
    if (idx >= 0) {
      rules.splice(idx, 1)
      settingsManager.set('interceptorRules' as never, rules as never)
    }
  })
  handle('interceptor:getCaptured', (_event, opts) => {
    console.debug('[IPC] interceptor:getCaptured')
    return capturer.getCaptured(opts)
  })
  handle('interceptor:clearLog', () => {
    console.debug('[IPC] interceptor:clearLog')
    capturer.clearLog()
  })

  // Autocomplete
  handle('autocomplete:suggestions', (event, opts) => {
    const inst = getInstance(event)
    if (!inst) {
      console.debug('[IPC] autocomplete:suggestions: no instance')
      return []
    }
    const { query = '', limit = 8 } = opts
    const settings = SettingsManager.getInstance()
    const engine = (settings.get('searchEngine') as SearchEngine) ?? 'google'
    const enabled = settings.get('searchSuggestions') !== false

    // 1. 本地结果（history + bookmark），保持现有逻辑
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
    const local: AutocompleteSuggestion[] = [...historyResults, ...bookmarkResults]

    // 2. 搜索引擎实时建议（受开关控制，失败/超时静默降级）
    let engineHits: Promise<AutocompleteSuggestion[]> = Promise.resolve([])
    if (enabled && query.trim()) {
      engineHits = getSearchSuggestions(query, engine)
        .then((phrases) =>
          phrases.map((phrase) => ({
            type: 'engine' as const,
            title: phrase,
            url: resolveAddressBarTarget(phrase, engine),
          }))
        )
        .catch(() => {
          console.debug(
            '[Autocomplete] engine suggestions failed: query=%s engine=%s',
            query,
            engine
          )
          return []
        })
    }

    console.debug(
      '[Autocomplete] suggestions: query=%s engine=%s enabled=%s limit=%s',
      query,
      engine,
      enabled,
      limit
    )

    // 3. 合并排序：本地优先，引擎其后；按 url 去重；顶部保留 search 直达项
    const isUrlLike =
      /^https?:\/\//i.test(query.trim()) ||
      (!query.includes(' ') && /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/.*)?$/i.test(query.trim()))
    const out: AutocompleteSuggestion[] = []
    if (!isUrlLike && query.trim()) {
      out.push({
        type: 'search',
        title: `用 ${engine} 搜索 "${query.trim()}"`,
        url: resolveAddressBarTarget(query.trim(), engine),
      })
    }
    const seen = new Set<string>(out.map((s) => s.url))
    return Promise.all([local, engineHits]).then(([localResolved, engineResolved]) => {
      for (const s of [...localResolved, ...engineResolved]) {
        if (s.url && !seen.has(s.url)) {
          seen.add(s.url)
          out.push(s)
        }
      }
      return out.slice(0, limit).filter((s) => s.url)
    })
  })

  // Bookmark
  handle('bookmark:isBookmarked', (event, url) => {
    console.debug('[IPC] bookmark:isBookmarked: url', url)
    const inst = getInstance(event)
    if (!inst) {
      console.debug('[IPC] bookmark:isBookmarked: no instance')
      return { isBookmarked: false, id: null }
    }
    return inst.bookmarkManager.isBookmarked(url)
  })

  // Find in Page — use ipcMain.on (not handle) because found-in-page is an async event
  // that must be broadcast back to the renderer
  ipcMain.on('page:startFind', (event, opts) => {
    console.debug('[IPC] page:startFind: tabId', opts.tabId)
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
    console.debug('[IPC] page:endFind: tabId', tabId)
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
    console.debug('[IPC] page:findNext: tabId forward', opts?.tabId, opts?.forward)
    const inst = getInstance(event)
    if (!inst) {
      console.debug('[IPC] page:findNext: no instance')
      return
    }
    const wc = inst.tabManager.getWebContents(opts.tabId)
    if (!wc) {
      console.debug('[IPC] page:findNext: no webContents tabId', opts?.tabId)
      return
    }
    // findInPage 翻页要求 text 非空且与当前搜索一致；传空串不会翻页（旧 bug）。复用已存关键字。
    const text = findQueries.get(String(wc.id))
    if (text) wc.findInPage(text, { forward: opts.forward, findNext: true })
    else console.debug('[IPC] page:findNext: no cached query tabId', opts?.tabId)
  })

  handle('page:findPrevious', (event, opts) => {
    console.debug('[IPC] page:findPrevious: tabId forward', opts?.tabId, opts?.forward)
    const inst = getInstance(event)
    if (!inst) {
      console.debug('[IPC] page:findPrevious: no instance')
      return
    }
    const wc = inst.tabManager.getWebContents(opts.tabId)
    if (!wc) {
      console.debug('[IPC] page:findPrevious: no webContents tabId', opts?.tabId)
      return
    }
    const text = findQueries.get(String(wc.id))
    if (text) wc.findInPage(text, { forward: !opts.forward, findNext: true })
    else console.debug('[IPC] page:findPrevious: no cached query tabId', opts?.tabId)
  })

  // --- Error Page ---
  handle('page:getErrorInfo', (event) => {
    console.debug('[IPC] page:getErrorInfo')
    const inst = getInstance(event)
    if (!inst) {
      console.debug('[IPC] page:getErrorInfo: no instance')
      return null
    }
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
    console.debug('[IPC] page:retry')
    const inst = getInstance(event)
    if (!inst) {
      console.debug('[IPC] page:retry: no instance')
      return
    }
    const tabId = inst.tabManager.getTabIdByWebContents(event.sender)
    if (!tabId) return
    const nav = inst.tabManager.getNavigationState(tabId)
    if (!nav) return
    inst.navigationManager.loadURL(tabId, nav.requestedUrl)
  })

  // --- Cert Warning ---
  handle('page:getCertWarningInfo', (event) => {
    console.debug('[IPC] page:getCertWarningInfo')
    const inst = getInstance(event)
    if (!inst) {
      console.debug('[IPC] page:getCertWarningInfo: no instance')
      return null
    }
    const tabId = inst.tabManager.getTabIdByWebContents(event.sender)
    if (!tabId) return null
    return inst.tabManager.getCertPending(tabId)
  })

  handle('page:trustCertAndContinue', (event, scope) => {
    console.debug('[IPC] page:trustCertAndContinue: scope', scope)
    const inst = getInstance(event)
    if (!inst) {
      console.debug('[IPC] page:trustCertAndContinue: no instance')
      return
    }
    const tabId = inst.tabManager.getTabIdByWebContents(event.sender)
    if (!tabId) return
    const pending = inst.tabManager.getCertPending(tabId)
    if (!pending) return
    inst.certTrustStore.add(pending.host, pending.errorText, scope)
    inst.navigationManager.loadURL(tabId, pending.requestedUrl)
  })

  // Tab reorder
  handle('tab:reorder', (event, ids) => {
    console.debug('[IPC] tab:reorder: ids', ids)
    const inst = getInstance(event)
    if (!inst) return
    inst.tabManager.reorder(ids)
  })

  // Tab thumbnail capture — 返回 PNG data URL，供标签悬停预览使用
  handle('tab:captureThumbnail', async (event, tabId) => {
    console.debug('[IPC] tab:captureThumbnail: tabId', tabId)
    const inst = getInstance(event)
    if (!inst) return null
    const wc = inst.tabManager.getWebContents(tabId)
    if (!wc || wc.isDestroyed()) return null
    try {
      const image = await wc.capturePage()
      const size = image.getSize()
      // 空白页 / 挂起标签 → 跳过，避免返回破图
      if (size.width === 0 || size.height === 0) {
        console.debug('[IPC] tab:captureThumbnail: blank image for tabId', tabId)
        return null
      }
      return image.toDataURL()
    } catch {
      console.debug('[IPC] tab:captureThumbnail: capture failed for tabId', tabId)
      return null
    }
  })

  // Tab pin / mute / batch close
  handle('tab:setPinned', (event, tabId, pinned) => {
    console.debug('[IPC] tab:setPinned: tabId pinned', tabId, pinned)
    const inst = getInstance(event)
    if (!inst) return
    inst.tabManager.setPinned(tabId, pinned)
  })

  handle('tab:setMuted', (event, tabId, muted) => {
    console.debug('[IPC] tab:setMuted: tabId muted', tabId, muted)
    const inst = getInstance(event)
    if (!inst) return
    inst.tabManager.setMuted(tabId, muted)
  })

  handle('tab:closeMany', (event, ids) => {
    console.debug('[IPC] tab:closeMany: count', ids.length)
    const inst = getInstance(event)
    if (!inst) return
    inst.tabManager.closeMany(ids)
    // 关末标签不再强制退出：关闭当前窗口（与 tab:close 一致）
    if (inst.tabManager.getList().length === 0) {
      inst.window.close()
    }
  })

  handle('tab:reopenClosed', (event) => {
    console.info('[IPC] tab:reopenClosed')
    const inst = getInstance(event)
    if (!inst) return
    inst.tabManager.reopenClosed()
  })

  // Window controls
  handle('window:new', (_event, opts) => {
    console.info(
      '[IPC] window:new: incognito=%s url=%s',
      opts?.incognito === true,
      opts?.url ?? '(newtab)'
    )
    if (opts?.incognito) {
      openIncognitoWindow(opts?.url)
    } else {
      openNormalWindow(opts?.url)
    }
  })

  handle('window:getInfo', (event) => {
    const inst = getInstance(event)
    const info = {
      isIncognito: inst?.isIncognito === true,
      windowId: inst ? String(inst.window.id) : '',
    }
    console.debug('[IPC] window:getInfo: %o', info)
    return info
  })

  handle('window:minimize', (event) => {
    console.debug('[IPC] window:minimize')
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win) win.minimize()
    else console.debug('[IPC] window:minimize: no window')
  })

  handle('window:maximize', (event) => {
    console.debug('[IPC] window:maximize')
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
  })

  handle('window:close', (event) => {
    console.debug('[IPC] window:close')
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win) win.close()
    else console.debug('[IPC] window:close: no window')
  })

  // Shell — 下载闭环
  handle('shell:showInFolder', (_event, filePath) => {
    console.info('[IPC] shell:showInFolder: path', filePath)
    shell.showItemInFolder(filePath)
  })
  handle('shell:openFile', (_event, filePath) => {
    console.info('[IPC] shell:openFile: path', filePath)
    shell.openPath(filePath).catch((err) => {
      console.error('[IPC] shell:openFile: failed', filePath, err)
    })
  })
  handle('shell:openFileInBrowser', (event, filePath) => {
    console.info('[IPC] shell:openFileInBrowser: path', filePath)
    const inst = getInstance(event)
    if (!inst) {
      console.debug('[IPC] shell:openFileInBrowser: no instance')
      return
    }
    // 本地路径经地址解析转为 wmfx://files 内部路由，统一由文件浏览器呈现
    const url = resolveAddressBarTarget(filePath, 'google')
    inst.tabManager.create({ url, sessionId: inst.sessionId })
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
    console.debug('[IPC] proxy:status')
    const inst = getInstance(event)
    return inst?.proxyManager?.getStatus() ?? { running: false }
  })

  handle('proxy:getProxies', async (event) => {
    console.debug('[IPC] proxy:getProxies')
    try {
      const inst = getInstance(event)
      return (await inst?.proxyManager?.getProxies()) ?? {}
    } catch {
      return {}
    }
  })

  handle('proxy:switchNode', async (event, groupName, nodeName) => {
    console.debug('[IPC] proxy:switchNode: group node', groupName, nodeName)
    try {
      const inst = getInstance(event)
      await inst?.proxyManager?.switchNode(groupName, nodeName)
    } catch {
      /* proxy not running */
    }
  })

  handle('proxy:mode', async (event) => {
    console.debug('[IPC] proxy:mode')
    try {
      const inst = getInstance(event)
      return (await inst?.proxyManager?.getMode()) ?? 'rule'
    } catch {
      return 'rule'
    }
  })

  handle('proxy:setMode', async (event, mode) => {
    console.debug('[IPC] proxy:setMode: mode', mode)
    try {
      const inst = getInstance(event)
      await inst?.proxyManager?.setMode(mode)
    } catch {
      /* proxy not running */
    }
  })

  handle('proxy:checkDelay', async (event, groupName) => {
    console.debug('[IPC] proxy:checkDelay: group', groupName)
    try {
      const inst = getInstance(event)
      return (await inst?.proxyManager?.checkDelay(groupName)) ?? []
    } catch {
      return []
    }
  })

  // Subscription
  handle('proxy:getSubscriptions', (event) => {
    console.debug('[IPC] proxy:getSubscriptions')
    const inst = getInstance(event)
    return inst?.subscriptionManager.getSubscriptions() ?? []
  })

  handle('proxy:addSubscription', async (event, url, name) => {
    console.debug('[IPC] proxy:addSubscription: url name', url, name)
    const inst = getInstance(event)
    if (!inst) throw new Error('No window instance')
    const id = await inst.subscriptionManager.addSubscription(url, name)
    return { id }
  })

  handle('proxy:removeSubscription', async (event, id) => {
    console.debug('[IPC] proxy:removeSubscription: id', id)
    const inst = getInstance(event)
    if (!inst) {
      console.debug('[IPC] proxy:removeSubscription: no instance')
      return
    }
    await inst?.subscriptionManager.removeSubscription(id)
  })

  handle('proxy:updateSubscription', async (event, id) => {
    console.debug('[IPC] proxy:updateSubscription: id', id)
    const inst = getInstance(event)
    if (!inst) {
      console.debug('[IPC] proxy:updateSubscription: no instance')
      return
    }
    await inst?.subscriptionManager.updateSubscription(id)
  })

  handle('proxy:activateSubscription', async (event, id) => {
    console.debug('[IPC] proxy:activateSubscription: id', id)
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
    console.debug('[IPC] proxy:deactivateSubscription: id', id)
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
    console.debug('[IPC] log:frontend: level msg', entry?.level, entry?.message)
    handleFrontendLog(entry)
  })

  // 应用信息：版本号 / 架构 / 平台，关于页展示
  handle('app:info', () => {
    console.debug('[IPC] app:info')
    return { version: getAppVersion(), arch: process.arch, platform: process.platform }
  })

  // Updater：自动更新状态查询 / 手动检查 / 退出安装
  handle('updater:check', () => {
    console.debug('[IPC] updater:check')
    updater.checkForUpdates()
  })

  handle('updater:getStatus', () => {
    console.debug('[IPC] updater:getStatus')
    return updater.getStatus()
  })

  handle('updater:restart', () => {
    console.debug('[IPC] updater:restart')
    updater.restartAndInstall()
  })

  // Popover
  handle('popover:open', (event, popoverId, options) => {
    console.debug('[IPC] popover:open: popoverId', popoverId)
    getInstance(event)?.popoverManager.open(popoverId, options)
  })
  handle('popover:close', (event, popoverId) => {
    console.debug('[IPC] popover:close: popoverId', popoverId)
    getInstance(event)?.popoverManager.close(popoverId)
  })
  handle('popover:data', (event, popoverId, data) => {
    console.debug('[IPC] popover:data: popoverId', popoverId)
    getInstance(event)?.popoverManager.sendData(popoverId, data)
  })
  ipcMain.on('popover:panel-event', (event, payload) => {
    console.debug(
      '[IPC] popover:panel-event: popoverId eventName',
      payload?.popoverId,
      payload?.eventName
    )
    const { popoverId, eventName, eventData } = payload as {
      popoverId: string
      eventName: string
      eventData?: unknown
    }
    getInstance(event)?.popoverManager.notifyEvent(popoverId, eventName, eventData)
  })
  ipcMain.on('popover:measure', (event, popoverId, size) => {
    console.debug('[IPC] popover:measure: popoverId size', popoverId, size)
    getInstance(event)?.popoverManager.applyMeasure(
      popoverId,
      size as { width: number; height: number; gutter?: number; offsetX?: number; offsetY?: number }
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

  // ---- Command Palette ----
  handle('commandPalette:getData', async () => {
    console.info('[IPC] commandPalette:getData: fetching all data')
    const allTabs: ReturnType<IpcContract['tab:getList']>[number][] = []
    const allHistory: ReturnType<IpcContract['history:getAll']>[number][] = []
    const allBookmarks: ReturnType<IpcContract['bookmark:getList']>[number][] = []
    for (const instance of globalThis.browserInstances.values()) {
      allTabs.push(...instance.tabManager.getList())
      for (const item of instance.historyManager.getAll()) {
        allHistory.push({
          id: item.id,
          url: item.url,
          title: item.title,
          favicon: item.favicon,
          visitTime: item.visit_time,
          visitCount: item.visit_count,
        })
      }
      allBookmarks.push(...instance.bookmarkManager.getList())
    }
    allHistory.sort((a, b) => b.visitTime - a.visitTime)
    const limitedHistory = allHistory.slice(0, 200)
    const recentActions =
      (SettingsManager.getInstance().get('commandPaletteRecentActions') as string[]) ?? []
    const data: CommandPaletteData = {
      tabs: allTabs,
      history: limitedHistory,
      bookmarks: allBookmarks,
      recentActions,
    }
    console.debug(
      '[IPC] commandPalette:getData: tabs=%d history=%d bookmarks=%d recent=%d',
      allTabs.length,
      limitedHistory.length,
      allBookmarks.length,
      recentActions.length
    )
    return data
  })

  handle('commandPalette:execute', (_event, opts) => {
    console.info('[IPC] commandPalette:execute: type=%s id=%s', opts.type, opts.id)
    if (opts.type === 'tab') {
      const win = BrowserWindow.fromWebContents(_event.sender)
      if (win) {
        const inst = globalThis.browserInstances?.get(String(win.id))
        if (inst) {
          inst.tabManager.activate(opts.id)
        }
      }
    }
  })

  handle('commandPalette:saveRecent', (_event, actionId) => {
    console.debug('[IPC] commandPalette:saveRecent: actionId=%s', actionId)
    const settings = SettingsManager.getInstance()
    const recent = ((settings.get('commandPaletteRecentActions') as string[]) ?? []).filter(
      (id) => id !== actionId
    )
    recent.unshift(actionId)
    if (recent.length > 10) recent.length = 10
    settings.set('commandPaletteRecentActions' as never, recent as never)
  })

  // Native Menu
  handle('native-menu:open', async (event, menuId, items, position) => {
    // 多窗口：从触发事件的窗口解析对应的 NativeMenuManager
    const win = BrowserWindow.fromWebContents(event.sender)
    const manager = (win && nativeMenuManagers.get(win.id)) || nativeMenuManager
    if (manager) {
      await manager.open(menuId, items, position)
    }
  })

  handle('native-menu:close', (event, menuId) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const manager = (win && nativeMenuManagers.get(win.id)) || nativeMenuManager
    if (manager) {
      manager.close(menuId)
    }
    return Promise.resolve()
  })
}
