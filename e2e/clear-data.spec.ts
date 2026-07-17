import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'

let app: ElectronApplication
let page: Page

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

/**
 * popover 菜单渲染在独立 popoverView 的 /panel 路由中，会被枚举进 app.windows() 但未必是默认
 * page。轮询找到含目标文案的面板 page 并与之交互。
 */
async function findPopoverPage(text: string): Promise<Page> {
  for (let i = 0; i < 50; i++) {
    for (const w of app.windows()) {
      try {
        if ((await w.getByText(text, { exact: true }).count()) > 0) return w
      } catch {
        /* page may detach between calls */
      }
    }
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error(`findPopoverPage: "${text}" not found in any webContents`)
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
  await expect(page.locator('.url-input')).toHaveValue('', {
    timeout: 15000,
  })
})

test('设置页清除浏览数据弹窗', async () => {
  // 导航到隐私设置页
  await page.locator('.url-input').fill('wmfx://settings/privacy')
  await page.keyboard.press('Enter')
  await expect(page.locator('.url-input')).toHaveValue('wmfx://settings/privacy')

  // 点击设置页触发按钮（文案「清除浏览数据」）
  await page.getByRole('button', { name: '清除浏览数据' }).first().click()

  // 弹窗标题「清除浏览数据」可见
  const modal = page.locator('.n-modal')
  await expect(modal.getByText('清除浏览数据', { exact: true }).first()).toBeVisible()

  // 取消勾选全部四个复选（默认全勾），清除按钮应禁用
  await modal.getByText('Cookie', { exact: true }).click()
  await modal.getByText('缓存', { exact: true }).click()
  await modal.getByText('本地存储', { exact: true }).click()
  await modal.getByText('表单数据（近似清除）', { exact: true }).click()
  await expect(modal.getByRole('button', { name: '清除浏览数据' })).toBeDisabled()

  // 重新勾选缓存
  await modal.getByText('缓存', { exact: true }).click()

  // 点击清除按钮
  await modal.getByRole('button', { name: '清除浏览数据' }).click()

  // 成功后显示「已清除浏览数据」
  await expect(modal.getByText('已清除浏览数据', { exact: true })).toBeVisible()
})

test('三点菜单清空缓存打开同一弹窗', async () => {
  // 导航到新标签页（任意页均可）
  await page.locator('.url-input').fill('wmfx://newtab')
  await page.keyboard.press('Enter')
  await expect(page.locator('.url-input')).toHaveValue('')

  // 点击三点菜单（title=「菜单」）
  await page.getByTitle('菜单').click()

  // 在 popover 面板中点击「清空缓存」
  const panel = await findPopoverPage('清空缓存')
  await panel.getByText('清空缓存', { exact: true }).click()

  // 弹窗标题「清除浏览数据」可见（与设置页同一弹窗）
  await expect(page.locator('.n-modal').getByText('清除浏览数据', { exact: true }).first()).toBeVisible()
})
