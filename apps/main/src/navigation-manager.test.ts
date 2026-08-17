// biome-ignore-all lint/suspicious/noExplicitAny: 测试用 mock 对象，需要 any
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NavigationManager } from './navigation-manager'

// 模拟 internal-url 模块
vi.mock('./internal-url', () => ({
  loadInternalView: vi.fn(),
}))

// 模拟 @browser/shared（已通过 node_modules 的 workspace 链接可用，不需 mock）

describe('NavigationManager', () => {
  let mockTabManager: ReturnType<typeof createMockTabManager>
  let mockWebContents: ReturnType<typeof createMockWebContents>
  let nav: NavigationManager

  function createMockWebContents() {
    return {
      // loadURL 返回 Promise（与真实 Electron 一致），供 navigation-manager 的 .catch 链使用
      loadURL: vi.fn().mockResolvedValue(undefined),
      reload: vi.fn(),
      stop: vi.fn(),
      navigationHistory: {
        canGoBack: vi.fn(),
        canGoForward: vi.fn(),
        goBack: vi.fn(),
        goForward: vi.fn(),
      },
    }
  }

  function createMockTabManager() {
    return {
      getWebContents: vi.fn(() => mockWebContents),
      relaunchView: vi.fn(),
      setNavigating: vi.fn(),
    }
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockWebContents = createMockWebContents()
    mockTabManager = createMockTabManager()
    nav = new NavigationManager(mockTabManager as any)
  })

  describe('goBack', () => {
    it('当可后退时调用 navigationHistory.goBack', () => {
      mockWebContents.navigationHistory.canGoBack.mockReturnValue(true)
      nav.goBack('tab-1')
      expect(mockWebContents.navigationHistory.goBack).toHaveBeenCalled()
    })

    it('当不可后退时不调用 goBack', () => {
      mockWebContents.navigationHistory.canGoBack.mockReturnValue(false)
      nav.goBack('tab-1')
      expect(mockWebContents.navigationHistory.goBack).not.toHaveBeenCalled()
    })
  })

  describe('goForward', () => {
    it('当可前进时调用 navigationHistory.goForward', () => {
      mockWebContents.navigationHistory.canGoForward.mockReturnValue(true)
      nav.goForward('tab-1')
      expect(mockWebContents.navigationHistory.goForward).toHaveBeenCalled()
    })

    it('当不可前进时不调用 goForward', () => {
      mockWebContents.navigationHistory.canGoForward.mockReturnValue(false)
      nav.goForward('tab-1')
      expect(mockWebContents.navigationHistory.goForward).not.toHaveBeenCalled()
    })
  })

  describe('reload', () => {
    it('调用 webContents.reload', () => {
      nav.reload('tab-1')
      expect(mockWebContents.reload).toHaveBeenCalled()
    })
  })

  describe('stop', () => {
    it('调用 webContents.stop', () => {
      nav.stop('tab-1')
      expect(mockWebContents.stop).toHaveBeenCalled()
    })
  })

  describe('loadURL', () => {
    it('wmfx:// 内部 URL 调用 relaunchView + setNavigating + loadInternalView', async () => {
      const { loadInternalView } = await import('./internal-url')
      mockTabManager.relaunchView.mockReturnValue({
        view: mockWebContents,
        didRelaunch: false,
      })

      nav.loadURL('tab-1', 'wmfx://settings')

      expect(mockTabManager.relaunchView).toHaveBeenCalledWith('tab-1', 'wmfx://settings')
      expect(mockTabManager.setNavigating).toHaveBeenCalledWith('tab-1', 'wmfx://settings')
      expect(loadInternalView).toHaveBeenCalledWith(mockWebContents, 'settings')
    })

    it('wmfx:// 内部 URL 且 didRelaunch=true 时不调 setNavigating 和 loadInternalView', async () => {
      const { loadInternalView } = await import('./internal-url')
      mockTabManager.relaunchView.mockReturnValue({
        view: mockWebContents,
        didRelaunch: true,
      })

      nav.loadURL('tab-1', 'wmfx://settings')

      expect(mockTabManager.relaunchView).toHaveBeenCalledWith('tab-1', 'wmfx://settings')
      expect(mockTabManager.setNavigating).not.toHaveBeenCalled()
      expect(loadInternalView).not.toHaveBeenCalled()
    })

    it('http:// 外部 URL 调用 setNavigating + webContents.loadURL', () => {
      nav.loadURL('tab-1', 'https://example.com')

      expect(mockTabManager.setNavigating).toHaveBeenCalledWith('tab-1', 'https://example.com')
      expect(mockWebContents.loadURL).toHaveBeenCalledWith('https://example.com')
    })

    it('裸域名自动补 https://', () => {
      nav.loadURL('tab-1', 'example.com')

      expect(mockTabManager.setNavigating).toHaveBeenCalledWith('tab-1', 'https://example.com')
      expect(mockWebContents.loadURL).toHaveBeenCalledWith('https://example.com')
    })
  })
})
