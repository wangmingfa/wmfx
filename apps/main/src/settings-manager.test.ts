import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultSettings, SettingsManager } from './settings-manager'

// Mock electron-store — 使用普通函数而非箭头函数，使其可被 new 调用
let mockStoreData: Record<string, unknown>

vi.mock('electron-store', () => ({
  default: function MockStore(options?: { defaults?: Record<string, unknown> }) {
    const defaults = options?.defaults ?? {}
    if (Object.keys(mockStoreData).length === 0) {
      mockStoreData = { ...defaults }
    }
    return {
      get: (key: string) => mockStoreData[key] ?? defaults[key],
      set: (key: string, value: unknown) => {
        mockStoreData[key] = value
      },
      get store() {
        return { ...mockStoreData }
      },
    }
  },
}))

// Mock electron nativeTheme
vi.mock('electron', () => ({
  nativeTheme: {
    themeSource: 'dark',
  },
}))

describe('SettingsManager', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // 重置 singleton 实例
    // @ts-expect-error 重置私有静态属性用于测试
    delete SettingsManager.instance
    mockStoreData = { ...defaultSettings }
  })

  it('getAll 返回默认值，其中 forceDark 为 false', () => {
    const mgr = SettingsManager.getInstance()
    const all = mgr.getAll()
    expect(all.forceDark).toBe(false)
    expect(all.forceDark).toBe(defaultSettings.forceDark)
    expect(all.searchEngine).toBe('google')
    expect(all.searchEngine).toBe(defaultSettings.searchEngine)
    expect(all.adBlockEnabled).toBe(true)
    expect(all.adBlockEnabled).toBe(defaultSettings.adBlockEnabled)
    expect(all.tabBarPosition).toBe('top')
    expect(all.tabBarPosition).toBe(defaultSettings.tabBarPosition)
  })

  it('get 获取单个设置', () => {
    const mgr = SettingsManager.getInstance()
    expect(mgr.get('forceDark')).toBe(false)
    expect(mgr.get('searchEngine')).toBe('google')
    expect(mgr.get('adBlockEnabled')).toBe(true)
    expect(mgr.get('tabBarPosition')).toBe('top')
  })

  it('set 设置值并持久化', () => {
    const mgr = SettingsManager.getInstance()
    mgr.set('forceDark', true)
    mgr.set('searchEngine', 'bing')
    mgr.set('adBlockEnabled', false)
    mgr.set('tabBarPosition', 'left')

    // 验证 mockStoreData 被更新（持久化）
    expect(mockStoreData.forceDark).toBe(true)
    expect(mockStoreData.searchEngine).toBe('bing')
    expect(mockStoreData.adBlockEnabled).toBe(false)
    expect(mockStoreData.tabBarPosition).toBe('left')
  })

  it('修改后 get 返回新值', () => {
    const mgr = SettingsManager.getInstance()
    // 先修改
    mgr.set('forceDark', true)
    mgr.set('searchEngine', 'bing')

    // 再读取
    expect(mgr.get('forceDark')).toBe(true)
    expect(mgr.get('searchEngine')).toBe('bing')

    // 未修改的仍为默认值
    expect(mgr.get('adBlockEnabled')).toBe(true)
    expect(mgr.get('tabBarPosition')).toBe('top')
  })
})
