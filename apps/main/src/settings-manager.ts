import type {
  InterceptorRule,
  QuickLink,
  SearchEngine,
  SettingsSnapshot,
  ThemeMode,
} from '@browser/ipc-contract'
import { nativeTheme } from 'electron'
import Store from 'electron-store'

export type LaunchBehavior = 'restore' | 'newtab' | 'homepage'

interface SettingsSchema {
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
  currentLang: 'zh-CN' | 'en-US' | 'system'
  trustedCerts: { host: string; errorText: string }[]
  showBookmarkBar: boolean
  openBookmarkInNewTab: boolean
  searchSuggestions: boolean
  launchBehavior: LaunchBehavior
  defaultFont: string
  defaultFontSize: number
  defaultEncoding: string
  adBlockEnabled: boolean
  adBlockCustomRules: string[]
  adBlockAllowlist: string[]
  forceDark: boolean
  tabBarPosition: 'top' | 'left'
  interceptorEnabled: boolean
  interceptorRules: InterceptorRule[]
}

export const defaultSettings: SettingsSchema = {
  theme: 'dark',
  downloadPath: '',
  defaultSearch: 'google',
  searchEngine: 'google',
  newTabUrl: 'https://www.baidu.com',
  defaultZoom: 1,
  zoomFactor: 1,
  quickLinks: [],
  tabOrder: [],
  openTabs: [],
  activeTabIndex: 0,
  windowBounds: null,
  currentLang: 'zh-CN',
  trustedCerts: [],
  showBookmarkBar: false,
  openBookmarkInNewTab: false,
  searchSuggestions: true,
  launchBehavior: 'restore',
  defaultFont: 'system-ui',
  defaultFontSize: 16,
  defaultEncoding: 'utf-8',
  adBlockEnabled: true,
  adBlockCustomRules: [],
  adBlockAllowlist: [],
  forceDark: true,
  tabBarPosition: 'top',
  interceptorEnabled: false,
  interceptorRules: [],
}

/** 校验 theme 值 */
function validateTheme(v: unknown): ThemeMode {
  if (['light', 'dark', 'system'].includes(v as string)) return v as ThemeMode
  return defaultSettings.theme
}

/** 校验 defaultSearch 值 */
function validateDefaultSearch(v: unknown): SearchEngine {
  if (['google', 'baidu', 'bing'].includes(v as string)) return v as SearchEngine
  return defaultSettings.defaultSearch
}

/** 校验字符串非空，返回值 trim */
function validateString(v: unknown, fallback: string): string {
  if (typeof v === 'string' && v.trim() !== '') return v.trim()
  return fallback
}

/** 校验数字范围 */
function validateNumber(v: unknown, fallback: number, min?: number, max?: number): number {
  if (typeof v !== 'number' || Number.isNaN(v)) return fallback
  if (min !== undefined && v < min) return fallback
  if (max !== undefined && v > max) return fallback
  return v
}

/** 校验 QuickLink 数组 */
function validateQuickLinks(v: unknown): QuickLink[] {
  if (Array.isArray(v)) {
    return v.filter(
      (item): item is QuickLink =>
        item != null &&
        typeof item === 'object' &&
        typeof (item as QuickLink).id === 'string' &&
        (item as QuickLink).id.trim() !== '' &&
        typeof (item as QuickLink).title === 'string' &&
        (item as QuickLink).title.trim() !== '' &&
        typeof (item as QuickLink).url === 'string' &&
        (item as QuickLink).url.trim() !== ''
    )
  }
  return []
}

/** 校验字符串数组 */
function validateStringArray(v: unknown): string[] {
  if (Array.isArray(v)) {
    return v.filter((x): x is string => typeof x === 'string' && x.trim() !== '')
  }
  return []
}

/** 校验 openTabs 数组 */
function validateOpenTabs(v: unknown): { url: string; title: string }[] {
  if (Array.isArray(v)) {
    return v.filter(
      (item): item is { url: string; title: string } =>
        item != null &&
        typeof item === 'object' &&
        typeof (item as { url: string; title: string }).url === 'string' &&
        (item as { url: string; title: string }).url.trim() !== '' &&
        typeof (item as { url: string; title: string }).title === 'string' &&
        (item as { url: string; title: string }).title.trim() !== ''
    )
  }
  return []
}

/** 校验 windowBounds */
function validateWindowBounds(
  v: unknown
): { x: number; y: number; width: number; height: number } | null {
  if (v === null || v === undefined) return null
  if (typeof v !== 'object') return null
  const obj = v as Record<string, unknown>
  if (
    typeof obj.x === 'number' &&
    typeof obj.y === 'number' &&
    typeof obj.width === 'number' &&
    typeof obj.height === 'number'
  ) {
    return obj as { x: number; y: number; width: number; height: number }
  }
  return null
}

export class SettingsManager {
  private static instance: SettingsManager
  private store: Store<SettingsSchema>

  private constructor() {
    console.debug('[SettingsManager] constructor: initializing store')
    this.store = new Store<SettingsSchema>({
      name: 'wmfx-settings',
      defaults: defaultSettings,
    })
  }

  static getInstance(): SettingsManager {
    console.debug('[SettingsManager] getInstance')
    if (!SettingsManager.instance) {
      SettingsManager.instance = new SettingsManager()
    }
    return SettingsManager.instance
  }

