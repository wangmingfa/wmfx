import path from 'node:path'
import Database from 'better-sqlite3'
import { app } from 'electron'

class DatabaseManager {
  private static instance: DatabaseManager | null = null
  private _db: Database.Database

  private constructor() {
    console.debug('[DatabaseManager] constructor: init start')
    const dbPath = path.join(app.getPath('userData'), 'wmfx.db')
    console.debug('[DatabaseManager] constructor: dbPath', dbPath)
    this._db = new Database(dbPath)
    this._db.pragma('journal_mode = WAL')
    console.debug('[DatabaseManager] constructor: WAL pragma set')
    this.initTables()
    console.debug('[DatabaseManager] constructor: init done')
  }

  static getInstance(): DatabaseManager {
    console.debug('[DatabaseManager] getInstance: hasInstance', !!DatabaseManager.instance)
    if (!DatabaseManager.instance) {
      DatabaseManager.instance = new DatabaseManager()
    }
    return DatabaseManager.instance
  }

  get db(): Database.Database {
    return this._db
  }

  private initTables(): void {
    console.debug('[DatabaseManager] initTables: creating tables')
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

      CREATE TABLE IF NOT EXISTS subscriptions (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        url TEXT NOT NULL,
        active INTEGER DEFAULT 0,
        last_update INTEGER DEFAULT 0,
        expire INTEGER DEFAULT 0,
        upload INTEGER DEFAULT 0,
        download INTEGER DEFAULT 0,
        total INTEGER DEFAULT 0
      );
    `)

    // Migration: add 'active' column to subscriptions if missing
    try {
      this.db.prepare('SELECT active FROM subscriptions LIMIT 1').get()
    } catch {
      console.debug('[DatabaseManager] initTables: adding missing active column to subscriptions')
      this.db.exec('ALTER TABLE subscriptions ADD COLUMN active INTEGER DEFAULT 0')
    }
    console.debug('[DatabaseManager] initTables: done')
  }

  destroy(): void {
    console.debug('[DatabaseManager] destroy: closing db')
    this.db.close()
    DatabaseManager.instance = null
    console.debug('[DatabaseManager] destroy: done')
  }
}

export default DatabaseManager
