/**
 * 所有 IPC 通道的类型契约：通道名 -> (参数) => 返回值。
 * 主进程用它约束 handle，渲染进程用它约束 invoke。
 * 后续里程碑在此扩展（tab:*, nav:*, proxy:* ...）。
 */

/** Popover 类型：menu=下拉菜单, addressbar=地址栏建议面板, find=页内查找栏, downloads=下载列表 */
export type PopoverType = 'menu' | 'addressbar' | 'find' | 'downloads'

/** Popover 显示模式：overlay=铺满窗口阻断交互；bounded=仅覆盖内容区、非阻断、失焦关闭 */
export type PopoverMode = 'overlay' | 'bounded'

/** Popover 事件：面板 → 主 renderer */
export interface PopoverEventPayload {
  popoverId: string
  eventName: string
  eventData?: unknown
}

/** Popover 打开参数 */
export interface PopoverOpenOptions {
  type: PopoverType
  anchor: PopoverAnchor
  data?: unknown
  mode?: PopoverMode
  size?: { width?: number; height?: number }
  /** 常驻：bounded popover 失焦不自动关闭（如页内查找栏），只能主动 close/Esc/关闭按钮关闭 */
  persistent?: boolean
}

export type PopoverPlacement =
  | 'bottom-start'
  | 'bottom-end'
  | 'top-start'
  | 'top-end'
  | 'right-start'
  | 'left-start'
  | 'cover-start' // 视图左上角对齐锚点 rect 左上角（覆盖在元素上，向下延伸）
  | 'cover-end' // 视图右上角对齐锚点 rect 右上角

/** 锚点：触发元素的窗口局部坐标，getBoundingClientRect 直传 */
export type PopoverAnchor =
  | { type: 'rect'; rect: ViewBounds; placement?: PopoverPlacement }
  | { type: 'point'; x: number; y: number; placement?: PopoverPlacement }
  | { type: 'cursor'; placement?: PopoverPlacement } // 面板侧用最近指针位置解析

export type MenuItemType = 'item' | 'separator' | 'submenu' // checkbox 后期扩展

/** 菜单项：纯数据描述，动作靠 id 路由，不携带函数（IPC 不可序列化函数） */
export interface MenuItem {
  id: string
  type?: MenuItemType // 默认 'item'
  label?: string
  icon?: string // 图标名，复用现有 Icon 组件
  shortcut?: string // 纯展示文本（应用内全局快捷键提示）
  accessKey?: string // 单字符助记符（如 'A'）；面板打开期间的临时触发键
  disabled?: boolean
  danger?: boolean // 危险操作红色样式（如关闭标签页）
  children?: MenuItem[] // submenu -> 递归即多级菜单
}

/** 导航错误信息 */
export interface NavigationError {
  code: number
  description: string
}

export type NavigationRunState = 'loading' | 'success' | 'error' | 'crashed'

/** 地址栏安全标志三态 */
export type SecurityState = 'secure' | 'insecure' | 'internal'

export interface NavigationState {
  /** 地址栏显示的 URL（成功=committedUrl；失败=requestedUrl） */
  displayUrl: string
  /** 用户请求访问的 URL（重试用） */
  requestedUrl: string
  /** 最后一次成功 commit 的 URL */
  committedUrl: string
  /** WebContents 当前实际加载的 URL（可能是 wmfx://error） */
  internalUrl: string
  isLoading: boolean
  state: NavigationRunState
  error: NavigationError | null
  securityState: SecurityState
}

export type CertTrustScope = 'once' | 'session' | 'always'

export interface CertWarningInfo {
  host: string
  errorText: string
  requestedUrl: string
}

export interface TabState {
  id: string
  windowId: string
  sessionId: string
  navigation: NavigationState
  title: string
  favicon: string | null
  canGoBack: boolean
  canGoForward: boolean
  zoomFactor: number
  isMuted: boolean
  isPinned: boolean
  active: boolean
  isSuspended: boolean
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
  title?: string
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

/** 主题设置值：用户在设置页选择的值（含 system） */
export type ThemeMode = 'light' | 'dark' | 'system'
/** 最终渲染主题：始终为 'light' 或 'dark'，由 ThemeMode 解析而来 */
export type ResolvedThemeMode = 'light' | 'dark'
/** 搜索引擎 */
export type SearchEngine = 'google' | 'baidu' | 'bing'

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

/** 渲染进程转发到主进程的日志条目 */
export interface LogEntry {
  level: 'debug' | 'log' | 'info' | 'warn' | 'error'
  message: string
}

/** 自动更新状态（electron-updater + GitHub Releases） */
export type UpdaterStatus =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'available'; info: UpdateInfo }
  | { state: 'not-available' }
  | { state: 'downloading'; percent: number }
  | { state: 'downloaded'; info: UpdateInfo }
  | { state: 'error'; message: string }

