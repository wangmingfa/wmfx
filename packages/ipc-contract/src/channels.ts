/**
 * 所有 IPC 通道的类型契约：通道名 -> (参数) => 返回值。
 * 主进程用它约束 handle，渲染进程用它约束 invoke。
 * 后续里程碑在此扩展（tab:*, nav:*, proxy:* ...）。
 */

import type { NativeMenuItemDescriptor } from './menu'

/** Popover 类型：menu=下拉菜单, addressbar=地址栏建议面板, find=页内查找栏, downloads=下载列表, bookmark-folder=书签文件夹下拉 */
export type PopoverType =
  | 'menu'
  | 'addressbar'
  | 'find'
  | 'downloads'
  | 'bookmark-folder'
  | 'tab-thumbnail'
  | 'command-palette'
  | 'workspace'

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
  /**
   * overlay 模式下的遮罩配置。未配置时遮罩完全透明（仅拦截点击）；
   * 配置后按 color（CSS 颜色，可含 alpha）渲染半透明遮罩并可选 blur（px）背景模糊。
   */
  backdrop?: { color?: string; blur?: number }
  /** 点击遮罩是否关闭面板（默认 true）；设为 false 时点击遮罩不触发关闭 */
  closeOnBackdrop?: boolean
  /** 面板与锚点之间的间距（px），默认 0 */
  gap?: number
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
  isReaderMode: boolean
  /** 网页是否处于 HTML 全屏（Fullscreen API）状态 */
  isHtmlFullscreen: boolean
}

/** 密码管理器条目（主进程返回时密码已解密为明文） */
export interface PasswordEntry {
  id: string
  /** 站点域名或标识，如 example.com */
  domain: string
  username: string
  /** 解密后的明文密码（仅在主进程→渲染进程 IPC 内传输，不落盘明文） */
  password: string
  note?: string
  createdAt: number
  updatedAt: number
}

