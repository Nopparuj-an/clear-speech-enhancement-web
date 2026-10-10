import { describe, expect, it } from 'vitest';
import { estimatePeakBytes, formatGB, shouldWarn } from './memory';

describe('long-file warning', () => {
  it('estimates linearly in duration and channels', () => {
    expect(estimatePeakBytes(60, 1, 1)).toBe(60 * 48_000 * 4);
    expect(estimatePeakBytes(60, 2, 1)).toBe(2 * 60 * 48_000 * 4);
  });

  it('warns earlier on mobile', () => {
    const twentyMinutes = estimatePeakBytes(20 * 60, 1);
    expect(shouldWarn(twentyMinutes, { mobile: true })).toBe(true);
    expect(shouldWarn(twentyMinutes, { mobile: false })).toBe(false);
  });

  it('caps the desktop limit by device memory', () => {
    const bytes = 1.5 * 1024 ** 3;
    expect(shouldWarn(bytes, { mobile: false, deviceMemoryGB: 2 })).toBe(true);
    expect(shouldWarn(bytes, { mobile: false, deviceMemoryGB: 8 })).toBe(false);
  });

  it('formats sizes', () => {
    expect(formatGB(2.04 * 1024 ** 3)).toBe('2 GB');
  });
});
