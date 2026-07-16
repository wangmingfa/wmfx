import type { QuickLink, SearchEngine, SettingsSnapshot, ThemeMode } from '@browser/ipc-contract'
import { nativeTheme } from 'electron'
import Store from 'electron-store'

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
    this.store = new Store<SettingsSchema>({
      name: 'wmfx-settings',
      defaults: defaultSettings,
    })
  }

  static getInstance(): SettingsManager {
    if (!SettingsManager.instance) {
      SettingsManager.instance = new SettingsManager()
    }
    return SettingsManager.instance
  }

  get<K extends keyof SettingsSchema>(key: K): SettingsSchema[K] {
    return this.store.get(key) as SettingsSchema[K]
  }

  set<K extends keyof SettingsSchema>(key: K, value: SettingsSchema[K]): void {
    console.debug(`[SettingsManager] set: key=${key}`)
    const validated = this.validateValue(key, value)
    this.store.set(key, validated)
    if (key === 'theme') {
      this.setNativeTheme()
    }
  }

  private validateValue<K extends keyof SettingsSchema>(
    key: K,
    value: SettingsSchema[K]
  ): SettingsSchema[K] {
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
      default:
        return value
    }
  }

  getAll(): SettingsSnapshot {
    return { ...defaultSettings, ...this.store.store }
  }

  setNativeTheme() {
    nativeTheme.themeSource = this.get('theme')
  }
}
