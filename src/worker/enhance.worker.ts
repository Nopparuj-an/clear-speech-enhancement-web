import './importScriptsShim';
import { master } from '../audio/loudness';
import { computePeaks } from '../audio/peaks';
import { transferablesOf, type ErrorCode, type WorkerRequest, type WorkerResponse } from './protocol';

type ClearModule = typeof import('@desert-ant-labs/clear');
type ClearInstance = Awaited<ReturnType<ClearModule['Clear']['load']>>;

const post = (message: WorkerResponse, transfer: Transferable[] = []) => self.postMessage(message, { transfer });

let clear: Promise<ClearInstance> | null = null;

function load(mock = false): Promise<ClearInstance> {
  if (mock) clear ??= import('./mockClear').then((m) => m.createMockClear() as unknown as ClearInstance);
  clear ??= (async () => {
    // Imported lazily so the importScripts shim is installed first and the 46 MB
    // core only downloads when the worker is actually asked for the model.
    const { Clear } = await import('@desert-ant-labs/clear');
    const litertWasmDir = new URL(`${import.meta.env.BASE_URL}litert/`, self.location.origin).href;
    // The runtime is eval'd by the shim, so Emscripten can't tell where its
    // script came from and would look for the .wasm next to this worker.
    (self as unknown as { Module?: object }).Module = { locateFile: (path: string) => litertWasmDir + path };
    const instance = await Clear.load({
      litertWasmDir,
      onProgress: (fraction) => post({ type: 'progress', stage: 'download', fraction }),
    });
    return instance;
  })();
  clear.catch(() => {
    clear = null;
  });
  return clear;
}

function classify(error: unknown, fallback: ErrorCode): { code: ErrorCode; message: string } {
  const message = error instanceof Error ? error.message : String(error);
  if (error instanceof RangeError || /out of memory|allocation failed|memory access out of bounds/i.test(message)) {
    return { code: 'oom', message };
  }
  return { code: fallback, message };
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const req = event.data;
  try {
    switch (req.type) {
      case 'load': {
        const instance = await load(req.mock);
        post({ type: 'loaded', cached: instance.isDownloaded() });
        break;
      }
      case 'enhance': {
        const instance = await load();
        // Full strength, no mastering: strength and loudness are applied later so
        // changing them never re-runs inference (ARCHITECTURE §3).
        const result = await instance.enhance(req.channels, req.sampleRate, {
          strength: 1,
          targetLUFS: null,
          channelMode: req.channelMode,
          outputSampleRate: 48_000,
        });
        post(
          {
            type: 'enhanced',
            id: req.id,
            channels: result.channels,
            sampleRate: result.sampleRate,
            processingSec: result.processingSec,
            realtimeFactor: result.realtimeFactor,
          },
          transferablesOf(result.channels),
        );
        break;
      }
      case 'master': {
        // Our own BS.1770 + true-peak limiter: the SDK can master arbitrary
        // audio too, but only by running the model again (spike S2).
        const result = master(req.channels, { targetLUFS: req.targetLUFS, peakCeilingDBFS: req.peakCeilingDBFS });
        post(
          {
            type: 'mastered',
            id: req.id,
            channels: result.channels,
            measuredLUFS: Number.isFinite(result.inputLUFS) ? result.inputLUFS : null,
            truePeakDBFS: null,
          },
          transferablesOf(result.channels),
        );
        break;
      }
      case 'peaks': {
        const { min, max } = computePeaks(req.channels, req.buckets);
        post({ type: 'peaks', id: req.id, min, max }, [min.buffer, max.buffer]);
        break;
      }
    }
  } catch (error) {
    const fallback: ErrorCode = req.type === 'load' ? 'download' : 'runtime';
    post({ type: 'error', id: 'id' in req ? req.id : undefined, ...classify(error, fallback) });
  }
};
