import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'

let app: ElectronApplication
let page: Page

/**
 * Electron + WebContentsView 下，Playwright 的 firstWindow()/windows() 只暴露一个 page，
 * 且该 page 可能绑定到外壳渲染进程，也可能绑定到某个标签的 WebContentsView
 * （两者都加载同一个 index.html，标签页的 hash 为 #/newtab 等内部路由）。
 * 外壳是唯一带 .tab-bar 或 .vertical-tab-bar 的页面，且其路由为 #/（标签页为 #/newtab 等子路由）。
 * 这里轮询直到拿到外壳，避免选中标签页导致断言失败。
 */
async function getShell(): Promise<Page> {
  for (let i = 0; i < 60; i++) {
    for (const w of app.windows()) {
      try {
        if ((await w.locator('.tab-bar').count()) > 0 || (await w.locator('.vertical-tab-bar').count()) > 0) return w
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

/**
 * 标签页内容渲染在独立的 WebContentsView 中（非外壳），轮询找到含目标选择器的标签页 page。
 * 排除带 .tab-bar/.vertical-tab-bar 的外壳页面，确保返回的是标签内容页。
 */
async function findTabContentPage(selector: string): Promise<Page> {
  for (let i = 0; i < 50; i++) {
    for (const w of app.windows()) {
      try {
        if ((await w.locator('.tab-bar').count()) > 0 || (await w.locator('.vertical-tab-bar').count()) > 0) continue
        if ((await w.locator(selector).count()) > 0) return w
      } catch {
        /* page may detach between calls */
      }
    }
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error(`findTabContentPage: "${selector}" not found in any tab webContents`)
}

test.beforeAll(async () => {
  app = await electron.launch({
    args: ['apps/main/dist/index.cjs', '--no-sandbox', '--disable-gpu'],
  })
  page = await getShell()
  await page.evaluate(async () => {
    await window.browserAPI.setSetting({ key: 'tabBarPosition', value: 'top' })
  })
  await expect(page.locator('.tab-bar')).toBeVisible({ timeout: 10000 })
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
  await expect(page.locator('.address-input')).toHaveValue('', {
    timeout: 15000,
  })
})

test('设置页清除浏览数据弹窗', async () => {
  await page.locator('.address-input').fill('wmfx://settings/privacy')
  await page.keyboard.press('Enter')
  await expect(page.locator('.address-input')).toHaveValue('wmfx://settings/privacy')

  // 设置页内容在标签的 WebContentsView 中渲染，需找到对应的 webContents
  const settingsPage = await findTabContentPage('.n-switch')

  // 等待设置页加载完毕
  await settingsPage.waitForTimeout(1000)

  // 点击「清除浏览数据」按钮
  const clearBtn = settingsPage.getByRole('button', { name: '清除浏览数据' }).first()
  await expect(clearBtn).toBeVisible({ timeout: 10000 })
  await clearBtn.click()

  // 弹窗标题「清除浏览数据」可见
  const modal = settingsPage.locator('.n-modal')
  await expect(modal.getByText('清除浏览数据', { exact: true }).first()).toBeVisible({ timeout: 10000 })

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
  // 先导航到非 newtab 的页面，确保后续 newtab 导航能触发 watcher 清空输入框
  await page.locator('.address-input').fill('wmfx://settings')
  await page.keyboard.press('Enter')
  await expect(page.locator('.address-input')).toHaveValue('wmfx://settings')

  // 导航到新标签页
  await page.locator('.address-input').fill('wmfx://newtab')
  await page.keyboard.press('Enter')
  await expect(page.locator('.address-input')).toHaveValue('')

  // 点击三点菜单
  await page.locator('.app-menu').click()

  // 在 popover 面板中点击「清空缓存」
  const panel = await findPopoverPage('清空缓存')
  await panel.getByText('清空缓存', { exact: true }).first().click()
  await page.waitForTimeout(500)

  // 弹窗在 tab 的 webContents 中，需找到含 .n-modal 的 tab page
  const modalPage = await findTabContentPage('.n-modal')
  await expect(modalPage.locator('.n-modal').getByText('清除浏览数据', { exact: true }).first()).toBeVisible({ timeout: 10000 })
})
