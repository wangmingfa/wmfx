import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PageEnhanceManager } from './page-enhance-manager'

function fakeWc(url: string) {
  return {
    getURL: () => url,
    insertCSS: vi.fn().mockResolvedValue('css-key-1'),
    removeInsertedCSS: vi.fn().mockResolvedValue(undefined),
    executeJavaScript: vi
      .fn()
      .mockResolvedValue(
        JSON.stringify({ title: 'T', content: '<p>hi</p>', byline: null, url: 'https://x.com' })
      ),
    once: vi.fn(),
    id: Math.floor(Math.random() * 1e9),
  }
}

describe('PageEnhanceManager', () => {
  let mgr: PageEnhanceManager
  beforeEach(() => {
    mgr = new PageEnhanceManager()
    vi.clearAllMocks()
  })

  it('applyDark(true) 对外部页 insertCSS', () => {
    const wc = fakeWc('https://example.com')
    mgr.applyDark(wc as never, true)
    expect(wc.insertCSS).toHaveBeenCalled()
  })

  it('applyDark(false) 移除已注入 CSS', async () => {
    const wc = fakeWc('https://example.com')
    mgr.applyDark(wc as never, true)
    mgr.applyDark(wc as never, false)
    // 等待 pending 的 insertCSS 结算，remove 才会被触发
    await Promise.resolve()
    await Promise.resolve()
    expect(wc.removeInsertedCSS).toHaveBeenCalledWith('css-key-1')
  })

  it('remove 在 insert resolve 之前调用仍能正确移除（回归：竞态）', async () => {
    // 手动控制 insertCSS 的 Promise，模拟异步 IPC 尚未 resolve
    let resolveInsert: (key: string) => void = () => {}
    const wc = fakeWc('https://example.com')
    wc.insertCSS = vi.fn().mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          resolveInsert = resolve
        })
    )
    mgr.applyDark(wc as never, true)
    // 立即移除，此时 insertCSS 尚未 resolve，key 还未知
    mgr.applyDark(wc as never, false)
    expect(wc.removeInsertedCSS).not.toHaveBeenCalled()
    // insertCSS 结算后应补上移除
    resolveInsert('css-key-late')
    await Promise.resolve()
    await Promise.resolve()
    expect(wc.removeInsertedCSS).toHaveBeenCalledWith('css-key-late')
  })

  it('applyDark 对内部页/about:blank 不注入', () => {
    const wmfx = fakeWc('wmfx://reader')
    const blank = fakeWc('about:blank')
    mgr.applyDark(wmfx as never, true)
    mgr.applyDark(blank as never, true)
    expect(wmfx.insertCSS).not.toHaveBeenCalled()
    expect(blank.insertCSS).not.toHaveBeenCalled()
  })

  it('applyDark(true) 幂等：同一 wc 重复调用不重复注入（页内导航防堆积）', () => {
    const wc = fakeWc('https://example.com')
    mgr.applyDark(wc as never, true)
    mgr.applyDark(wc as never, true)
    mgr.applyDark(wc as never, true)
    expect(wc.insertCSS).toHaveBeenCalledTimes(1)
  })

  it('resetDark 后再 applyDark(true) 会重新注入（回归：全量导航后暗色重新生效）', () => {
    const wc = fakeWc('https://example.com')
    mgr.applyDark(wc as never, true)
    expect(wc.insertCSS).toHaveBeenCalledTimes(1)
    // 模拟 did-navigate 全量导航：旧文档 CSS 已被丢弃，重置追踪 key 后应重新注入
    mgr.resetDark(wc as never)
    mgr.applyDark(wc as never, true)
    expect(wc.insertCSS).toHaveBeenCalledTimes(2)
  })

  it('applyDark(true) 注册一次 destroyed 清理，销毁后 map 清空可重新注入', () => {
    const wc = fakeWc('https://example.com')
    mgr.applyDark(wc as never, true)
    // destroyed 仅注册一次（首次追踪时）
    expect(wc.once).toHaveBeenCalledTimes(1)
    expect(wc.once).toHaveBeenCalledWith('destroyed', expect.any(Function))
    // 触发 destroyed 回调后，map 已清空，再次 applyDark(true) 重新注入
    const destroyedCb = wc.once.mock.calls[0][1] as () => void
    destroyedCb()
    mgr.applyDark(wc as never, true)
    expect(wc.insertCSS).toHaveBeenCalledTimes(2)
  })

  it('extractArticle 解析 executeJavaScript 返回的 JSON', async () => {
    const wc = fakeWc('https://example.com')
    const article = await mgr.extractArticle(wc as never)
    expect(article).not.toBeNull()
    expect(article?.title).toBe('T')
    expect(wc.executeJavaScript).toHaveBeenCalled()
  })
})
