import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

// Runs the ARCHITECTURE §11 spikes against the real model (needs network to
// Hugging Face). Opt-in: SPIKE=1. Results go to the log and spike-results.json.
test('spike checks with the real model', async ({ page }, testInfo) => {
  test.skip(process.env.SPIKE !== '1' || testInfo.project.name !== 'desktop', 'SPIKE=1 only');
  test.setTimeout(15 * 60_000);
  page.on('console', (m) => m.type() === 'error' && console.log('[page]', m.text().slice(0, 300)));
  await page.goto('./spike.html');
  await page.setInputFiles('#file', fileURLToPath(new URL('./fixtures/noisy-speech.mp3', import.meta.url)));
  await page.getByRole('button', { name: 'Run all checks' }).click();
  await expect(page.locator('#result')).toContainText('finishedAt', { timeout: 14 * 60_000 });
  const json = (await page.locator('#result').textContent()) ?? '{}';
  console.log(`SPIKE RESULTS\n${json}`);
  await writeFile('spike-results.json', json);
  expect(JSON.parse(json).fatal).toBeUndefined();
});

test('real model: full app flow, MP3 in → enhanced MP3 out', async ({ page }, testInfo) => {
  test.skip(process.env.SPIKE !== '1' || testInfo.project.name !== 'desktop', 'SPIKE=1 only');
  test.setTimeout(10 * 60_000);
  await page.goto('./');
  await page.setInputFiles('#file', fileURLToPath(new URL('./fixtures/noisy-speech.mp3', import.meta.url)));
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible({ timeout: 8 * 60_000 });
  await expect(page.getByRole('radio', { name: /MP3/ })).toHaveAttribute('aria-checked', 'true');
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: /^Export / }).click();
  const file = await pending;
  expect(file.suggestedFilename()).toBe('noisy-speech-enhanced.mp3');
  await expect(page.getByText('output LUFS')).toBeVisible();
  console.log('REAL FLOW stats:', await page.locator('.stats-grid').innerText());
});
