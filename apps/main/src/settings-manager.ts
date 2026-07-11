import Store from 'electron-store'

interface SettingsSchema {
  theme: 'light' | 'dark' | 'system'
  downloadPath: string
  defaultSearch: 'google' | 'baidu' | 'bing'
  newTabUrl: string
  zoomFactor: number
}

const defaultSettings: SettingsSchema = {
  theme: 'dark',
  downloadPath: '',
  defaultSearch: 'google',
  newTabUrl: 'https://www.google.com',
  zoomFactor: 1,
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
