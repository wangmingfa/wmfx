import type { HistoryItem, HistoryRepository } from '@wmfx/database'

export interface HistoryAddOptions {
  url: string
  title?: string | null
  favicon?: string | null
}

export class HistoryManager {
  constructor(private repo: HistoryRepository) {}

  add(opts: HistoryAddOptions): void {
    const existing = this.repo.find(opts.url)
    if (existing) {
      console.debug(`[HistoryManager] add: incrementing visit count for url=${opts.url}`)
      this.repo.incrementVisitCount(opts.url)
      return
    }
    console.debug(`[HistoryManager] add: creating new entry url=${opts.url}`)
    this.repo.add({
      url: opts.url,
      title: opts.title ?? null,
      favicon: opts.favicon ?? null,
      visit_time: Date.now(),
      visit_count: 1,
    })
  }

  search(query: string, limit = 50, offset = 0) {
    return this.repo.search(query, limit, offset)
  }

  getList(limit = 50, offset = 0) {
    return this.repo.getList(limit, offset)
  }

  getRecent(limit = 5): HistoryItem[] {
    return this.repo.getList(limit, 0)
  }

  delete(id: string): boolean {
    console.debug(`[HistoryManager] delete: id=${id}`)
    return this.repo.delete(id)
  }

  clear(): void {
    console.debug('[HistoryManager] clear: clearing all history')
    this.repo.clear()
  }
}
