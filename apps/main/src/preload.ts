import type {
  AutocompleteQuery,
  AutocompleteSuggestion,
  BookmarkCheckResult,
  BookmarkCreateOptions,
  BookmarkItem,
  CreateTabOptions,
  DownloadCreateOptions,
  DownloadItem,
  DownloadListOptions,
  FindInPageDirection,
  FindInPageOptions,
  HistoryItem,
  QuickLink,
  TabPrintOptions,
  TabPrintToPdfOptions,
  TabState,
  TabZoomOptions,
  ThemeMode,
  ViewBounds,
} from '@browser/ipc-contract'
import { contextBridge, ipcRenderer } from 'electron'

const api: {
  ping: (message: string) => Promise<string>
  createTab: (opts: CreateTabOptions) => Promise<TabState>
  closeTab: (tabId: string) => Promise<void>
  activateTab: (tabId: string) => Promise<void>
  getState: (tabId: string) => Promise<TabState>
  getList: () => Promise<TabState[]>
  setViewportBounds: (tabId: string, bounds: ViewBounds) => void
  setSidebarOpen: (open: boolean) => void
  goBack: (tabId: string) => Promise<void>
  goForward: (tabId: string) => Promise<void>
  reload: (tabId: string) => Promise<void>
  stop: (tabId: string) => Promise<void>
  loadURL: (tabId: string, url: string) => Promise<void>
  getPartitions: () => Promise<string[]>
  onTabStateChange: (cb: (state: TabState) => void) => void
  onTabCreated: (cb: (state: TabState) => void) => void
  onTabRemoved: (cb: (tabId: string) => void) => void
  removeListener: (
    channel: string,
    cb: (event: Electron.IpcRendererEvent, ...args: unknown[]) => void
  ) => void
  // Download
  createDownload: (opts: DownloadCreateOptions) => Promise<{ id: string }>
  pauseDownload: (id: string) => Promise<void>
  resumeDownload: (id: string) => Promise<void>
  cancelDownload: (id: string) => Promise<void>
  getDownload: (id: string) => Promise<DownloadItem | null>
  getDownloads: (opts?: DownloadListOptions) => Promise<DownloadItem[]>
  setDownloadPath: (path: string) => Promise<void>
  // History
  addHistory: (item: {
    url: string
    title?: string | null
    favicon?: string | null
  }) => Promise<void>
  deleteHistory: (id: string) => Promise<void>
  searchHistory: (opts: {
    query: string
    limit?: number
    offset?: number
  }) => Promise<HistoryItem[]>
  getHistoryList: (opts?: { limit?: number; offset?: number }) => Promise<HistoryItem[]>
  clearHistory: () => Promise<void>
  // Bookmark
  addBookmark: (item: BookmarkCreateOptions) => Promise<{ id: string }>
  deleteBookmark: (id: string) => Promise<void>
  renameBookmark: ({ id, title }: { id: string; title: string }) => Promise<void>
  getBookmarks: (parentId?: string | null) => Promise<BookmarkItem[]>
  searchBookmarks: ({ query }: { query: string }) => Promise<BookmarkItem[]>
  importBookmarks: (html: string) => Promise<void>
  exportBookmarks: () => Promise<{ html: string }>
  // Page
  printPage: (opts: TabPrintOptions) => Promise<void>
  printToPDF: (opts: TabPrintToPdfOptions) => Promise<{ path: string }>
  setZoom: (opts: TabZoomOptions) => Promise<void>
  getZoom: (tabId: string) => Promise<{ factor: number }>
  // Settings
  getSetting: (key: string) => Promise<unknown>
  setSetting: ({ key, value }: { key: string; value: unknown }) => Promise<void>
  getAllSettings: () => Promise<Record<string, unknown>>
  // Theme
  getTheme: () => Promise<ThemeMode>
  setTheme: (theme: ThemeMode) => Promise<void>
  // Broadcast
  onDownloadProgress: (
    cb: (data: { id: string; state: string; receivedBytes: number; totalBytes: number }) => void
  ) => void
  // QuickLinks
  getQuickLinks: () => Promise<QuickLink[]>
  setQuickLinks: (links: QuickLink[]) => Promise<void>
  // Autocomplete
  getAutocompleteSuggestions: (opts: AutocompleteQuery) => Promise<AutocompleteSuggestion[]>
  // Bookmark
  isBookmarked: (url: string) => Promise<BookmarkCheckResult>
  // Find in Page
  startFind: (opts: FindInPageOptions) => void
  endFind: (tabId: string) => Promise<void>
  findNext: (opts: FindInPageDirection) => Promise<void>
  findPrevious: (opts: FindInPageDirection) => Promise<void>
  // Tab reorder
  reorderTabs: (ids: string[]) => Promise<void>
  // Window controls
  minimizeWindow: () => Promise<void>
  maximizeWindow: () => Promise<void>
  closeWindow: () => Promise<void>
  // Proxy
  startProxy: () => Promise<void>
  stopProxy: () => Promise<void>
  getProxyStatus: () => Promise<{ running: boolean; pid?: number; port?: number }>
  getProxies: () => Promise<
    Record<string, { name: string; type: string; now?: string; all?: string[] }>
  >
  switchProxyNode: (groupName: string, nodeName: string) => Promise<void>
  getProxyMode: () => Promise<string>
  setProxyMode: (mode: 'rule' | 'global' | 'direct') => Promise<void>
  checkProxyDelay: (groupName: string) => Promise<{ nodeName: string; delay: number }[]>
  // Subscription
  getSubscriptions: () => Promise<
    {
      id: string
      name: string
      url: string
      active: number
      last_update: number
      expire: number
      upload: number
      download: number
      total: number
    }[]
  >
  addSubscription: (url: string, name: string) => Promise<{ id: string }>
  removeSubscription: (id: string) => Promise<void>
  updateSubscription: (id: string) => Promise<void>
  activateSubscription: (id: string) => Promise<void>
  deactivateSubscription: (id: string) => Promise<void>
  // Broadcast
  onFoundInPage: (
    cb: (data: {
      tabId: string
      requestId: string
      activeMatchIndex: number
      totalMatches: number
      selection: string
    }) => void
  ) => void
} = {
  ping: (message) => ipcRenderer.invoke('app:ping', message),
  createTab: (opts) => ipcRenderer.invoke('tab:create', opts),
  closeTab: (tabId) => ipcRenderer.invoke('tab:close', tabId),
  activateTab: (tabId) => ipcRenderer.invoke('tab:activate', tabId),
  getState: (tabId) => ipcRenderer.invoke('tab:getState', tabId),
  getList: () => ipcRenderer.invoke('tab:getList'),
  setViewportBounds: (tabId, bounds) => ipcRenderer.send('tab:setViewportBounds', tabId, bounds),
  setSidebarOpen: (open) => ipcRenderer.invoke('tab:setSidebarOpen', open),
  goBack: (tabId) => ipcRenderer.invoke('nav:goBack', tabId),
  goForward: (tabId) => ipcRenderer.invoke('nav:goForward', tabId),
  reload: (tabId) => ipcRenderer.invoke('nav:reload', tabId),
  stop: (tabId) => ipcRenderer.invoke('nav:stop', tabId),
  loadURL: (tabId, url) => ipcRenderer.invoke('nav:loadURL', tabId, url),
  getPartitions: () => ipcRenderer.invoke('session:getPartitions'),
  onTabStateChange: (cb) =>
    ipcRenderer.on('tab:state-change', (_e, state) => cb(state as TabState)),
  onTabCreated: (cb) => ipcRenderer.on('tab:created', (_e, state) => cb(state as TabState)),
  onTabRemoved: (cb) => ipcRenderer.on('tab:removed', (_e, tabId) => cb(tabId as string)),
  removeListener: (channel, cb) => ipcRenderer.removeListener(channel, cb),
  // Download
  createDownload: (opts) => ipcRenderer.invoke('download:create', opts),
  pauseDownload: (id) => ipcRenderer.invoke('download:pause', id),
  resumeDownload: (id) => ipcRenderer.invoke('download:resume', id),
  cancelDownload: (id) => ipcRenderer.invoke('download:cancel', id),
  getDownload: (id) => ipcRenderer.invoke('download:get', id),
  getDownloads: (opts) => ipcRenderer.invoke('download:getList', opts),
  setDownloadPath: (path) => ipcRenderer.invoke('download:setPath', path),
  // History
  addHistory: (item) => ipcRenderer.invoke('history:add', item),
  deleteHistory: (id) => ipcRenderer.invoke('history:delete', id),
  searchHistory: (opts) => ipcRenderer.invoke('history:search', opts),
  getHistoryList: (opts) => ipcRenderer.invoke('history:getList', opts),
  clearHistory: () => ipcRenderer.invoke('history:clear'),
  // Bookmark
  addBookmark: (item) => ipcRenderer.invoke('bookmark:add', item),
  deleteBookmark: (id) => ipcRenderer.invoke('bookmark:delete', id),
  renameBookmark: ({ id, title }) => ipcRenderer.invoke('bookmark:rename', { id, title }),
  getBookmarks: (parentId) => ipcRenderer.invoke('bookmark:getList', parentId),
  searchBookmarks: ({ query }) => ipcRenderer.invoke('bookmark:search', { query }),
  importBookmarks: (html) => ipcRenderer.invoke('bookmark:import', html),
  exportBookmarks: () => ipcRenderer.invoke('bookmark:export'),
  // Page
  printPage: (opts) => ipcRenderer.invoke('page:print', opts),
  printToPDF: (opts) => ipcRenderer.invoke('page:printToPDF', opts),
  setZoom: (opts) => ipcRenderer.invoke('page:setZoom', opts),
  getZoom: (tabId) => ipcRenderer.invoke('page:getZoom', tabId),
  // Settings
  getSetting: (key) => ipcRenderer.invoke('settings:get', key),
  setSetting: ({ key, value }) => ipcRenderer.invoke('settings:set', { key, value }),
  getAllSettings: () => ipcRenderer.invoke('settings:getAll'),
  // Theme
  getTheme: () => ipcRenderer.invoke('theme:get'),
  setTheme: (theme) => ipcRenderer.invoke('theme:set', theme),
  // Broadcast
  onDownloadProgress: (cb) =>
    ipcRenderer.on('download:progress', (_e, data) =>
      cb(data as { id: string; state: string; receivedBytes: number; totalBytes: number })
    ),
  // QuickLinks
  getQuickLinks: () => ipcRenderer.invoke('settings:getQuickLinks'),
  setQuickLinks: (links) => ipcRenderer.invoke('settings:setQuickLinks', links),
  // Autocomplete
  getAutocompleteSuggestions: (opts) => ipcRenderer.invoke('autocomplete:suggestions', opts),
  // Bookmark
  isBookmarked: (url) => ipcRenderer.invoke('bookmark:isBookmarked', url),
  // Find in Page
  startFind: (opts) => ipcRenderer.send('page:startFind', opts),
  endFind: (tabId) => ipcRenderer.invoke('page:endFind', tabId),
  findNext: (opts) => ipcRenderer.invoke('page:findNext', opts),
  findPrevious: (opts) => ipcRenderer.invoke('page:findPrevious', opts),
  // Tab reorder
  reorderTabs: (ids) => ipcRenderer.invoke('tab:reorder', ids),
  // Window controls
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  maximizeWindow: () => ipcRenderer.invoke('window:maximize'),
  closeWindow: () => ipcRenderer.invoke('window:close'),
  // Proxy
  startProxy: () => ipcRenderer.invoke('proxy:start'),
  stopProxy: () => ipcRenderer.invoke('proxy:stop'),
  getProxyStatus: () => ipcRenderer.invoke('proxy:status'),
  getProxies: () => ipcRenderer.invoke('proxy:getProxies'),
  switchProxyNode: (groupName, nodeName) =>
    ipcRenderer.invoke('proxy:switchNode', groupName, nodeName),
  getProxyMode: () => ipcRenderer.invoke('proxy:mode'),
  setProxyMode: (mode) => ipcRenderer.invoke('proxy:setMode', mode),
  checkProxyDelay: (groupName) => ipcRenderer.invoke('proxy:checkDelay', groupName),
  // Subscription
  getSubscriptions: () => ipcRenderer.invoke('proxy:getSubscriptions'),
  addSubscription: (url, name) => ipcRenderer.invoke('proxy:addSubscription', url, name),
  removeSubscription: (id) => ipcRenderer.invoke('proxy:removeSubscription', id),
  updateSubscription: (id) => ipcRenderer.invoke('proxy:updateSubscription', id),
  activateSubscription: (id) => ipcRenderer.invoke('proxy:activateSubscription', id),
  deactivateSubscription: (id) => ipcRenderer.invoke('proxy:deactivateSubscription', id),
  // Broadcast
  onFoundInPage: (cb) =>
    ipcRenderer.on('page:foundInPage', (_e, data) =>
      cb(
        data as {
          tabId: string
          requestId: string
          activeMatchIndex: number
          totalMatches: number
          selection: string
        }
      )
    ),
}

contextBridge.exposeInMainWorld('browserAPI', api)
