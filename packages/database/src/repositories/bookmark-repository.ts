import crypto from 'node:crypto'
import type { Database as BetterSqlite3Db } from 'better-sqlite3'

export interface BookmarkItem {
  id: string
  parent_id: string | null
  title: string
  url: string | null
  favicon: string | null
  position: number
  created_at: number
}

export class BookmarkRepository {
  constructor(private db: BetterSqlite3Db) {}

  create(item: Omit<BookmarkItem, 'id' | 'created_at'>): string {
    const id = crypto.randomUUID()
    const now = Date.now()
    const stmt = this.db.prepare(`
      INSERT INTO bookmarks (id, parent_id, title, url, favicon, position, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    stmt.run(id, item.parent_id, item.title, item.url, item.favicon, item.position, now)
    return id
  }

  getById(id: string): BookmarkItem | undefined {
    const stmt = this.db.prepare(`
      SELECT id, parent_id, title, url, favicon, position, created_at
      FROM bookmarks WHERE id = ?
    `)
    return stmt.get(id) as BookmarkItem | undefined
  }

  getList(parentId?: string | null): BookmarkItem[] {
    let sql = `
      SELECT id, parent_id, title, url, favicon, position, created_at
      FROM bookmarks
    `
    const params: unknown[] = []
    if (parentId !== undefined) {
      sql += parentId === null ? ' WHERE parent_id IS NULL' : ' WHERE parent_id = ?'
      if (parentId !== null) params.push(parentId)
    }
    sql += ' ORDER BY position'
    const stmt = this.db.prepare(sql)
    return stmt.all(...params) as BookmarkItem[]
  }

  search(query: string): BookmarkItem[] {
    const stmt = this.db.prepare(`
      SELECT id, parent_id, title, url, favicon, position, created_at
      FROM bookmarks
      WHERE title LIKE ? OR url LIKE ?
      ORDER BY title
    `)
    return stmt.all(`%${query}%`, `%${query}%`) as BookmarkItem[]
  }

  update(
    id: string,
    updates: Partial<Pick<BookmarkItem, 'title' | 'url' | 'favicon' | 'position'>>
  ): void {
    const fields: string[] = []
    const params: unknown[] = []
    for (const [key, value] of Object.entries(updates)) {
      fields.push(`${key} = ?`)
      params.push(value)
    }
    if (fields.length === 0) return
    params.push(id)
    const stmt = this.db.prepare(`UPDATE bookmarks SET ${fields.join(', ')} WHERE id = ?`)
    stmt.run(...params)
  }

  delete(id: string): boolean {
    const stmt = this.db.prepare('DELETE FROM bookmarks WHERE id = ?')
    const result = stmt.run(id)
    return result.changes > 0
  }
}
