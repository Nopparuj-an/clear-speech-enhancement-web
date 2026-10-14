import { describe, expect, it } from 'vitest';
import { formatDurationWords, formatTime } from './time';

describe('formatTime', () => {
  it('formats minutes and hours', () => {
    expect(formatTime(754.5)).toBe('12:34.50');
    expect(formatTime(5654)).toBe('1:34:14.00');
    expect(formatTime(5.129)).toBe('0:05.12');
    expect(formatTime(768, 0)).toBe('12:48');
  });
});

describe('formatDurationWords', () => {
  it('uses the largest units', () => {
    expect(formatDurationWords(5652)).toBe('1 h 34 min');
    expect(formatDurationWords(95)).toBe('1 min 35 s');
  });
});
