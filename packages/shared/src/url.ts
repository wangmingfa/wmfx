export interface AddressBarResult {
  type: 'url' | 'search'
  value: string
}

const DOMAIN_LIKE = /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/.*)?$/i

export function normalizeAddressBarInput(input: string): AddressBarResult {
  const trimmed = input.trim()
  if (/^https?:\/\//i.test(trimmed)) {
    return { type: 'url', value: trimmed }
  }
  if (!trimmed.includes(' ') && DOMAIN_LIKE.test(trimmed)) {
    return { type: 'url', value: `https://${trimmed}` }
  }
  return { type: 'search', value: trimmed }
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

/** 新标签页默认地址。集中在此，未来支持「用户自定义新标签页地址」只需改这一处（或改 createNewTab 读设置）。 */
export const NEW_TAB_URL = `${WMFX_SCHEME}newtab`

export const INTERNAL_ROUTE_PREFIXES: readonly string[] = [
  '/settings',
  '/history',
  '/bookmarks',
  '/downloads',
  '/proxy',
  '/newtab',
]

/** 内部页标题：由 path 首段映射到菜单名（create() 设置 tab.title 用） */
const INTERNAL_TITLE_MAP: Record<string, string> = {
  settings: 'Settings',
  history: 'History',
  bookmarks: 'Bookmarks',
  downloads: 'Downloads',
  proxy: 'Proxy',
  newtab: 'New Tab',
}

/** 由 wmfx:// 之后的 path 推导展示标题，如 'settings/appearance' → 'Settings' */
export function internalTitleFromPath(path: string): string {
  const top = path.split('/')[0] ?? ''
  return INTERNAL_TITLE_MAP[top] ?? 'Internal'
}

/** 判断是否为 wmfx:// 内部地址 */
export function isWmfxUrl(url: string): boolean {
  return url.startsWith(WMFX_SCHEME)
}

/** 取 wmfx:// 之后的路径段，如 'settings/appearance' 或 'history' */
export function wmfxPath(url: string): string {
  return url.slice(WMFX_SCHEME.length)
}

/**
 * 把实际加载地址（file://...#/x 或 http://.../#/x）还原为 wmfx:// 展示地址；
 * 若 hash 非内部路由前缀则返回 null（视为外部页）。
 */
export function wmfxFromActualUrl(actual: string): string | null {
  const i = actual.indexOf('#/')
  if (i < 0) return null
  const hashPath = actual.slice(i + 1)
  if (!INTERNAL_ROUTE_PREFIXES.some((p) => hashPath.startsWith(p))) return null
  return WMFX_SCHEME + hashPath.slice(1)
}
