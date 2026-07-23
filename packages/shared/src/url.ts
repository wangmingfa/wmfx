import { messages } from './i18n/messages'

export interface AddressBarResult {
  type: 'url' | 'search'
  value: string
}

const DOMAIN_LIKE = /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/.*)?$/i

/** 本地路径匹配模式（Unix/Windows/相对路径） */
const LOCAL_PATH_PATTERNS = [
  /^\/[\w\-./]+$/, // Unix: /home/user/docs
  /^[A-Z]:[/\\][\w\-./\\]+$/i, // Windows: C:/Users/x or C:\Users\x
  /^~\/[\w\-./]+$/, // Unix short: ~/Documents
  /^\.\.?\/[\w\-./]+$/, // Relative: ./src, ../tmp
]

/** 判断是否为本地文件系统路径（用于地址栏自动检测） */
export function isLocalPath(input: string): boolean {
  return LOCAL_PATH_PATTERNS.some((p) => p.test(input))
}

/** 将本地路径规范化为正斜杠格式（Windows 反斜杠统一为正斜杠） */
export function normalizeLocalPath(input: string): string {
  return input.replace(/\\/g, '/')
}

/** 各搜索引擎的搜索地址前缀（查询参数拼在后面）。 */
export const SEARCH_ENGINE_BASE: Record<string, string> = {
  google: 'https://www.google.com/search?q=',
  baidu: 'https://www.baidu.com/s?wd=',
  bing: 'https://www.bing.com/search?q=',
}

export function normalizeAddressBarInput(input: string): AddressBarResult {
  console.debug('[url] normalizeAddressBarInput: input', input)
  const trimmed = input.trim()
  if (/^https?:\/\//i.test(trimmed)) {
    console.debug('[url] normalizeAddressBarInput: 命中 http(s) 前缀, 按 url 处理')
    return { type: 'url', value: trimmed }
  }
  if (/^wmfx:\/\//i.test(trimmed)) {
    console.debug('[url] normalizeAddressBarInput: 命中 wmfx:// 前缀, 按 url 处理')
    return { type: 'url', value: trimmed }
  }
  if (isLocalPath(trimmed)) {
    console.debug('[url] normalizeAddressBarInput: 命中本地路径, 按 url 处理')
    return { type: 'url', value: normalizeLocalPath(trimmed) }
  }
  if (!trimmed.includes(' ') && DOMAIN_LIKE.test(trimmed)) {
    console.debug('[url] normalizeAddressBarInput: 类域名, 补充 https:// 前缀')
    return { type: 'url', value: `https://${trimmed}` }
  }
  console.debug('[url] normalizeAddressBarInput: 视作搜索词, type=search')
  return { type: 'search', value: trimmed }
}

/**
 * 把地址栏输入解析为最终要加载的 URL：
 * - 链接（http(s) 或类域名）按原流程走；
 * - 否则用指定搜索引擎构造搜索 URL。
 * searchEngine 取设置值（'google' | 'baidu' | 'bing'），缺省回退 google。
 */
export function resolveAddressBarTarget(input: string, searchEngine: string): string {
  console.debug('[url] resolveAddressBarTarget: input searchEngine', input, searchEngine)
  const { type, value } = normalizeAddressBarInput(input)
  if (type === 'url') {
    // 本地路径 → wmfx://files/xxx，由文件浏览器处理
    if (isLocalPath(value)) {
      const normalized = normalizeLocalPath(value)
      const url = `${WMFX_SCHEME}files/${normalized}`
      console.debug('[url] resolveAddressBarTarget: 本地路径转 wmfx://files', value, '→', url)
      return url
    }
    console.debug('[url] resolveAddressBarTarget: 直接返回 url', value)
    return value
  }
  const base = SEARCH_ENGINE_BASE[searchEngine] ?? SEARCH_ENGINE_BASE.google
  const target = `${base}${encodeURIComponent(value)}`
  console.debug('[url] resolveAddressBarTarget: 构造搜索 url', target)
  return target
}

/** 地址栏显示 URL：将 wmfx://files/xxx 还原为原始本地路径 /xxx，其他 URL 原样返回 */
export function formatAddressBarUrl(url: string): string {
  const prefix = `${WMFX_SCHEME}files/`
  if (url.startsWith(prefix)) {
    const raw = url.slice(prefix.length)
    // hash 路由中路径可能被编码（空格/%2F 等），还原为用户可读的原始路径
    let localPath = raw
    try {
      localPath = decodeURIComponent(raw)
    } catch {
      /* 非编码字符串，原样返回 */
    }
    console.debug('[url] formatAddressBarUrl: wmfx://files →', localPath)
    return localPath
  }
  return url
}

/**
 * 内部页面（wmfx://）的路由前缀集合。
 *
 * 主进程（internal-url.ts）用它在 `did-navigate` 时判别「当前加载的是内部页还是外部站
 * 点」；渲染进程（router.ts）用它声明内部路由。两侧共用同一份常量，避免各写一份导致
 * 不一致，也避免 main 反向依赖 renderer 造成的循环依赖。放在 @browser/shared 是因为
 * 主/渲染两侧都已依赖它。
 */
export const WMFX_SCHEME = 'wmfx://'

/**
 * wmfx scheme 的裸名称（不带 `://`）。
 * `protocol.registerSchemesAsPrivileged` 与 `protocol.handle` 需要的是裸 scheme 名，
 * 不能传 `'wmfx://'`，否则协议无法识别（表现为 ERR_UNKNOWN_URL_SCHEME）。
 */
