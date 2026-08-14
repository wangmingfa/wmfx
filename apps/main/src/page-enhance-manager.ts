/**
 * 页面增强管理器 — 强制暗色 + 阅读模式正文提取（主进程侧）
 *
 * - 强制暗色：外部 http(s) 页通过 executeJavaScript 注入 resources/darkreader.js
 *   （esbuild 打包的 IIFE，暴露全局 DarkReader），再调用 DarkReader.enable()/disable()
 *   开关。相比 CSS 反色滤镜，Dark Reader 逐色映射站点样式表：
 *   媒体保持原样、色相不偏、已支持暗色的站点不会二次反转，且内部监听 DOM
 *   变化自动适配动态内容。
 * - 阅读模式：在 PageView 的 webContents 内执行 Readability IIFE 提取正文，
 *   返回结构化文章；视图切换由 TabManager 控制，原网页不销毁。
 *
 * 注意：外部页不挂 preload，故注入脚本必须是自包含纯 JS 字符串。
 * Readability / DarkReader 已由 esbuild 打包为 IIFE（resources/*.js），
 * 运行时用 fs.readFile 读取，再 executeJavaScript 注入。
 */

import { readFile } from 'node:fs/promises'
import { wmfxFromActualUrl } from '@browser/shared'
import type { WebContents } from 'electron'
import { resolveFromRoot } from './paths'

export interface ExtractedArticle {
  title: string
  content: string
  byline: string | null
  url: string
}

export class PageEnhanceManager {
  /** 已生效（注入完成）的 webContents id 集合（幂等去重用） */
  private darkEnabled = new Set<number>()
  /** 每个 wc 的期望暗色状态（最新点击意图；串行链上每个操作执行时复查它） */
  private darkDesired = new Map<number, boolean>()
  /** 每个 wc 的暗色操作串行链：enable/disable 严格按提交顺序执行，杜绝过期脚本交错 */
  private darkOps = new Map<number, Promise<void>>()
  /** 已注册 destroyed 清理的 wc id（避免重复注册监听） */
  private darkTracked = new Set<number>()
  private readabilitySrc = ''
  private darkreaderSrc = ''

  /** 页面实际 URL 是否是内部页 wmfx://（dev 走 http://...#/path，prod 走 file://...#/path）。 */
  private isInternal(wc: WebContents): boolean {
    return wmfxFromActualUrl(wc.getURL()) !== null
  }

  /** 懒加载 Readability IIFE 脚本字符串 */
  private async loadReadability(): Promise<string> {
    if (!this.readabilitySrc) {
      this.readabilitySrc = await readFile(resolveFromRoot('resources/readability.js'), 'utf-8')
      console.debug(`[PageEnhanceManager] loadReadability: len=${this.readabilitySrc.length}`)
    }
    return this.readabilitySrc
  }

  /** 懒加载 Dark Reader IIFE 脚本字符串 */
  private async loadDarkReader(): Promise<string> {
    if (!this.darkreaderSrc) {
      this.darkreaderSrc = await readFile(resolveFromRoot('resources/darkreader.js'), 'utf-8')
      console.debug(`[PageEnhanceManager] loadDarkReader: len=${this.darkreaderSrc.length}`)
    }
    return this.darkreaderSrc
  }

  applyDark(wc: WebContents, isDark: boolean): void {
    const url = wc.getURL()
    const isExternal =
      !this.isInternal(wc) && (url.startsWith('http://') || url.startsWith('https://'))
    console.debug(
      `[PageEnhanceManager] applyDark: isDark=${isDark} url=${url} isExternal=${isExternal}`
    )
    if (!isExternal) return
    // 记录最新意图后入链：快速连续 toggle 时只有最后一次意图生效，
    // 链上早先排队但已过期的操作会在执行时复查 darkDesired 自动跳过
    this.darkDesired.set(wc.id, isDark)
    this.enqueueDarkOp(wc, isDark ? () => this.enableDark(wc) : () => this.disableDark(wc))
  }

  /** 把暗色操作挂到该 wc 的串行链尾部，严格按提交顺序执行（前序失败不阻塞后续） */
  private enqueueDarkOp(wc: WebContents, op: () => Promise<void>): void {
    const prev = this.darkOps.get(wc.id) ?? Promise.resolve()
    const next = prev
      .catch(() => {})
      .then(op)
      .catch((err) => {
        console.error(`[PageEnhanceManager] dark op failed wcId=${wc.id}`, err)
      })
    this.darkOps.set(wc.id, next)
    if (!this.darkTracked.has(wc.id)) {
      this.darkTracked.add(wc.id)
      wc.once('destroyed', () => {
        this.darkTracked.delete(wc.id)
        this.darkOps.delete(wc.id)
        this.darkEnabled.delete(wc.id)
        this.darkDesired.delete(wc.id)
      })
    }
  }

