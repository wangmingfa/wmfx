/**
 * 云同步管理器（主进程）
 *
 * 职责：
 * - 编排同步：收集本地数据 → 加密 → WebDAV 上传
 * - 编排恢复：WebDAV 下载 → 解密 → 恢复到本地各 manager
 *
 * 密钥流：
 * - 用户密码在 renderer 用 Web Crypto 派生 AES-256-GCM key (Uint8Array)
 * - key 通过 IPC 传给本模块，主进程只接触密文，不接触明文密码
 * - 同步/恢复完成后 key 被丢弃
 */

import type { EncryptedPackage } from '../crypto'
import { exportPackage, importPackage, parsePackageJson } from '../crypto'
import { WebDAVClient, WebDAVError } from '../webdav-client'
import type { CloudSyncConfig, ExportData, SyncRecord } from './types'

const PACKAGE_KEY = 'settings.wmfx'
const METAS_KEY = '._meta.json'

export class CloudSyncManager {
  private recentRecords_: SyncRecord[] = []
  private connected_ = false

  setRecentRecords(records: SyncRecord[]) {
    this.recentRecords_ = records
  }
  get recentRecords(): SyncRecord[] {
    return this.recentRecords_
  }
  get connected(): boolean {
    return this.connected_
  }
  set connected(v: boolean) {
    this.connected_ = v
  }

  /** 测试 WebDAV 连接 */
  async testConnection(
    config: CloudSyncConfig
  ): Promise<{ ok: boolean; message: string; status: number }> {
    if (config.type !== 'webdav') {
      throw new Error(`[CloudSync] unsupported type ${config.type}`)
    }
    console.info('[CloudSync] testConnection: host', config.webdav.baseUrl)
    const client = new WebDAVClient(config.webdav)
    try {
      await client.test()
      this.connected_ = true
      return { ok: true, message: '连接成功', status: 200 }
    } catch (err) {
      this.connected_ = false
      if (err instanceof WebDAVError) {
        return { ok: false, message: err.message, status: err.status }
      }
      return { ok: false, message: String(err), status: 0 }
    }
  }

  /** 同步本地数据到云端 */
  async upload(
    config: CloudSyncConfig,
    data: ExportData,
    key: Uint8Array
  ): Promise<{ ok: boolean; message: string; bytes: number }> {
    if (config.type !== 'webdav') throw new Error(`[CloudSync] unsupported type ${config.type}`)
    console.info('[CloudSync] upload: starting')

    const client = new WebDAVClient(config.webdav)
    const pkg: EncryptedPackage = await exportPackage(data, key)

    await client.upload(PACKAGE_KEY, Buffer.from(JSON.stringify(pkg)))
    await client.upload(
      METAS_KEY,
      Buffer.from(
        JSON.stringify({
          schemaVersion: pkg.schemaVersion,
          exportedAt: pkg.exportedAt,
          updatedAt: Date.now(),
        })
      )
    )

    console.info('[CloudSync] upload: done, bytes', pkg.ciphertext.length)
    this.addRecord({
      timestamp: Date.now(),
      action: 'upload',
      ok: true,
      message: '同步成功',
      bytes: pkg.ciphertext.length,
    })
    return { ok: true, message: '同步成功', bytes: pkg.ciphertext.length }
  }

  /** 从云端下载加密包（返回 JSON 字符串，未解密） */
  async downloadEncrypted(
    config: CloudSyncConfig
  ): Promise<{ ok: boolean; message: string; packageJson?: string; bytes: number }> {
    if (config.type !== 'webdav') throw new Error(`[CloudSync] unsupported type ${config.type}`)
    console.info('[CloudSync] downloadEncrypted: starting')

    const client = new WebDAVClient(config.webdav)
    try {
      const raw = await client.download(PACKAGE_KEY)
      const pkg = parsePackageJson(raw.toString('utf8'))
      this.addRecord({
        timestamp: Date.now(),
        action: 'download',
        ok: true,
        message: '下载成功',
        bytes: raw.length,
      })
      return { ok: true, message: '下载成功', packageJson: JSON.stringify(pkg), bytes: raw.length }
    } catch (err) {
      if (err instanceof WebDAVError && err.code === 'NOT_FOUND') {
        return { ok: false, message: '云端没有同步数据（请先同步一次）', bytes: 0 }
      }
      this.addRecord({ timestamp: Date.now(), action: 'download', ok: false, message: String(err) })
      return { ok: false, message: String(err), bytes: 0 }
    }
  }

  /** 用 key 解密云端包并反序列化 */
  async decryptData(
    packageJson: string,
    key: Uint8Array
  ): Promise<{ ok: boolean; message: string; data?: unknown }> {
    const pkg = parsePackageJson(packageJson)
    try {
      const data = await importPackage<unknown>(pkg, key)
      return { ok: true, message: '解密成功', data }
    } catch {
      return { ok: false, message: '解密失败，请检查同步密码是否正确', data: undefined }
    }
  }

  /** 预览云端 meta（无需密码） */
  async preview(
    config: CloudSyncConfig
  ): Promise<{ ok: boolean; message: string; exportedAt?: number; schemaVersion?: number }> {
    if (config.type !== 'webdav') return { ok: false, message: 'unsupported type' }
    const client = new WebDAVClient(config.webdav)
    try {
      const raw = await client.download(METAS_KEY)
      const meta = JSON.parse(raw.toString('utf8'))
      return {
        ok: true,
        message: '已读取云端元信息',
        exportedAt: meta.exportedAt ?? meta.updatedAt ?? 0,
        schemaVersion: meta.schemaVersion ?? 1,
      }
    } catch {
      return { ok: false, message: '云端暂无同步数据' }
    }
  }

  /** 清空云端数据 */
  async deleteRemote(config: CloudSyncConfig): Promise<{ ok: boolean; message: string }> {
    if (config.type !== 'webdav') return { ok: false, message: 'unsupported type' }
    const client = new WebDAVClient(config.webdav)
    try {
      await client.delete(PACKAGE_KEY)
      await client.delete(METAS_KEY)
      this.addRecord({ timestamp: Date.now(), action: 'test', ok: true, message: '云端数据已清空' })
      return { ok: true, message: '云端数据已清空' }
    } catch (err) {
      return { ok: false, message: String(err) }
    }
  }

  /** 记录同步/恢复操作 */
  addRecord(rec: SyncRecord) {
    this.recentRecords_.unshift(rec)
    if (this.recentRecords_.length > 20) this.recentRecords_.length = 20
  }

  /** 清空同步记录 */
  clearRecords() {
    this.recentRecords_ = []
  }

  /** 模块级单例，所有窗口共享 */
  static getInstance(): CloudSyncManager {
    return CloudSyncManager._instance
  }
  private static _instance = new CloudSyncManager()
}
