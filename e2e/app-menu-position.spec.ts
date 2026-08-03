import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'

let app: ElectronApplication
let page: Page

const LAUNCH_OPTS = { args: ['apps/main/dist/index.cjs', '--no-sandbox', '--disable-gpu'] }

async function getShell(): Promise<Page> {
  for (let i = 0; i < 60; i++) {
    for (const w of app.windows()) {
      try {
        if ((await w.locator('.tab-bar').count()) > 0 || (await w.locator('.vertical-tab-bar').count()) > 0)
          return w
      }
      catch { /* page may detach */ }
    }
    await new Promise(r => setTimeout(r, 150))
  }
  throw new Error('getShell: shell window not found')
}

async function findPanel(): Promise<Page | null> {
  for (let i = 0; i < 40; i++) {
    for (const w of app.windows()) {
      try {
        if ((await w.locator('.popover-box:visible').count()) > 0) return w
      }
      catch { /* page may detach */ }
    }
    await new Promise(r => setTimeout(r, 100))
  }
  return null
}

async function allPanels(): Promise<Page[]> {
  const panels: Page[] = []
  for (const w of app.windows()) {
    try {
      if ((await w.locator('.popover-box:visible').count()) > 0) panels.push(w)
    }
    catch { /* ignore */ }
  }
  return panels
}

async function resetPage() {
  await page.evaluate(async () => {
    const list = await window.browserAPI.getList()
    for (const t of list.slice(1)) await window.browserAPI.closeTab(t.id)
    const remaining = await window.browserAPI.getList()
    const active = remaining[0]
    if (active) {
      await window.browserAPI.loadURL(active.id, 'wmfx://downloads')
      await window.browserAPI.loadURL(active.id, 'wmfx://newtab')
    }
  })
  await expect(page.locator('.tab-item')).toHaveCount(1, { timeout: 15000 })
}

async function restartApp() {
  await app.close()
  app = await electron.launch(LAUNCH_OPTS)
  page = await getShell()
  await page.evaluate(async () => {
    await window.browserAPI.setSetting({ key: 'tabBarPosition', value: 'top' })
  })
  await expect(page.locator('.tab-bar')).toBeVisible({ timeout: 10000 })
  await resetPage()
}

test.beforeAll(async () => {
  app = await electron.launch(LAUNCH_OPTS)
  page = await getShell()
  await page.evaluate(async () => {
    await window.browserAPI.setSetting({ key: 'tabBarPosition', value: 'top' })
  })
  await expect(page.locator('.tab-bar')).toBeVisible({ timeout: 10000 })
})

test.afterAll(() => app.close())

test.beforeEach(resetPage)

test('AppMenuButton 连续点击 10 次，菜单位置均正确且能正常关闭', async () => {
  const btn = page.locator('.app-menu')
  const { width: winW, height: winH } = await page.evaluate(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }))

  for (let i = 0; i < 10; i++) {
    await btn.click()
    const panel = await findPanel()
    expect(panel, `第 ${i + 1} 次点击应打开菜单`).not.toBeNull()

    await expect(panel!.getByText('书签', { exact: true })).toBeVisible({ timeout: 2000 })

    const panelBounds = await panel!.evaluate(() => {
      const r = document.querySelector('.popover-box')?.getBoundingClientRect()
      return r ? { x: r.left, y: r.top, w: r.width, h: r.height } : null
    })
    expect(panelBounds).not.toBeNull()
    expect(panelBounds!.x).toBeGreaterThanOrEqual(-50)
    expect(panelBounds!.y).toBeGreaterThanOrEqual(-50)
    expect(panelBounds!.x + panelBounds!.w).toBeLessThanOrEqual(winW + 50)
    expect(panelBounds!.y + panelBounds!.h).toBeLessThanOrEqual(winH + 50)

    await panel!.keyboard.press('Escape')
    await page.waitForTimeout(400)
    expect((await allPanels()).length, `第 ${i + 1} 次关闭后应无残留菜单`).toBe(0)

    // 每次打开菜单间隔 500ms
    if (i < 9) await page.waitForTimeout(500)
  }
})

test('AppMenuButton 菜单位置稳定性：每轮重启应用，重复 3 轮', async () => {
  for (let round = 0; round < 3; round++) {
    // 每轮重启应用（最后一轮结束后不再重启）
    if (round > 0) await restartApp()

    const btn = page.locator('.app-menu')
    await btn.click()
    const panel = await findPanel()
    expect(panel, `第 ${round + 1} 轮应打开菜单`).not.toBeNull()
    await expect(panel!.getByText('书签', { exact: true })).toBeVisible({ timeout: 2000 })
    await expect(panel!.locator('.popover-box')).toBeVisible()

    const bounds = await panel!.evaluate(() => {
      const r = document.querySelector('.popover-box')?.getBoundingClientRect()
      return r ? { x: r.left, y: r.top } : null
    })
    expect(bounds).not.toBeNull()
    expect(bounds!.x).toBeGreaterThanOrEqual(0)
    expect(bounds!.y).toBeGreaterThanOrEqual(0)

    await panel!.keyboard.press('Escape')
    await page.waitForTimeout(400)
    expect((await allPanels()).length, `第 ${round + 1} 轮关闭后应无残留`).toBe(0)

    // 每轮间隔 500ms（最后一轮结束后不再等待）
    if (round < 2) await page.waitForTimeout(500)
  }
})
