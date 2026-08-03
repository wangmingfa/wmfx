// 导入 mock 后的 electron 模块
import { safeStorage } from 'electron'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PasswordManager } from './password-manager'

// Mock store data
let mockStoreData: Record<string, unknown>

// Mock electron-store — 使用普通函数而非箭头函数，使其可被 new 调用
vi.mock('electron-store', () => ({
  default: function MockStore(options?: { defaults?: Record<string, unknown> }) {
    const defaults = options?.defaults ?? { entries: [] }
    if (mockStoreData === undefined) {
      mockStoreData = { ...defaults }
    }
    return {
      get: (key: string) => mockStoreData[key],
      set: (key: string, value: unknown) => {
        mockStoreData[key] = value
      },
      get store() {
        return { ...mockStoreData }
      },
    }
  },
}))

// Mock electron safeStorage
vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: vi.fn(() => true),
    encryptString: vi.fn((plain: string) => Buffer.from(plain)),
    decryptString: vi.fn((buf: Buffer) => buf.toString('utf-8')),
  },
}))

describe('PasswordManager', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // 重置 singleton
    // @ts-expect-error 重置私有静态属性用于测试
    delete PasswordManager.instance
    mockStoreData = { entries: [] }
  })

  describe('save (add)', () => {
    it('保存密码并加密（encryptString 被调用）', () => {
      const mgr = PasswordManager.getInstance()
      const entry = mgr.save({
        domain: 'example.com',
        username: 'user1',
        password: 'secret123',
        note: 'my note',
      })

      // 返回的条目包含解密后的密码
      expect(entry.domain).toBe('example.com')
      expect(entry.username).toBe('user1')
      expect(entry.password).toBe('secret123')
      expect(entry.note).toBe('my note')
      expect(entry.id).toBeDefined()
      expect(typeof entry.id).toBe('string')
      expect(entry.createdAt).toBeGreaterThan(0)
      expect(entry.updatedAt).toBeGreaterThan(0)

      // 验证 safeStorage.encryptString 被调用
      expect(safeStorage.encryptString).toHaveBeenCalledWith('secret123')

      // 验证存储层包含加密数据（passwordEnc 存在）
      const storedEntries = mockStoreData.entries as unknown[]
      expect(storedEntries).toHaveLength(1)
      const stored = storedEntries[0] as Record<string, unknown>
      expect(stored.passwordEnc).toBeDefined()
      // passwordEnc 是 base64 编码的 Buffer
      expect(typeof stored.passwordEnc).toBe('string')
    })
  })

  describe('list (getAll)', () => {
    it('返回所有密码列表（解密后）', () => {
      const mgr = PasswordManager.getInstance()
      mgr.save({ domain: 'a.com', username: 'u1', password: 'p1' })
      mgr.save({ domain: 'b.com', username: 'u2', password: 'p2' })

      const list = mgr.list()
      expect(list).toHaveLength(2)
      expect(list[0].domain).toBe('a.com')
      expect(list[0].password).toBe('p1')
      expect(list[1].domain).toBe('b.com')
      expect(list[1].password).toBe('p2')
    })

    it('无条目时返回空数组', () => {
      const mgr = PasswordManager.getInstance()
      expect(mgr.list()).toEqual([])
    })
  })

  describe('list filter (get by id)', () => {
    it('按 id 获取并解密', () => {
      const mgr = PasswordManager.getInstance()
      const entry = mgr.save({
        domain: 'example.com',
        username: 'user1',
        password: 'secret123',
      })

      const list = mgr.list()
      const found = list.find((e) => e.id === entry.id)
      expect(found).toBeDefined()
      expect(found!.password).toBe('secret123')
      expect(found!.domain).toBe('example.com')
    })
  })

  describe('delete', () => {
    it('删除密码', () => {
      const mgr = PasswordManager.getInstance()
      const entry = mgr.save({
        domain: 'example.com',
        username: 'user1',
        password: 'secret123',
      })
      const entry2 = mgr.save({
        domain: 'other.com',
        username: 'user2',
        password: 'other456',
      })
      expect(mgr.list()).toHaveLength(2)

      // 删除第一个
      const result = mgr.delete(entry.id)
      expect(result).toBe(true)
      expect(mgr.list()).toHaveLength(1)
      expect(mgr.list()[0].id).toBe(entry2.id)
    })

    it('删除不存在的 id 返回 false', () => {
      const mgr = PasswordManager.getInstance()
      expect(mgr.delete('nonexistent')).toBe(false)
    })
  })

  describe('save (update)', () => {
    it('更新密码', () => {
      const mgr = PasswordManager.getInstance()
      const entry = mgr.save({
        domain: 'example.com',
        username: 'user1',
        password: 'secret123',
      })

      // 更新密码（用 setTimeout 确保 updatedAt 不同）
      const updated = mgr.save({
        id: entry.id,
        domain: 'example.com',
        username: 'user1',
        password: 'newpass456',
        note: 'updated note',
      })

      expect(updated.id).toBe(entry.id)
      expect(updated.password).toBe('newpass456')
      expect(updated.note).toBe('updated note')
      expect(updated.updatedAt).toBeGreaterThanOrEqual(entry.updatedAt ?? 0)

      // 列表中也反映更新
      const list = mgr.list()
      expect(list).toHaveLength(1)
      expect(list[0].password).toBe('newpass456')

      // safeStorage.encryptString 被调用两次（一次 add，一次 update）
      expect(safeStorage.encryptString).toHaveBeenCalledTimes(2)
      expect(safeStorage.encryptString).toHaveBeenLastCalledWith('newpass456')
    })
  })
})