/** 密码保存入参（新增时无 id，更新时带 id） */
export interface PasswordEntryInput {
  id?: string
  domain: string
  username: string
  password: string
  note?: string
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

/** 广告拦截规则（含来源标记） */
export interface AdBlockRule {
  /** 域名 */
  host: string
  /** 来源：builtin=内置清单 / custom=用户自定义黑名单 / allow=白名单 */
  source: 'builtin' | 'custom' | 'allow'
}

/** 拦截历史条目（单次被拦请求） */
export interface AdBlockLogEntry {
  /** 被拦截的请求 URL */
  url: string
  /** 拦截时间（毫秒时间戳） */
  time: number
  /** 请求主机名 */
  host: string
}

// ---- Request Interceptor types ----

export type RuleAction = 'block' | 'redirect' | 'mock'

export interface InterceptorRule {
  id: string
  name: string
  enabled: boolean
  action: RuleAction
  urlPattern: string
  methods: string[]
  resourceTypes: string[]
  targetUrl?: string
  mockStatusCode?: number
  mockHeaders?: Record<string, string>
  mockBody?: string
  createdAt: number
  updatedAt: number
}

export interface CapturedRequest {
  id: string
  tabId: string
  method: string
  url: string
  statusCode: number
  statusLine: string
  requestHeaders: Record<string, string>
  responseHeaders: Record<string, string>
  type: string
  startTime: number
  endTime: number
  duration: number
  intercepted: boolean
  ruleId?: string
  ruleName?: string
  error?: string
}

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

/** 快捷键元数据（主进程注册表映射而来，纯展示用，不含回调） */
export interface ShortcutInfo {
  id: string
  accelerator: string
  scope: 'in-app' | 'global'
  group: 'navigation' | 'tab' | 'window' | 'devtools'
  description: Record<string, string>
  /** true = 设置页不展示，快捷键仍生效 */
  hidden?: boolean
}

/** 工作区（Arc-style Space） */
export interface Workspace {
  id: string
  name: string
  color: string
  position: number
  /** 实时计算的标签数量，非持久化 */
  tabCount: number
  createdAt: number
  updatedAt: number
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
  /** history: 本地历史记录；bookmark: 本地书签；search: 地址栏"用X搜索"直达项；engine: 搜索引擎实时建议 */
  type: 'history' | 'bookmark' | 'search' | 'engine'
  title: string
  url: string
}

/** 命令面板打开时一次性获取的数据 */
export interface CommandPaletteData {
  tabs: TabState[]
  history: HistoryItem[]
  bookmarks: BookmarkItem[]
  recentActions: string[]
}

// ─── 文件浏览器类型 ─────────────────────────────────────────

/** 文件/目录条目 */
export interface FileEntry {
  name: string
  path: string
  isDir: boolean
  size: number
  modifiedAt: number
  createdAt: number
  extension: string
  isHidden: boolean
}

/** 文件状态 */
export interface FileStat {
  size: number
  isDir: boolean
  isFile: boolean
  isSymbolicLink: boolean
  modifiedAt: number
  createdAt: number
  permissions: string
}

/** 文件预览数据 */
export interface PreviewData {
  type: 'image' | 'text' | 'pdf' | 'audio' | 'video' | 'unknown'
  fileName: string
  fileSize: number
  modifiedAt?: number
  mimeType?: string
  data?: string
  truncated?: boolean
  dimensions?: { width: number; height: number }
}

/** 文件浏览器书签 */
export interface FileBookmark {
  id: string
  name: string
  path: string
  icon: string
}

/** 系统常用目录 */
export interface SystemDir {
  name: string
  path: string
  icon: string
}

/** 应用内剪贴板数据 */
export interface ClipboardData {
  paths: string[]
  operation: 'copy' | 'cut'
}

/** FTP 连接选项 */
export interface FtpConnectOptions {
  host: string
  port?: number
  user?: string
  password?: string
}

/** SFTP 连接选项 */
export interface SftpConnectOptions {
  host: string
  port?: number
  user?: string
  password?: string
  privateKeyPath?: string
  privateKeyPassword?: string
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
  showBookmarkBar: boolean
  openBookmarkInNewTab: boolean
  forceDark: boolean
  tabBarPosition: 'top' | 'left'
  /** 垂直标签栏是否折叠 */
  tabBarCollapsed: boolean
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
  'download:delete': (id: string) => void
  'download:get': (id: string) => DownloadItem | null
  'download:getList': (opts?: DownloadListOptions) => DownloadItem[]
  'download:setPath': (path: string) => void
  // Dialog：原生系统对话框
  /** 打开系统文件夹选择对话框，返回选中的目录路径；用户取消则返回 null */
  'dialog:selectFolder': () => string | null
  // 文件系统
  'fs:fileExists': (path: string) => boolean
  'fs:readDir': (dirPath: string) => FileEntry[]
  'fs:stat': (filePath: string) => FileStat
  'fs:mkdir': (dirPath: string) => void
  'fs:rename': (oldPath: string, newPath: string) => void
  'fs:delete': (paths: string[]) => void
  'fs:copy': (sources: string[], dest: string) => void
  'fs:cut': (sources: string[], dest: string) => void
  'fs:paste': (dest: string) => void
  'fs:search': (dirPath: string, query: string) => FileEntry[]
  'fs:readPreview': (filePath: string) => PreviewData
  'fs:getSystemDirs': () => SystemDir[]
  'fs:getBookmarks': () => FileBookmark[]
  'fs:addBookmark': (dirPath: string, name: string) => void
  'fs:removeBookmark': (id: string) => void
  'fs:renameBookmark': (id: string, name: string) => void
  'fs:reorderBookmarks': (ids: string[]) => void
  // 实时监听：渲染进程请求主进程对指定目录建立/释放 fs.watch
  /** 开始监听目录变化（按目录路径引用计数，多标签共享同一 watcher） */
  'fs:watch': (dirPath: string) => void
  /** 停止监听目录变化（引用计数归零时关闭 watcher） */
  'fs:unwatch': (dirPath: string) => void
  // 剪贴板
  'clipboard:copy': (text: string) => void
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
  'history:getAll': () => HistoryItem[]
  'history:clear': () => void
  'privacy:clearData': (opts: {
    types: ('cookies' | 'cache' | 'localStorage' | 'formData')[]
  }) => void
  // Bookmark
  'bookmark:add': (item: BookmarkCreateOptions) => { id: string }
  'bookmark:delete': (id: string) => void
  'bookmark:rename': ({ id, title }: { id: string; title: string }) => void
  'bookmark:getList': (parentId?: string | null) => BookmarkItem[]
  'bookmark:getListByWorkspace': (parentId?: string | null) => BookmarkItem[]
  'bookmark:search': ({ query }: { query: string }) => BookmarkItem[]
  'bookmark:import': (html: string) => void
  'bookmark:export': () => { html: string }
  'bookmark:move': (opts: { id: string; parentId?: string | null; position: number }) => void
  'bookmark:drag-start': (id: string) => void
  'bookmark:drag-drop': (opts: { targetParentId?: string | null; targetPosition: number }) => void
  'bookmark:drag-get': () => string | null
  'bookmark:openFolder': (folderId: string) => void
  // Page
  'page:print': (opts: TabPrintOptions) => void
  'page:printToPDF': (opts: TabPrintToPdfOptions) => { path: string }
  'page:setZoom': (opts: TabZoomOptions) => void
  'page:getZoom': (tabId: string) => { factor: number }
  // Reader mode
  'page:enterReadingMode': (tabId: string) => void
  'page:exitReadingMode': (tabId: string) => void
  'reader:article': (article: {
    title: string
    content: string
    byline: string | null
    url: string
  }) => void
  /** 渲染进程主动拉取当前 tab 已提取的阅读文章（首次进入竞态兜底）；无则返回 null */
  'reader:requestArticle': (
    tabId: string
  ) => { title: string; content: string; byline: string | null; url: string } | null
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
  // Password manager
  /** 列出全部密码（密码已解密） */
  'password:list': () => PasswordEntry[]
  /** 搜索密码（按域名/用户名） */
  'password:search': (opts: { query: string }) => PasswordEntry[]
  /** 新增或更新密码（带 id 为更新） */
  'password:save': (input: PasswordEntryInput) => PasswordEntry
  /** 删除密码 */
  'password:delete': (id: string) => void
  // Default browser（设置为默认浏览器，交互同 Chrome）
  'default-browser:set': () => SetDefaultBrowserResult
  'default-browser:isDefault': () => boolean
  // Ad blocker
  /** 返回广告拦截状态：是否启用、被拦截计数、规则总数 */
  'adblock:getStatus': () => { enabled: boolean; blockedCount: number; ruleCount: number }
  /** 切换广告拦截开关 */
  'adblock:setEnabled': (enabled: boolean) => void
  /** 返回全部规则（含来源标记），供 UI 展示 */
  'adblock:getRules': () => AdBlockRule[]
  /** 返回拦截历史（按时间倒序），供「拦截历史」弹窗展示 */
  'adblock:getLog': () => AdBlockLogEntry[]
  // Request Interceptor
  'interceptor:getStatus': () => { enabled: boolean; capturedCount: number; ruleCount: number }
  'interceptor:setEnabled': (enabled: boolean) => void
  'interceptor:getRules': () => InterceptorRule[]
  'interceptor:addRule': (rule: InterceptorRule) => void
  'interceptor:updateRule': (rule: InterceptorRule) => void
  'interceptor:deleteRule': (ruleId: string) => void
  'interceptor:getCaptured': (opts?: { limit?: number; offset?: number }) => CapturedRequest[]
  'interceptor:clearLog': () => void
  // Autocomplete
  'autocomplete:suggestions': (opts: AutocompleteQuery) => AutocompleteSuggestion[]
  // Bookmark
  'bookmark:isBookmarked': (url: string) => BookmarkCheckResult
  'bookmarks:changed': () => void
  // 文件浏览器实时变更（主进程 fs.watch 触发，广播到所有渲染窗口）
  /** 目录内容发生变化：payload 为发生变化的目录路径，渲染进程据此重载对应目录 */
  'fs:changed': (dirPath: string) => void
  // Find in Page
  'page:startFind': (opts: FindInPageOptions) => void
  'page:endFind': (tabId: string) => void
  'page:findNext': (opts: FindInPageDirection) => void
  'page:findPrevious': (opts: FindInPageDirection) => void
  // Tab reorder
  'tab:reorder': (ids: string[]) => void
  // Tab thumbnail capture
  /** 截取指定标签页的页面缩略图，返回 PNG data URL；标签不存在或已销毁时返回 null */
  'tab:captureThumbnail': (tabId: string) => string | null
  // Tab pin / mute / batch close
  'tab:setPinned': (tabId: string, pinned: boolean) => void
  'tab:setMuted': (tabId: string, muted: boolean) => void
  'tab:closeMany': (ids: string[]) => void
  // Undo close tab
  /** 撤销最近一次关闭：从已关闭标签栈恢复。栈空时无操作。 */
  'tab:reopenClosed': () => void
  // Window controls
  /**
   * 新建浏览器窗口。
   * - 默认：普通窗口
   * - `incognito: true`：独立无痕窗口（整窗内存 partition，关闭即焚）
   */
  'window:new': (opts?: { url?: string; incognito?: boolean }) => void
  /** 返回当前窗口信息（是否无痕、窗口 id），供渲染端判断窗口类型 */
  'window:getInfo': () => { isIncognito: boolean; windowId: string }
  'window:minimize': () => void
  'window:maximize': () => void
  'window:close': () => void
  /** macOS 交通灯显示/隐藏（null 隐藏，坐标显示） */
  'window:setTrafficLightVisible': (visible: boolean) => void
  // Shell (download closure)
  /** 打开设置页（主进程快捷键回调经 focused 窗口广播，渲染进程据此导航到 wmfx://settings） */
  'shell:openSettings': () => void
  /** 在文件管理器中显示指定文件 */
  'shell:showInFolder': (filePath: string) => void
  /** 用系统默认应用打开文件 */
  'shell:openFile': (filePath: string) => void
  /** 在应用内浏览器标签页中打开本地文件（本地路径 → wmfx://files 路由） */
  'shell:openFileInBrowser': (filePath: string) => void
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
    mode?: PopoverMode,
    backdrop?: { color?: string; blur?: number },
    closeOnBackdrop?: boolean
  ) => void
  'popover:measure': (
    popoverId: string,
    size: { width: number; height: number; gutter?: number; offsetX?: number; offsetY?: number }
  ) => void
  'popover:dismiss': (popoverId: string) => void
  // Error / Cert Warning
  'page:getErrorInfo': () => { code: number; description: string; requestedUrl: string } | null
  'page:retry': () => void
  'page:getCertWarningInfo': () => CertWarningInfo | null
  'page:trustCertAndContinue': (scope: CertTrustScope) => void
  // Shortcuts
  /** 返回所有已声明快捷键的元数据（不含回调），供设置页展示 */
  'shortcuts:list': () => ShortcutInfo[]
  // Native Menu
  'native-menu:open': (
    menuId: string,
    items: NativeMenuItemDescriptor[],
    position?: { x: number; y: number }
  ) => Promise<void>
  'native-menu:close': (menuId: string) => Promise<void>
  'native-menu:action': (payload: { menuId: string; itemId: string }) => void
  'native-menu:closed': (menuId: string) => void
  // Command Palette
  'commandPalette:getData': () => CommandPaletteData
  'commandPalette:execute': (opts: { type: string; id: string; data?: unknown }) => void
  'commandPalette:saveRecent': (actionId: string) => void
  // Workspace
  'workspace:list': () => Workspace[]
  'workspace:create': (name: string, color: string) => Workspace
  'workspace:update': (
    id: string,
    patch: { name?: string; color?: string; position?: number }
  ) => Workspace
  'workspace:delete': (id: string) => void
  'workspace:switchTo': (id: string) => void
  'workspace:getActive': () => Workspace | null
  'workspace:reorder': (ids: string[]) => void
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
  'download:delete',
  'dialog:selectFolder',
  'fs:fileExists',
  'fs:readDir',
  'fs:stat',
  'fs:mkdir',
  'fs:rename',
  'fs:delete',
  'fs:copy',
  'fs:cut',
  'fs:paste',
  'fs:search',
  'fs:readPreview',
  'fs:getSystemDirs',
  'fs:getBookmarks',
  'fs:addBookmark',
  'fs:removeBookmark',
  'fs:renameBookmark',
  'fs:reorderBookmarks',
  'fs:watch',
  'fs:unwatch',
  'fs:changed',
  'clipboard:copy',
  'favicon:get',
  'favicon:set',
  // History
  'history:add',
  'history:delete',
  'history:search',
  'history:getList',
  'history:getAll',
  'history:clear',
  'privacy:clearData',
  // Bookmark
  'bookmark:add',
  'bookmark:delete',
  'bookmark:rename',
  'bookmark:getList',
  'bookmark:getListByWorkspace',
  'bookmark:search',
  'bookmark:import',
  'bookmark:export',
  'bookmark:move',
  'bookmark:drag-start',
  'bookmark:drag-drop',
  'bookmark:drag-get',
  'bookmark:openFolder',
  // Page
  'page:print',
  'page:printToPDF',
  'page:setZoom',
  'page:getZoom',
  // Reader mode
  'page:enterReadingMode',
  'page:exitReadingMode',
  'reader:article',
  'reader:requestArticle',
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
  // Password manager
  'password:list',
  'password:search',
  'password:save',
  'password:delete',
  // Default browser
  'default-browser:set',
  'default-browser:isDefault',
  // Ad blocker
  'adblock:getStatus',
  'adblock:setEnabled',
  'adblock:getRules',
  'adblock:getLog',
  // Request Interceptor
  'interceptor:getStatus',
  'interceptor:setEnabled',
  'interceptor:getRules',
  'interceptor:addRule',
  'interceptor:updateRule',
  'interceptor:deleteRule',
  'interceptor:getCaptured',
  'interceptor:clearLog',
  // Autocomplete
  'autocomplete:suggestions',
  // Bookmark
  'bookmark:isBookmarked',
  'bookmarks:changed',
  // Find in Page
  'page:startFind',
  'page:endFind',
  'page:findNext',
  'page:findPrevious',
  // Tab reorder
  'tab:reorder',
  // Tab thumbnail
  'tab:captureThumbnail',
  // Tab pin / mute / batch close
  'tab:setPinned',
  'tab:setMuted',
  'tab:closeMany',
  // Undo close tab
  'tab:reopenClosed',
  // Window controls
  'window:new',
  'window:getInfo',
  'window:minimize',
  'window:maximize',
  'window:close',
  'window:setTrafficLightVisible',
  // Shell (download closure)
  'shell:showInFolder',
  'shell:openFile',
  'shell:openSettings',
  'shell:openFileInBrowser',
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
  // Shortcuts
  'shortcuts:list',
  // Native Menu
  'native-menu:open',
  'native-menu:close',
  'native-menu:action',
  'native-menu:closed',
  // Command Palette
  'commandPalette:getData',
  'commandPalette:execute',
  'commandPalette:saveRecent',
  // Workspace
  'workspace:list',
  'workspace:create',
  'workspace:update',
  'workspace:delete',
  'workspace:switchTo',
  'workspace:getActive',
  'workspace:reorder',
] as const

export function isIpcChannel(name: string): name is IpcChannel {
  const ok = (IPC_CHANNELS as readonly string[]).includes(name)
  console.debug('[IPC] isIpcChannel: name result', name, ok)
  return ok
}

/** 渲染进程侧调用类型：invoke 返回 Promise。 */
export type IpcInvoke = {
  [K in IpcChannel]: (...args: Parameters<IpcContract[K]>) => Promise<ReturnType<IpcContract[K]>>
}
