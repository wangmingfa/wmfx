/**
 * 请求捕获器 — 对每个 session 挂载 webRequest 钩子链，捕获所有请求并推送到渲染页
 *
 * 注意：Electron webRequest API 的 callback 类型签名不完整（缺少 redirectURL/statusCode 等字段），
 * 需要类型断言绕过，运行时正常工作。
 * Biome 的 noExplicitAny 规则已通过 ignore 注释处理。
 */

import type { CapturedRequest, InterceptorRule } from '@browser/ipc-contract'
import type { Session } from 'electron'
import { InterceptorEngine } from './InterceptorEngine'

type WithId = { __capturedId?: string; [key: string]: unknown }

export class RequestCapturer {
  private static MAX_CAPTURED = 5000
  private captured: CapturedRequest[] = []
  private attached = new WeakSet<Session>()
  private enabled = false
  private engine: InterceptorEngine
  /** 收集完成的请求，等待下次推送 */
  private pending: CapturedRequest[] = []
  private pushTimer: ReturnType<typeof setInterval> | null = null
  /** 推送到渲染进程的回调 */
  private onPush: ((requests: CapturedRequest[]) => void) | null = null

  constructor(getRules: () => InterceptorRule[]) {
    this.engine = new InterceptorEngine(getRules)
    console.debug('[RequestCapturer] constructor')
  }

  isEnabled(): boolean {
    return this.enabled
  }

  setEnabled(value: boolean): void {
    console.info('[RequestCapturer] setEnabled:', value)
    this.enabled = value
    if (value) this.startPushTimer()
    else this.stopPushTimer()
  }

  /** 注册推送回调（渲染进程侧通过 IPC 注册） */
  setPushCallback(cb: (requests: CapturedRequest[]) => void): void {
    this.onPush = cb
  }

  getCaptured(opts?: { limit?: number; offset?: number }): CapturedRequest[] {
    const limit = opts?.limit ?? 100
    const offset = opts?.offset ?? 0
    return this.captured.slice(offset, offset + limit)
  }

  getCapturedCount(): number {
    return this.captured.length
  }

  clearLog(): void {
    this.captured = []
    this.pending = []
  }

