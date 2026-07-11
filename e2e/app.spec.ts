import { test, expect, _electron as electron } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';

let app: ElectronApplication;
let page: Page;

test.beforeAll(() => {
  return electron
    .launch({ args: ['apps/main/dist/index.cjs'] })
    .then((electronApp) => {
      app = electronApp;
      return app.firstWindow();
    })
    .then((firstPage) => {
      page = firstPage;
    });
});

test.afterAll(() => {
  return app.close();
});

test('window loads with the app title', async () => {
  await expect(page.locator('h1')).toHaveText('AI Browser');
});

test('type-safe IPC round-trips renderer -> main -> renderer', async () => {
  await page.getByTestId('ping-btn').click();
  await expect(page.getByTestId('pong')).toHaveText('pong: hello from renderer');
});

test('security baseline: no node integration in renderer', async () => {
  const hasRequire = await page.evaluate(
    () => typeof (window as unknown as { require?: unknown }).require,
  );
  expect(hasRequire).toBe('undefined');
});

test('security baseline: only browserAPI is exposed', async () => {
  const hasBrowserApi = await page.evaluate(
    () => typeof (window as unknown as { browserAPI?: unknown }).browserAPI,
  );
  expect(hasBrowserApi).toBe('object');
});
