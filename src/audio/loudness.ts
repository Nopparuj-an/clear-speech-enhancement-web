// Loudness normalisation for export (spike S2: the SDK can master arbitrary
// audio, but only by running the model again). ITU-R BS.1770-4 integrated
// loudness, a gain to the target, then a look-ahead true-peak limiter, matching
// the SDK's defaults (−1.5 dBTP ceiling, at most +9 dB of gain). 48 kHz only.

const RATE = 48_000;

/** K-weighting biquads at 48 kHz (BS.1770-4, Table 1 and 2). */
const PRE = { b: [1.53512485958697, -2.69169618940638, 1.19839281085285], a: [-1.69065929318241, 0.73248077421585] };
const RLB = { b: [1, -2, 1], a: [-1.99004745483398, 0.99007225036621] };

function biquad(x: Float32Array, f: { b: number[]; a: number[] }): Float32Array {
  const [b0, b1, b2] = f.b as [number, number, number];
  const [a1, a2] = f.a as [number, number];
  const y = new Float32Array(x.length);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = x[i]!;
    const out = b0 * v + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1;
    x1 = v;
    y2 = y1;
    y1 = out;
    y[i] = out;
  }
  return y;
}

/** Integrated loudness in LUFS, or -Infinity for silence. */
export function integratedLoudness(channels: Float32Array[]): number {
  const length = channels[0]?.length ?? 0;
  const block = Math.round(0.4 * RATE);
  const hop = Math.round(0.1 * RATE);
  if (length < block) return -Infinity;
  // Energy per 100 ms hop, summed over channels (weight 1.0 for L, R and mono);
  // each 400 ms block is then four consecutive hops.
  const hops = Math.floor(length / hop);
  const energy = new Float64Array(hops);
  for (const c of channels) {
    const w = biquad(biquad(c, PRE), RLB);
    for (let h = 0; h < hops; h++) {
      let s = 0;
      for (let i = h * hop; i < (h + 1) * hop; i++) s += w[i]! * w[i]!;
      energy[h]! += s;
    }
  }
  const per = block / hop;
  const powers: number[] = [];
  for (let h = 0; h + per <= hops; h++) {
    let sum = 0;
    for (let k = 0; k < per; k++) sum += energy[h + k]!;
    powers.push(sum / block);
  }
  const lufs = (p: number) => -0.691 + 10 * Math.log10(p);
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
  const absolute = powers.filter((p) => lufs(p) > -70);
  if (!absolute.length) return -Infinity;
  const relativeGate = lufs(mean(absolute)) - 10;
  const gated = absolute.filter((p) => lufs(p) > relativeGate);
  return lufs(mean(gated));
}

/** 4× oversampling interpolator taps for true-peak estimation (windowed sinc, 12 taps per phase). */
const PHASES = 4;
const TAPS = 12;
const INTERP: Float64Array[] = Array.from({ length: PHASES }, (_, phase) => {
  const taps = new Float64Array(TAPS);
  for (let k = 0; k < TAPS; k++) {
    const t = k - TAPS / 2 + 1 - phase / PHASES;
    const sinc = t === 0 ? 1 : Math.sin(Math.PI * t) / (Math.PI * t);
    const w = 0.5 + 0.5 * Math.cos((Math.PI * t) / (TAPS / 2));
    taps[k] = sinc * w;
  }
  return taps;
});

/** Per-sample true-peak estimate (max over 4 interpolated phases), across channels. */
export function truePeakEnvelope(channels: Float32Array[], skipBelow = 0): Float32Array {
  const length = channels[0]?.length ?? 0;
  const env = new Float32Array(length);
  for (const c of channels) {
    for (let i = 0; i < length; i++) {
      let peak = Math.abs(c[i]!);
      // Inter-sample peaks only matter near loud samples: skip the
      // interpolation when this sample and its neighbours are well below `skipBelow`.
      if (peak < skipBelow && Math.abs(c[i - 1] ?? 0) < skipBelow && Math.abs(c[i + 1] ?? 0) < skipBelow) {
        if (peak > env[i]!) env[i] = peak;
        continue;
      }
      for (let p = 1; p < PHASES; p++) {
        const taps = INTERP[p]!;
        let acc = 0;
        for (let k = 0; k < TAPS; k++) {
          const j = i + k - TAPS / 2 + 1;
          if (j >= 0 && j < length) acc += taps[k]! * c[j]!;
        }
        peak = Math.max(peak, Math.abs(acc));
      }
      if (peak > env[i]!) env[i] = peak;
    }
  }
  return env;
}

export function truePeakDB(channels: Float32Array[]): number {
  let m = 0;
  for (const v of truePeakEnvelope(channels)) m = Math.max(m, v);
  return 20 * Math.log10(m || 1e-12);
}

export interface MasterOptions {
  targetLUFS: number;
  peakCeilingDBFS?: number;
  maxGainDB?: number;
}

export interface MasterResult {
  channels: Float32Array[];
  inputLUFS: number;
}

/**
 * Gain to the loudness target, then a look-ahead limiter on the true-peak
 * envelope: 5 ms look-ahead (instant attack within it), 80 ms release.
 * Channels share one gain so the stereo image never moves.
 */
export function master(channels: Float32Array[], options: MasterOptions): MasterResult {
  const ceiling = 10 ** ((options.peakCeilingDBFS ?? -1.5) / 20);
  const inputLUFS = integratedLoudness(channels);
  const gainDB = Number.isFinite(inputLUFS) ? Math.min(options.maxGainDB ?? 9, options.targetLUFS - inputLUFS) : 0;
  const gain = 10 ** (gainDB / 20);
  const length = channels[0]?.length ?? 0;
  const scaled = channels.map((c) => c.map((v) => v * gain));

  // Required gain reduction per sample, from the true-peak envelope (with a
  // small safety margin for the interpolator's approximation).
  const target = ceiling * 0.985;
  const env = truePeakEnvelope(scaled, target * 0.5);
  const need = new Float32Array(length);
  for (let i = 0; i < length; i++) need[i] = env[i]! > target ? target / env[i]! : 1;

  // Look-ahead: the gain at i is the minimum need over [i, i + lookahead].
  const lookahead = Math.round(0.005 * RATE);
  const minAhead = new Float32Array(length);
  const deque: number[] = [];
  for (let i = length - 1; i >= 0; i--) {
    while (deque.length && need[deque[deque.length - 1]!]! >= need[i]!) deque.pop();
    deque.push(i);
    while (deque[0]! > i + lookahead) deque.shift();
    minAhead[i] = need[deque[0]!]!;
  }
  const release = Math.exp(-1 / (0.08 * RATE));
  let g = 1;
  for (let i = 0; i < length; i++) {
    const want = minAhead[i]!;
    g = want < g ? want : want - (want - g) * release;
    if (g < 1) for (const c of scaled) c[i]! *= g;
  }
  return { channels: scaled, inputLUFS };
}
