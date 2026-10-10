// Throwaway harness for the ARCHITECTURE §11 spikes. Not linked from the app.
// Runs on the main thread (LiteRT.js loads via <script> here) except the worker
// check, which exercises the real worker + importScripts shim path.
import { canEncodeAudio } from 'mediabunny';
import { EnhanceClient } from '../worker/client';
import { decodeAudio, downmix, probe, resample } from '../media/source';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const fileInput = $<HTMLInputElement>('file');
const runButton = $<HTMLButtonElement>('run');
const copyButton = $<HTMLButtonElement>('copy');
const logEl = $<HTMLPreElement>('log');
const resultEl = $<HTMLPreElement>('result');
const downloads = $<HTMLDivElement>('downloads');

const results: Record<string, unknown> = { userAgent: navigator.userAgent, startedAt: new Date().toISOString() };
const log = (line: string) => {
  logEl.textContent += `${line}\n`;
  logEl.scrollTop = logEl.scrollHeight;
};
const show = () => (resultEl.textContent = JSON.stringify(results, null, 2));

fileInput.onchange = () => (runButton.disabled = !fileInput.files?.length);
copyButton.onclick = () => navigator.clipboard.writeText(JSON.stringify(results, null, 2));
runButton.onclick = () => {
  runButton.disabled = true;
  run()
    .catch((e: unknown) => {
      results.fatal = String(e instanceof Error ? (e.stack ?? e.message) : e);
      log(`FAILED: ${String(e)}`);
    })
    .finally(() => {
      results.finishedAt = new Date().toISOString();
      show();
      copyButton.disabled = false;
    });
};

function rms(a: Float32Array): number {
  let s = 0;
  for (const v of a) s += v * v;
  return Math.sqrt(s / Math.max(1, a.length));
}

function relError(actual: Float32Array, expected: Float32Array): number {
  const n = Math.min(actual.length, expected.length);
  const diff = new Float32Array(n);
  for (let i = 0; i < n; i++) diff[i] = actual[i]! - expected[i]!;
  return rms(diff) / Math.max(1e-9, rms(expected.subarray(0, n)));
}

/** Lag (in samples) where b best matches a, searched in ±maxLag over a window. */
function bestLag(a: Float32Array, b: Float32Array, maxLag: number): { lag: number; correlation: number } {
  const from = maxLag;
  const to = Math.min(a.length, b.length) - maxLag;
  let best = { lag: 0, correlation: -Infinity };
  for (let lag = -maxLag; lag <= maxLag; lag += 1) {
    let dot = 0;
    let na = 0;
    let nb = 0;
    for (let i = from; i < to; i += 4) {
      const x = a[i]!;
      const y = b[i + lag]!;
      dot += x * y;
      na += x * x;
      nb += y * y;
    }
    const c = dot / Math.sqrt(na * nb || 1);
    if (c > best.correlation) best = { lag, correlation: c };
  }
  return best;
}

function wavBlob(samples: Float32Array, sampleRate: number): Blob {
  const data = new DataView(new ArrayBuffer(44 + samples.length * 2));
  const text = (o: number, s: string) => [...s].forEach((ch, i) => data.setUint8(o + i, ch.charCodeAt(0)));
  text(0, 'RIFF');
  data.setUint32(4, 36 + samples.length * 2, true);
  text(8, 'WAVEfmt ');
  data.setUint32(16, 16, true);
  data.setUint16(20, 1, true);
  data.setUint16(22, 1, true);
  data.setUint32(24, sampleRate, true);
  data.setUint32(28, sampleRate * 2, true);
  data.setUint16(32, 2, true);
  data.setUint16(34, 16, true);
  text(36, 'data');
  data.setUint32(40, samples.length * 2, true);
  samples.forEach((v, i) => data.setInt16(44 + i * 2, Math.max(-1, Math.min(1, v)) * 0x7fff, true));
  return new Blob([data], { type: 'audio/wav' });
}

function offerDownload(name: string, samples: Float32Array) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(wavBlob(samples, 48_000));
  a.download = name;
  a.textContent = `Download ${name}`;
  downloads.append(a);
}

