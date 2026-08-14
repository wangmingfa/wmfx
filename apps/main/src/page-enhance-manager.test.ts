import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PageEnhanceManager } from './page-enhance-manager'

// 懒加载的 darkreader/readability IIFE 从磁盘读取，测试里用 mock 避免真实 IO
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(async (path: string) => {
    if (path.includes('darkreader')) return 'var DarkReader = { enable(){}, disable(){} };'
    if (path.includes('readability')) return 'var Readability = function(){};'
    return ''
  }),
}))

function fakeWc(url: string) {
  return {
    getURL: () => url,
    executeJavaScript: vi
      .fn()
      .mockResolvedValue(
        JSON.stringify({ title: 'T', content: '<p>hi</p>', byline: null, url: 'https://x.com' })
      ),
    once: vi.fn(),
    isDestroyed: vi.fn(() => false),
    id: Math.floor(Math.random() * 1e9),
  }
}

/** 等待异步的 enableDark 流程结算（loadDarkReader → executeJavaScript） */
async function flush(): Promise<void> {
  await new Promise((r) => setTimeout(r, 0))
}

describe('PageEnhanceManager', () => {
  let mgr: PageEnhanceManager
  beforeEach(() => {
    mgr = new PageEnhanceManager()
    vi.clearAllMocks()
  })

  it('applyDark(true) 对外部页注入 DarkReader.enable', async () => {
    const wc = fakeWc('https://example.com')
    mgr.applyDark(wc as never, true)
    await flush()
    expect(wc.executeJavaScript).toHaveBeenCalledTimes(1)
    expect(wc.executeJavaScript.mock.calls[0][0]).toContain('DarkReader.enable')
  })

  it('applyDark(false) 移除已启用暗色（调用 DarkReader.disable）', async () => {
    const wc = fakeWc('https://example.com')
    mgr.applyDark(wc as never, true)
    await flush()
    mgr.applyDark(wc as never, false)
    // disable 在串行链上排队执行，需等待链结算
    await flush()
    expect(wc.executeJavaScript).toHaveBeenCalledTimes(2)
    expect(wc.executeJavaScript.mock.calls[1][0]).toContain('DarkReader.disable')
  })

  it('enable 尚未结算时立即关闭：不残留暗色（回归：快速 toggle 竞态）', async () => {
    const wc = fakeWc('https://example.com')
    mgr.applyDark(wc as never, true)
    // 不等 enable 完成就关闭：期望状态为 false，enable 结算后应跳过注入
    mgr.applyDark(wc as never, false)
    await flush()
    // 只调用了一次 disable，没有 enable 注入残留
    expect(wc.executeJavaScript).toHaveBeenCalledTimes(1)
    expect(wc.executeJavaScript.mock.calls[0][0]).toContain('DarkReader.disable')
  })

  it('removeDarkBatch 在 enable 尚未结算时也能取消（回归：慢速点击关闭失效）', async () => {
    const wc = fakeWc('https://example.com')
    mgr.applyDark(wc as never, true)
    // enable 尚在 in-flight（不在 darkEnabled 中），立即批量关闭
    mgr.removeDarkBatch([wc as never])
    await flush()
    // darkDesired 已置 false：enable 结算时跳过注入，不残留 enable 调用
    expect(
      wc.executeJavaScript.mock.calls.filter((c) => c[0].includes('DarkReader.enable'))
    ).toHaveLength(0)
    // 再次 applyDark(true) 可正常重新注入（darkInFlight 已释放）
    mgr.applyDark(wc as never, true)
    await flush()
    expect(
      wc.executeJavaScript.mock.calls.filter((c) => c[0].includes('DarkReader.enable'))
    ).toHaveLength(1)
  })

  it('removeDarkBatch 对已生效 wc 调用 DarkReader.disable（回归：批量关闭生效页面）', async () => {
    const wc = fakeWc('https://example.com')
    mgr.applyDark(wc as never, true)
    await flush()
    mgr.removeDarkBatch([wc as never])
    // disable 在串行链上排队执行，需等待链结算
    await flush()
    // enable 注入 1 次 + disable 1 次
    expect(
      wc.executeJavaScript.mock.calls.filter((c) => c[0].includes('DarkReader.enable'))
    ).toHaveLength(1)
    expect(
      wc.executeJavaScript.mock.calls.filter((c) => c[0].includes('DarkReader.disable'))
    ).toHaveLength(1)
  })

  it('applyDark 对内部页/about:blank 不注入', () => {
    const wmfx = fakeWc('wmfx://reader')
    const blank = fakeWc('about:blank')
    mgr.applyDark(wmfx as never, true)
    mgr.applyDark(blank as never, true)
    expect(wmfx.executeJavaScript).not.toHaveBeenCalled()
    expect(blank.executeJavaScript).not.toHaveBeenCalled()
  })

  it('applyDark(true) 幂等：同一 wc 重复调用不重复注入（页内导航防堆积）', async () => {
    const wc = fakeWc('https://example.com')
    mgr.applyDark(wc as never, true)
    mgr.applyDark(wc as never, true)
    mgr.applyDark(wc as never, true)
    await flush()
    mgr.applyDark(wc as never, true)
    expect(wc.executeJavaScript.mock.calls.filter((c) => c[0].includes('enable'))).toHaveLength(1)
  })

  it('resetDark 后再 applyDark(true) 会重新注入（回归：全量导航后暗色重新生效）', async () => {
    const wc = fakeWc('https://example.com')
    mgr.applyDark(wc as never, true)
    await flush()
    expect(wc.executeJavaScript.mock.calls.filter((c) => c[0].includes('enable'))).toHaveLength(1)
    // 模拟 did-navigate 全量导航：旧文档脚本已随导航销毁，重置追踪后应重新注入
    mgr.resetDark(wc as never)
    mgr.applyDark(wc as never, true)
    await flush()
    expect(wc.executeJavaScript.mock.calls.filter((c) => c[0].includes('enable'))).toHaveLength(2)
  })

  it('applyDark(true) 注册一次 destroyed 清理，销毁后重新注入', async () => {
    const wc = fakeWc('https://example.com')
    mgr.applyDark(wc as never, true)
    await flush()
    // destroyed 仅注册一次（首次追踪时）
    expect(wc.once).toHaveBeenCalledTimes(1)
    expect(wc.once).toHaveBeenCalledWith('destroyed', expect.any(Function))
    // 触发 destroyed 回调后，追踪已清空，再次 applyDark(true) 重新注入
    const destroyedCb = wc.once.mock.calls[0][1] as () => void
    destroyedCb()
    mgr.applyDark(wc as never, true)
    await flush()
    expect(wc.executeJavaScript.mock.calls.filter((c) => c[0].includes('enable'))).toHaveLength(2)
  })

  it('extractArticle 解析 executeJavaScript 返回的 JSON', async () => {
    const wc = fakeWc('https://example.com')
    const article = await mgr.extractArticle(wc as never)
    expect(article).not.toBeNull()
    expect(article?.title).toBe('T')
    expect(wc.executeJavaScript).toHaveBeenCalled()
  })
})
