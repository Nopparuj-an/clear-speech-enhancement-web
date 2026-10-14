import { describe, expect, it } from 'vitest';
import { integratedLoudness, master, truePeakDB } from './loudness';

const sine = (freq: number, amp: number, seconds: number) =>
  Float32Array.from({ length: Math.round(seconds * 48_000) }, (_, i) => amp * Math.sin((2 * Math.PI * freq * i) / 48_000));

describe('integratedLoudness', () => {
  it('reads a full-scale 997 Hz sine as −3.01 LUFS (BS.1770 reference)', () => {
    expect(integratedLoudness([sine(997, 1, 3)])).toBeCloseTo(-3.01, 1);
  });

  it('is −Infinity for silence and too-short input', () => {
    expect(integratedLoudness([new Float32Array(48_000)])).toBe(-Infinity);
    expect(integratedLoudness([new Float32Array(100)])).toBe(-Infinity);
  });
});

describe('truePeakDB', () => {
  it('catches inter-sample peaks above the sample peak', () => {
    // fs/4 sine phased so samples land at ±0.707 of the true peak.
    const x = Float32Array.from({ length: 4800 }, (_, i) => Math.sin((Math.PI / 2) * i + Math.PI / 4));
    expect(truePeakDB([x])).toBeGreaterThan(-1);
  });
});

describe('master', () => {
  it('hits the target and respects the ceiling', () => {
    const quiet = sine(440, 0.1, 4); // ≈ −23 LUFS, needs +4 dB
    const out = master([quiet], { targetLUFS: -19 });
    expect(integratedLoudness(out.channels)).toBeCloseTo(-19, 0);
    expect(truePeakDB(out.channels)).toBeLessThanOrEqual(-1.5);
  });

  it('limits peaks without moving the stereo image', () => {
    const loud = sine(440, 0.9, 2);
    const out = master([loud, loud.map((v) => v * 0.5)], { targetLUFS: -9 });
    expect(truePeakDB(out.channels)).toBeLessThanOrEqual(-1.5);
    const i = 24_000;
    expect(out.channels[1]![i]! / out.channels[0]![i]!).toBeCloseTo(0.5, 5);
  });

  it('caps the gain at +9 dB', () => {
    const veryQuiet = sine(440, 0.001, 2);
    const out = master([veryQuiet], { targetLUFS: -14 });
    expect(integratedLoudness(out.channels) - integratedLoudness([veryQuiet])).toBeCloseTo(9, 1);
  });
});