/** Enhance in chunks with overlap and an equal-power crossfade (S4). */
async function enhanceChunked(
  enhance: (x: Float32Array) => Promise<Float32Array>,
  x: Float32Array,
  chunk: number,
  overlap: number,
): Promise<Float32Array> {
  const out = new Float32Array(x.length);
  let pos = 0;
  let prevTail: Float32Array | null = null;
  while (pos < x.length) {
    const end = Math.min(x.length, pos + chunk + overlap);
    const y = await enhance(x.slice(pos, end));
    const head = prevTail ? Math.min(overlap, prevTail.length, y.length) : 0;
    for (let i = 0; i < y.length && pos + i < out.length; i++) {
      if (i < head) {
        const t = (i + 0.5) / head;
        out[pos + i] = prevTail![i]! * Math.cos((t * Math.PI) / 2) + y[i]! * Math.sin((t * Math.PI) / 2);
      } else {
        out[pos + i] = y[i]!;
      }
    }
    prevTail = end < x.length ? y.slice(chunk) : null;
    pos += chunk;
  }
  return out;
}

async function run() {
  logEl.textContent = '';
  downloads.textContent = '';
  const file = fileInput.files![0]!;
  const t0 = performance.now();

  // S7: browser coverage
  results.s7 = {
    webCodecsAudioDecoder: 'AudioDecoder' in globalThis,
    webCodecsAudioEncoder: 'AudioEncoder' in globalThis,
    webgpu: 'gpu' in navigator,
    canEncode: Object.fromEntries(
      await Promise.all(
        (['aac', 'opus', 'flac', 'mp3', 'pcm-s16'] as const).map(async (c) => [c, await canEncodeAudio(c).catch(() => false)]),
      ),
    ),
    deviceMemoryGB: (navigator as { deviceMemory?: number }).deviceMemory ?? null,
  };
  log('S7 browser coverage done');

  // Decode
  const info = await probe(file);
  results.input = { name: file.name, size: file.size, container: info.containerName, ...info.audio, duration: info.duration };
  const decoded = await decodeAudio(info);
  const x48 = (await resample([downmix(decoded.channels)], decoded.sampleRate, 48_000))[0]!;
  log(`Decoded ${info.duration.toFixed(1)} s in ${((performance.now() - t0) / 1000).toFixed(1)} s`);

  // Load the SDK on the main thread
  const heapBefore = (performance as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? null;
  const { Clear } = await import('@desert-ant-labs/clear');
  const litertWasmDir = new URL(`${import.meta.env.BASE_URL}litert/`, location.origin).href;
  const tLoad = performance.now();
  const clear = await Clear.load({ litertWasmDir, onProgress: (f) => log(`model download ${(f * 100).toFixed(0)}%`) });
  results.loadSec = (performance.now() - tLoad) / 1000;
  log(`SDK loaded in ${(results.loadSec as number).toFixed(1)} s`);

  // S5: download sizes
  results.s5 = performance
    .getEntriesByType('resource')
    .map((e) => e as PerformanceResourceTiming)
    .filter((e) => /\.(wasm|tflite|bin|json)(\?|$)|huggingface|litert/.test(e.name))
    .map((e) => ({ url: e.name, transferKB: Math.round(e.transferSize / 1024), encodedKB: Math.round(e.encodedBodySize / 1024), decodedKB: Math.round(e.decodedBodySize / 1024) }));
  log('S5 sizes recorded (0 transfer = served from cache; rerun in a private window for first-visit numbers)');

  // S1: alignment and linear strength
  const full = await clear.enhance(x48, 48_000, { strength: 1, targetLUFS: null });
  const wet = full.samples;
  const half = (await clear.enhance(x48, 48_000, { strength: 0.5, targetLUFS: null })).samples;
  const expectedHalf = new Float32Array(wet.length);
  for (let i = 0; i < wet.length; i++) expectedHalf[i] = 0.5 * wet[i]! + 0.5 * (x48[i] ?? 0);
  const window = Math.min(x48.length, 48_000 * 20);
  results.s1 = {
    inputLength: x48.length,
    outputLength: wet.length,
    sameLength: wet.length === x48.length,
    realtimeFactor: full.realtimeFactor,
    processingSec: full.processingSec,
    lag: bestLag(x48.subarray(0, window), wet.subarray(0, window), 2400),
    strengthIsLinear_relError: relError(half, expectedHalf),
  };
  log('S1 done');
  offerDownload('original.wav', x48);
  offerDownload('enhanced-full.wav', wet);

  // S2: mastering arbitrary audio with strength 0
  const tMaster = performance.now();
  const mastered = await clear.enhance(x48, 48_000, { strength: 0, targetLUFS: -19, peakCeilingDBFS: -1.5 });
  const masterSec = (performance.now() - tMaster) / 1000;
  let dot = 0;
  let xx = 0;
  let peak = 0;
  for (let i = 0; i < Math.min(x48.length, mastered.samples.length); i++) {
    dot += mastered.samples[i]! * x48[i]!;
    xx += x48[i]! * x48[i]!;
    peak = Math.max(peak, Math.abs(mastered.samples[i]!));
  }
  const gain = dot / (xx || 1);
  const scaled = x48.map((v) => v * gain);
  results.s2 = {
    measuredInputLUFS: mastered.measuredLUFS,
    truePeakDBFS: mastered.measuredTruePeakDBFS,
    samplePeakDBFS: 20 * Math.log10(peak || 1e-9),
    fittedGainDB: 20 * Math.log10(Math.abs(gain) || 1e-9),
    residualVsScaledInput: relError(mastered.samples, scaled),
    masterSec,
    enhanceSec: full.processingSec,
    looksLikeInferenceSkipped: masterSec < full.processingSec * 0.3,
  };
  log('S2 done');

  // S4: chunked vs whole
  if (x48.length > 48_000 * 90) {
    const enhanceOne = async (part: Float32Array) => (await clear.enhance(part, 48_000, { strength: 1, targetLUFS: null })).samples;
    const tChunk = performance.now();
    const chunked = await enhanceChunked(enhanceOne, x48, 48_000 * 60, 48_000);
    results.s4 = {
      chunkSec: 60,
      overlapSec: 1,
      relErrorVsWhole: relError(chunked, wet),
      chunkedSec: (performance.now() - tChunk) / 1000,
      wholeSec: full.processingSec,
      note: 'Listen around 1:00, 2:00, … in enhanced-chunked.wav for seams.',
    };
    offerDownload('enhanced-chunked.wav', chunked);
    log('S4 done');
  } else {
    results.s4 = 'skipped: file shorter than 90 s';
  }
  clear.dispose();

  // S6: WebGPU
  if ('gpu' in navigator) {
    try {
      const gpu = await Clear.load({ litertWasmDir, accelerator: 'webgpu' });
      const r = await gpu.enhance(x48, 48_000, { strength: 1, targetLUFS: null });
      results.s6 = { webgpuSec: r.processingSec, cpuSec: full.processingSec, relErrorVsCpu: relError(r.samples, wet) };
      gpu.dispose();
    } catch (e) {
      results.s6 = { error: String(e) };
    }
  } else {
    results.s6 = 'skipped: no WebGPU';
  }
  log('S6 done');

  // Worker path (importScripts shim) + S3-ish memory reading
  const client = new EnhanceClient();
  const tWorker = performance.now();
  await client.load();
  const fromWorker = await client.enhance([x48.slice()], 48_000, 'mono');
  results.worker = {
    ok: true,
    totalSec: (performance.now() - tWorker) / 1000,
    relErrorVsMainThread: relError(fromWorker.channels[0]!, wet),
  };
  client.dispose();
  const heapAfter = (performance as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? null;
  results.s3 = {
    jsHeapDeltaMB: heapBefore && heapAfter ? Math.round((heapAfter - heapBefore) / 1048576) : 'unavailable in this browser',
    audioMinutes: x48.length / 48_000 / 60,
    note: 'Rough: JS heap only. For real numbers watch the tab in the browser task manager while running.',
  };
  log('Worker check done. All checks finished.');
}

// `spike.html#worker-smoke`: load the model in the worker only, to check the
// importScripts shim path without a file (used by CI smoke tests too).
if (location.hash === '#worker-smoke') {
  const client = new EnhanceClient();
  client.onDownloadProgress = (f) => log(`model download ${(f * 100).toFixed(0)}%`);
  client
    .load()
    .then((r) => (resultEl.textContent = `worker-smoke: loaded cached=${r.cached}`))
    .catch((e: { code?: string; message?: string }) => (resultEl.textContent = `worker-smoke: error ${e.code}: ${e.message}`));
}
