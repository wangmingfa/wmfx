/**
 * 页面增强管理器 — 暗色注入 + 阅读模式正文提取（主进程侧）
 *
 * - 按全局主题给外部 http(s) 页注入/移除暗色 CSS（CSS 滤镜反色方案）
 * - 阅读模式：在 PageView 的 webContents 内执行 Readability IIFE 提取正文，
 *   返回结构化文章；视图切换由 TabManager 控制，原网页不销毁。
 *
 * 注意：外部页不挂 preload，故提取脚本必须是自包含纯 JS 字符串。
 * Readability 已由 esbuild 打包为 IIFE（resources/readability.js），
 * 运行时用 fs.readFile 读取，再 executeJavaScript 注入 PageView。
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
  private static readonly DARK_CSS = `
html { background: #0d0d0d !important; }
html, body, *:not(img):not(video):not(canvas) {
  filter: invert(1) hue-rotate(180deg) !important;
  background-color: #0d0d0d !important;
}
img, video, canvas { filter: invert(1) hue-rotate(180deg) !important; }
`
  /** 追踪每个外部 wc 注入的 CSS key（Promise<string>），用于精确移除。 */
  private darkCss = new Map<number, Promise<string>>()
  private readabilitySrc = ''

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

  applyDark(wc: WebContents, isDark: boolean): void {
    const url = wc.getURL()
    const isExternal =
      !this.isInternal(wc) && (url.startsWith('http://') || url.startsWith('https://'))
    console.debug(
      `[PageEnhanceManager] applyDark: isDark=${isDark} url=${url} isExternal=${isExternal}`
    )
    if (!isExternal) return
    if (isDark) {
      if (this.darkCss.has(wc.id)) {
        console.debug(`[PageEnhanceManager] applyDark: 已注入，跳过 wcId=${wc.id}`)
        return
      }
      const p = wc.insertCSS(PageEnhanceManager.DARK_CSS)
      this.darkCss.set(wc.id, p)
      wc.once('destroyed', () => {
        this.darkCss.delete(wc.id)
      })
    } else {
      this.removeDark(wc)
    }
  }

  /** 移除单个 webContents 的暗色 CSS。 */
  private removeDark(wc: WebContents): void {
    const p = this.darkCss.get(wc.id)
    if (p) {
      this.darkCss.delete(wc.id)
      void p.then((key) => wc.removeInsertedCSS(key)).catch(() => {})
    }
  }

  /** 批量移除指定 webContents 列表的暗色 CSS。 */
  removeDarkBatch(wcs: WebContents[]): void {
    const ids = new Set(wcs.map((w) => w.id))
    for (const [wcId, p] of this.darkCss) {
      if (!ids.has(wcId)) continue
      const w = wcs.find((x) => x.id === wcId)
      if (!w) {
        this.darkCss.delete(wcId)
        continue
      }
      this.darkCss.delete(wcId)
      void p.then((key) => w.removeInsertedCSS(key)).catch(() => {})
    }
  }

  /**
   * 忘记某 webContents 追踪的暗色 key（不调用 removeInsertedCSS）。
   * 用于全量导航（did-navigate）：Chromium 已随旧文档丢弃已注入的 CSS，
   * 但 darkCss map 仍持有过期 key，会让幂等 guard 误判为"已注入"而跳过新页注入。
   * 页内导航（did-navigate-in-page）文档不变、CSS 仍在，切勿调用本方法。
   */
  resetDark(wc: WebContents): void {
    console.debug(`[PageEnhanceManager] resetDark: wcId=${wc.id}`)
    this.darkCss.delete(wc.id)
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
