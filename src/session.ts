// The app's controller: owns the worker, the playback engine and the large
// audio buffers (kept out of the store), and drives import → process → edit →
// export. UI components call these functions and read the store.
import { PlaybackEngine, type ListenMode } from './audio/engine';
import { detectDevice, estimatePeakBytes, shouldWarn } from './audio/memory';
import { mixChannels } from './audio/mix';
import { computePeaks, mixPeaks } from './audio/peaks';
import { supportedAudioFormats } from './media/encode';
import { encodeAudioFile, type RenderedAudio } from './media/exportAudio';
import { exportVideo, snapVideoRange } from './media/exportVideo';
import { AUDIO_FORMATS, defaultAudioFormat, outputFileName, type AudioFormatId } from './media/formats';
import type { TimeRange } from './media/keyframes';
import { decodeAudio, downmix, MediaError, probe, resample } from './media/source';
import { get, initialState, LOUDNESS, resetSteps, set, setStep, type ExportTab, type LoudnessId, type RateId } from './store';
import { EnhanceClient, WorkerError } from './worker/client';
import type { ChannelMode } from './worker/protocol';

const PEAK_BUCKETS = 2400;

let client: EnhanceClient | null = null;
let engine: PlaybackEngine | null = null;
/** Original at 48 kHz in the source's channel layout. */
let dryFull: AudioBuffer | null = null;
/** Original in the processed layout (mono downmix or the same as dryFull). */
let dryMix: AudioBuffer | null = null;
let wet: AudioBuffer | null = null;
/** Bumped on every new run so late results from a cancelled one are ignored. */
let run = 0;

function getClient() {
  client ??= new EnhanceClient();
  return client;
}

function getEngine() {
  if (!engine) {
    engine = new PlaybackEngine();
    engine.onEnded = () => set({ playing: false, position: engine!.position });
  }
  return engine;
}

const channelsOf = (buffer: AudioBuffer) => Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c));

// ---------------------------------------------------------------- import

export async function openFile(file: File) {
  startOver();
  let info;
  try {
    info = await probe(file);
  } catch (e) {
    const message = e instanceof MediaError ? e.message : `"${file.name}" can't be read. Try an MP3, WAV, M4A, MP4 or WebM file.`;
    set({ importError: message });
    return;
  }
  const format = defaultAudioFormat(info.audio.codec);
  set({
    info,
    importError: null,
    duration: info.duration,
    trim: { start: 0, end: info.duration },
    channelMode: 'mono',
    exportTab: info.videoContainer ? 'video' : 'audio',
    exportFormat: format.value,
    formatReason: format.reason ?? null,
  });
  void checkFormats();

  const bytes = estimatePeakBytes(info.duration, 1);
  if (shouldWarn(bytes, detectDevice())) {
    set({ phase: 'processing', longFile: { bytes } });
    void getClient().load().catch(() => {}); // warm the model while the user decides
    return;
  }
  void process();
}

async function checkFormats() {
  const { info, channelMode } = get();
  if (!info) return;
  const supported = await supportedAudioFormats({ numberOfChannels: channelMode === 'mono' ? 1 : info.audio.channels, sampleRate: 48_000 });
  const current = get().exportFormat;
  const patch: Partial<ReturnType<typeof get>> = { supportedFormats: supported };
  if (!supported.has(current)) {
    const fallback = (['m4a', 'mp3', 'wav'] as AudioFormatId[]).find((f) => supported.has(f)) ?? 'wav';
    patch.exportFormat = fallback;
    patch.formatReason = `${AUDIO_FORMATS[current].label} can't be written in this browser; saving as ${AUDIO_FORMATS[fallback].label}.`;
  }
  set(patch);
}

export function continueAnyway() {
  set({ longFile: null });
  void process();
}

