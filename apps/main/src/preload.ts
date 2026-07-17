import type {
  AppInfo,
  AutocompleteQuery,
  AutocompleteSuggestion,
  BookmarkCheckResult,
  BookmarkCreateOptions,
  BookmarkItem,
  CertTrustScope,
  CreateTabOptions,
  DownloadCreateOptions,
  DownloadItem,
  DownloadListOptions,
  FindInPageDirection,
  FindInPageOptions,
  HistoryItem,
  LogEntry,
  NativeMenuItemDescriptor,
  PopoverAnchor,
  PopoverEventPayload,
  PopoverMode,
  PopoverOpenOptions,
  PopoverType,
  QuickLink,
  SetDefaultBrowserResult,
  SettingsSnapshot,
  TabPrintOptions,
  TabPrintToPdfOptions,
  TabState,
  TabZoomOptions,
  ThemeMode,
  UpdaterStatus,
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
  createNewTab: (sessionId?: string) => Promise<TabState>
  loadURLCurrent: (url: string) => Promise<void>
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
  deleteDownload: (id: string) => Promise<void>
  getDownload: (id: string) => Promise<DownloadItem | null>
  getDownloads: (opts?: DownloadListOptions) => Promise<DownloadItem[]>
  setDownloadPath: (path: string) => Promise<void>
  // Dialog
  selectFolder: () => Promise<string | null>
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
  getAllHistory: () => Promise<HistoryItem[]>
  clearHistory: () => Promise<void>
  clearPrivacyData: (opts: {
    types: ('cookies' | 'cache' | 'localStorage' | 'formData')[]
  }) => Promise<void>
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
  getAllSettings: () => Promise<SettingsSnapshot>
  // Theme
  getTheme: () => Promise<ThemeMode>
  setTheme: (theme: ThemeMode) => Promise<void>
  onThemeChange: (cb: (theme: ThemeMode) => void) => void
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
  moveBookmark: (opts: { id: string; parentId?: string | null; position: number }) => Promise<void>
  dragBookmarkStart: (id: string) => Promise<void>
  openBookmarkFolder: (folderId: string) => Promise<void>
  dragBookmarkDrop: (opts: {
    targetParentId?: string | null
    targetPosition: number
  }) => Promise<void>
  getDragBookmarkId: () => Promise<string | null>
  onBookmarksChanged: (cb: () => void) => void
  // Find in Page
  startFind: (opts: FindInPageOptions) => void
  endFind: (tabId: string) => Promise<void>
  findNext: (opts: FindInPageDirection) => Promise<void>
  findPrevious: (opts: FindInPageDirection) => Promise<void>
  // Tab reorder
  reorderTabs: (ids: string[]) => Promise<void>
  // Tab thumbnail
  captureThumbnail: (tabId: string) => Promise<string | null>
  // Tab pin / mute / batch close
  setPinned: (tabId: string, pinned: boolean) => Promise<void>
  setMuted: (tabId: string, muted: boolean) => Promise<void>
  closeTabs: (ids: string[]) => Promise<void>
  // Undo close tab
  reopenClosed: () => Promise<void>
  // Window controls
  getWindowInfo: () => Promise<{ isIncognito: boolean; windowId: string }>
  minimizeWindow: () => Promise<void>
  maximizeWindow: () => Promise<void>
  closeWindow: () => Promise<void>
  createNewWindow: (opts?: { url?: string; incognito?: boolean }) => Promise<void>
  // Shell (download closure)
  showInFolder: (filePath: string) => Promise<void>
  openFile: (filePath: string) => Promise<void>
  // File system
  fileExists: (path: string) => Promise<boolean>
  // Clipboard
  copyText: (text: string) => Promise<void>
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
  onOpenFind: (cb: (tabId: string) => void) => void
  onFocusAddressBar: (cb: () => void) => void
  // Log
  log: (entry: LogEntry) => void
  // Updater
  checkForUpdates: () => Promise<void>
  getUpdaterStatus: () => Promise<UpdaterStatus>
  onUpdaterStatus: (cb: (status: UpdaterStatus) => void) => void
  restartAndInstall: () => void
  // App info
  getAppInfo: () => Promise<AppInfo>
  // Proxy traffic broadcast
  // Default browser
  setDefaultBrowser: () => Promise<SetDefaultBrowserResult>
  isDefaultBrowser: () => Promise<boolean>
  // Favicon cache
  faviconGet: (key: string) => Promise<string | null>
  // Popover
  popoverOpen: (popoverId: string, options: PopoverOpenOptions) => Promise<void>
  popoverClose: (popoverId: string) => Promise<void>
  popoverSendData: (popoverId: string, data: unknown) => Promise<void>
  popoverEvent: (payload: PopoverEventPayload) => void
  onPopoverRender: (
    cb: (
      popoverId: string,
      type: PopoverType,
      anchor: PopoverAnchor,
      data?: unknown,
      mode?: PopoverMode
    ) => void
  ) => void
  popoverMeasure: (
    popoverId: string,
    size: { width: number; height: number; gutter?: number }
  ) => void
  onPopoverData: (cb: (popoverId: string, data: unknown) => void) => void
  onPopoverDismiss: (cb: (popoverId: string) => void) => void
  onPopoverEvent: (cb: (payload: PopoverEventPayload) => void) => void
  // Proxy traffic broadcast
  onProxyTraffic: (cb: (data: { up: number; down: number }) => void) => void
  // Error / Cert Warning
  getErrorInfo: () => Promise<{ code: number; description: string; requestedUrl: string } | null>
  retry: () => Promise<void>
  getCertWarningInfo: () => Promise<{
    host: string
    errorText: string
    requestedUrl: string
  } | null>
  trustCertAndContinue: (scope: CertTrustScope) => Promise<void>
  // Native Menu
  nativeMenuOpen: (
    menuId: string,
    items: NativeMenuItemDescriptor[],
    position?: { x: number; y: number }
  ) => Promise<void>
  nativeMenuClose: (menuId: string) => Promise<void>
  onNativeMenuAction: (cb: (payload: { menuId: string; itemId: string }) => void) => void
  onNativeMenuClosed: (cb: (menuId: string) => void) => void
} = {
  ping: (message) => ipcRenderer.invoke('app:ping', message),
  createTab: (opts) => ipcRenderer.invoke('tab:create', opts),
  closeTab: (tabId) => ipcRenderer.invoke('tab:close', tabId),
  activateTab: (tabId) => ipcRenderer.invoke('tab:activate', tabId),
  getState: (tabId) => ipcRenderer.invoke('tab:getState', tabId),
  getList: () => ipcRenderer.invoke('tab:getList'),
  setViewportBounds: (tabId, bounds) => ipcRenderer.send('tab:setViewportBounds', tabId, bounds),
  createNewTab: (sessionId) => ipcRenderer.invoke('tab:createNewTab', sessionId),
  loadURLCurrent: (url) => ipcRenderer.invoke('nav:loadURLCurrent', url),
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
  deleteDownload: (id) => ipcRenderer.invoke('download:delete', id),
  // Dialog
  selectFolder: () => ipcRenderer.invoke('dialog:selectFolder'),
  // History
  addHistory: (item) => ipcRenderer.invoke('history:add', item),
  deleteHistory: (id) => ipcRenderer.invoke('history:delete', id),
  searchHistory: (opts) => ipcRenderer.invoke('history:search', opts),
  getHistoryList: (opts) => ipcRenderer.invoke('history:getList', opts),
  getAllHistory: () => ipcRenderer.invoke('history:getAll'),
  clearHistory: () => ipcRenderer.invoke('history:clear'),
  clearPrivacyData: (opts: { types: ('cookies' | 'cache' | 'localStorage' | 'formData')[] }) =>
    ipcRenderer.invoke('privacy:clearData', opts),
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
  onThemeChange: (cb) => ipcRenderer.on('theme:change', (_e, theme) => cb(theme as ThemeMode)),
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
  moveBookmark: (opts) => ipcRenderer.invoke('bookmark:move', opts),
  dragBookmarkStart: (id) => ipcRenderer.invoke('bookmark:drag-start', id),
  openBookmarkFolder: (folderId) => ipcRenderer.invoke('bookmark:openFolder', folderId),
  dragBookmarkDrop: (opts) => ipcRenderer.invoke('bookmark:drag-drop', opts),
  getDragBookmarkId: () => ipcRenderer.invoke('bookmark:drag-get'),
  onBookmarksChanged: (cb) => ipcRenderer.on('bookmarks:changed', () => cb()),
  // Find in Page
  startFind: (opts) => ipcRenderer.send('page:startFind', opts),
  endFind: (tabId) => ipcRenderer.invoke('page:endFind', tabId),
  findNext: (opts) => ipcRenderer.invoke('page:findNext', opts),
  findPrevious: (opts) => ipcRenderer.invoke('page:findPrevious', opts),
  // Tab reorder
  reorderTabs: (ids) => ipcRenderer.invoke('tab:reorder', ids),
  captureThumbnail: (tabId) => ipcRenderer.invoke('tab:captureThumbnail', tabId),
  // Tab pin / mute / batch close
  setPinned: (tabId, pinned) => ipcRenderer.invoke('tab:setPinned', tabId, pinned),
  setMuted: (tabId, muted) => ipcRenderer.invoke('tab:setMuted', tabId, muted),
  closeTabs: (ids) => ipcRenderer.invoke('tab:closeMany', ids),
  reopenClosed: () => ipcRenderer.invoke('tab:reopenClosed'),
  // Window controls
  getWindowInfo: () => ipcRenderer.invoke('window:getInfo'),
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  maximizeWindow: () => ipcRenderer.invoke('window:maximize'),
  closeWindow: () => ipcRenderer.invoke('window:close'),
  createNewWindow: (opts) => ipcRenderer.invoke('window:new', opts),
  // Shell (download closure)
  showInFolder: (filePath) => ipcRenderer.invoke('shell:showInFolder', filePath),
  openFile: (filePath) => ipcRenderer.invoke('shell:openFile', filePath),
  // File system
  fileExists: (path) => ipcRenderer.invoke('fs:fileExists', path),
  // Clipboard
  copyText: (text) => ipcRenderer.invoke('clipboard:copy', text),
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
  onOpenFind: (cb) => ipcRenderer.on('page:openFind', (_e, tabId) => cb(tabId as string)),
  onFocusAddressBar: (cb) => ipcRenderer.on('shell:focusAddressBar', () => cb()),
  // Log
  log: (entry) => ipcRenderer.send('log:frontend', entry),
  // Updater
  checkForUpdates: () => ipcRenderer.invoke('updater:check'),
  getUpdaterStatus: () => ipcRenderer.invoke('updater:getStatus'),
  onUpdaterStatus: (cb) =>
    ipcRenderer.on('updater:status', (_e, status) => cb(status as UpdaterStatus)),
  restartAndInstall: () => ipcRenderer.invoke('updater:restart'),
  // App info
  getAppInfo: () => ipcRenderer.invoke('app:info'),
  // Popover
  popoverOpen: (popoverId, options) => ipcRenderer.invoke('popover:open', popoverId, options),
  popoverClose: (popoverId) => ipcRenderer.invoke('popover:close', popoverId),
  popoverSendData: (popoverId, data) => ipcRenderer.invoke('popover:data', popoverId, data),
  popoverEvent: (payload) => ipcRenderer.send('popover:panel-event', payload),
  onPopoverRender: (cb) =>
    ipcRenderer.on('popover:render', (_e, id, type, anchor, data, mode) =>
      cb(id, type as PopoverType, anchor as PopoverAnchor, data, mode as PopoverMode | undefined)
    ),
  popoverMeasure: (popoverId, size) => ipcRenderer.send('popover:measure', popoverId, size),
  onPopoverData: (cb) =>
    ipcRenderer.on('popover:data', (_e, popoverId, data) => cb(popoverId as string, data)),
  onPopoverDismiss: (cb) => ipcRenderer.on('popover:dismiss', (_e, id) => cb(id as string)),
  onPopoverEvent: (cb) =>
    ipcRenderer.on('popover:event', (_e, payload) => cb(payload as PopoverEventPayload)),
  onProxyTraffic: (cb) =>
    ipcRenderer.on('proxy:traffic', (_e, data) => cb(data as { up: number; down: number })),
  // Error / Cert Warning
  getErrorInfo: () => ipcRenderer.invoke('page:getErrorInfo'),
  retry: () => ipcRenderer.invoke('page:retry'),
  getCertWarningInfo: () => ipcRenderer.invoke('page:getCertWarningInfo'),
  trustCertAndContinue: (scope) => ipcRenderer.invoke('page:trustCertAndContinue', scope),
  // Native Menu
  nativeMenuOpen: (menuId, items, position) =>
    ipcRenderer.invoke('native-menu:open', menuId, items, position),
  nativeMenuClose: (menuId) => ipcRenderer.invoke('native-menu:close', menuId),
  onNativeMenuAction: (cb) =>
    ipcRenderer.on('native-menu:action', (_e, payload) =>
      cb(payload as { menuId: string; itemId: string })
    ),
  onNativeMenuClosed: (cb) =>
    ipcRenderer.on('native-menu:closed', (_e, menuId) => cb(menuId as string)),
  // Default browser
  setDefaultBrowser: () => ipcRenderer.invoke('default-browser:set'),
  isDefaultBrowser: () => ipcRenderer.invoke('default-browser:isDefault'),
  // Favicon
  faviconGet: (key: string) => ipcRenderer.invoke('favicon:get', key),
}

contextBridge.exposeInMainWorld('browserAPI', api)
