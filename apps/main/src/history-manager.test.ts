// biome-ignore-all lint/suspicious/noExplicitAny: 测试用 mock 对象，需要 any
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HistoryManager } from './history-manager'

describe('HistoryManager', () => {
  let mockRepo: {
    find: ReturnType<typeof vi.fn>
    incrementVisitCount: ReturnType<typeof vi.fn>
    add: ReturnType<typeof vi.fn>
    search: ReturnType<typeof vi.fn>
    getList: ReturnType<typeof vi.fn>
    getAll: ReturnType<typeof vi.fn>
    delete: ReturnType<typeof vi.fn>
    clear: ReturnType<typeof vi.fn>
  }
  let history: HistoryManager

  beforeEach(() => {
    mockRepo = {
      find: vi.fn(),
      incrementVisitCount: vi.fn(),
      add: vi.fn(),
      search: vi.fn(),
      getList: vi.fn(),
      getAll: vi.fn(),
      delete: vi.fn(),
      clear: vi.fn(),
    }
    history = new HistoryManager(mockRepo as any)
  })

  describe('add', () => {
    it('新 URL 调用 repo.add', () => {
      mockRepo.find.mockReturnValue(null)

      history.add({ url: 'https://example.com', title: 'Example' })

      expect(mockRepo.find).toHaveBeenCalledWith('https://example.com')
      expect(mockRepo.add).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://example.com',
          title: 'Example',
          visit_count: 1,
        })
      )
      expect(mockRepo.incrementVisitCount).not.toHaveBeenCalled()
    })

    it('已存在的 URL 增加访问计数', () => {
      mockRepo.find.mockReturnValue({ id: '1', url: 'https://example.com', visit_count: 1 })

      history.add({ url: 'https://example.com', title: 'Example' })

      expect(mockRepo.find).toHaveBeenCalledWith('https://example.com')
      expect(mockRepo.incrementVisitCount).toHaveBeenCalledWith('https://example.com')
      expect(mockRepo.add).not.toHaveBeenCalled()
    })

    it('wmfx:// 内部 URL 也正常记录（不跳过）', () => {
      mockRepo.find.mockReturnValue(null)

      history.add({ url: 'wmfx://settings', title: 'Settings' })

      expect(mockRepo.add).toHaveBeenCalled()
    })

    it('title 为空时传 null', () => {
      mockRepo.find.mockReturnValue(null)

      history.add({ url: 'https://example.com' })

      expect(mockRepo.add).toHaveBeenCalledWith(
        expect.objectContaining({
          title: null,
        })
      )
    })
  })

  describe('search', () => {
    it('调用 repo.search 并返回结果', () => {
      const mockResults = [{ id: '1', url: 'https://example.com', title: 'Example' }]
      mockRepo.search.mockReturnValue(mockResults)

      const result = history.search('example', 10, 0)

      expect(mockRepo.search).toHaveBeenCalledWith('example', 10, 0)
      expect(result).toBe(mockResults)
    })

    it('使用默认 limit 和 offset', () => {
      history.search('test')
      expect(mockRepo.search).toHaveBeenCalledWith('test', 50, 0)
    })
  })

  describe('getList', () => {
    it('调用 repo.getList 并返回结果', () => {
      const mockList = [{ id: '1', url: 'https://example.com' }]
      mockRepo.getList.mockReturnValue(mockList)

      const result = history.getList(10, 0)

      expect(mockRepo.getList).toHaveBeenCalledWith(10, 0)
      expect(result).toBe(mockList)
    })
  })

  describe('getAll', () => {
    it('调用 repo.getAll 并返回结果', () => {
      const mockAll = [{ id: '1', url: 'https://example.com' }]
      mockRepo.getAll.mockReturnValue(mockAll)

      const result = history.getAll()

      expect(mockRepo.getAll).toHaveBeenCalled()
      expect(result).toBe(mockAll)
    })
  })

  describe('getRecent', () => {
    it('调用 repo.getList 并返回最近记录', () => {
      const mockRecent = [{ id: '1', url: 'https://example.com' }]
      mockRepo.getList.mockReturnValue(mockRecent)

      const result = history.getRecent(5)

      expect(mockRepo.getList).toHaveBeenCalledWith(5, 0)
      expect(result).toBe(mockRecent)
    })
  })

  describe('delete', () => {
    it('调用 repo.delete', () => {
      mockRepo.delete.mockReturnValue(true)

      const result = history.delete('1')

      expect(mockRepo.delete).toHaveBeenCalledWith('1')
      expect(result).toBe(true)
    })
  })

  describe('clear', () => {
    it('调用 repo.clear', () => {
      history.clear()
      expect(mockRepo.clear).toHaveBeenCalled()
    })
  })
})