/** Long file: decode only, let the user trim, then enhance just that part. */
export async function trimBeforeCleaning() {
  set({ longFile: null });
  const token = ++run;
  try {
    await decodeStep(token);
    if (token !== run) return;
    getEngine().setBuffers(dryFull!, null);
    dryMix = dryFull;
    set({ phase: 'editor', enhanced: false, listen: 'original', peaksDry: computePeaks(channelsOf(dryFull!), PEAK_BUCKETS), peaksWet: null, peaksMix: null });
  } catch (e) {
    if (token === run) fail(e);
  }
}

/** After trimming first: crop to the trim and process only that range. */
export async function enhanceSelection() {
  const { trim, timelineOffset } = get();
  const e = getEngine();
  e.pause();
  const startFrame = Math.floor(trim.start * 48_000);
  const endFrame = Math.ceil(trim.end * 48_000);
  dryFull = e.makeBuffer(
    channelsOf(dryFull!).map((c) => c.slice(startFrame, endFrame)),
    48_000,
  );
  const duration = dryFull.duration;
  set({ timelineOffset: timelineOffset + trim.start, duration, trim: { start: 0, end: duration }, position: 0, playing: false });
  e.setBuffers(dryFull, null);
  e.seek(0);
  set({ phase: 'processing' });
  setStep('decode', { status: 'done' });
  const token = ++run;
  try {
    await enhanceStep(token);
  } catch (err) {
    if (token === run) fail(err);
  }
}

// ---------------------------------------------------------------- processing

async function process() {
  const token = ++run;
  set({ phase: 'processing', processingError: null });
  resetSteps();
  try {
    await decodeStep(token);
    if (token !== run) return;
    await enhanceStep(token);
  } catch (e) {
    if (token === run) fail(e);
  }
}

async function loadModel(token: number) {
  const c = getClient();
  setStep('download', { status: 'active', fraction: 0 });
  c.onDownloadProgress = (fraction) => token === run && setStep('download', { status: 'active', fraction });
  const { cached } = await c.load();
  if (token === run) setStep('download', { status: 'done', detail: cached ? 'cached' : 'downloaded' });
}

async function decodeStep(token: number) {
  const info = get().info!;
  const model = loadModel(token);
  setStep('decode', { status: 'active', fraction: 0 });
  const decoded = await decodeAudio(info, (fraction) => token === run && setStep('decode', { status: 'active', fraction }));
  const channels = await resample(decoded.channels, decoded.sampleRate, 48_000);
  if (token !== run) return;
  dryFull = getEngine().makeBuffer(channels, 48_000);
  set({ duration: dryFull.duration, trim: { start: 0, end: dryFull.duration } });
  setStep('decode', { status: 'done' });
  await model;
}

async function enhanceStep(token: number) {
  const { channelMode } = get();
  await loadModel(token);
  if (token !== run) return;
  const e = getEngine();
  const source = channelsOf(dryFull!);
  const layout = channelMode === 'mono' && source.length > 1 ? [downmix(source)] : source;
  dryMix = layout === source ? dryFull : e.makeBuffer(layout, 48_000);

  setStep('enhance', { status: 'active' });
  const started = performance.now();
  const result = await getClient().enhance(
    layout.map((c) => c.slice()),
    48_000,
    channelMode,
  );
  if (token !== run) return;
  // Keep the timelines identical even if the model returns a few samples more or less.
  const length = dryMix!.length;
  const fitted = result.channels.map((c) => {
    if (c.length === length) return c;
    const out = new Float32Array(length);
    out.set(c.subarray(0, length));
    return out;
  });
  wet = e.makeBuffer(fitted, 48_000);
  setStep('enhance', { status: 'done', detail: `${((performance.now() - started) / 1000).toFixed(1)} s` });

  setStep('waveform', { status: 'active' });
  const dryChannels = channelsOf(dryMix!);
  const peaksDry = computePeaks(dryChannels, PEAK_BUCKETS);
  const peaksWet = computePeaks(channelsOf(wet), PEAK_BUCKETS);
  const peaksMix = mixPeaks(dryChannels, channelsOf(wet), get().strength, PEAK_BUCKETS);
  setStep('waveform', { status: 'done' });

  e.setBuffers(dryMix!, wet);
  e.setStrength(get().strength);
  e.setListen('enhanced');
  set({
    phase: 'editor',
    enhanced: true,
    listen: 'enhanced',
    peaksDry,
    peaksWet,
    peaksMix,
    peaksMixStrength: get().strength,
    unexported: true,
    stats: { processingSec: result.processingSec, realtimeFactor: result.realtimeFactor, inputLUFS: null, outputLUFS: null },
  });
  void refreshSnap();
}

