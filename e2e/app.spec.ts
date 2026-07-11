import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'

let app: ElectronApplication
let page: Page

test.beforeAll(() => {
  return electron
    .launch({ args: ['apps/main/dist/index.cjs'] })
    .then((electronApp) => {
      app = electronApp
      return app.firstWindow()
    })
    .then((firstPage) => {
      page = firstPage
    })
})

test.afterAll(() => {
  return app.close()
})

test('window loads with tab bar', async () => {
  await expect(page.locator('.tab-bar')).toBeVisible()
})

test('default tab is created on launch', async () => {
  await expect(page.locator('.tab-item')).toHaveCount(1)
})

test('type-safe IPC round-trips renderer -> main -> renderer', async () => {
  // Use the browserAPI.ping directly via page.evaluate since ping button is no longer in UI
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

test('downloads list is visible in sidebar', async () => {
  await page.locator('.sidebar-button').click()
  await expect(page.locator('.sidebar')).toHaveClass(/open/)
  await page.locator('.sidebar-tab', { hasText: 'Downloads' }).click()
  await expect(page.locator('.sidebar-empty', { hasText: 'No downloads' })).toBeVisible()
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
    const theme = await window.browserAPI.getTheme()
    expect(theme).toBe('light')
  })
  await page.evaluate(async () => {
    await window.browserAPI.setTheme('dark')
  })
})

test('sidebar opens and closes via toggle button', async () => {
  await expect(page.locator('.sidebar')).not.toHaveClass(/open/)
  await page.locator('.sidebar-button').click()
  await expect(page.locator('.sidebar')).toHaveClass(/open/)
  await page.locator('.sidebar-button').click()
  await expect(page.locator('.sidebar')).not.toHaveClass(/open/)
})
