// Messages between the UI thread and the enhancement worker (ARCHITECTURE §4).
// Sample buffers are always transferred, never copied.

export type ChannelMode = 'mono' | 'preserve';

export type WorkerRequest =
  | { type: 'load'; mock?: boolean }
  | { type: 'enhance'; id: number; channels: Float32Array[]; sampleRate: number; channelMode: ChannelMode }
  | { type: 'master'; id: number; channels: Float32Array[]; sampleRate: number; targetLUFS: number; peakCeilingDBFS: number }
  | { type: 'peaks'; id: number; channels: Float32Array[]; buckets: number };

export type ErrorCode = 'download' | 'oom' | 'runtime';

export type WorkerResponse =
  | { type: 'progress'; stage: 'download'; fraction: number }
  | { type: 'loaded'; cached: boolean }
  | {
      type: 'enhanced';
      id: number;
      channels: Float32Array[];
      sampleRate: number;
      processingSec: number;
      realtimeFactor: number;
    }
  | { type: 'mastered'; id: number; channels: Float32Array[]; measuredLUFS: number | null; truePeakDBFS: number | null }
  | { type: 'peaks'; id: number; min: Float32Array; max: Float32Array }
  | { type: 'error'; id?: number; code: ErrorCode; message: string };

export function transferablesOf(channels: Float32Array[]): ArrayBuffer[] {
  const seen = new Set<ArrayBuffer>();
  for (const c of channels) seen.add(c.buffer as ArrayBuffer);
  return [...seen];
}
