/**
 * 所有 IPC 通道的类型契约：通道名 -> (参数) => 返回值。
 * 主进程用它约束 handle，渲染进程用它约束 invoke。
 * 后续里程碑在此扩展（tab:*, nav:*, proxy:* ...）。
 */

export interface TabState {
  id: string
  windowId: string
  sessionId: string
  url: string
  title: string
  favicon: string | null
  isLoading: boolean
  canGoBack: boolean
  canGoForward: boolean
  zoomFactor: number
  isMuted: boolean
  isPinned: boolean
  active: boolean
}

export interface ViewBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface CreateTabOptions {
  url?: string
  sessionId?: string
  activate?: boolean
}

/** 下载状态 */
export type DownloadState =
  | 'pending'
  | 'downloading'
  | 'paused'
  | 'completed'
  | 'cancelled'
  | 'error'

/** 下载项 */
export interface DownloadItem {
  id: string
  url: string
  filename: string
  path: string
  state: DownloadState
  receivedBytes: number
  totalBytes: number
  createdAt: number
  errorMsg: string | null
}

/** 历史记录项 */
export interface HistoryItem {
  id: string
  url: string
  title: string | null
  favicon: string | null
  visitTime: number
  visitCount: number
}

/** 书签项 */
export interface BookmarkItem {
  id: string
  parentId: string | null
  title: string
  url: string | null
  favicon: string | null
  position: number
  createdAt: number
}

/** 主题模式 */
export type ThemeMode = 'light' | 'dark' | 'system'

/** 下载创建参数 */
export interface DownloadCreateOptions {
  url: string
  filename?: string
  path?: string
}

/** 搜索参数 */
export interface SearchOptions {
  query: string
  limit?: number
  offset?: number
}

/** 列表查询参数 */
export interface ListOptions {
  limit?: number
  offset?: number
}

/** 下载列表参数 */
export interface DownloadListOptions {
  state?: DownloadState
  limit?: number
  offset?: number
}

/** 书签创建参数 */
export interface BookmarkCreateOptions {
  title: string
  url: string | null
  favicon?: string | null
  parentId?: string | null
}

/** 页面打印选项 */
export interface PrintOptions {
  deviceName?: string
  printBackground?: boolean
  margins?: {
    top: number
    bottom: number
    left: number
    right: number
  }
}

/** 页面导出 PDF 选项 */
export interface PrintToPdfOptions {
  filename?: string
  pageSize?: 'A3' | 'A4' | 'A5' | 'Letter' | 'Legal' | 'Tabloid'
  marginsType?: number
}

export interface TabPrintOptions {
  tabId: string
  options?: PrintOptions
}

export interface TabPrintToPdfOptions {
  tabId: string
  options?: PrintToPdfOptions
}

export interface TabZoomOptions {
  tabId: string
  factor: number
}

/** 新标签页快捷网站 */
export interface QuickLink {
  id: string
  title: string
  url: string
}

/** 补全建议项 */
export interface AutocompleteSuggestion {
  type: 'history' | 'bookmark' | 'search'
  title: string
  url: string
}

/** 补全查询参数 */
export interface AutocompleteQuery {
  query: string
  limit?: number
}

/** 书签检查结果 */
export interface BookmarkCheckResult {
  isBookmarked: boolean
  id: string | null
}

/** 标签页查找结果 */
export interface FindInPageResult {
  matches: number
  activeMatch: number
  searchText: string
}

/** 页面内查找参数 */
export interface FindInPageOptions {
  tabId: string
  searchText: string
}

/** 标签页查找翻页参数 */
export interface FindInPageDirection {
  tabId: string
  forward: boolean
}

/** 新标签页快捷网站列表参数 */
export interface QuickLinksListOptions {
  tabId?: string
}

