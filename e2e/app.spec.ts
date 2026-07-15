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
    await new Promise(r => setTimeout(r, 100))
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
// 注意：关闭最后一个标签会触发应用退出（tab:close 处理器），因此只关闭多余标签，保留首个。
// 保留标签先跳到一个不同内部路由再回到 wmfx://newtab，确保真正触发导航事件
// （相同 hash 的 loadURL 不会重新派发导航事件，地址栏会残留上一用例键入的旧值）。
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

test('window loads with tab bar', async () => {
  await expect(page.locator('.tab-bar')).toBeVisible()
})

test('default tab is created on launch', async () => {
  await expect(page.locator('.tab-item')).toHaveCount(1, { timeout: 15000 })
})

test('type-safe IPC round-trips renderer -> main -> renderer', async () => {
  const pong = await page.evaluate(async () => {
    return await window.browserAPI.ping('hello from renderer')
  })
  expect(pong).toBe('pong: hello from renderer')
})

test('security baseline: no node integration in renderer', async () => {
  const hasRequire = await page.evaluate(
    () => typeof (window as unknown as { require?: unknown }).require,
  )
  expect(hasRequire).toBe('undefined')
})

test('security baseline: only browserAPI is exposed', async () => {
  const hasBrowserApi = await page.evaluate(
    () => typeof (window as unknown as { browserAPI?: unknown }).browserAPI,
  )
  expect(hasBrowserApi).toBe('object')
})

test('new tab button creates a second tab', async () => {
  await page.locator('.tab-new').click()
  await expect(page.locator('.tab-item')).toHaveCount(2)
})

test('close tab removes it from tab bar', async () => {
  await page.locator('.tab-new').click()
  await expect(page.locator('.tab-item')).toHaveCount(2)
  await page.locator('.tab-close').first().click()
  await expect(page.locator('.tab-item')).toHaveCount(1)
})

test('downloads page is accessible via app menu', async () => {
  await page.locator('.app-menu').click()
  const panel = await findPopoverPage('下载')
  await expect(panel.getByText('下载', { exact: true })).toBeVisible()
  await panel.getByText('下载', { exact: true }).click()
  await expect(page.locator('.url-input')).toHaveValue('wmfx://downloads')
})

test('history list is accessible via browserAPI', async () => {
  const history = await page.evaluate(async () => {
    return await window.browserAPI.getHistoryList({ limit: 10 })
  })
  expect(Array.isArray(history)).toBe(true)
})

test('bookmark can be added via browserAPI', async () => {
  const result = await page.evaluate(async () => {
    return await window.browserAPI.addBookmark({
      title: 'Test Bookmark',
      url: 'https://example.com',
    })
  })
  expect(result).toBeDefined()
  expect(typeof result.id).toBe('string')
})

test('theme can be switched via browserAPI', async () => {
  await page.evaluate(async () => {
    await window.browserAPI.setTheme('light')
  })
  const theme = await page.evaluate(async () => window.browserAPI.getTheme())
  expect(theme).toBe('light')
  await page.evaluate(async () => {
    await window.browserAPI.setTheme('dark')
  })
})

test('app menu opens and closes', async () => {
  await expect(page.locator('.app-menu-dropdown')).toHaveCount(0)
  await page.locator('.app-menu').click()
  const panel = await findPopoverPage('书签')
  await expect(panel.getByText('书签', { exact: true })).toBeVisible()
  await panel.keyboard.press('Escape')
  await expect(page.locator('.app-menu-dropdown')).toHaveCount(0)
})

test('default new tab shows empty address bar', async () => {
  await expect(page.locator('.url-input')).toHaveValue('')
})

test('find bar opens on Ctrl+F', async () => {
  await page.keyboard.press('Control+F')
  await expect(page.locator('.find-bar')).toBeVisible()
})

test('autocomplete dropdown appears on input focus', async () => {
  await page.locator('.url-input').click()
  await page.keyboard.type('test')
  await page.waitForTimeout(250)
  const dropdown = page.locator('.autocomplete')
  await expect(dropdown).toBeVisible()
})