  /** 对 session 幂等挂载 webRequest 钩子链 */
  attach(session: Session): void {
    if (this.attached.has(session)) return
    this.attached.add(session)
    console.debug('[RequestCapturer] attach session')
    const wr = session.webRequest

    wr.onBeforeRequest((details, callback) => {
      if (!this.enabled) {
        callback({})
        return
      }
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const entry: CapturedRequest = {
        id,
        tabId: details.webContents?.id.toString() ?? '',
        method: details.method,
        url: details.url,
        statusCode: 0,
        statusLine: '',
        requestHeaders: {},
        responseHeaders: {},
        type: details.resourceType,
        startTime: Date.now(),
        endTime: 0,
        duration: 0,
        intercepted: false,
      }
      const now = Date.now()
      const reqInfo = { url: details.url, method: details.method, type: details.resourceType }
      const match = this.engine.match(reqInfo)
      if (match) {
        entry.intercepted = true
        entry.ruleId = match.id
        entry.ruleName = match.name
        if (match.action === 'block') {
          entry.endTime = Date.now()
          entry.duration = entry.endTime - now
          entry.statusCode = 0
          this.addCaptured(entry)
          callback({ cancel: true })
          return
        } else if (match.action === 'redirect' && match.targetUrl) {
          entry.endTime = Date.now()
          entry.duration = entry.endTime - now
          this.addCaptured(entry)
          // biome-ignore lint/suspicious/noExplicitAny: Electron's BeforeRequestResponse doesn't include redirectURL
          callback({ redirectURL: match.targetUrl } as any)
          return
        }
      }
      const d = details as unknown as WithId
      d.__capturedId = entry.id
      this.capturedMap.set(entry.id, entry)
      callback({})
    })

    wr.onBeforeSendHeaders((details, callback) => {
      if (!this.enabled) {
        callback({})
        return
      }
      const d = details as unknown as WithId
      const entry = this.capturedMap.get(d.__capturedId ?? '')
      if (entry) {
        entry.requestHeaders = { ...(details.requestHeaders as Record<string, string>) }
        const match = this.engine.match({
          url: details.url,
          method: details.method,
          type: details.resourceType,
        })
        if (match?.action === 'redirect' && match.targetUrl && !entry.intercepted) {
          entry.intercepted = true
          entry.ruleId = match.id
          entry.ruleName = match.name
          entry.endTime = Date.now()
          entry.duration = entry.endTime - entry.startTime
          this.addCaptured(entry)
          // biome-ignore lint/suspicious/noExplicitAny: Electron's BeforeSendResponse doesn't include redirectURL
          callback({ redirectURL: match.targetUrl } as any)
          return
        }
      }
      callback({ requestHeaders: details.requestHeaders })
    })

    wr.onSendHeaders((details) => {
      if (!this.enabled) return
      const d = details as unknown as WithId
      const entry = this.capturedMap.get(d.__capturedId ?? '')
      if (entry) {
        entry.requestHeaders = { ...(details.requestHeaders as Record<string, string>) }
      }
    })

    wr.onHeadersReceived((details, callback) => {
      if (!this.enabled) {
        callback({})
        return
      }
      const d = details as unknown as WithId
      const entry = this.capturedMap.get(d.__capturedId ?? '')
      if (entry) {
        entry.statusCode = details.statusCode
        entry.statusLine = details.statusLine ?? ''
        entry.responseHeaders = details.responseHeaders
          ? Object.fromEntries(
              Object.entries(details.responseHeaders).map(([k, v]) => [
                k,
                Array.isArray(v) ? v.join(', ') : v,
              ])
            )
          : {}
        const match = this.engine.match({
          url: details.url,
          method: details.method,
          type: details.resourceType,
        })
        if (match?.action === 'mock' && !entry.intercepted) {
          entry.intercepted = true
          entry.ruleId = match.id
          entry.ruleName = match.name
          entry.statusCode = match.mockStatusCode ?? 200
          entry.responseHeaders = { ...(match.mockHeaders ?? {}), ...entry.responseHeaders }
          entry.endTime = Date.now()
          entry.duration = entry.endTime - entry.startTime
          this.addCaptured(entry)
          callback({
            statusCode: match.mockStatusCode ?? 200,
            responseHeaders: match.mockHeaders ?? details.responseHeaders,
            // biome-ignore lint/suspicious/noExplicitAny: Electron's HeadersReceivedResponse type is incomplete
          } as any)
          return
        }
      }
      callback({})
    })

    wr.onCompleted((details) => {
      if (!this.enabled) return
      const d = details as unknown as WithId
      const entry = this.capturedMap.get(d.__capturedId ?? '')
      if (entry && !entry.intercepted) {
        entry.statusCode = details.statusCode
        entry.statusLine = details.statusLine ?? ''
        entry.responseHeaders = details.responseHeaders
          ? Object.fromEntries(
              Object.entries(details.responseHeaders).map(([k, v]) => [
                k,
                Array.isArray(v) ? v.join(', ') : v,
              ])
            )
          : {}
        entry.endTime = Date.now()
        entry.duration = entry.endTime - entry.startTime
        entry.error = undefined
        this.addCaptured(entry)
      }
      this.capturedMap.delete(d.__capturedId ?? '')
    })

    wr.onErrorOccurred((details) => {
      if (!this.enabled) return
      const d = details as unknown as WithId
      const entry = this.capturedMap.get(d.__capturedId ?? '')
      if (entry) {
        entry.error = details.error
        entry.endTime = Date.now()
        entry.duration = entry.endTime - entry.startTime
        if (!entry.intercepted) this.addCaptured(entry)
      }
      this.capturedMap.delete(d.__capturedId ?? '')
    })
  }

  private capturedMap = new Map<string, CapturedRequest>()

  private addCaptured(entry: CapturedRequest): void {
    this.captured.push(entry)
    if (this.captured.length > RequestCapturer.MAX_CAPTURED) {
      this.captured.splice(0, this.captured.length - RequestCapturer.MAX_CAPTURED)
    }
    this.pending.push(entry)
  }

  private startPushTimer(): void {
    if (this.pushTimer) return
    this.pushTimer = setInterval(() => {
      if (this.pending.length > 0 && this.onPush) {
        const batch = this.pending.splice(0, this.pending.length)
        const chunks: CapturedRequest[][] = []
        for (let i = 0; i < batch.length; i += 50) {
          chunks.push(batch.slice(i, i + 50))
        }
        for (const chunk of chunks) {
          this.onPush(chunk)
        }
      }
    }, 300)
  }

  private stopPushTimer(): void {
    if (this.pushTimer) {
      clearInterval(this.pushTimer)
      this.pushTimer = null
    }
  }
}