export const WMFX_SCHEME_NAME = 'wmfx'

/** 新标签页默认地址。集中在此，未来支持「用户自定义新标签页地址」只需改这一处（或改 createNewTab 读设置）。 */
export const NEW_TAB_URL = `${WMFX_SCHEME}newtab`

export const INTERNAL_ROUTE_PREFIXES: readonly string[] = [
  '/settings',
  '/history',
  '/bookmarks',
  '/downloads',
  '/proxy',
  '/passwords',
  '/newtab',
  '/error',
  '/cert-warning',
  '/interceptor',
  '/files',
  '/ftp',
  '/sftp',
]

/** 内部页标题硬编码映射：由 path 首段映射到中文菜单名（向后兼容用）。 */
const INTERNAL_TITLE_MAP: Record<string, string> = {
  settings: '设置',
  history: '历史',
  bookmarks: '书签',
  downloads: '下载',
  proxy: '代理',
  newtab: '新标签页',
  interceptor: '请求拦截',
  files: '文件',
  ftp: 'FTP',
  sftp: 'SFTP',
}

/** 由 wmfx:// 之后的 path 推导展示标题，如 'settings/appearance' → 'Settings'（支持 i18n）。 */
export function internalTitleFromPath(path: string, lang: string = 'zh-CN'): string {
  console.debug('[url] internalTitleFromPath: path lang', path, lang)
  const top = path.split('/')[0] ?? ''
  if (lang === 'zh-CN') {
    const title = INTERNAL_TITLE_MAP[top] ?? 'Internal'
    console.debug('[url] internalTitleFromPath: 中文标题', title)
    return title
  }
  const msg = messages[lang] ?? messages['zh-CN']
  const topToKey: Record<string, string> = {
    settings: 'settings',
    history: 'history',
    bookmarks: 'bookmarks',
    downloads: 'downloads',
    proxy: 'proxy',
    newtab: 'newTab',
  }
  const msgKey = topToKey[top]
  if (msgKey === 'newTab') {
    console.debug('[url] internalTitleFromPath: 使用 newTab 标题')
    return msg.newTab.title
  }
  const appMenuKey = msgKey as keyof typeof msg.appMenu
  if (appMenuKey && msg.appMenu?.[appMenuKey]) {
    console.debug('[url] internalTitleFromPath: 使用 appMenu 标题 key', appMenuKey)
    return msg.appMenu[appMenuKey]
  }
  console.debug('[url] internalTitleFromPath: 未匹配, 回退 Internal')
  return 'Internal'
}

/** 判断是否为 wmfx:// 内部地址 */
export function isWmfxUrl(url: string): boolean {
  const ok = url.startsWith(WMFX_SCHEME)
  console.debug('[url] isWmfxUrl: url result', url, ok)
  return ok
}

/** 取 wmfx:// 之后的路径段，如 'settings/appearance' 或 'history' */
export function wmfxPath(url: string): string {
  const path = url.slice(WMFX_SCHEME.length)
  console.debug('[url] wmfxPath: url path', url, path)
  return path
}

/**
 * 把实际加载地址（file://...#/x 或 http://.../#/x）还原为 wmfx:// 展示地址；
 * 若 hash 非内部路由前缀则返回 null（视为外部页）。
 */
export function wmfxFromActualUrl(actual: string): string | null {
  console.debug('[url] wmfxFromActualUrl: actual', actual)
  const i = actual.indexOf('#/')
  if (i < 0) {
    console.debug('[url] wmfxFromActualUrl: 无 #/ 片段, 非内部页')
    return null
  }
  const hashPath = actual.slice(i + 1)
  if (!INTERNAL_ROUTE_PREFIXES.some((p) => hashPath.startsWith(p))) {
    console.debug('[url] wmfxFromActualUrl: hash 非内部路由前缀, 视为外部页')
    return null
  }
  const result = WMFX_SCHEME + hashPath.slice(1)
  console.debug('[url] wmfxFromActualUrl: 还原内部地址', result)
  return result
}

/**
 * 内部地址归一化：保留 wmfx:// + path，剔除 query（与 hash），用于 favicon 缓存 key。
 * 例如 'wmfx://settings/appearance?x=1' → 'wmfx://settings/appearance'。
 */
export function normalizeWmfxUrl(url: string): string {
  const path = wmfxPath(url).split('?')[0].split('#')[0]
  const result = WMFX_SCHEME + path
  console.debug('[url] normalizeWmfxUrl: url normalized', url, result)
  return result
}

/**
 * 计算 favicon 缓存 key：
 * - 内部地址（wmfx://）→ 归一化全链接（剔 query/hash），同一内部页不同参数共享图标
 * - 外部 http(s) 地址 → origin（含协议），如 'https://www.google.com'，协议不同视作不同 key
 * - 无法解析（about:blank 等）→ ''（不缓存）
 */
export function faviconKeyOf(url: string): string {
  console.debug('[url] faviconKeyOf: url', url)
  if (!url) {
    console.debug('[url] faviconKeyOf: 空 url, 返回空 key')
    return ''
  }
  if (isWmfxUrl(url)) {
    const key = normalizeWmfxUrl(url)
    console.debug('[url] faviconKeyOf: 内部地址 key', key)
    return key
  }
  try {
    const origin = new URL(url).origin
    console.debug('[url] faviconKeyOf: 外部地址 origin', origin)
    return origin
  } catch {
    console.debug('[url] faviconKeyOf: URL 解析失败, 返回空 key')
    return ''
  }
}
