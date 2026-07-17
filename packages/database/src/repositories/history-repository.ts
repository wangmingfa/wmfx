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
    console.debug(
      '[HistoryRepository] add: url title visit_time',
      item.url,
      item.title,
      item.visit_time
    )
    const id = crypto.randomUUID()
    const stmt = this.db.prepare(`
      INSERT INTO history (id, url, title, favicon, visit_time, visit_count)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    stmt.run(id, item.url, item.title, item.favicon, item.visit_time, item.visit_count)
    console.debug('[HistoryRepository] add: inserted id', id)
    return id
  }

  find(url: string): HistoryItem | undefined {
    const stmt = this.db.prepare(`
      SELECT id, url, title, favicon, visit_time, visit_count
      FROM history WHERE url = ?
    `)
    const row = stmt.get(url) as HistoryItem | undefined
    console.debug('[HistoryRepository] find: url found', url, !!row)
    return row
  }

  incrementVisitCount(url: string): void {
    const stmt = this.db.prepare(`
      UPDATE history SET visit_count = visit_count + 1 WHERE url = ?
    `)
    stmt.run(url)
    console.debug('[HistoryRepository] incrementVisitCount: url', url)
  }

  search(query: string, limit = 50, offset = 0): HistoryItem[] {
    const stmt = this.db.prepare(`
      SELECT id, url, title, favicon, visit_time, visit_count
      FROM history
      WHERE url LIKE ? OR title LIKE ?
      ORDER BY visit_time DESC
      LIMIT ? OFFSET ?
    `)
    const rows = stmt.all(`%${query}%`, `%${query}%`, limit, offset) as HistoryItem[]
    console.debug(
      '[HistoryRepository] search: query limit offset count',
      query,
      limit,
      offset,
      rows.length
    )
    return rows
  }

  getList(limit = 50, offset = 0): HistoryItem[] {
    const stmt = this.db.prepare(`
      SELECT id, url, title, favicon, visit_time, visit_count
      FROM history
      ORDER BY visit_time DESC
      LIMIT ? OFFSET ?
    `)
    const rows = stmt.all(limit, offset) as HistoryItem[]
    console.debug('[HistoryRepository] getList: limit offset count', limit, offset, rows.length)
    return rows
  }

  getAll(): HistoryItem[] {
    const stmt = this.db.prepare(`
      SELECT id, url, title, favicon, visit_time, visit_count
      FROM history
      ORDER BY visit_time DESC
    `)
    const rows = stmt.all() as HistoryItem[]
    console.debug('[HistoryRepository] getAll: count', rows.length)
    return rows
  }

  delete(id: string): boolean {
    const stmt = this.db.prepare('DELETE FROM history WHERE id = ?')
    const result = stmt.run(id)
    console.debug('[HistoryRepository] delete: id changes', id, result.changes)
    return result.changes > 0
  }

  clear(): void {
    console.debug('[HistoryRepository] clear: deleting all history')
    this.db.prepare('DELETE FROM history').run()
    console.debug('[HistoryRepository] clear: done')
  }
}
