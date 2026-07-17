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
    console.debug(
      '[BookmarkRepository] create: parent_id title url',
      item.parent_id,
      item.title,
      item.url
    )
    const id = crypto.randomUUID()
    const now = Date.now()
    const stmt = this.db.prepare(`
      INSERT INTO bookmarks (id, parent_id, title, url, favicon, position, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    stmt.run(id, item.parent_id, item.title, item.url, item.favicon, item.position, now)
    console.debug('[BookmarkRepository] create: inserted id', id)
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
    const rows = stmt.all(...params) as BookmarkItem[]
    console.debug('[BookmarkRepository] getList: parentId count', parentId, rows.length)
    return rows
  }

  /** 返回某节点的所有后代 id（含直接/间接子），用于防循环校验 */
  getDescendants(id: string): string[] {
    const result: string[] = []
    const stack = [id]
    while (stack.length > 0) {
      const current = stack.pop() as string
      const children = this.db
        .prepare(`SELECT id, parent_id FROM bookmarks WHERE parent_id = ?`)
        .all(current) as BookmarkItem[]
      for (const child of children) {
        result.push(child.id)
        stack.push(child.id)
      }
    }
    console.debug('[BookmarkRepository] getDescendants: id descendantCount', id, result.length)
    return result
  }

  /** 返回某父节点下的所有兄弟（含自身），按 position 排序；parentId 为 null 取顶层 */
  getSiblings(parentId: string | null): BookmarkItem[] {
    const sql = `
      SELECT id, parent_id, title, url, favicon, position, created_at
      FROM bookmarks
      ${parentId === null ? 'WHERE parent_id IS NULL' : 'WHERE parent_id = ?'}
      ORDER BY position
    `
    const stmt = this.db.prepare(sql)
    const rows = (parentId === null ? stmt.all() : stmt.all(parentId)) as BookmarkItem[]
    console.debug('[BookmarkRepository] getSiblings: parentId count', parentId, rows.length)
    return rows
  }

  search(query: string): BookmarkItem[] {
    const stmt = this.db.prepare(`
      SELECT id, parent_id, title, url, favicon, position, created_at
      FROM bookmarks
      WHERE title LIKE ? OR url LIKE ?
      ORDER BY title
    `)
    const rows = stmt.all(`%${query}%`, `%${query}%`) as BookmarkItem[]
    console.debug('[BookmarkRepository] search: query count', query, rows.length)
    return rows
  }

  update(
    id: string,
    updates: Partial<Pick<BookmarkItem, 'title' | 'url' | 'favicon' | 'position' | 'parent_id'>>
  ): void {
    const fields: string[] = []
    const params: unknown[] = []
    for (const [key, value] of Object.entries(updates)) {
      fields.push(`${key} = ?`)
      params.push(value)
    }
    if (fields.length === 0) {
      console.debug('[BookmarkRepository] update: id no fields to update, skip', id)
      return
    }
    params.push(id)
    const stmt = this.db.prepare(`UPDATE bookmarks SET ${fields.join(', ')} WHERE id = ?`)
    stmt.run(...params)
    console.debug('[BookmarkRepository] update: id fields', id, fields.join(','))
  }

  delete(id: string): boolean {
    const stmt = this.db.prepare('DELETE FROM bookmarks WHERE id = ?')
    const result = stmt.run(id)
    console.debug('[BookmarkRepository] delete: id changes', id, result.changes)
    return result.changes > 0
  }
}