function fail(e: unknown) {
  console.error(e);
  if (e instanceof WorkerError && e.code === 'oom') {
    set({ processingError: { message: 'Your device ran out of memory. Try trimming the file first.', action: 'trim' } });
  } else if (e instanceof WorkerError && e.code === 'download') {
    set({ processingError: { message: "Couldn't download the model. Check your connection and try again.", action: 'retry' } });
  } else if (e instanceof MediaError) {
    set({ processingError: { message: e.message, action: 'choose' } });
  } else {
    set({ processingError: { message: `Something went wrong: ${e instanceof Error ? e.message : String(e)}`, action: 'retry' } });
  }
}

export function retry() {
  set({ processingError: null });
  if (dryFull) {
    set({ phase: 'processing' });
    const token = ++run;
    enhanceStep(token).catch((e) => token === run && fail(e));
  } else {
    void process();
  }
}

export function cancelProcessing() {
  run++;
  client?.cancel();
  startOver();
}

export function startOver() {
  run++;
  engine?.pause();
  dryFull = dryMix = wet = null;
  set(initialState());
}

// ---------------------------------------------------------------- editor

export function togglePlay() {
  const e = getEngine();
  const { playing, position, trim } = get();
  if (playing) {
    e.pause();
    set({ playing: false, position: e.position });
    return;
  }
  const from = position < trim.start || position >= trim.end - 0.01 ? trim.start : position;
  e.play(from, trim.end);
  set({ playing: true, position: from });
}

export function seek(time: number) {
  const { trim } = get();
  const t = Math.max(0, Math.min(time, get().duration));
  getEngine().seek(t);
  if (get().playing) getEngine().setStopAt(t < trim.end ? trim.end : get().duration);
  set({ position: t });
}

/** Called every animation frame while playing. */
export function tick() {
  if (engine && get().playing) set({ position: engine.position });
}

export function setStrength(strength: number, final: boolean) {
  getEngine().setStrength(strength);
  set({ strength });
  if (final && dryMix && wet) {
    set({ peaksMix: mixPeaks(channelsOf(dryMix), channelsOf(wet), strength, PEAK_BUCKETS), peaksMixStrength: strength });
  }
}

export function setListen(listen: ListenMode) {
  getEngine().setListen(listen);
  set({ listen });
}

export function setTrim(trim: TimeRange) {
  const duration = get().duration;
  const start = Math.max(0, Math.min(trim.start, duration));
  const end = Math.max(start + 0.05, Math.min(trim.end, duration));
  set({ trim: { start, end } });
  if (get().playing) getEngine().setStopAt(end);
  scheduleSnap();
}

export function setLoudness(loudness: LoudnessId) {
  set({ loudness });
}

export function setRate(rate: RateId) {
  set({ rate });
}

export function requestChannelMode(mode: ChannelMode) {
  if (mode === get().channelMode) return;
  set({ confirm: 'channels', pendingChannelMode: mode });
}

export function applyChannelMode() {
  const mode = get().pendingChannelMode;
  if (!mode) return;
  set({ confirm: null, pendingChannelMode: null, channelMode: mode });
  void checkFormats();
  if (!dryFull) return;
  getEngine().pause();
  set({ playing: false, phase: 'processing', processingError: null });
  resetSteps();
  setStep('decode', { status: 'done' });
  const token = ++run;
  enhanceStep(token).catch((e) => token === run && fail(e));
}

export function setExportTab(exportTab: ExportTab) {
  set({ exportTab });
  if (exportTab === 'video') void refreshSnap();
}

