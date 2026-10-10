// Test double for the Clear SDK (`?mock-model`): fast and deterministic, so e2e
// tests can run the whole flow without downloading the model.
interface Options {
  strength?: number;
  targetLUFS?: number | null;
  peakCeilingDBFS?: number;
  outputSampleRate?: number;
}

export function createMockClear() {
  return {
    isDownloaded: () => true,
    dispose: () => {},
    async enhance(channels: Float32Array[], sampleRate: number, options: Options = {}) {
      const started = performance.now();
      const s = options.strength ?? 1;
      // "Enhance": a crude noise gate relative to the peak, blended by strength like the SDK.
      let inPeak = 1e-9;
      for (const c of channels) for (const v of c) inPeak = Math.max(inPeak, Math.abs(v));
      const threshold = inPeak * 0.3;
      let out = channels.map((c) => c.map((v) => (Math.abs(v) < threshold ? v * (1 - s) : v)));
      let measuredLUFS: number | null = null;
      let measuredTruePeakDBFS: number | null = null;
      if (options.targetLUFS !== null && options.targetLUFS !== undefined) {
        let peak = 1e-9;
        for (const c of out) for (const v of c) peak = Math.max(peak, Math.abs(v));
        const gain = 10 ** ((options.peakCeilingDBFS ?? -1.5) / 20) / peak;
        out = out.map((c) => c.map((v) => v * gain));
        measuredLUFS = -23;
        measuredTruePeakDBFS = options.peakCeilingDBFS ?? -1.5;
      }
      await new Promise((r) => setTimeout(r, 300));
      const durationSec = (out[0]?.length ?? 0) / sampleRate;
      const processingSec = (performance.now() - started) / 1000;
      return {
        channels: out,
        samples: out[0]!,
        channelCount: out.length,
        sampleRate: options.outputSampleRate ?? 48_000,
        durationSec,
        processingSec,
        measuredLUFS,
        measuredTruePeakDBFS,
        realtimeFactor: durationSec / processingSec,
      };
    },
  };
}
