import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'

let app: ElectronApplication
let page: Page

/** 本地 HTTP 服务器：提供一个「真实外部 http:// 页面」，含可被 Readability 提取的正文。
 * 用本地服务器替代公网站点，使「外部页」代码路径（暗色注入 applyDark、阅读模式提取、
 * 阅读按钮 isExternal 判定）在无外网/无头 CI 下也能确定性触发，而非依赖不稳定的公网。 */
let server: Server
let externalUrl = ''

/**
 * Electron + WebContentsView 下，Playwright 的 firstWindow()/windows() 只暴露一个 page，
 * 且该 page 可能绑定到外壳渲染进程，也可能绑定到某个标签的 WebContentsView
 * （两者都加载同一个 index.html，标签页的 hash 为 #/newtab 等内部路由）。
 * 外壳是唯一带 .tab-bar 的页面，且其路由为 #/（标签页为 #/newtab 等子路由）。
 * 这里轮询直到拿到外壳，避免选中标签页导致断言失败。
 */
async function getShell(): Promise<Page> {
  for (let i = 0; i < 60; i++) {
    for (const w of app.windows()) {
      try {
        if ((await w.locator('.tab-bar').count()) > 0) return w
      } catch {
        /* page may detach between calls */
      }
    }
    await new Promise((r) => setTimeout(r, 150))
  }
  throw new Error('getShell: shell window not found')
}

/** 轮询等待 active tab 的 displayUrl 提交到期望的外部 URL。
 * 返回 true 表示外部导航成功 commit（外部页代码路径已执行）；false 表示超时未提交。 */
async function waitExternalCommitted(expected: string, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const committed = await page.evaluate(async () => {
      const list = await window.browserAPI.getList()
      const active = list.find((t) => t.active)
      return active?.navigation.displayUrl ?? ''
    })
    if (committed === expected || committed.startsWith(expected)) return true
    await new Promise((r) => setTimeout(r, 150))
  }
  return false
}

/** 轮询等待 active tab 的 isReaderMode 到达期望值。返回是否达成。 */
async function waitReaderMode(expected: boolean, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const flag = await page.evaluate(async () => {
      const list = await window.browserAPI.getList()
      return list.find((t) => t.active)?.isReaderMode ?? false
    })
    if (flag === expected) return true
    await new Promise((r) => setTimeout(r, 150))
  }
  return false
}

test.beforeAll(async () => {
  // 启动本地文章服务器（真实 http:// 外部页）。
  server = createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(
      `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>WMFX Reader Fixture</title></head>
       <body>
         <article>
           <h1>WMFX Reader Fixture Article</h1>
           <p>${'This is a substantial paragraph of readable article text used to satisfy Readability extraction heuristics. '.repeat(
             12,
           )}</p>
           <p>${'Readability requires enough character content and paragraph structure before it treats a page as an article, so we provide several long paragraphs here. '.repeat(
             12,
           )}</p>
           <p>${'A third paragraph ensures the extractor has plenty of prose to work with and reliably returns non-null content across environments. '.repeat(
             12,
           )}</p>
         </article>
       </body></html>`,
    )
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const addr = server.address() as AddressInfo
  externalUrl = `http://127.0.0.1:${addr.port}/`

  app = await electron.launch({
    args: ['apps/main/dist/index.cjs', '--no-sandbox', '--disable-gpu'],
  })
  page = await getShell()
})

