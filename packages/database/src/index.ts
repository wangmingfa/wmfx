import DatabaseManager from './database'
import { BookmarkRepository } from './repositories/bookmark-repository'
import { DownloadRepository } from './repositories/download-repository'
import { HistoryRepository } from './repositories/history-repository'
import { SubscriptionRepository } from './repositories/subscription-repository'
import { WorkspaceRepository } from './repositories/workspace-repository'

export type { BookmarkItem } from './repositories/bookmark-repository'
export type { DownloadItem, DownloadState } from './repositories/download-repository'
export type { HistoryItem } from './repositories/history-repository'
export type { SubscriptionRecord } from './repositories/subscription-repository'
export type { WorkspaceRecord, WorkspaceTabState } from './repositories/workspace-repository'
export {
  BookmarkRepository,
  DatabaseManager,
  DownloadRepository,
  HistoryRepository,
  SubscriptionRepository,
  WorkspaceRepository,
}
