/**
 * Dry/wet blend, the same linear mix the preview applies with gain nodes:
 * `out = s·wet + (1−s)·dry`. Endpoints return copies of the inputs exactly.
 */
export function mixChannel(dry: Float32Array, wet: Float32Array, strength: number, start = 0, end = dry.length): Float32Array {
  const s = Math.min(1, Math.max(0, strength));
  const length = Math.max(0, Math.min(end, dry.length, wet.length) - start);
  if (s === 0) return dry.slice(start, start + length);
  if (s === 1) return wet.slice(start, start + length);
  const out = new Float32Array(length);
  const d = 1 - s;
  for (let i = 0; i < length; i++) out[i] = s * wet[start + i]! + d * dry[start + i]!;
  return out;
}

export function mixChannels(dry: Float32Array[], wet: Float32Array[], strength: number, start?: number, end?: number): Float32Array[] {
  return wet.map((w, c) => mixChannel(dry[Math.min(c, dry.length - 1)]!, w, strength, start, end));
}