/** electron-updater 更新信息（版本号、发布说明等） */
export interface UpdateInfo {
  version: string
  releaseDate: string
  releaseName?: string | null
  releaseNotes?: string | Array<{ version?: string; note?: string | null }> | null
}

/** 应用基础信息：关于页展示用 */
export interface AppInfo {
  /** 版本号，如 1.2.0 */
  version: string
  /** 系统架构，如 x64 / arm64 */
  arch: string
  /** 平台，如 darwin / win32 / linux */
  platform: string
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

/** 应用设置快照 */
export interface SettingsSnapshot {
  theme: ThemeMode
  downloadPath: string
  defaultSearch: SearchEngine
  searchEngine: string
  newTabUrl: string
  defaultZoom: number
  zoomFactor: number
  quickLinks: QuickLink[]
  tabOrder: string[]
  openTabs: { url: string; title: string }[]
  activeTabIndex: number
  windowBounds: { x: number; y: number; width: number; height: number } | null
}

/** 设置为默认浏览器结果（setAsDefaultProtocolClient 跨平台生效，返回是否成功） */
export interface SetDefaultBrowserResult {
  success: boolean
  error?: string
}

export interface IpcContract {
  'app:ping': (message: string) => string
  /** 应用基础信息（版本号、系统架构、平台），用于关于页展示 */
  'app:info': () => AppInfo
  'tab:create': (opts: CreateTabOptions) => TabState
  'tab:close': (tabId: string) => void
  'tab:activate': (tabId: string) => void
  'tab:getState': (tabId: string) => TabState
  'tab:getList': () => TabState[]
  'tab:setViewportBounds': (tabId: string, bounds: ViewBounds) => void
  'tab:createNewTab': (sessionId?: string) => TabState
  'nav:goBack': (tabId: string) => void
  'nav:goForward': (tabId: string) => void
  'nav:reload': (tabId: string) => void
  'nav:stop': (tabId: string) => void
  'nav:loadURL': (tabId: string, url: string) => void
  'nav:loadURLCurrent': (url: string) => void
  'session:getPartitions': () => string[]
  // Download
  'download:create': (opts: DownloadCreateOptions) => { id: string }
  'download:pause': (id: string) => void
  'download:resume': (id: string) => void
  'download:cancel': (id: string) => void
  'download:get': (id: string) => DownloadItem | null
  'download:getList': (opts?: DownloadListOptions) => DownloadItem[]
  'download:setPath': (path: string) => void
  // Dialog：原生系统对话框
  /** 打开系统文件夹选择对话框，返回选中的目录路径；用户取消则返回 null */
  'dialog:selectFolder': () => string | null
  // Favicon：网站图标缓存（按 origin / 归一化内部地址为 key）
  /** 查询 favicon 缓存；命中返回 URL，未命中返回 null */
  'favicon:get': (key: string) => string | null
  /** 写入 favicon 缓存（主进程在 page-favicon-updated 时调用，渲染进程一般不直写） */
  'favicon:set': (key: string, url: string) => void
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
  'settings:getAll': () => SettingsSnapshot
  // Theme
  'theme:get': () => ThemeMode
  'theme:set': (theme: ThemeMode) => void
  // New Tab
  'settings:getQuickLinks': () => QuickLink[]
  'settings:setQuickLinks': (links: QuickLink[]) => void
  // Default browser（设置为默认浏览器，交互同 Chrome）
  'default-browser:set': () => SetDefaultBrowserResult
  'default-browser:isDefault': () => boolean
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
  // Tab pin / mute / batch close
  'tab:setPinned': (tabId: string, pinned: boolean) => void
  'tab:setMuted': (tabId: string, muted: boolean) => void
  'tab:closeMany': (ids: string[]) => void
  // Window controls
  'window:minimize': () => void
  'window:maximize': () => void
  'window:close': () => void
  // Proxy
  'proxy:start': () => void
  'proxy:stop': () => void
  'proxy:status': () => { running: boolean; pid?: number; port?: number }
  'proxy:getProxies': () => Record<
    string,
    { name: string; type: string; now?: string; all?: string[] }
  >
  'proxy:switchNode': (groupName: string, nodeName: string) => void
  'proxy:mode': () => string
  'proxy:setMode': (mode: 'rule' | 'global' | 'direct') => void
  'proxy:checkDelay': (groupName: string) => { nodeName: string; delay: number }[]
  // Subscription
  'proxy:getSubscriptions': () => {
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
  'proxy:addSubscription': (url: string, name: string) => { id: string }
  'proxy:removeSubscription': (id: string) => void
  'proxy:updateSubscription': (id: string) => void
  'proxy:activateSubscription': (id: string) => void
  'proxy:deactivateSubscription': (id: string) => void
  // Log
  'log:frontend': (entry: LogEntry) => void
  // Updater
  'updater:check': () => void
  'updater:getStatus': () => UpdaterStatus
  /** 退出并安装已下载好的更新（等价于 electron-updater 的 quitAndInstall） */
  'updater:restart': () => void
  // Popover
  'popover:open': (popoverId: string, options: PopoverOpenOptions) => void
  'popover:close': (popoverId: string) => void
  'popover:data': (popoverId: string, data: unknown) => void
  'popover:panel-event': (payload: PopoverEventPayload) => void
  'popover:event': (payload: PopoverEventPayload) => void
  'popover:render': (
    popoverId: string,
    type: PopoverType,
    anchor: PopoverAnchor,
    data?: unknown,
    mode?: PopoverMode
  ) => void
  'popover:measure': (
    popoverId: string,
    size: { width: number; height: number; gutter?: number }
  ) => void
  'popover:dismiss': (popoverId: string) => void
  // Error / Cert Warning
  'page:getErrorInfo': () => { code: number; description: string; requestedUrl: string } | null
  'page:retry': () => void
  'page:getCertWarningInfo': () => CertWarningInfo | null
  'page:trustCertAndContinue': (scope: CertTrustScope) => void
}

export type IpcChannel = keyof IpcContract

export const IPC_CHANNELS: readonly IpcChannel[] = [
  'app:ping',
  'app:info',
  'tab:create',
  'tab:close',
  'tab:activate',
  'tab:getState',
  'tab:getList',
  'tab:setViewportBounds',
  'tab:createNewTab',
  'nav:loadURLCurrent',
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
  'dialog:selectFolder',
  'favicon:get',
  'favicon:set',
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
  // Default browser
  'default-browser:set',
  'default-browser:isDefault',
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
  // Tab pin / mute / batch close
  'tab:setPinned',
  'tab:setMuted',
  'tab:closeMany',
  // Window controls
  'window:minimize',
  'window:maximize',
  'window:close',
  // Proxy
  'proxy:start',
  'proxy:stop',
  'proxy:status',
  'proxy:getProxies',
  'proxy:switchNode',
  'proxy:mode',
  'proxy:setMode',
  'proxy:checkDelay',
  // Subscription
  'proxy:getSubscriptions',
  'proxy:addSubscription',
  'proxy:removeSubscription',
  'proxy:updateSubscription',
  'proxy:activateSubscription',
  'proxy:deactivateSubscription',
  // Log
  'log:frontend',
  // Updater
  'updater:check',
  'updater:getStatus',
  'updater:restart',
  // Popover
  'popover:open',
  'popover:close',
  'popover:data',
  'popover:panel-event',
  'popover:event',
  'popover:render',
  'popover:dismiss',
  // Error / Cert Warning
  'page:getErrorInfo',
  'page:retry',
  'page:getCertWarningInfo',
  'page:trustCertAndContinue',
] as const

export function isIpcChannel(name: string): name is IpcChannel {
  return (IPC_CHANNELS as readonly string[]).includes(name)
}

/** 渲染进程侧调用类型：invoke 返回 Promise。 */
export type IpcInvoke = {
  [K in IpcChannel]: (...args: Parameters<IpcContract[K]>) => Promise<ReturnType<IpcContract[K]>>
}
