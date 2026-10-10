import { transferablesOf, type ChannelMode, type ErrorCode, type WorkerRequest, type WorkerResponse } from './protocol';

export class WorkerError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
  }
}

/** `?mock-model` swaps the model for a cheap fake, for tests without network. */
const MOCK_MODEL = typeof location !== 'undefined' && new URLSearchParams(location.search).has('mock-model');

type Pending = { resolve: (value: WorkerResponse) => void; reject: (error: Error) => void };

/** Promise wrapper over the enhancement worker. `cancel()` kills and respawns it. */
export class EnhanceClient {
  private worker!: Worker;
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private loadWaiters: Pending[] = [];
  onDownloadProgress: (fraction: number) => void = () => {};

  constructor() {
    this.spawn();
  }

  private spawn() {
    this.worker = new Worker(new URL('./enhance.worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => this.handle(event.data);
    this.worker.onerror = (event) => this.failAll(new WorkerError('runtime', event.message || 'Worker crashed'));
  }

  private handle(msg: WorkerResponse) {
    if (msg.type === 'progress') return this.onDownloadProgress(msg.fraction);
    if (msg.type === 'loaded') {
      this.loadWaiters.splice(0).forEach((w) => w.resolve(msg));
      return;
    }
    if (msg.type === 'error' && msg.id === undefined) {
      this.loadWaiters.splice(0).forEach((w) => w.reject(new WorkerError(msg.code, msg.message)));
      return;
    }
    const id = msg.id!;
    const waiter = this.pending.get(id);
    if (!waiter) return;
    this.pending.delete(id);
    if (msg.type === 'error') waiter.reject(new WorkerError(msg.code, msg.message));
    else waiter.resolve(msg);
  }

  private failAll(error: Error) {
    this.loadWaiters.splice(0).forEach((w) => w.reject(error));
    this.pending.forEach((w) => w.reject(error));
    this.pending.clear();
  }

  private request<T extends WorkerResponse>(build: (id: number) => WorkerRequest, transfer: Transferable[]): Promise<T> {
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: WorkerResponse) => void, reject });
      this.worker.postMessage(build(id), transfer);
    });
  }

  load(): Promise<{ cached: boolean }> {
    return new Promise((resolve, reject) => {
      this.loadWaiters.push({ resolve: (m) => resolve(m as { type: 'loaded'; cached: boolean }), reject });
      this.worker.postMessage({ type: 'load', mock: MOCK_MODEL } satisfies WorkerRequest);
    });
  }

  enhance(channels: Float32Array[], sampleRate: number, channelMode: ChannelMode) {
    return this.request<Extract<WorkerResponse, { type: 'enhanced' }>>(
      (id) => ({ type: 'enhance', id, channels, sampleRate, channelMode }),
      transferablesOf(channels),
    );
  }

  master(channels: Float32Array[], sampleRate: number, targetLUFS: number, peakCeilingDBFS = -1.5) {
    return this.request<Extract<WorkerResponse, { type: 'mastered' }>>(
      (id) => ({ type: 'master', id, channels, sampleRate, targetLUFS, peakCeilingDBFS }),
      transferablesOf(channels),
    );
  }

  /** Copies the channels (peaks must not take ownership of buffers still in use). */
  peaks(channels: Float32Array[], buckets: number) {
    const copies = channels.map((c) => c.slice());
    return this.request<Extract<WorkerResponse, { type: 'peaks' }>>(
      (id) => ({ type: 'peaks', id, channels: copies, buckets }),
      transferablesOf(copies),
    );
  }

  /** Stop whatever is running. The model stays in the browser cache. */
  cancel() {
    this.worker.terminate();
    this.failAll(new WorkerError('runtime', 'cancelled'));
    this.spawn();
  }

  dispose() {
    this.worker.terminate();
    this.failAll(new WorkerError('runtime', 'disposed'));
  }
}
