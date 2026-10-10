export interface Peaks {
  min: Float32Array;
  max: Float32Array;
}

/** Min/max per bucket across all channels, for drawing a waveform lane. */
export function computePeaks(channels: Float32Array[], buckets: number): Peaks {
  const length = channels[0]?.length ?? 0;
  const n = Math.max(1, Math.floor(buckets));
  const min = new Float32Array(n);
  const max = new Float32Array(n);
  if (length === 0) return { min, max };
  for (let b = 0; b < n; b++) {
    const from = Math.floor((b * length) / n);
    const to = Math.max(from + 1, Math.floor(((b + 1) * length) / n));
    let lo = Infinity;
    let hi = -Infinity;
    for (const ch of channels) {
      for (let i = from; i < to && i < length; i++) {
        const v = ch[i]!;
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
    }
    min[b] = lo === Infinity ? 0 : lo;
    max[b] = hi === -Infinity ? 0 : hi;
  }
  return { min, max };
}

/** Cheap approximation of the mix's peaks while the strength slider moves. */
export function lerpPeaks(dry: Peaks, wet: Peaks, strength: number): Peaks {
  const s = Math.min(1, Math.max(0, strength));
  const n = Math.min(dry.min.length, wet.min.length);
  const min = new Float32Array(n);
  const max = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    min[i] = s * wet.min[i]! + (1 - s) * dry.min[i]!;
    max[i] = s * wet.max[i]! + (1 - s) * dry.max[i]!;
  }
  return { min, max };
}
