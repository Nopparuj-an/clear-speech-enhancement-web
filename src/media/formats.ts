// "Same as source" export rules (SPEC §5). Pure: no Mediabunny imports, so the
// table is unit-tested on its own.

export type AudioFormatId = 'wav' | 'flac' | 'mp3' | 'm4a' | 'opus';
export type VideoContainer = 'mp4' | 'mov' | 'webm' | 'mkv';
export type EncodableCodec = 'pcm' | 'flac' | 'mp3' | 'aac' | 'opus';

export interface AudioFormatInfo {
  id: AudioFormatId;
  label: string;
  extension: string;
  codec: EncodableCodec;
  lossless: boolean;
  note: string;
}

export const AUDIO_FORMATS: Record<AudioFormatId, AudioFormatInfo> = {
  wav: { id: 'wav', label: 'WAV', extension: 'wav', codec: 'pcm', lossless: true, note: 'Lossless, largest file.' },
  flac: { id: 'flac', label: 'FLAC', extension: 'flac', codec: 'flac', lossless: true, note: 'Lossless, about half the size of WAV.' },
  mp3: { id: 'mp3', label: 'MP3', extension: 'mp3', codec: 'mp3', lossless: false, note: 'Plays everywhere.' },
  m4a: { id: 'm4a', label: 'M4A (AAC)', extension: 'm4a', codec: 'aac', lossless: false, note: 'Small, good for Apple devices.' },
  opus: { id: 'opus', label: 'Opus', extension: 'opus', codec: 'opus', lossless: false, note: 'Smallest at the same quality.' },
};

export const AUDIO_FORMAT_ORDER: AudioFormatId[] = ['wav', 'flac', 'mp3', 'm4a', 'opus'];

const LOSSLESS_SOURCE = /^(pcm|flac|alac)/;

/** Human name for a source codec, for the "can't be written" notes. */
function codecName(codec: string): string {
  if (codec === 'vorbis') return 'OGG Vorbis';
  if (codec.startsWith('pcm')) return 'PCM';
  return codec.toUpperCase();
}

export interface DefaultChoice<T> {
  value: T;
  /** Shown in the export panel when the default differs from the source. */
  reason?: string;
}

/** Default audio export format for a source audio codec (Mediabunny codec id). */
export function defaultAudioFormat(sourceCodec: string | null): DefaultChoice<AudioFormatId> {
  switch (sourceCodec) {
    case 'mp3':
      return { value: 'mp3' };
    case 'aac':
      return { value: 'm4a' };
    case 'flac':
      return { value: 'flac' };
    case 'opus':
      return { value: 'opus' };
    case 'vorbis':
      return { value: 'opus', reason: "OGG Vorbis can't be written in the browser; saving as Opus." };
  }
  if (sourceCodec && sourceCodec.startsWith('pcm')) return { value: 'wav' };
  if (sourceCodec && LOSSLESS_SOURCE.test(sourceCodec)) {
    return { value: 'flac', reason: `${codecName(sourceCodec)} can't be written in the browser; saving as FLAC (lossless).` };
  }
  const name = sourceCodec ? codecName(sourceCodec) : 'This audio format';
  return { value: 'm4a', reason: `${name} can't be written in the browser; saving as M4A.` };
}

/** Audio codecs each video container accepts, in fallback order. */
const CONTAINER_AUDIO: Record<VideoContainer, EncodableCodec[]> = {
  mp4: ['aac', 'mp3', 'opus', 'flac'],
  mov: ['aac', 'mp3', 'opus', 'flac'],
  webm: ['opus'],
  mkv: ['opus', 'aac', 'mp3', 'flac'],
};

/** Audio codec for a video export: the source codec if the container takes it, else the container's first choice. */
export function videoAudioCodec(container: VideoContainer, sourceCodec: string | null): DefaultChoice<EncodableCodec> {
  const accepted = CONTAINER_AUDIO[container];
  const match = accepted.find((c) => c === sourceCodec);
  if (match) return { value: match };
  const fallback = accepted[0]!;
  const name = sourceCodec ? codecName(sourceCodec) : 'The source audio';
  return { value: fallback, reason: `${name} can't be written in this container; using ${fallback === 'aac' ? 'AAC' : 'Opus'}.` };
}

export const MIN_BITRATE = 128_000;
export const MAX_BITRATE = 320_000;

/** Lossy bitrate: match the source within [128, 320] kbps; unknown → 192 kbps (96 for Opus). */
export function lossyBitrate(codec: EncodableCodec, sourceBitrate: number | null): number {
  if (!sourceBitrate || !Number.isFinite(sourceBitrate) || sourceBitrate <= 0) {
    return codec === 'opus' ? 96_000 : 192_000;
  }
  return Math.min(MAX_BITRATE, Math.max(MIN_BITRATE, Math.round(sourceBitrate / 1000) * 1000));
}

/** `talk.final.mp4` → `talk.final-enhanced.m4a`. */
export function outputFileName(sourceName: string, extension: string): string {
  const dot = sourceName.lastIndexOf('.');
  const stem = dot > 0 ? sourceName.slice(0, dot) : sourceName;
  return `${stem}-enhanced.${extension}`;
}