  get<K extends keyof SettingsSchema>(key: K): SettingsSchema[K] {
    console.debug('[SettingsManager] get: key', key)
    return this.store.get(key) as SettingsSchema[K]
  }

  set<K extends keyof SettingsSchema>(key: K, value: SettingsSchema[K]): void {
    console.debug(`[SettingsManager] set: key`, key)
    const validated = this.validateValue(key, value)
    console.debug('[SettingsManager] set: validated key', key)
    this.store.set(key, validated)
    if (key === 'theme') {
      console.debug('[SettingsManager] set: theme changed, applying native theme')
      this.setNativeTheme()
    }
  }

  private validateValue<K extends keyof SettingsSchema>(
    key: K,
    value: SettingsSchema[K]
  ): SettingsSchema[K] {
    console.debug('[SettingsManager] validateValue: key', key)
    switch (key) {
      case 'theme':
        return validateTheme(value) as SettingsSchema[K]
      case 'defaultSearch':
        return validateDefaultSearch(value) as SettingsSchema[K]
      case 'searchEngine':
        return validateString(value, defaultSettings.searchEngine) as SettingsSchema[K]
      case 'newTabUrl': {
        const url = validateString(value, defaultSettings.newTabUrl)
        if (url.startsWith('http://') || url.startsWith('https://')) {
          return url as SettingsSchema[K]
        }
        return defaultSettings.newTabUrl as SettingsSchema[K]
      }
      case 'defaultZoom':
        return validateNumber(value, defaultSettings.defaultZoom, 0.5, 3) as SettingsSchema[K]
      case 'zoomFactor':
        return validateNumber(value, defaultSettings.zoomFactor, 0.1, 5) as SettingsSchema[K]
      case 'quickLinks':
        return validateQuickLinks(value) as SettingsSchema[K]
      case 'tabOrder':
        return validateStringArray(value) as SettingsSchema[K]
      case 'openTabs':
        return validateOpenTabs(value) as SettingsSchema[K]
      case 'activeTabIndex':
        return validateNumber(value, defaultSettings.activeTabIndex, 0) as SettingsSchema[K]
      case 'windowBounds':
        return validateWindowBounds(value) as SettingsSchema[K]
      case 'downloadPath':
        return validateString(value, defaultSettings.downloadPath) as SettingsSchema[K]
      case 'currentLang': {
        if (['zh-CN', 'en-US', 'system'].includes(value as string))
          return value as SettingsSchema[K]
        return defaultSettings.currentLang as SettingsSchema[K]
      }
      case 'trustedCerts': {
        if (!Array.isArray(value)) return defaultSettings.trustedCerts as SettingsSchema[K]
        return value.filter(
          (item) =>
            item != null &&
            typeof item === 'object' &&
            typeof (item as { host?: unknown }).host === 'string' &&
            typeof (item as { errorText?: unknown }).errorText === 'string'
        ) as SettingsSchema[K]
      }
      case 'showBookmarkBar':
      case 'openBookmarkInNewTab':
      case 'searchSuggestions':
        return typeof value === 'boolean'
          ? (value as SettingsSchema[K])
          : (defaultSettings[key as keyof SettingsSchema] as SettingsSchema[K])
      case 'launchBehavior': {
        if (['restore', 'newtab', 'homepage'].includes(value as string))
          return value as SettingsSchema[K]
        return defaultSettings.launchBehavior as SettingsSchema[K]
      }
      case 'defaultFont':
        return validateString(value, defaultSettings.defaultFont) as SettingsSchema[K]
      case 'defaultFontSize':
        return validateNumber(value, defaultSettings.defaultFontSize, 12, 24) as SettingsSchema[K]
      case 'defaultEncoding': {
        if (['utf-8', 'gbk', 'gb2312', 'big5', 'shift_jis', 'iso-8859-1'].includes(value as string))
          return value as SettingsSchema[K]
        return defaultSettings.defaultEncoding as SettingsSchema[K]
      }
      case 'adBlockEnabled':
        return typeof value === 'boolean'
          ? (value as SettingsSchema[K])
          : (defaultSettings.adBlockEnabled as SettingsSchema[K])
      case 'adBlockCustomRules':
      case 'adBlockAllowlist':
        return validateStringArray(value) as SettingsSchema[K]
      case 'forceDark':
        return typeof value === 'boolean'
          ? (value as SettingsSchema[K])
          : (defaultSettings.forceDark as SettingsSchema[K])
      case 'tabBarPosition': {
        if (['top', 'left'].includes(value as string)) return value as SettingsSchema[K]
        return defaultSettings.tabBarPosition as SettingsSchema[K]
      }
      case 'interceptorEnabled':
        return typeof value === 'boolean'
          ? (value as SettingsSchema[K])
          : (defaultSettings.interceptorEnabled as SettingsSchema[K])
      case 'interceptorRules':
        return Array.isArray(value)
          ? (value as SettingsSchema[K])
          : (defaultSettings.interceptorRules as SettingsSchema[K])
      default:
        return value
    }
  }

  getAll(): SettingsSnapshot {
    console.debug('[SettingsManager] getAll')
    return { ...defaultSettings, ...this.store.store }
  }

  setNativeTheme() {
    const theme = this.get('theme')
    console.debug('[SettingsManager] setNativeTheme: theme', theme)
    nativeTheme.themeSource = theme
  }
}
