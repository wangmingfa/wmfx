import type { QuickLink } from '@browser/ipc-contract'
import Store from 'electron-store'

interface SettingsSchema {
  theme: 'light' | 'dark' | 'system'
  downloadPath: string
  defaultSearch: 'google' | 'baidu' | 'bing'
  newTabUrl: string
  zoomFactor: number
  quickLinks: QuickLink[]
  tabOrder: string[]
  openTabs: { url: string; title: string }[]
  activeTabIndex: number
  windowBounds: { x: number; y: number; width: number; height: number } | null
}

const defaultSettings: SettingsSchema = {
  theme: 'dark',
  downloadPath: '',
  defaultSearch: 'google',
  newTabUrl: 'https://www.baidu.com',
  zoomFactor: 1,
  quickLinks: [],
  tabOrder: [],
  openTabs: [],
  activeTabIndex: 0,
  windowBounds: null,
}

export class SettingsManager {
  private store: Store<SettingsSchema>

  constructor() {
    this.store = new Store<SettingsSchema>({
      name: 'wmfx-settings',
      defaults: defaultSettings,
    })
  }

  get<K extends keyof SettingsSchema>(key: K): SettingsSchema[K] {
    return this.store.get(key) as SettingsSchema[K]
  }

  set<K extends keyof SettingsSchema>(key: K, value: SettingsSchema[K]): void {
    this.store.set(key, value)
  }

  getAll(): SettingsSchema {
    return { ...defaultSettings, ...this.store.store }
  }
}
