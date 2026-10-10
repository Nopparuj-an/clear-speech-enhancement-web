import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { ALL_FORMATS, BufferSource, EncodedPacketSink, Input } from 'mediabunny';

const fixture = (name: string) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));

async function openEditor(page: Page, file: string) {
  await page.goto('./?mock-model');
  await page.setInputFiles('#file', fixture(file));
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible({ timeout: 30_000 });
}

async function download(page: Page, click: () => Promise<void>) {
  const pending = page.waitForEvent('download');
  await click();
  const file = await pending;
  return { name: file.suggestedFilename(), bytes: await readFile((await file.path())!) };
}

async function readPackets(bytes: Uint8Array, kind: 'video' | 'audio') {
  const input = new Input({ source: new BufferSource(bytes), formats: ALL_FORMATS });
  const track = kind === 'video' ? await input.getPrimaryVideoTrack() : await input.getPrimaryAudioTrack();
  if (!track) return null;
  const packets = [];
  for await (const p of new EncodedPacketSink(track).packets()) packets.push(p);
  return { codec: track.codec, packets, duration: await input.computeDuration() };
}

test.describe('desktop', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop layout');

  test('audio: enhance, A/B, strength and export WAV and MP3', async ({ page }) => {
    await openEditor(page, 'speech.wav');
    await expect(page.locator('.lane canvas')).toHaveCount(2);
    await expect(page.getByText('Listening')).toBeVisible();

    await page.getByRole('button', { name: 'Original', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Original', exact: true })).toHaveAttribute('aria-pressed', 'true');

    const slider = page.getByLabel('Enhancement strength');
    await slider.focus();
    for (let i = 0; i < 20; i++) await page.keyboard.press('ArrowLeft');
    await expect(page.locator('.lane-label').getByText('· 80%')).toBeVisible();

    // Same as source: WAV in → WAV out.
    await expect(page.getByRole('radio', { name: /WAV/ })).toHaveAttribute('aria-checked', 'true');
    const wav = await download(page, () => page.getByRole('button', { name: /^Export / }).click());
    expect(wav.name).toBe('speech-enhanced.wav');
    expect(wav.bytes.subarray(0, 4).toString()).toBe('RIFF');

    await page.getByRole('radio', { name: /MP3/ }).click();
    const mp3 = await download(page, () => page.getByRole('button', { name: /^Export / }).click());
    expect(mp3.name).toBe('speech-enhanced.mp3');
    const audio = await readPackets(mp3.bytes, 'audio');
    expect(audio?.codec).toBe('mp3');
    expect(audio!.duration).toBeGreaterThan(3.8);
  });

  test('audio: trim is exact', async ({ page }) => {
    await openEditor(page, 'speech.mp3');
    await expect(page.getByRole('radio', { name: /MP3/ })).toHaveAttribute('aria-checked', 'true');
    const end = page.getByRole('slider', { name: 'Trim end' });
    await end.focus();
    for (let i = 0; i < 10; i++) await page.keyboard.press('ArrowLeft'); // 10 × 0.1 s
    await page.getByRole('radio', { name: /WAV/ }).click();
    const wav = await download(page, () => page.getByRole('button', { name: /^Export / }).click());
    const dataBytes = wav.bytes.length - 44;
    const seconds = dataBytes / 2 / 48_000;
    expect(seconds).toBeGreaterThan(2.9);
    expect(seconds).toBeLessThan(3.2);
  });

  test('video: copies video packets untouched and snaps the trim to keyframes', async ({ page }) => {
    await openEditor(page, 'clip.webm');
    await expect(page.locator('video')).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Video', exact: true })).toHaveAttribute('aria-pressed', 'true');

    const start = page.getByRole('slider', { name: 'Trim start' });
    await start.focus();
    for (let i = 0; i < 15; i++) await page.keyboard.press('ArrowRight'); // 1.5 s
    await expect(page.getByText(/your trim widens to/)).toContainText('0:01.00');

    const out = await download(page, () => page.getByRole('button', { name: /^Export / }).click());
    expect(out.name).toBe('clip-enhanced.webm');

    const source = await readPackets(await readFile(fixture('clip.webm')), 'video');
    const result = await readPackets(out.bytes, 'video');
    const kept = source!.packets.filter((p) => p.timestamp >= 1 - 1e-6);
    expect(result!.codec).toBe(source!.codec);
    expect(result!.packets.length).toBe(kept.length);
    result!.packets.forEach((p, i) => expect(Buffer.from(p.data).equals(Buffer.from(kept[i]!.data))).toBe(true));
    const audio = await readPackets(out.bytes, 'audio');
    expect(audio?.codec).toBe('opus');
  });

  test('start over asks first', async ({ page }) => {
    await openEditor(page, 'speech.wav');
    await page.getByRole('button', { name: /Close file/ }).click();
    await expect(page.getByRole('dialog', { name: 'Close this file and start over?' })).toBeVisible();
    await page.getByRole('button', { name: 'Keep working' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.getByRole('button', { name: /Close file/ }).click();
    await page.getByRole('button', { name: 'Close and choose a file' }).click();
    await expect(page.getByRole('heading', { name: 'Make speech sound studio-clean' })).toBeVisible();
  });
});

test.describe('mobile', () => {
  test.skip(({ isMobile }) => !isMobile, 'phone layout');

  test('export from the bottom sheet', async ({ page }) => {
    await openEditor(page, 'speech.wav');
    await expect(page.getByRole('button', { name: 'Start over' })).toBeVisible();
    await page.getByRole('button', { name: 'Options' }).click();
    await expect(page.getByRole('group', { name: 'Loudness target' })).toBeVisible();
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    const sheet = page.getByRole('dialog', { name: 'Export' });
    await expect(sheet).toBeVisible();
    await sheet.getByRole('radio', { name: /FLAC/ }).click();
    const flac = await download(page, () => sheet.getByRole('button', { name: /^Save / }).click());
    expect(flac.name).toBe('speech-enhanced.flac');
    expect(flac.bytes.subarray(0, 4).toString()).toBe('fLaC');
  });
});