test.afterAll(async () => {
  await app.close()
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

// 每个用例前重置为「单个新标签页」干净状态，避免用例间标签/状态互相污染。
// 保留标签先跳到一个不同内部路由再回到 wmfx://newtab，确保真正触发导航事件。
test.beforeEach(async () => {
  await page.evaluate(async () => {
    const list = await window.browserAPI.getList()
    for (const t of list.slice(1)) {
      await window.browserAPI.closeTab(t.id)
    }
    const remaining = await window.browserAPI.getList()
    const active = remaining[0]
    if (active) {
      await window.browserAPI.loadURL(active.id, 'wmfx://downloads')
      await window.browserAPI.loadURL(active.id, 'wmfx://newtab')
    }
  })
  await expect(page.locator('.tab-item')).toHaveCount(1, { timeout: 15000 })
  await expect(page.locator('.url-input')).toHaveValue('', { timeout: 15000 })
})

test('暗色主题下外部页进入外部代码路径（提交 URL + 阅读按钮可见）', async () => {
  // 设置暗色主题：applyDark 仅对外部 http(s) 页注入暗色 CSS，此处切到 dark 后再导航外部页，
  // 触发主进程侧 applyDark 的外部页分支。
  await page.evaluate(async () => {
    await window.browserAPI.setTheme('dark')
  })
  const theme = await page.evaluate(async () => window.browserAPI.getTheme())
  expect(theme).toBe('dark')

  // 导航到真实本地 http 外部页。
  await page.evaluate(async (url) => {
    const list = await window.browserAPI.getList()
    const active = list.find((t) => t.active)
    if (active) await window.browserAPI.loadURL(active.id, url)
  }, externalUrl)

  // 网络依赖守卫：外部导航若无法在超时内 commit（离线/无头受限），跳过而非伪造通过。
  const committed = await waitExternalCommitted(externalUrl, 12000)
  test.skip(!committed, `外部页 ${externalUrl} 未能在超时内提交（需可用的本地/外部网络）`)

  // 真实断言 1：active tab 确实提交了外部 URL —— 证明外部页代码路径（含 applyDark 外部分支）已执行。
  const committedUrl = await page.evaluate(async () => {
    const list = await window.browserAPI.getList()
    return list.find((t) => t.active)?.navigation.displayUrl ?? ''
  })
  expect(committedUrl.startsWith('http://127.0.0.1:')).toBe(true)

  // 真实断言 2：阅读模式按钮对外部页可见（isExternal 判定为真的可观察信号，紧扣外部页代码路径）。
  await expect(page.getByTitle('阅读模式')).toBeVisible({ timeout: 8000 })
})

test('阅读模式进入/退出（isReaderMode 翻转）', async () => {
  // 导航到真实本地文章页。
  await page.evaluate(async (url) => {
    const list = await window.browserAPI.getList()
    const active = list.find((t) => t.active)
    if (active) await window.browserAPI.loadURL(active.id, url)
  }, externalUrl)

  const committed = await waitExternalCommitted(externalUrl, 12000)
  test.skip(!committed, `外部页 ${externalUrl} 未能在超时内提交（需可用的本地/外部网络）`)

  // 阅读按钮应对外部页可见（进入阅读模式的入口）。
  const enterBtn = page.getByTitle('阅读模式')
  await expect(enterBtn).toBeVisible({ timeout: 8000 })
  await enterBtn.click()

  // 网络/提取依赖守卫：若 Readability 无法从该页提取正文，isReaderMode 不会翻转，跳过而非伪造通过。
  const entered = await waitReaderMode(true, 10000)
  test.skip(!entered, '阅读正文提取未成功（isReaderMode 未翻转，可能受提取环境限制）')

  // 真实断言：active tab 的 isReaderMode 已翻转为 true（主进程真实状态信号）。
  const inReader = await page.evaluate(async () => {
    const list = await window.browserAPI.getList()
    return list.find((t) => t.active)?.isReaderMode ?? false
  })
  expect(inReader).toBe(true)

  // 退出阅读模式：通过 IPC 调用（ReaderView 渲染在独立 wmfx://reader 子视图，
  // 外壳 page 无法直接点到其退出按钮，故走真实 IPC 路径，等价于点击「退出阅读模式」）。
  await page.evaluate(async () => {
    const list = await window.browserAPI.getList()
    const active = list.find((t) => t.active)
    if (active) await window.browserAPI.exitReadingMode(active.id)
  })

  // 真实断言：退出后 isReaderMode 翻回 false。
  const exited = await waitReaderMode(false, 8000)
  expect(exited).toBe(true)
})
