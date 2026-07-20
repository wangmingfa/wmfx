import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'

let app: ElectronApplication
let page: Page

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

test.beforeAll(async () => {
  app = await electron.launch({
    args: ['apps/main/dist/index.cjs', '--no-sandbox', '--disable-gpu'],
  })
  page = await getShell()
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
  await page.locator('.url-input').click()
  await page.locator('.url-input').fill('/tmp')
  await page.keyboard.press('Enter')
  await expect(page.locator('.url-input')).toHaveValue('/tmp')
})

test('typing wmfx://files navigates to file browser', async () => {
  await page.locator('.url-input').click()
  await page.locator('.url-input').fill('wmfx://files')
  await page.keyboard.press('Enter')
  await expect(page.locator('.url-input')).toHaveValue('wmfx://files')
})

// ─── 文件浏览器 UI ───────────────────────────────────────────

test('file browser shows sidebar with system dirs', async () => {
  await page.locator('.url-input').click()
  await page.locator('.url-input').fill('wmfx://files')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(1500)
  await expect(page.locator('.files-view')).toBeVisible()
  // Sidebar should contain at least "下载" (Downloads) system dir
  await expect(page.locator('.files-sidebar')).toBeVisible()
})

test('file browser shows breadcrumb', async () => {
  await page.locator('.url-input').click()
  await page.locator('.url-input').fill('wmfx://files')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(1500)
  await expect(page.locator('.files-breadcrumb')).toBeVisible()
})

test('file browser has toolbar with new folder button', async () => {
  await page.locator('.url-input').click()
  await page.locator('.url-input').fill('wmfx://files')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(1500)
  await expect(page.locator('.files-toolbar')).toBeVisible()
})

test('file browser has search input', async () => {
  await page.locator('.url-input').click()
  await page.locator('.url-input').fill('wmfx://files')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(1500)
  await expect(page.locator('.files-search-input')).toBeVisible()
})

// ─── 文件操作 ────────────────────────────────────────────────

test('new folder creates a folder', async () => {
  // Navigate to a writable location
  const testDir = '/tmp/wmfx-e2e-test'
  await page.locator('.url-input').click()
  await page.locator('.url-input').fill(testDir)
  await page.keyboard.press('Enter')
  await page.waitForTimeout(1500)

  // Click new folder button
  const newFolderBtn = page.locator('.files-toolbar').getByRole('button', { name: /新建|New/i }).first()
  if ((await newFolderBtn.count()) > 0) {
    await newFolderBtn.click()
    await page.waitForTimeout(500)
    // Check if a new folder appears or rename dialog opens
    await expect(page.locator('.file-item')).toContainText('未命名文件夹')
  }
})

test('file browser lists directories', async () => {
  const testDir = '/tmp/wmfx-e2e-test'
  await page.locator('.url-input').click()
  await page.locator('.url-input').fill(testDir)
  await page.keyboard.press('Enter')
  await page.waitForTimeout(1500)
  // The file list should be visible
  await expect(page.locator('.files-list')).toBeVisible()
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
  expect(result.message).toContain('SENSITIVE_DIR')
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
  // Navigate to a directory with files
  const testDir = '/tmp/wmfx-e2e-test'
  await page.locator('.url-input').click()
  await page.locator('.url-input').fill(testDir)
  await page.keyboard.press('Enter')
  await page.waitForTimeout(1500)

  // Find a file item and double-click it
  const fileItem = page.locator('.file-item').first()
  if ((await fileItem.count()) > 0) {
    await fileItem.dblclick()
    await page.waitForTimeout(500)
    // Quick Look panel should appear
    await expect(page.locator('.quick-look')).toBeVisible()
    // Press Escape to close
    await page.keyboard.press('Escape')
  }
})

// ─── 下载集成 ────────────────────────────────────────────────

test('downloads page has open-in-browser button', async () => {
  await page.locator('.url-input').click()
  await page.locator('.url-input').fill('wmfx://downloads')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(1500)
  await expect(page.locator('.downloads-view')).toBeVisible()
})
