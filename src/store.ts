import { create } from 'zustand';
import type { ListenMode } from './audio/engine';
import type { Peaks } from './audio/peaks';
import type { AudioFormatId } from './media/formats';
import type { TimeRange } from './media/keyframes';
import type { MediaInfo } from './media/source';
import type { ChannelMode } from './worker/protocol';

export type Phase = 'import' | 'processing' | 'editor';
export type StepId = 'download' | 'decode' | 'enhance' | 'waveform';
export type StepStatus = 'pending' | 'active' | 'done';
export type LoudnessId = 'off' | 'podcast' | 'stream' | 'broadcast';
export type RateId = '48' | 'source';
export type ExportTab = 'audio' | 'video';

export const LOUDNESS: Record<LoudnessId, { label: string; short: string; lufs: number | null }> = {
  off: { label: 'Off', short: 'as is', lufs: null },
  podcast: { label: 'Podcast', short: '−19', lufs: -19 },
  stream: { label: 'Streaming', short: '−14', lufs: -14 },
  broadcast: { label: 'Broadcast', short: '−23', lufs: -23 },
};

export interface Step {
  status: StepStatus;
  fraction?: number;
  detail?: string;
}

export interface AppError {
  message: string;
  action?: 'retry' | 'trim' | 'choose';
}

export interface State {
  phase: Phase;
  info: MediaInfo | null;
  importError: string | null;

  steps: Record<StepId, Step>;
  /** Long-file warning waiting for a decision (SPEC §6.2). */
  longFile: { bytes: number } | null;
  processingError: AppError | null;

  /** False while trimming before cleaning: only the original is loaded. */
  enhanced: boolean;
  /** Source time of audio time 0 (non-zero after "Trim before cleaning"). */
  timelineOffset: number;
  duration: number;
  peaksDry: Peaks | null;
  peaksWet: Peaks | null;
  /** Exact peaks of the mix at `peaksMixStrength`. */
  peaksMix: Peaks | null;
  peaksMixStrength: number;
  stats: { processingSec: number; realtimeFactor: number; inputLUFS: number | null; outputLUFS: number | null } | null;

  strength: number;
  loudness: LoudnessId;
  channelMode: ChannelMode;
  rate: RateId;

  listen: ListenMode;
  playing: boolean;
  position: number;
  trim: TimeRange;

  exportTab: ExportTab;
  exportFormat: AudioFormatId;
  formatReason: string | null;
  supportedFormats: Set<AudioFormatId> | null;
  snappedVideoRange: TimeRange | null;
  exporting: { fraction: number } | null;
  exportError: string | null;
  unexported: boolean;

  confirm: 'close' | 'channels' | null;
  pendingChannelMode: ChannelMode | null;
}

const initialSteps = (): Record<StepId, Step> => ({
  download: { status: 'pending' },
  decode: { status: 'pending' },
  enhance: { status: 'pending' },
  waveform: { status: 'pending' },
});

export const initialState = (): State => ({
  phase: 'import',
  info: null,
  importError: null,
  steps: initialSteps(),
  longFile: null,
  processingError: null,
  enhanced: false,
  timelineOffset: 0,
  duration: 0,
  peaksDry: null,
  peaksWet: null,
  peaksMix: null,
  peaksMixStrength: 1,
  stats: null,
  strength: 1,
  loudness: 'podcast',
  channelMode: 'mono',
  rate: '48',
  listen: 'enhanced',
  playing: false,
  position: 0,
  trim: { start: 0, end: 0 },
  exportTab: 'audio',
  exportFormat: 'wav',
  formatReason: null,
  supportedFormats: null,
  snappedVideoRange: null,
  exporting: null,
  exportError: null,
  unexported: false,
  confirm: null,
  pendingChannelMode: null,
});

export const useStore = create<State>()(() => initialState());

export const set = useStore.setState;
export const get = useStore.getState;

export function setStep(id: StepId, step: Step) {
  set((s) => ({ steps: { ...s.steps, [id]: step } }));
}

export function resetSteps() {
  set({ steps: initialSteps() });
}
