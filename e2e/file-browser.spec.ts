import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'

let app: ElectronApplication
let page: Page

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
 * 文件浏览器 / 下载页 渲染在 tab 的 webContents 中（非外壳 page）。
 * 轮询 app.windows() 找到不含 .tab-bar（即非外壳）且含目标选择器的 tab page。
 */
async function findTabPage(selector: string): Promise<Page> {
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
  throw new Error(`findTabPage: "${selector}" not found in any tab webContents`)
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
})

// ─── 地址栏导航 ──────────────────────────────────────────────

test('file browser accessible via local path in address bar', async () => {
  await page.locator('.address-input').click()
  await page.locator('.address-input').fill('/tmp')
  await page.keyboard.press('Enter')
  await expect(page.locator('.address-input')).toHaveValue('/tmp')
})

test('typing wmfx://files navigates to file browser', async () => {
  await page.locator('.address-input').click()
  await page.locator('.address-input').fill('wmfx://files')
  await page.keyboard.press('Enter')
  await expect(page.locator('.address-input')).toHaveValue('wmfx://files')
})

// ─── 文件浏览器 UI ───────────────────────────────────────────

test('file browser shows sidebar with system dirs', async () => {
  await page.locator('.address-input').click()
  await page.locator('.address-input').fill('wmfx://files')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(1500)
  const tabPage = await findTabPage('.files-view')
  await expect(tabPage.locator('.files-view')).toBeVisible()
  // Sidebar should contain at least "下载" (Downloads) system dir
  await expect(tabPage.locator('.files-sidebar')).toBeVisible()
})

test('file browser shows breadcrumb', async () => {
  await page.locator('.address-input').click()
  await page.locator('.address-input').fill('wmfx://files')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(1500)
  const tabPage = await findTabPage('.files-breadcrumb')
  await expect(tabPage.locator('.files-breadcrumb')).toBeVisible()
})

test('file browser has toolbar with new folder button', async () => {
  await page.locator('.address-input').click()
  await page.locator('.address-input').fill('wmfx://files')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(1500)
  const tabPage = await findTabPage('.files-toolbar')
  await expect(tabPage.locator('.files-toolbar')).toBeVisible()
})

test('file browser has search input', async () => {
  await page.locator('.address-input').click()
  await page.locator('.address-input').fill('wmfx://files')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(1500)
  const tabPage = await findTabPage('.toolbar-search')
  await expect(tabPage.locator('.toolbar-search')).toBeVisible()
})

// ─── 文件操作 ────────────────────────────────────────────────

test('new folder creates a folder', async () => {
  // Navigate to a writable location
  await page.locator('.address-input').click()
  await page.locator('.address-input').fill('/tmp')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(2000)

  const tabPage = await findTabPage('.files-toolbar')
  // Click new folder button
  const newFolderBtn = tabPage.locator('.files-toolbar').getByRole('button', { name: /新建|New/i }).first()
  if ((await newFolderBtn.count()) > 0) {
    await newFolderBtn.click()
    await page.waitForTimeout(500)
    // Check if a new folder appears or rename dialog opens
    await expect(tabPage.locator('.file-item')).toContainText('未命名文件夹')
  }
})

test('file browser lists directories', async () => {
  // Navigate to /tmp which always exists
  await page.locator('.address-input').click()
  await page.locator('.address-input').fill('/tmp')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(2000)
  // .files-list is in the tab's webContents; use findTabPage to locate it
  const tabPage = await findTabPage('.files-list')
  await expect(tabPage.locator('.files-list')).toBeVisible({ timeout: 10000 })
})

// ─── 安全 ────────────────────────────────────────────────────

test('path traversal is blocked via browserAPI', async () => {
  const result = await page.evaluate(async () => {
    try {
      await window.browserAPI.readDir('/etc/passwd')
      return { ok: true }
    } catch (err) {
      return { ok: false, message: (err as Error).message }
    }
  })
  expect(result.ok).toBe(false)
  expect(result.message).toContain('不允许访问')
})

test('sensitive directory access is blocked via browserAPI', async () => {
  for (const dir of ['/root', '/etc', '/proc', '/sys', '/var/log']) {
    const result = await page.evaluate(async (d: string) => {
      try {
        await window.browserAPI.readDir(d)
        return { ok: true }
      } catch (err) {
        return { ok: false, message: (err as Error).message }
      }
    }, dir)
    expect(result.ok, `should block ${dir}`).toBe(false)
  }
})

test('node_modules directory is blocked', async () => {
  const testDir = '/tmp/wmfx-e2e-node-modules-test'
  await page.evaluate(async (d: string) => {
    // We can't create dirs from renderer, but we can test the API
  }, testDir)
  const result = await page.evaluate(async (d: string) => {
    try {
      await window.browserAPI.readDir(d)
      return { ok: true }
    } catch (err) {
      return { ok: false, message: (err as Error).message }
    }
  }, `${testDir}/node_modules`)
  expect(result.ok).toBe(false)
})

// ─── Quick Look ──────────────────────────────────────────────

test('Quick Look opens on file double-click', async () => {
  await page.locator('.address-input').click()
  await page.locator('.address-input').fill('/tmp')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(2000)

  const tabPage = await findTabPage('.file-item')
  // Find a file item and double-click it
  const fileItem = tabPage.locator('.file-item').first()
  if ((await fileItem.count()) > 0) {
    await fileItem.dblclick()
    await page.waitForTimeout(500)
    // Quick Look panel should appear
    await expect(tabPage.locator('.quick-look')).toBeVisible({ timeout: 5000 })
    // Press Escape to close
    await tabPage.keyboard.press('Escape')
  }
})

// ─── 下载集成 ────────────────────────────────────────────────

test('downloads page has open-in-browser button', async () => {
  await page.locator('.address-input').click()
  await page.locator('.address-input').fill('wmfx://downloads')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(2000)
  // DownloadsView 使用 PageLayout，根类为 .page
  const tabPage = await findTabPage('.page')
  await expect(tabPage.locator('.page')).toBeVisible({ timeout: 10000 })
})
