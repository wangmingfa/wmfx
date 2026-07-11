import type { HistoryRepository } from '@wmfx/database'

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
      this.repo.incrementVisitCount(opts.url)
      return
    }
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

  delete(id: string): boolean {
    return this.repo.delete(id)
  }

  clear(): void {
    this.repo.clear()
  }
}
