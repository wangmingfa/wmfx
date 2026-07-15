import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'

let app: ElectronApplication
let page: Page

/**
 * popover 渲染在独立 popoverView 的 /panel 路由中，Playwright 的 app.windows() 会把它枚举为
 * 一个独立的 page，但不保证是默认 page。这里轮询直到拿到带 .tab-bar 的外壳页面，避免选中某个
 * 标签的 WebContentsView 导致断言失败。
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

/** 轮询 app.windows()，返回含目标选择器的 popover 面板 page（独立 webContents）。 */
async function findPanelWith(selector: string): Promise<Page> {
  for (let i = 0; i < 50; i++) {
    for (const w of app.windows()) {
      try {
        if ((await w.locator(selector).count()) > 0) return w
      } catch {
        /* page may detach between calls */
      }
    }
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error(`findPanelWith: "${selector}" not found in any webContents`)
}

/** 统计所有 webContents 中目标选择器出现的次数（用于验证 popover 已关闭）。 */
async function countInAllWindows(selector: string): Promise<number> {
  let n = 0
  for (const w of app.windows()) {
    try {
      n += await w.locator(selector).count()
    } catch {
      /* page may detach between calls */
    }
  }
  return n
}

test.beforeAll(async () => {
  app = await electron.launch({
    args: ['apps/main/dist/index.cjs', '--no-sandbox', '--disable-gpu'],
  })
  page = await getShell()
})

test.afterAll(() => {
  return app.close()
})

// 每个用例前重置为「单个新标签页」干净状态，避免用例间标签/状态互相污染。
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

test('地址栏 popover 覆盖输入框但不挡标签栏，点标签栏可切换并失焦关闭', async () => {
  const addr = page.locator('.url-input')
  await addr.click()

  // 地址栏 popover 出现在独立面板 webContents，且覆盖在输入框上
  const panel = await findPanelWith('.popover-box.is-addressbar')
  await expect(panel.locator('.popover-box.is-addressbar')).toBeVisible()

  // 标签栏仍可点击（bounded 模式下的 popover 视图只覆盖输入框区域，不铺满窗口阻断交互）
  const tab = page.locator('.tab-item').first()
  await expect(tab).toBeVisible()
  await tab.click()

  // 失焦后 popover 关闭：不再有任何 .popover-box.is-addressbar 残留
  await expect
    .poll(async () => await countInAllWindows('.popover-box.is-addressbar'))
    .toBe(0)
})

test('菜单 popover 不挡应用，点应用其它区域失焦关闭', async () => {
  await page.locator('.app-menu').click()

  // 菜单出现在独立面板 webContents
  const panel = await findPanelWith('.popover-box')
  await expect(panel.getByText('书签', { exact: true })).toBeVisible()

  // 点击应用窗口的非 popover 区域应使 popover 失焦关闭
  await page.mouse.click(400, 400)
  await expect.poll(async () => await countInAllWindows('.popover-box')).toBe(0)
})