export function setExportFormat(exportFormat: AudioFormatId) {
  set({ exportFormat, formatReason: null });
}

let snapTimer: ReturnType<typeof setTimeout> | undefined;
function scheduleSnap() {
  clearTimeout(snapTimer);
  snapTimer = setTimeout(() => void refreshSnap(), 250);
}

/** Source-time range for an audio-time range. */
function toSource(range: TimeRange): TimeRange {
  const { info, timelineOffset } = get();
  const base = (info?.audioStart ?? 0) + timelineOffset;
  return { start: base + range.start, end: base + range.end };
}

async function refreshSnap() {
  const { info, trim, exportTab } = get();
  if (!info?.videoContainer || exportTab !== 'video') return;
  try {
    const snapped = await snapVideoRange(info, toSource(trim));
    const base = info.audioStart + get().timelineOffset;
    set({ snappedVideoRange: { start: snapped.start - base, end: snapped.end - base } });
  } catch {
    set({ snappedVideoRange: null });
  }
}

// ---------------------------------------------------------------- export

/** Mix, master and resample an audio-time range (zero-padded outside the audio). */
async function renderRange(range: TimeRange): Promise<RenderedAudio> {
  const { strength, loudness, rate, info } = get();
  const dry = channelsOf(dryMix!);
  const wetChannels = wet ? channelsOf(wet) : dry;
  const startFrame = Math.round(range.start * 48_000);
  const endFrame = Math.round(range.end * 48_000);
  const from = Math.max(0, startFrame);
  const to = Math.min(dry[0]!.length, endFrame);
  const s = wet ? strength : 0;
  let channels = mixChannels(dry, wetChannels, s, from, Math.max(from, to));
  if (from > startFrame || to < endFrame) {
    channels = channels.map((c) => {
      const padded = new Float32Array(Math.max(0, endFrame - startFrame));
      padded.set(c, from - startFrame);
      return padded;
    });
  }
  const target = LOUDNESS[loudness].lufs;
  if (target !== null) {
    const mastered = await getClient().master(channels, 48_000, target);
    channels = mastered.channels;
    set((st) => ({ stats: st.stats ? { ...st.stats, inputLUFS: mastered.measuredLUFS, outputLUFS: target } : st.stats }));
  } else {
    set((st) => ({ stats: st.stats ? { ...st.stats, outputLUFS: null } : st.stats }));
  }
  const outRate = rate === 'source' && info ? info.audio.sampleRate : 48_000;
  channels = await resample(channels, 48_000, outRate);
  return { channels, sampleRate: outRate };
}

export function exportFileName(): string {
  const { info, exportTab, exportFormat } = get();
  if (!info) return '';
  const ext = exportTab === 'video' && info.videoContainer ? info.file.name.split('.').pop()!.toLowerCase() : AUDIO_FORMATS[exportFormat].extension;
  return outputFileName(info.file.name, ext);
}

export async function exportNow() {
  const { info, exportTab, exportFormat, trim } = get();
  if (!info || !dryMix || get().exporting) return;
  getEngine().pause();
  set({ playing: false, exporting: { fraction: 0 }, exportError: null });
  const onProgress = (fraction: number) => set({ exporting: { fraction } });
  try {
    let blob: Blob;
    if (exportTab === 'video' && info.videoContainer) {
      const base = info.audioStart + get().timelineOffset;
      const result = await exportVideo(info, {
        range: toSource(trim),
        renderAudio: (r) => renderRange({ start: r.start - base, end: r.end - base }),
        onProgress,
      });
      blob = result.blob;
    } else {
      const audio = await renderRange(trim);
      blob = await encodeAudioFile(audio, { format: exportFormat, sourceBitrate: info.audio.bitrate, onProgress });
    }
    saveBlob(blob, exportFileName());
    set({ exporting: null, unexported: false });
  } catch (e) {
    console.error(e);
    set({ exporting: null, exportError: `Export failed: ${e instanceof Error ? e.message : String(e)}. Try another format.` });
  }
}

function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
