import { describe, expect, it } from 'vitest';
import { computePeaks, lerpPeaks } from './peaks';

describe('computePeaks', () => {
  it('finds min and max per bucket across channels', () => {
    const left = Float32Array.from([0.1, -0.2, 0.5, 0]);
    const right = Float32Array.from([0, 0.3, -0.9, 0.2]);
    const peaks = computePeaks([left, right], 2);
    expect(Array.from(peaks.min)).toEqual([-0.20000000298023224, -0.8999999761581421]);
    expect(Array.from(peaks.max)).toEqual([0.30000001192092896, 0.5]);
  });

  it('handles more buckets than samples and empty input', () => {
    expect(computePeaks([Float32Array.from([0.5])], 3).max[0]).toBe(0.5);
    expect(computePeaks([], 4).min).toHaveLength(4);
  });
});

describe('lerpPeaks', () => {
  it('interpolates envelopes', () => {
    const a = { min: Float32Array.from([-1]), max: Float32Array.from([1]) };
    const b = { min: Float32Array.from([0]), max: Float32Array.from([0]) };
    expect(lerpPeaks(a, b, 0.25).max[0]).toBe(0.75);
  });
});

describe('mixPeaks', () => {
  it('matches computePeaks of the materialised mix', async () => {
    const { mixChannels } = await import('./mix');
    const dry = [Float32Array.from([0.2, -0.4, 0.9, 0.1, -0.3, 0.5])];
    const wet = [Float32Array.from([0.1, 0, 0.3, 0, -0.1, 0.2])];
    const { mixPeaks } = await import('./peaks');
    expect(mixPeaks(dry, wet, 0.3, 3)).toEqual(computePeaks(mixChannels(dry, wet, 0.3), 3));
  });
});
