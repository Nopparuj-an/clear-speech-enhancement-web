import { describe, expect, it } from 'vitest';
import { rangeChanged, snapToKeyframes } from './keyframes';

const keys = [0, 2, 4, 6, 8];

describe('snapToKeyframes', () => {
  it('widens to the surrounding keyframes', () => {
    expect(snapToKeyframes(keys, { start: 3.1, end: 6.5 }, 9.5)).toEqual({ start: 2, end: 8 });
  });

  it('keeps ranges already on keyframes', () => {
    expect(snapToKeyframes(keys, { start: 4, end: 6 }, 9.5)).toEqual({ start: 4, end: 6 });
  });

  it('runs to the media end after the last keyframe', () => {
    expect(snapToKeyframes(keys, { start: 8.5, end: 9 }, 9.5)).toEqual({ start: 8, end: 9.5 });
  });

  it('reports changes', () => {
    expect(rangeChanged({ start: 3.1, end: 6.5 }, { start: 2, end: 8 })).toBe(true);
    expect(rangeChanged({ start: 4, end: 6 }, { start: 4, end: 6 })).toBe(false);
  });
});
