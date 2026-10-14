import { describe, expect, it } from 'vitest';
import { defaultAudioFormat, lossyBitrate, outputFileName, videoAudioCodec } from './formats';

describe('defaultAudioFormat', () => {
  it.each([
    ['mp3', 'mp3'],
    ['aac', 'm4a'],
    ['flac', 'flac'],
    ['opus', 'opus'],
    ['pcm-s16', 'wav'],
    ['pcm-f32', 'wav'],
  ])('keeps %s as %s with no note', (codec, format) => {
    expect(defaultAudioFormat(codec)).toEqual({ value: format });
  });

  it('maps Vorbis to Opus with a reason', () => {
    const choice = defaultAudioFormat('vorbis');
    expect(choice.value).toBe('opus');
    expect(choice.reason).toMatch(/OGG Vorbis/);
  });

  it('maps other lossless codecs to FLAC', () => {
    expect(defaultAudioFormat('alac').value).toBe('flac');
  });

  it('maps other lossy or unknown codecs to M4A', () => {
    expect(defaultAudioFormat('ac3').value).toBe('m4a');
    expect(defaultAudioFormat(null).value).toBe('m4a');
  });
});

describe('videoAudioCodec', () => {
  it('keeps the source codec when the container accepts it', () => {
    expect(videoAudioCodec('mp4', 'aac')).toEqual({ value: 'aac' });
    expect(videoAudioCodec('webm', 'opus')).toEqual({ value: 'opus' });
    expect(videoAudioCodec('mkv', 'flac')).toEqual({ value: 'flac' });
  });

  it('falls back to the container default', () => {
    expect(videoAudioCodec('webm', 'vorbis').value).toBe('opus');
    expect(videoAudioCodec('mov', 'pcm-s16').value).toBe('aac');
    expect(videoAudioCodec('mkv', 'vorbis').value).toBe('opus');
  });
});

describe('lossyBitrate', () => {
  it('matches the source within the clamp', () => {
    expect(lossyBitrate('aac', 160_000)).toBe(160_000);
    expect(lossyBitrate('mp3', 64_000)).toBe(128_000);
    expect(lossyBitrate('aac', 512_000)).toBe(320_000);
  });

  it('uses defaults when unknown', () => {
    expect(lossyBitrate('aac', null)).toBe(192_000);
    expect(lossyBitrate('opus', null)).toBe(96_000);
  });
});

describe('outputFileName', () => {
  it('appends -enhanced before the new extension', () => {
    expect(outputFileName('talk.final.mp4', 'm4a')).toBe('talk.final-enhanced.m4a');
    expect(outputFileName('noext', 'wav')).toBe('noext-enhanced.wav');
  });
});
