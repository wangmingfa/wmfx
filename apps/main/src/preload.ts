import type {
  AdBlockLogEntry,
  AdBlockRule,
  AppInfo,
  AutocompleteQuery,
  AutocompleteSuggestion,
  BookmarkCheckResult,
  BookmarkCreateOptions,
  BookmarkItem,
  CapturedRequest,
  CertTrustScope,
  CommandPaletteData,
  CreateTabOptions,
  DownloadCreateOptions,
  DownloadItem,
  DownloadListOptions,
  FileBookmark,
  FileEntry,
  FileStat,
  FindInPageDirection,
  FindInPageOptions,
  HistoryItem,
  InterceptorRule,
  LogEntry,
  NativeMenuItemDescriptor,
  PasswordEntry,
  PasswordEntryInput,
  PopoverAnchor,
  PopoverEventPayload,
  PopoverMode,
  PopoverOpenOptions,
  PopoverType,
  PreviewData,
  QuickLink,
  SetDefaultBrowserResult,
  SettingsSnapshot,
  ShortcutInfo,
  SystemDir,
  TabPrintOptions,
  TabPrintToPdfOptions,
  TabState,
  TabZoomOptions,
  ThemeMode,
  UpdaterStatus,
  ViewBounds,
  Workspace,
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
  getBookmarksByWorkspace: (parentId?: string | null) => Promise<BookmarkItem[]>
  searchBookmarks: ({ query }: { query: string }) => Promise<BookmarkItem[]>
  importBookmarks: (html: string) => Promise<void>
  exportBookmarks: () => Promise<{ html: string }>
  // Password manager
  getPasswords: () => Promise<PasswordEntry[]>
  searchPasswords: (opts: { query: string }) => Promise<PasswordEntry[]>
  savePassword: (input: PasswordEntryInput) => Promise<PasswordEntry>
  deletePassword: (id: string) => Promise<void>
  // Page
  printPage: (opts: TabPrintOptions) => Promise<void>
  printToPDF: (opts: TabPrintToPdfOptions) => Promise<{ path: string }>
  setZoom: (opts: TabZoomOptions) => Promise<void>
  getZoom: (tabId: string) => Promise<{ factor: number }>
  // Reader mode
  enterReadingMode: (tabId: string) => Promise<void>
  exitReadingMode: (tabId: string) => Promise<void>
  onReaderArticle: (
    cb: (article: { title: string; content: string; byline: string | null; url: string }) => void
  ) => () => void
  requestReaderArticle: (
    tabId: string
  ) => Promise<{ title: string; content: string; byline: string | null; url: string } | null>
  // Settings
  getSetting: (key: string) => Promise<unknown>
  setSetting: ({ key, value }: { key: string; value: unknown }) => Promise<void>
  getAllSettings: () => Promise<SettingsSnapshot>
  // Shortcuts
  getShortcuts: () => Promise<ShortcutInfo[]>
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
  onBookmarksChanged: (cb: () => void) => () => void
  onBookmarkBarChanged: (cb: () => void) => () => void
  onTabBarPositionChanged: (cb: () => void) => () => void
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
  setTrafficLightVisible: (visible: boolean) => Promise<void>
  // Shell (download closure)
  showInFolder: (filePath: string) => Promise<void>
  openFile: (filePath: string) => Promise<void>
  openFileInBrowser: (filePath: string) => Promise<void>
  // File system
  fileExists: (path: string) => Promise<boolean>
  readDir: (dirPath: string) => Promise<FileEntry[]>
  stat: (filePath: string) => Promise<FileStat>
  mkdir: (dirPath: string) => Promise<void>
  rename: (oldPath: string, newPath: string) => Promise<void>
  deleteFiles: (paths: string[]) => Promise<void>
  copyFiles: (sources: string[], dest: string) => Promise<void>
  cutFiles: (sources: string[], dest: string) => Promise<void>
  pasteFiles: (dest: string) => Promise<void>
  searchDir: (dirPath: string, query: string) => Promise<FileEntry[]>
  readFilePreview: (filePath: string) => Promise<PreviewData>
  getSystemDirs: () => Promise<SystemDir[]>
  getFileBookmarks: () => Promise<FileBookmark[]>
  addFileBookmark: (dirPath: string, name: string) => Promise<void>
  removeFileBookmark: (id: string) => Promise<void>
  renameFileBookmark: (id: string, name: string) => Promise<void>
  reorderFileBookmarks: (ids: string[]) => Promise<void>
  watchDir: (dirPath: string) => Promise<void>
  unwatchDir: (dirPath: string) => Promise<void>
  onFilesChanged: (cb: (dirPath: string) => void) => () => void
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
  onFocusAddressBar: (cb: () => void) => () => void
  onOpenCommandPalette: (cb: () => void) => () => void
  onOpenSettings: (cb: () => void) => () => void
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
  // Ad blocker
  getAdBlockStatus: () => Promise<{ enabled: boolean; blockedCount: number; ruleCount: number }>
  setAdBlockEnabled: (enabled: boolean) => Promise<void>
  getAdBlockRules: () => Promise<AdBlockRule[]>
  getAdBlockLog: () => Promise<AdBlockLogEntry[]>
  // Request Interceptor
  interceptorGetStatus: () => Promise<{
    enabled: boolean
    capturedCount: number
    ruleCount: number
  }>
  interceptorSetEnabled: (enabled: boolean) => Promise<void>
  interceptorGetRules: () => Promise<InterceptorRule[]>
  interceptorAddRule: (rule: InterceptorRule) => Promise<void>
  interceptorUpdateRule: (rule: InterceptorRule) => Promise<void>
  interceptorDeleteRule: (ruleId: string) => Promise<void>
  interceptorGetCaptured: (opts?: { limit?: number; offset?: number }) => Promise<CapturedRequest[]>
  interceptorClearLog: () => Promise<void>
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
      mode?: PopoverMode,
      backdrop?: { color?: string; blur?: number },
      closeOnBackdrop?: boolean,
      gap?: number
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
  // Command Palette
  commandPaletteGetData: () => Promise<CommandPaletteData>
  commandPaletteExecute: (opts: { type: string; id: string; data?: unknown }) => Promise<void>
  commandPaletteSaveRecent: (actionId: string) => Promise<void>
  // Workspace
  listWorkspaces: () => Promise<Workspace[]>
  createWorkspace: (name: string, color: string) => Promise<Workspace>
  updateWorkspace: (
    id: string,
    patch: { name?: string; color?: string; position?: number }
  ) => Promise<Workspace>
  deleteWorkspace: (id: string) => Promise<void>
  switchWorkspace: (id: string) => Promise<void>
  getActiveWorkspace: () => Promise<Workspace | null>
  reorderWorkspaces: (ids: string[]) => Promise<void>
  onWorkspaceSwitched: (cb: (workspace: Workspace) => void) => () => void
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
  getBookmarksByWorkspace: (parentId) =>
    ipcRenderer.invoke('bookmark:getListByWorkspace', parentId),
  searchBookmarks: ({ query }) => ipcRenderer.invoke('bookmark:search', { query }),
  importBookmarks: (html) => ipcRenderer.invoke('bookmark:import', html),
  exportBookmarks: () => ipcRenderer.invoke('bookmark:export'),
  // Password manager
  getPasswords: () => ipcRenderer.invoke('password:list'),
  searchPasswords: (opts) => ipcRenderer.invoke('password:search', opts),
  savePassword: (input) => ipcRenderer.invoke('password:save', input),
  deletePassword: (id) => ipcRenderer.invoke('password:delete', id),
  // Page
  printPage: (opts) => ipcRenderer.invoke('page:print', opts),
  printToPDF: (opts) => ipcRenderer.invoke('page:printToPDF', opts),
  setZoom: (opts) => ipcRenderer.invoke('page:setZoom', opts),
  getZoom: (tabId) => ipcRenderer.invoke('page:getZoom', tabId),
  // Reader mode
  enterReadingMode: (tabId) => ipcRenderer.invoke('page:enterReadingMode', tabId),
  exitReadingMode: (tabId) => ipcRenderer.invoke('page:exitReadingMode', tabId),
  onReaderArticle: (cb) => {
    const listener = (_e: Electron.IpcRendererEvent, article: unknown): void =>
      cb(article as { title: string; content: string; byline: string | null; url: string })
    ipcRenderer.on('reader:article', listener)
    return () => ipcRenderer.removeListener('reader:article', listener)
  },
  requestReaderArticle: (tabId) => ipcRenderer.invoke('reader:requestArticle', tabId),
  // Settings
  getSetting: (key) => ipcRenderer.invoke('settings:get', key),
  setSetting: ({ key, value }) => ipcRenderer.invoke('settings:set', { key, value }),
  getAllSettings: () => ipcRenderer.invoke('settings:getAll'),
  // Shortcuts
  getShortcuts: () => ipcRenderer.invoke('shortcuts:list'),
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
  onBookmarksChanged: (cb) => {
    const listener = (): void => cb()
    ipcRenderer.on('bookmarks:changed', listener)
    return () => ipcRenderer.removeListener('bookmarks:changed', listener)
  },
  onBookmarkBarChanged: (cb) => {
    const listener = (): void => cb()
    ipcRenderer.on('bookmarkBar:changed', listener)
    return () => ipcRenderer.removeListener('bookmarkBar:changed', listener)
  },
  onTabBarPositionChanged: (cb) => {
    const listener = (): void => cb()
    ipcRenderer.on('tabBarPosition:changed', listener)
    return () => ipcRenderer.removeListener('tabBarPosition:changed', listener)
  },
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
  setTrafficLightVisible: (visible) => ipcRenderer.invoke('window:setTrafficLightVisible', visible),
  // Shell (download closure)
  showInFolder: (filePath) => ipcRenderer.invoke('shell:showInFolder', filePath),
  openFile: (filePath) => ipcRenderer.invoke('shell:openFile', filePath),
  openFileInBrowser: (filePath) => ipcRenderer.invoke('shell:openFileInBrowser', filePath),
  // File system
  fileExists: (path) => ipcRenderer.invoke('fs:fileExists', path),
  readDir: (dirPath) => ipcRenderer.invoke('fs:readDir', dirPath),
  stat: (filePath) => ipcRenderer.invoke('fs:stat', filePath),
  mkdir: (dirPath) => ipcRenderer.invoke('fs:mkdir', dirPath),
  rename: (oldPath, newPath) => ipcRenderer.invoke('fs:rename', oldPath, newPath),
  deleteFiles: (paths) => ipcRenderer.invoke('fs:delete', paths),
  copyFiles: (sources, dest) => ipcRenderer.invoke('fs:copy', sources, dest),
  cutFiles: (sources, dest) => ipcRenderer.invoke('fs:cut', sources, dest),
  pasteFiles: (dest) => ipcRenderer.invoke('fs:paste', dest),
  searchDir: (dirPath, query) => ipcRenderer.invoke('fs:search', dirPath, query),
  readFilePreview: (filePath) => ipcRenderer.invoke('fs:readPreview', filePath),
  getSystemDirs: () => ipcRenderer.invoke('fs:getSystemDirs'),
  getFileBookmarks: () => ipcRenderer.invoke('fs:getBookmarks'),
  addFileBookmark: (dirPath, name) => ipcRenderer.invoke('fs:addBookmark', dirPath, name),
  removeFileBookmark: (id) => ipcRenderer.invoke('fs:removeBookmark', id),
  renameFileBookmark: (id: string, name: string) =>
    ipcRenderer.invoke('fs:renameBookmark', id, name),
  reorderFileBookmarks: (ids) => ipcRenderer.invoke('fs:reorderBookmarks', ids),
  watchDir: (dirPath) => ipcRenderer.invoke('fs:watch', dirPath),
  unwatchDir: (dirPath) => ipcRenderer.invoke('fs:unwatch', dirPath),
  onFilesChanged: (cb) => {
    const listener = (_e: unknown, dirPath: string): void => cb(dirPath)
    ipcRenderer.on('fs:changed', listener)
    return () => ipcRenderer.removeListener('fs:changed', listener)
  },
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
  onFocusAddressBar: (cb) => {
    const listener = (): void => cb()
    ipcRenderer.on('shell:focusAddressBar', listener)
    return () => ipcRenderer.removeListener('shell:focusAddressBar', listener)
  },
  onOpenCommandPalette: (cb) => {
    const listener = (): void => cb()
    ipcRenderer.on('shell:openCommandPalette', listener)
    return () => ipcRenderer.removeListener('shell:openCommandPalette', listener)
  },
  onOpenSettings: (cb) => {
    const listener = (): void => cb()
    ipcRenderer.on('shell:openSettings', listener)
    return () => ipcRenderer.removeListener('shell:openSettings', listener)
  },
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
    ipcRenderer.on(
      'popover:render',
      (_e, id, type, anchor, data, mode, backdrop, closeOnBackdrop, gap) =>
        cb(
          id,
          type as PopoverType,
          anchor as PopoverAnchor,
          data,
          mode as PopoverMode | undefined,
          backdrop,
          closeOnBackdrop,
          gap as number | undefined
        )
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
  // Command Palette
  commandPaletteGetData: () => ipcRenderer.invoke('commandPalette:getData'),
  commandPaletteExecute: (opts) => ipcRenderer.invoke('commandPalette:execute', opts),
  commandPaletteSaveRecent: (actionId) => ipcRenderer.invoke('commandPalette:saveRecent', actionId),
  // Default browser
  setDefaultBrowser: () => ipcRenderer.invoke('default-browser:set'),
  isDefaultBrowser: () => ipcRenderer.invoke('default-browser:isDefault'),
  // Ad blocker
  getAdBlockStatus: () => ipcRenderer.invoke('adblock:getStatus'),
  setAdBlockEnabled: (enabled: boolean) => ipcRenderer.invoke('adblock:setEnabled', enabled),
  getAdBlockRules: () => ipcRenderer.invoke('adblock:getRules'),
  getAdBlockLog: () => ipcRenderer.invoke('adblock:getLog'),
  // Request Interceptor
  interceptorGetStatus: () => ipcRenderer.invoke('interceptor:getStatus'),
  interceptorSetEnabled: (enabled: boolean) =>
    ipcRenderer.invoke('interceptor:setEnabled', enabled),
  interceptorGetRules: () => ipcRenderer.invoke('interceptor:getRules'),
  interceptorAddRule: (rule: InterceptorRule) => ipcRenderer.invoke('interceptor:addRule', rule),
  interceptorUpdateRule: (rule: InterceptorRule) =>
    ipcRenderer.invoke('interceptor:updateRule', rule),
  interceptorDeleteRule: (ruleId: string) => ipcRenderer.invoke('interceptor:deleteRule', ruleId),
  interceptorGetCaptured: (opts?: { limit?: number; offset?: number }) =>
    ipcRenderer.invoke('interceptor:getCaptured', opts),
  interceptorClearLog: () => ipcRenderer.invoke('interceptor:clearLog'),
  // Favicon cache
  faviconGet: (key: string) => ipcRenderer.invoke('favicon:get', key),
  // Workspace
  listWorkspaces: () => ipcRenderer.invoke('workspace:list'),
  createWorkspace: (name, color) => ipcRenderer.invoke('workspace:create', name, color),
  updateWorkspace: (id, patch) => ipcRenderer.invoke('workspace:update', id, patch),
  deleteWorkspace: (id) => ipcRenderer.invoke('workspace:delete', id),
  switchWorkspace: (id) => ipcRenderer.invoke('workspace:switchTo', id),
  getActiveWorkspace: () => ipcRenderer.invoke('workspace:getActive'),
  reorderWorkspaces: (ids) => ipcRenderer.invoke('workspace:reorder', ids),
  onWorkspaceSwitched: (cb) => {
    const handler = (_event: Electron.IpcRendererEvent, workspace: Workspace) => cb(workspace)
    ipcRenderer.on('workspace:switched', handler)
    return () => ipcRenderer.removeListener('workspace:switched', handler)
  },
}

contextBridge.exposeInMainWorld('browserAPI', api)
