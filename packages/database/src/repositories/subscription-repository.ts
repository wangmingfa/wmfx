import crypto from 'node:crypto'
import type { Database as BetterSqlite3Db } from 'better-sqlite3'

export interface SubscriptionRecord {
  id: string
  name: string
  url: string
  last_update: number
  expire: number
  upload: number
  download: number
  total: number
}

export class SubscriptionRepository {
  constructor(private db: BetterSqlite3Db) {}

  findAll(): SubscriptionRecord[] {
    return this.db
      .prepare(
        'SELECT id, name, url, last_update, expire, upload, download, total FROM subscriptions ORDER BY last_update DESC'
      )
      .all() as SubscriptionRecord[]
  }

  findById(id: string): SubscriptionRecord | undefined {
    return this.db
      .prepare(
        'SELECT id, name, url, last_update, expire, upload, download, total FROM subscriptions WHERE id = ?'
      )
      .get(id) as SubscriptionRecord | undefined
  }

  findByUrl(url: string): SubscriptionRecord | undefined {
    return this.db
      .prepare(
        'SELECT id, name, url, last_update, expire, upload, download, total FROM subscriptions WHERE url = ?'
      )
      .get(url) as SubscriptionRecord | undefined
  }

  create(sub: Omit<SubscriptionRecord, 'id'>): string {
    const id = crypto.randomUUID()
    this.db
      .prepare(
        'INSERT INTO subscriptions (id, name, url, last_update, expire, upload, download, total) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .run(id, sub.name, sub.url, sub.last_update, sub.expire, sub.upload, sub.download, sub.total)
    return id
  }

  update(id: string, fields: Partial<Omit<SubscriptionRecord, 'id'>>): void {
    const entries = Object.entries(fields)
    if (entries.length === 0) return
    const sets = entries.map(([k]) => `${k} = ?`).join(', ')
    const values = entries.map(([, v]) => v)
    this.db.prepare(`UPDATE subscriptions SET ${sets} WHERE id = ?`).run(...values, id)
  }

  delete(id: string): boolean {
    const result = this.db.prepare('DELETE FROM subscriptions WHERE id = ?').run(id)
    return result.changes > 0
  }
}