export interface IpcContract {
  'app:ping': (message: string) => string
  'tab:create': (opts: CreateTabOptions) => TabState
  'tab:close': (tabId: string) => void
  'tab:activate': (tabId: string) => void
  'tab:getState': (tabId: string) => TabState
  'tab:getList': () => TabState[]
  'tab:setViewportBounds': (tabId: string, bounds: ViewBounds) => void
  'tab:setSidebarOpen': (open: boolean) => void
  'nav:goBack': (tabId: string) => void
  'nav:goForward': (tabId: string) => void
  'nav:reload': (tabId: string) => void
  'nav:stop': (tabId: string) => void
  'nav:loadURL': (tabId: string, url: string) => void
  'session:getPartitions': () => string[]
  // Download
  'download:create': (opts: DownloadCreateOptions) => { id: string }
  'download:pause': (id: string) => void
  'download:resume': (id: string) => void
  'download:cancel': (id: string) => void
  'download:get': (id: string) => DownloadItem | null
  'download:getList': (opts?: DownloadListOptions) => DownloadItem[]
  'download:setPath': (path: string) => void
  // History
  'history:add': (item: { url: string; title?: string | null; favicon?: string | null }) => void
  'history:delete': (id: string) => void
  'history:search': (opts: SearchOptions) => HistoryItem[]
  'history:getList': (opts?: ListOptions) => HistoryItem[]
  'history:clear': () => void
  // Bookmark
  'bookmark:add': (item: BookmarkCreateOptions) => { id: string }
  'bookmark:delete': (id: string) => void
  'bookmark:rename': ({ id, title }: { id: string; title: string }) => void
  'bookmark:getList': (parentId?: string | null) => BookmarkItem[]
  'bookmark:search': ({ query }: { query: string }) => BookmarkItem[]
  'bookmark:import': (html: string) => void
  'bookmark:export': () => { html: string }
  // Page
  'page:print': (opts: TabPrintOptions) => void
  'page:printToPDF': (opts: TabPrintToPdfOptions) => { path: string }
  'page:setZoom': (opts: TabZoomOptions) => void
  'page:getZoom': (tabId: string) => { factor: number }
  // Settings
  'settings:get': (key: string) => unknown
  'settings:set': ({ key, value }: { key: string; value: unknown }) => void
  'settings:getAll': () => Record<string, unknown>
  // Theme
  'theme:get': () => ThemeMode
  'theme:set': (theme: ThemeMode) => void
  // New Tab
  'settings:getQuickLinks': () => QuickLink[]
  'settings:setQuickLinks': (links: QuickLink[]) => void
  // Autocomplete
  'autocomplete:suggestions': (opts: AutocompleteQuery) => AutocompleteSuggestion[]
  // Bookmark
  'bookmark:isBookmarked': (url: string) => BookmarkCheckResult
  // Find in Page
  'page:startFind': (opts: FindInPageOptions) => void
  'page:endFind': (tabId: string) => void
  'page:findNext': (opts: FindInPageDirection) => void
  'page:findPrevious': (opts: FindInPageDirection) => void
  // Tab reorder
  'tab:reorder': (ids: string[]) => void
  // Window controls
  'window:minimize': () => void
  'window:maximize': () => void
  'window:close': () => void
}

export type IpcChannel = keyof IpcContract

export const IPC_CHANNELS: readonly IpcChannel[] = [
  'app:ping',
  'tab:create',
  'tab:close',
  'tab:activate',
  'tab:getState',
  'tab:getList',
  'tab:setViewportBounds',
  'nav:goBack',
  'nav:goForward',
  'nav:reload',
  'nav:stop',
  'nav:loadURL',
  'session:getPartitions',
  // Download
  'download:create',
  'download:pause',
  'download:resume',
  'download:cancel',
  'download:get',
  'download:getList',
  'download:setPath',
  // History
  'history:add',
  'history:delete',
  'history:search',
  'history:getList',
  'history:clear',
  // Bookmark
  'bookmark:add',
  'bookmark:delete',
  'bookmark:rename',
  'bookmark:getList',
  'bookmark:search',
  'bookmark:import',
  'bookmark:export',
  // Page
  'page:print',
  'page:printToPDF',
  'page:setZoom',
  'page:getZoom',
  // Settings
  'settings:get',
  'settings:set',
  'settings:getAll',
  // Theme
  'theme:get',
  'theme:set',
  // New Tab
  'settings:getQuickLinks',
  'settings:setQuickLinks',
  // Autocomplete
  'autocomplete:suggestions',
  // Bookmark
  'bookmark:isBookmarked',
  // Find in Page
  'page:startFind',
  'page:endFind',
  'page:findNext',
  'page:findPrevious',
  // Tab reorder
  'tab:reorder',
  // Window controls
  'window:minimize',
  'window:maximize',
  'window:close',
] as const

export function isIpcChannel(name: string): name is IpcChannel {
  return (IPC_CHANNELS as readonly string[]).includes(name)
}

/** 渲染进程侧调用类型：invoke 返回 Promise。 */
export type IpcInvoke = {
  [K in IpcChannel]: (...args: Parameters<IpcContract[K]>) => Promise<ReturnType<IpcContract[K]>>
}