test('bookmark star button exists', async () => {
  await expect(page.locator('.bookmark-btn')).toBeVisible()
})

test('tab reorder via drag', async () => {
  await page.locator('.tab-new').click()
  await expect(page.locator('.tab-item')).toHaveCount(2)
  await page.locator('.tab-item').first().dragTo(page.locator('.tab-item').nth(1))
  await expect(page.locator('.tab-item')).toHaveCount(2)
})

test('proxy page is accessible via app menu', async () => {
  await page.locator('.app-menu').click()
  const panel = await findPopoverPage('代理')
  await expect(panel.getByText('代理', { exact: true })).toBeVisible()
  await panel.getByText('代理', { exact: true }).click()
  await expect(page.locator('.url-input')).toHaveValue('wmfx://proxy')
})

test('typing wmfx://settings navigates to settings page', async () => {
  await page.locator('.url-input').click()
  await page.locator('.url-input').fill('wmfx://settings')
  await page.keyboard.press('Enter')
  await expect(page.locator('.url-input')).toHaveValue('wmfx://settings/appearance')
})

test('proxy status can be queried via browserAPI', async () => {
  const status = await page.evaluate(async () => {
    return await window.browserAPI.getProxyStatus()
  })
  expect(status).toBeDefined()
  expect(typeof status.running).toBe('boolean')
})

test('proxy mode can be queried via browserAPI', async () => {
  const mode = await page.evaluate(async () => {
    return await window.browserAPI.getProxyMode()
  })
  expect(['rule', 'global', 'direct']).toContain(mode)
})

test('session state is saved on quit and restored on restart', async () => {
  // beforeEach 已重置为单标签；点击外壳「新建标签」按钮验证其确实新增一个标签。
  await page.locator('.tab-new').click()
  await expect(page.locator('.tab-item')).toHaveCount(2)

  // 通过 browserAPI 再新建一个标签（在任意页面均可，无需操作外壳 DOM），共 3 个。
  await page.evaluate(async () => {
    await window.browserAPI.createNewTab()
  })
  const beforeCount = await page.evaluate(
    async () => (await window.browserAPI.getList()).length,
  )
  expect(beforeCount).toBe(3)

  // 退出应用：before-quit 处理器会落盘当前所有标签（writeDelay:0 同步写入，避免被杀进程丢失）。
  // 注意：不要用 page.close()——当 page 绑定到标签 WebContentsView 时它会关闭标签而非窗口。
  await app.close()

  app = await electron.launch({
    args: ['apps/main/dist/index.cjs', '--no-sandbox', '--disable-gpu'],
  })
  page = await getShell()

  // 重启后标签应被恢复；getList 在任何页面（外壳或标签）都可用。
  const restored = await page.evaluate(
    async () => (await window.browserAPI.getList()).length,
  )
  expect(restored).toBe(3)
})

test('address bar clears when navigating to new tab from external page', async () => {
  // Navigate to a settings page (non-newtab internal URL)
  await page.locator('.url-input').fill('wmfx://settings')
  await page.keyboard.press('Enter')
  await expect(page.locator('.url-input')).toHaveValue('wmfx://settings/appearance')

  // Navigate to newtab — address bar should be empty
  await page.locator('.url-input').fill('wmfx://newtab')
  await page.keyboard.press('Enter')
  await expect(page.locator('.url-input')).toHaveValue('')
})

test('address bar updates when navigating to a non-newtab internal page', async () => {
  await page.locator('.url-input').fill('wmfx://proxy')
  await page.keyboard.press('Enter')
  await expect(page.locator('.url-input')).toHaveValue('wmfx://proxy')
})

test('new tab button triggers address bar focus', async () => {
  await page.locator('.tab-new').click()
  await expect(page.locator('.tab-item')).toHaveCount(2)
  // After creating new tab, address bar should be empty (new tab)
  await expect(page.locator('.url-input')).toHaveValue('')
})