  /** 注入 Dark Reader 并启用暗色（在串行链中执行；失败仅记录，不抛给上层） */
  private async enableDark(wc: WebContents): Promise<void> {
    // 执行时复查：排队期间可能已被后续点击关闭
    if (this.darkDesired.get(wc.id) !== true) return
    if (this.darkEnabled.has(wc.id)) return // 已生效，幂等跳过
    const src = await this.loadDarkReader()
    if (wc.isDestroyed()) return
    // 注入前复查：加载脚本期间可能已被关闭
    if (this.darkDesired.get(wc.id) !== true) return
    try {
      // 先屏蔽全局 define/exports/module 再注入：darkreader 是 UMD 产物，
      // 若页面存在 AMD 加载器（如百度首页的全局 define），UMD 会走 AMD/CJS 分支
      // 把模块注册到加载器而非挂到 window.DarkReader，导致后续 enable 抛 undefined。
      // 屏蔽后 UMD 强制走浏览器分支挂到全局，注入完恢复原值。
      await wc.executeJavaScript(
        `;(function() {
          const __saved = { define: window.define, exports: window.exports, module: window.module };
          let __restored = false;
          const __restore = () => {
            if (__restored) return;
            __restored = true;
            window.define = __saved.define;
            window.exports = __saved.exports;
            window.module = __saved.module;
          };
          try {
            window.define = undefined;
            window.exports = undefined;
            window.module = undefined;
          } catch (e) { /* 只读全局，忽略 */ }
          try {
            ${src}
          } finally {
            __restore();
          }
        })();
        ;DarkReader.setFetchMethod((url) => fetch(url));
        DarkReader.enable({
          mode: 1,
          brightness: 100,
          contrast: 90,
          sepia: 0,
          grayscale: 0
        });`
      )
    } catch (err) {
      console.error(`[PageEnhanceManager] enableDark: execute failed wcId=${wc.id}`, err)
      return
    }
    // 注入后复查：若期间被关闭，立即禁用避免残留暗色
    if (this.darkDesired.get(wc.id) !== true) {
      await wc
        .executeJavaScript('if (typeof DarkReader !== "undefined") { DarkReader.disable(); }')
        .catch(() => {})
      return
    }
    this.darkEnabled.add(wc.id)
    console.debug(`[PageEnhanceManager] enableDark: ok wcId=${wc.id}`)
  }

  /** 移除单个 webContents 的暗色（在串行链中执行）。 */
  private async disableDark(wc: WebContents): Promise<void> {
    // 执行时复查：排队期间可能已被后续点击重新开启
    if (this.darkDesired.get(wc.id) !== false) return
    this.darkEnabled.delete(wc.id)
    await wc
      .executeJavaScript('if (typeof DarkReader !== "undefined") { DarkReader.disable(); }')
      .catch(() => {})
  }

  /** 批量关闭指定 webContents 列表的暗色（每个 wc 入链，最后意图生效）。 */
  removeDarkBatch(wcs: WebContents[]): void {
    for (const w of wcs) {
      if (w.isDestroyed()) continue
      this.darkDesired.set(w.id, false)
      this.enqueueDarkOp(w, () => this.disableDark(w))
    }
  }

  /**
   * 忘记某 webContents 追踪的暗色状态（不调用 DarkReader.disable）。
   * 用于全量导航（did-navigate）：旧文档已随导航销毁，注入的脚本随之失效，
   * 若不清除 darkEnabled 会让幂等 guard 误判为"已启用"而跳过新页注入。
   * 页内导航（did-navigate-in-page）文档不变、脚本仍在，切勿调用本方法。
   */
  resetDark(wc: WebContents): void {
    console.debug(`[PageEnhanceManager] resetDark: wcId=${wc.id}`)
    this.darkEnabled.delete(wc.id)
    this.darkDesired.delete(wc.id)
  }

  async extractArticle(wc: WebContents): Promise<ExtractedArticle | null> {
    const src = await this.loadReadability()
    const result = await wc.executeJavaScript(
      `${src}
      ;(function(){
        try {
          const clone = document.cloneNode(true);
          const article = new Readability(clone).parse();
          if (!article || !article.content) return null;
          return JSON.stringify({
            title: article.title || document.title,
            content: article.content,
            byline: article.byline || null,
            url: location.href
          });
        } catch (e) { return null; }
      })();`
    )
    console.debug(`[PageEnhanceManager] extractArticle: hasResult=${!!result}`)
    if (!result) return null
    try {
      return JSON.parse(result) as ExtractedArticle
    } catch {
      return null
    }
  }
}
