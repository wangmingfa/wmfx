import path from 'node:path'
import Database from 'better-sqlite3'
import { app } from 'electron'

class DatabaseManager {
  private static instance: DatabaseManager | null = null
  private _db: Database.Database

  private constructor() {
    const dbPath = path.join(app.getPath('userData'), 'wmfx.db')
    this._db = new Database(dbPath)
    this._db.pragma('journal_mode = WAL')
    this.initTables()
  }

  static getInstance(): DatabaseManager {
    if (!DatabaseManager.instance) {
      DatabaseManager.instance = new DatabaseManager()
    }
    return DatabaseManager.instance
  }

  get db(): Database.Database {
    return this._db
  }

  private initTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS history (
        id TEXT PRIMARY KEY,
        url TEXT NOT NULL,
        title TEXT,
        favicon TEXT,
        visit_time INTEGER NOT NULL,
        visit_count INTEGER DEFAULT 1
      );

      CREATE TABLE IF NOT EXISTS downloads (
        id TEXT PRIMARY KEY,
        url TEXT NOT NULL,
        filename TEXT NOT NULL,
        path TEXT NOT NULL,
        state TEXT NOT NULL DEFAULT 'pending',
        received_bytes INTEGER DEFAULT 0,
        total_bytes INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL,
        error_msg TEXT
      );

      CREATE TABLE IF NOT EXISTS bookmarks (
        id TEXT PRIMARY KEY,
        parent_id TEXT,
        title TEXT NOT NULL,
        url TEXT,
        favicon TEXT,
        position INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (parent_id) REFERENCES bookmarks(id)
      );
    `)
  }

  destroy(): void {
    this.db.close()
    DatabaseManager.instance = null
  }
}

export default DatabaseManager
