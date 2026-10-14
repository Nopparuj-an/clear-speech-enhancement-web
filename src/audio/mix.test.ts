import { describe, expect, it } from 'vitest';
import { mixChannel, mixChannels } from './mix';

const dry = Float32Array.from([1, 0.5, -0.5, 0.25]);
const wet = Float32Array.from([0, 0.1, -0.1, 0]);

describe('mixChannel', () => {
  it('is bit-exact at the endpoints', () => {
    expect(mixChannel(dry, wet, 0)).toEqual(dry);
    expect(mixChannel(dry, wet, 1)).toEqual(wet);
  });

  it('blends linearly', () => {
    expect(Array.from(mixChannel(dry, wet, 0.5))).toEqual([0.5, 0.30000001192092896, -0.30000001192092896, 0.125]);
  });

  it('slices to the trim range', () => {
    expect(Array.from(mixChannel(dry, wet, 0, 1, 3))).toEqual([0.5, -0.5]);
  });

  it('clamps strength', () => {
    expect(mixChannel(dry, wet, 2)).toEqual(wet);
  });
});

describe('mixChannels', () => {
  it('reuses a mono dry channel for every wet channel', () => {
    const out = mixChannels([dry], [wet, wet], 0);
    expect(out).toHaveLength(2);
    expect(out[1]).toEqual(dry);
  });
});
