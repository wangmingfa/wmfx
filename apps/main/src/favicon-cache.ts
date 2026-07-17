/**
 * Favicon 缓存管理器 — 主进程侧，基于 electron-store 持久化到磁盘。
 *
 * key 规则（由 @browser/shared 的 faviconKeyOf 统一计算）：
 * - 外部地址：origin（含协议），如 'https://www.google.com'
 * - 内部地址：归一化全链接（剔 query/hash），如 'wmfx://settings/appearance'
 *
 * value：favicon 图标 URL（来源于 Electron 'page-favicon-updated' 事件，即 TabState.favicon）。
 * 渲染进程通过 'favicon:get' IPC 查询，达到跨重启复用、避免重复抓取的目的。
 */

import { faviconKeyOf } from '@browser/shared'
import Store from 'electron-store'

interface FaviconSchema {
  [key: string]: string
}

const store = new Store<FaviconSchema>({
  name: 'wmfx-favicons',
})

/** 按 key 查询缓存；未命中返回 null */
export function getFavicon(key: string): string | null {
  if (!key) {
    console.debug('[FaviconCache] getFavicon: empty key, skip')
    return null
  }
  const val = store.get(key) ?? null
  console.debug('[FaviconCache] getFavicon: key hit', key, val !== null)
  return val
}

/** 按页面 url 写入缓存（自动计算 key）；faviconUrl 为空则忽略 */
export function setFavicon(url: string, faviconUrl: string | null | undefined): void {
  const key = faviconKeyOf(url)
  if (!key || !faviconUrl) {
    console.debug('[FaviconCache] setFavicon: skip url key hasFavicon', url, key, !!faviconUrl)
    return
  }
  console.debug('[FaviconCache] setFavicon: url key', url, key)
  store.set(key, faviconUrl)
}

/** 按已算好的 key 直接写入（供 IPC 'favicon:set' 使用） */
export function setFaviconByKey(key: string, faviconUrl: string): void {
  if (!key || !faviconUrl) {
    console.debug('[FaviconCache] setFaviconByKey: skip key hasFavicon', key, !!faviconUrl)
    return
  }
  console.debug('[FaviconCache] setFaviconByKey: key', key)
  store.set(key, faviconUrl)
}
