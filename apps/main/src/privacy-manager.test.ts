import { session } from 'electron'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PrivacyManager } from './privacy-manager'

vi.mock('electron', () => ({
  session: {
    getAllSessions: vi.fn(),
  },
}))

// mock 后的 session 只暴露 getAllSessions；用该形状断言以满足 vi.spyOn 类型（避免 any）
const mockedSession = session as unknown as { getAllSessions: () => unknown }

describe('PrivacyManager.clear', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('对每个 session 调用 clearStorageData 且映射 cookies', async () => {
    const s1 = { clearStorageData: vi.fn().mockResolvedValue(undefined) }
    const s2 = { clearStorageData: vi.fn().mockResolvedValue(undefined) }
    vi.spyOn(mockedSession, 'getAllSessions').mockReturnValue([s1, s2] as never)
    const mgr = new PrivacyManager()
    await mgr.clear({ types: ['cookies'] })
    expect(s1.clearStorageData).toHaveBeenCalledWith({ storages: ['cookies'] })
    expect(s2.clearStorageData).toHaveBeenCalledWith({ storages: ['cookies'] })
  })

  it('cache 映射 cachestorage + shadercache', async () => {
    const s1 = { clearStorageData: vi.fn().mockResolvedValue(undefined) }
    vi.spyOn(mockedSession, 'getAllSessions').mockReturnValue([s1] as never)
    await new PrivacyManager().clear({ types: ['cache'] })
    expect(s1.clearStorageData).toHaveBeenCalledWith({
      storages: ['cachestorage', 'shadercache'],
    })
  })

  it('localStorage 与 formData 映射正确', async () => {
    const s1 = { clearStorageData: vi.fn().mockResolvedValue(undefined) }
    vi.spyOn(mockedSession, 'getAllSessions').mockReturnValue([s1] as never)
    await new PrivacyManager().clear({ types: ['localStorage', 'formData'] })
    expect(s1.clearStorageData).toHaveBeenCalledWith({
      storages: ['localstorage', 'indexdb'],
    })
  })

  it('无时间范围参数时仍清除全部', async () => {
    const s1 = { clearStorageData: vi.fn().mockResolvedValue(undefined) }
    vi.spyOn(mockedSession, 'getAllSessions').mockReturnValue([s1] as never)
    await new PrivacyManager().clear({ types: ['cookies'] })
    expect(s1.clearStorageData).toHaveBeenCalledWith({ storages: ['cookies'] })
  })
})
