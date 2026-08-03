// biome-ignore-all lint/suspicious/noExplicitAny: 测试用 mock 对象，需要 any
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AdBlocker } from './ad-blocker'

// 模拟 SettingsManager
const mockSettings = {
  get: vi.fn(),
  set: vi.fn(),
} as any

// 重置单例
beforeEach(() => {
  vi.clearAllMocks()
  // 清除 AdBlocker 单例
  delete (AdBlocker as any).instance
})

describe('AdBlocker', () => {
  describe('getInstance', () => {
    it('返回单例', () => {
      const a = AdBlocker.getInstance(mockSettings as any)
      const b = AdBlocker.getInstance(mockSettings as any)
      expect(a).toBe(b)
    })
  })

  describe('isEnabled / setEnabled', () => {
    it('初始状态从 settings 读取', () => {
      mockSettings.get.mockReturnValue(true)
      const blocker = AdBlocker.getInstance(mockSettings as any)
      expect(blocker.isEnabled()).toBe(true)
      expect(mockSettings.get).toHaveBeenCalledWith('adBlockEnabled')
    })

    it('setEnabled 切换状态并持久化', () => {
      mockSettings.get.mockReturnValue(true)
      const blocker = AdBlocker.getInstance(mockSettings as any)
      blocker.setEnabled(false)
      expect(blocker.isEnabled()).toBe(false)
      expect(mockSettings.set).toHaveBeenCalledWith('adBlockEnabled', false)
    })
  })

  describe('shouldBlock', () => {
    it('禁用时不拦截任何请求', () => {
      mockSettings.get.mockImplementation((key: string) => {
        if (key === 'adBlockEnabled') return false
        if (key === 'adBlockCustomRules') return []
        if (key === 'adBlockAllowlist') return []
        return undefined
      })
      const blocker = AdBlocker.getInstance(mockSettings as any)
      expect(blocker.shouldBlock('https://doubleclick.net/ads')).toBe(false)
    })

    it('拦截内置广告域名', () => {
      mockSettings.get.mockImplementation((key: string) => {
        if (key === 'adBlockEnabled') return true
        if (key === 'adBlockCustomRules') return []
        if (key === 'adBlockAllowlist') return []
        return undefined
      })
      const blocker = AdBlocker.getInstance(mockSettings as any)
      expect(blocker.shouldBlock('https://doubleclick.net/ads')).toBe(true)
      expect(blocker.shouldBlock('https://google-analytics.com/collect')).toBe(true)
      expect(blocker.shouldBlock('https://googlesyndication.com/ads')).toBe(true)
    })

    it('子域后缀匹配', () => {
      mockSettings.get.mockImplementation((key: string) => {
        if (key === 'adBlockEnabled') return true
        if (key === 'adBlockCustomRules') return []
        if (key === 'adBlockAllowlist') return []
        return undefined
      })
      const blocker = AdBlocker.getInstance(mockSettings as any)
      // sub.doubleclick.net 匹配 .doubleclick.net
      expect(blocker.shouldBlock('https://sub.doubleclick.net/ads')).toBe(true)
      // ads.example.com 不匹配任何规则
      expect(blocker.shouldBlock('https://ads.example.com')).toBe(false)
    })

    it('普通域名不被拦截', () => {
      mockSettings.get.mockImplementation((key: string) => {
        if (key === 'adBlockEnabled') return true
        if (key === 'adBlockCustomRules') return []
        if (key === 'adBlockAllowlist') return []
        return undefined
      })
      const blocker = AdBlocker.getInstance(mockSettings as any)
      expect(blocker.shouldBlock('https://example.com')).toBe(false)
      expect(blocker.shouldBlock('https://github.com')).toBe(false)
    })

    it('自定义黑名单生效', () => {
      mockSettings.get.mockImplementation((key: string) => {
        if (key === 'adBlockEnabled') return true
        if (key === 'adBlockCustomRules') return ['my-tracker.com']
        if (key === 'adBlockAllowlist') return []
        return undefined
      })
      const blocker = AdBlocker.getInstance(mockSettings as any)
      expect(blocker.shouldBlock('https://my-tracker.com/pixel')).toBe(true)
    })

    it('白名单优先级高于内置规则', () => {
      mockSettings.get.mockImplementation((key: string) => {
        if (key === 'adBlockEnabled') return true
        if (key === 'adBlockCustomRules') return []
        if (key === 'adBlockAllowlist') return ['doubleclick.net']
        return undefined
      })
      const blocker = AdBlocker.getInstance(mockSettings as any)
      // doubleclick.net 虽然在内置列表，但白名单放行了
      expect(blocker.shouldBlock('https://doubleclick.net/ads')).toBe(false)
    })

    it('白名单优先级高于自定义规则', () => {
      mockSettings.get.mockImplementation((key: string) => {
        if (key === 'adBlockEnabled') return true
        if (key === 'adBlockCustomRules') return ['my-tracker.com']
        if (key === 'adBlockAllowlist') return ['my-tracker.com']
        return undefined
      })
      const blocker = AdBlocker.getInstance(mockSettings as any)
      expect(blocker.shouldBlock('https://my-tracker.com/pixel')).toBe(false)
    })

    it('无效 URL 返回 false', () => {
      mockSettings.get.mockImplementation((key: string) => {
        if (key === 'adBlockEnabled') return true
        if (key === 'adBlockCustomRules') return []
        if (key === 'adBlockAllowlist') return []
        return undefined
      })
      const blocker = AdBlocker.getInstance(mockSettings as any)
      expect(blocker.shouldBlock('not-a-url')).toBe(false)
    })
  })

  describe('getBlockedCount / getBlockLog', () => {
    it('初始状态为 0 和空数组', () => {
      mockSettings.get.mockImplementation((key: string) => {
        if (key === 'adBlockEnabled') return true
        if (key === 'adBlockCustomRules') return []
        if (key === 'adBlockAllowlist') return []
        return undefined
      })
      const blocker = AdBlocker.getInstance(mockSettings as any)
      expect(blocker.getBlockedCount()).toBe(0)
      expect(blocker.getBlockLog()).toEqual([])
    })
  })

  describe('getRuleCount', () => {
    it('返回内置规则数', () => {
      mockSettings.get.mockImplementation((key: string) => {
        if (key === 'adBlockEnabled') return true
        if (key === 'adBlockCustomRules') return []
        if (key === 'adBlockAllowlist') return []
        return undefined
      })
      const blocker = AdBlocker.getInstance(mockSettings as any)
      // 内置规则数
      expect(blocker.getRuleCount()).toBeGreaterThan(50)
    })

    it('白名单规则不计入', () => {
      // 先获取无白名单时的规则数
      mockSettings.get.mockImplementation((key: string) => {
        if (key === 'adBlockEnabled') return true
        if (key === 'adBlockCustomRules') return []
        if (key === 'adBlockAllowlist') return []
        return undefined
      })
      const blocker = AdBlocker.getInstance(mockSettings as any)
      const countWithoutAllow = blocker.getRuleCount()

      // 设置白名单后规则数应减少
      mockSettings.get.mockImplementation((key: string) => {
        if (key === 'adBlockEnabled') return true
        if (key === 'adBlockCustomRules') return []
        if (key === 'adBlockAllowlist') return ['doubleclick.net']
        return undefined
      })
      // 重建 blocker 实例让 getRuleCount 重新读取 settings
      delete (AdBlocker as any).instance
      const blocker2 = AdBlocker.getInstance(mockSettings as any)
      const countWithAllow = blocker2.getRuleCount()

      expect(countWithAllow).toBeLessThan(countWithoutAllow)
    })
  })
})
