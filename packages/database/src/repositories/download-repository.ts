import crypto from 'node:crypto'
import type { Database as BetterSqlite3Db } from 'better-sqlite3'

export type DownloadState =
  | 'pending'
  | 'downloading'
  | 'paused'
  | 'completed'
  | 'cancelled'
  | 'error'

export interface DownloadItem {
  id: string
  url: string
  filename: string
  path: string
  state: DownloadState
  received_bytes: number
  total_bytes: number
  created_at: number
  error_msg: string | null
}

export class DownloadRepository {
  constructor(private db: BetterSqlite3Db) {}

  create(item: Omit<DownloadItem, 'id' | 'created_at'>): string {
    console.debug(
      '[DownloadRepository] create: url filename state',
      item.url,
      item.filename,
      item.state
    )
    const id = crypto.randomUUID()
    const now = Date.now()
    const stmt = this.db.prepare(`
      INSERT INTO downloads (id, url, filename, path, state, received_bytes, total_bytes, created_at, error_msg)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    stmt.run(
      id,
      item.url,
      item.filename,
      item.path,
      item.state,
      item.received_bytes,
      item.total_bytes,
      now,
      item.error_msg
    )
    console.debug('[DownloadRepository] create: inserted id', id)
    return id
  }

  getById(id: string): DownloadItem | undefined {
    const stmt = this.db.prepare(`
      SELECT id, url, filename, path, state, received_bytes, total_bytes, created_at, error_msg
      FROM downloads WHERE id = ?
    `)
    return stmt.get(id) as DownloadItem | undefined
  }

  update(
    id: string,
    updates: Partial<Pick<DownloadItem, 'state' | 'received_bytes' | 'total_bytes' | 'error_msg'>>
  ): void {
    const fields: string[] = []
    const params: unknown[] = []
    for (const [key, value] of Object.entries(updates)) {
      fields.push(`${key} = ?`)
      params.push(value)
    }
    if (fields.length === 0) {
      console.debug('[DownloadRepository] update: id no fields to update, skip', id)
      return
    }
    params.push(id)
    const stmt = this.db.prepare(`UPDATE downloads SET ${fields.join(', ')} WHERE id = ?`)
    stmt.run(...params)
    console.debug('[DownloadRepository] update: id fields', id, fields.join(','))
  }

  getList(opts?: { state?: DownloadState; limit?: number; offset?: number }): DownloadItem[] {
    const { state, limit = 50, offset = 0 } = opts || {}
    let sql = `
      SELECT id, url, filename, path, state, received_bytes, total_bytes, created_at, error_msg
      FROM downloads
    `
    const params: unknown[] = []
    if (state) {
      sql += ' WHERE state = ?'
      params.push(state)
    }
    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?'
    params.push(limit, offset)
    const stmt = this.db.prepare(sql)
    const rows = stmt.all(...params) as DownloadItem[]
    console.debug(
      '[DownloadRepository] getList: state limit offset count',
      state,
      limit,
      offset,
      rows.length
    )
    return rows
  }

  delete(id: string): boolean {
    const stmt = this.db.prepare('DELETE FROM downloads WHERE id = ?')
    const result = stmt.run(id)
    console.debug('[DownloadRepository] delete: id changes', id, result.changes)
    return result.changes > 0
  }
}
