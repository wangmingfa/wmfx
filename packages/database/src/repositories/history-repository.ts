import crypto from 'node:crypto'
import type { Database as BetterSqlite3Db } from 'better-sqlite3'

export interface HistoryItem {
  id: string
  url: string
  title: string | null
  favicon: string | null
  visit_time: number
  visit_count: number
}

export class HistoryRepository {
  constructor(private db: BetterSqlite3Db) {}

  add(item: Omit<HistoryItem, 'id'>): string {
    const id = crypto.randomUUID()
    const stmt = this.db.prepare(`
      INSERT INTO history (id, url, title, favicon, visit_time, visit_count)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    stmt.run(id, item.url, item.title, item.favicon, item.visit_time, item.visit_count)
    return id
  }

  find(url: string): HistoryItem | undefined {
    const stmt = this.db.prepare(`
      SELECT id, url, title, favicon, visit_time, visit_count
      FROM history WHERE url = ?
    `)
    return stmt.get(url) as HistoryItem | undefined
  }

  incrementVisitCount(url: string): void {
    const stmt = this.db.prepare(`
      UPDATE history SET visit_count = visit_count + 1 WHERE url = ?
    `)
    stmt.run(url)
  }

  search(query: string, limit = 50, offset = 0): HistoryItem[] {
    const stmt = this.db.prepare(`
      SELECT id, url, title, favicon, visit_time, visit_count
      FROM history
      WHERE url LIKE ? OR title LIKE ?
      ORDER BY visit_time DESC
      LIMIT ? OFFSET ?
    `)
    return stmt.all(`%${query}%`, `%${query}%`, limit, offset) as HistoryItem[]
  }

  getList(limit = 50, offset = 0): HistoryItem[] {
    const stmt = this.db.prepare(`
      SELECT id, url, title, favicon, visit_time, visit_count
      FROM history
      ORDER BY visit_time DESC
      LIMIT ? OFFSET ?
    `)
    return stmt.all(limit, offset) as HistoryItem[]
  }

  delete(id: string): boolean {
    const stmt = this.db.prepare('DELETE FROM history WHERE id = ?')
    const result = stmt.run(id)
    return result.changes > 0
  }

  clear(): void {
    this.db.prepare('DELETE FROM history').run()
  }
}
