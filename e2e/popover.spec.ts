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
        if ((await w.locator('.tab-bar').count()) > 0)
          return w
      }
      catch {
        /* page may detach between calls */
      }
    }
    await new Promise(r => setTimeout(r, 150))
  }
  throw new Error('getShell: shell window not found')
}

/** 轮询 app.windows()，找到含目标文案的 popover 面板 page（独立 webContents）。 */
async function findPopoverPage(text: string): Promise<Page> {
  for (let i = 0; i < 50; i++) {
    for (const w of app.windows()) {
      try {
        if ((await w.getByText(text, { exact: true }).count()) > 0)
          return w
      }
      catch {
        /* page may detach between calls */
      }
    }
    await new Promise(r => setTimeout(r, 100))
  }
  throw new Error(`findPopoverPage: "${text}" not found in any webContents`)
}

/** 统计所有 webContents 中目标文案的出现次数（用于验证 popover 已关闭）。 */
async function countPopoverText(text: string): Promise<number> {
  let n = 0
  for (const w of app.windows()) {
    try {
      n += await w.getByText(text, { exact: true }).count()
    }
    catch {
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
  await expect(page.locator('.url-input')).toHaveValue('', {
    timeout: 15000,
  })
})

test('tab context menu opens via Popover and is not the old inline menu', async () => {
  // 等待首个标签出现
  const firstTab = page.locator('.tab-item').first()
  await firstTab.waitFor()

  // 旧的内联 .tab-context-menu 不应存在（证明已迁移到 Popover）
  await expect(page.locator('.tab-context-menu')).toHaveCount(0)

  // 右键打开 Popover（渲染在独立 /panel webContents）
  await firstTab.click({ button: 'right' })

  // 菜单项文本出现在 popover webContents，且可点击
  const panel = await findPopoverPage('重新加载')
  await expect(panel.getByText('重新加载', { exact: true })).toBeVisible()
  await panel.getByText('重新加载', { exact: true }).click()

  // 点击叶子项后 popover 关闭：其它菜单项不再出现在任何 webContents
  await expect(await countPopoverText('关闭其它标签页')).toBe(0)
})

test('three-dot app menu opens via Popover', async () => {
  // 旧的内联 .app-menu-dropdown 不应存在（证明已迁移到 Popover）
  await expect(page.locator('.app-menu-dropdown')).toHaveCount(0)
  await page.locator('.app-menu').click()
  const panel = await findPopoverPage('书签')
  await expect(panel.getByText('书签', { exact: true })).toBeVisible()
  // Esc 关闭（keydown 监听在 popover 面板 webContents 上）
  await panel.keyboard.press('Escape')
  await expect(await countPopoverText('书签')).toBe(0)
})
