import { expect, test } from '@playwright/test';

test('app renders', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});

// Loads LiteRT and the SDK core in the worker through the importScripts shim.
// The model itself comes from Hugging Face: with MODEL_SMOKE=1 (CI) it must
// load; elsewhere a network failure on that download is acceptable.
test('worker loads the model runtime', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'once is enough');
  await page.goto('./spike.html#worker-smoke');
  const result = page.locator('#result');
  await expect(result).toContainText('worker-smoke:', { timeout: 110_000 });
  const text = (await result.textContent()) ?? '';
  if (process.env.MODEL_SMOKE === '1') expect(text).toContain('worker-smoke: loaded');
  else expect(text).toMatch(/worker-smoke: (loaded|error download: .*model download failed)/);
});
