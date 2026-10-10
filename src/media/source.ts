import { ALL_FORMATS, AudioBufferSink, BlobSource, Input, MATROSKA, MP4, QTFF, WEBM, type InputFormat } from 'mediabunny';
import type { VideoContainer } from './formats';

export interface MediaInfo {
  file: File;
  /** Container name as Mediabunny reports it, e.g. "MP4", "MP3". */
  containerName: string;
  /** Set only when the file has a video track we can copy. */
  videoContainer: VideoContainer | null;
  duration: number;
  audio: { codec: string | null; channels: number; sampleRate: number; bitrate: number | null };
  video: { codec: string | null; width: number; height: number } | null;
}

export class MediaError extends Error {
  constructor(
    readonly code: 'unreadable' | 'no-audio' | 'undecodable',
    message: string,
  ) {
    super(message);
  }
}

function videoContainerOf(format: InputFormat): VideoContainer | null {
  if (format === MP4) return 'mp4';
  if (format === QTFF) return 'mov';
  if (format === WEBM) return 'webm';
  if (format === MATROSKA) return 'mkv';
  return null;
}

export function openInput(file: File): Input {
  return new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
}

export async function probe(file: File): Promise<MediaInfo> {
  const input = openInput(file);
  try {
    if (!(await input.canRead())) throw new MediaError('unreadable', "This file's format can't be read.");
    const format = await input.getFormat();
    const audio = await input.getPrimaryAudioTrack();
    if (!audio) throw new MediaError('no-audio', 'This file has no audio track.');
    const video = await input.getPrimaryVideoTrack();
    const container = video ? videoContainerOf(format) : null;
    return {
      file,
      containerName: format.name,
      videoContainer: container,
      duration: await input.computeDuration(),
      audio: {
        codec: audio.codec,
        channels: audio.numberOfChannels,
        sampleRate: audio.sampleRate,
        bitrate: (await audio.getAverageBitrate().catch(() => null)) ?? (await audio.getBitrate().catch(() => null)),
      },
      video: video && container ? { codec: video.codec, width: video.displayWidth, height: video.displayHeight } : null,
    };
  } finally {
    input.dispose();
  }
}

export interface DecodedAudio {
  channels: Float32Array[];
  sampleRate: number;
}

/** Decode the primary audio track to planar float32 at its own rate. */
export async function decodeAudio(info: MediaInfo, onProgress?: (fraction: number) => void): Promise<DecodedAudio> {
  const input = openInput(info.file);
  try {
    const track = await input.getPrimaryAudioTrack();
    if (!track) throw new MediaError('no-audio', 'This file has no audio track.');
    if (!(await track.canDecode())) {
      if (info.video) throw new MediaError('undecodable', "This file's audio can't be read in this browser.");
      return await decodeWithWebAudio(info.file);
    }
    const sampleRate = track.sampleRate;
    const count = track.numberOfChannels;
    const first = await track.getFirstTimestamp();
    let capacity = Math.ceil(info.duration * sampleRate) + sampleRate;
    let channels = Array.from({ length: count }, () => new Float32Array(capacity));
    let filled = 0;
    for await (const { buffer, timestamp } of new AudioBufferSink(track).buffers()) {
      const offset = Math.max(0, Math.round((timestamp - first) * sampleRate));
      const end = offset + buffer.length;
      if (end > capacity) {
        capacity = Math.ceil(end * 1.25);
        channels = channels.map((c) => {
          const grown = new Float32Array(capacity);
          grown.set(c);
          return grown;
        });
      }
      for (let c = 0; c < count; c++) {
        channels[c]!.set(buffer.getChannelData(Math.min(c, buffer.numberOfChannels - 1)), offset);
      }
      filled = Math.max(filled, end);
      onProgress?.(info.duration > 0 ? Math.min(1, timestamp / info.duration) : 0);
    }
    return { channels: channels.map((c) => c.slice(0, filled)), sampleRate };
  } finally {
    input.dispose();
  }
}

async function decodeWithWebAudio(file: File): Promise<DecodedAudio> {
  const context = new OfflineAudioContext(1, 1, 48_000);
  try {
    const buffer = await context.decodeAudioData(await file.arrayBuffer());
    return {
      channels: Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c).slice()),
      sampleRate: buffer.sampleRate,
    };
  } catch {
    throw new MediaError('undecodable', "This file's audio can't be read in this browser.");
  }
}

/** Resample planar audio with the browser's resampler. No-op when rates match. */
export async function resample(channels: Float32Array[], fromRate: number, toRate: number): Promise<Float32Array[]> {
  if (fromRate === toRate || channels.length === 0) return channels;
  const length = channels[0]!.length;
  const outLength = Math.round((length * toRate) / fromRate);
  const context = new OfflineAudioContext(channels.length, Math.max(1, outLength), toRate);
  const source = context.createBufferSource();
  const buffer = context.createBuffer(channels.length, Math.max(1, length), fromRate);
  channels.forEach((c, i) => buffer.copyToChannel(c as Float32Array<ArrayBuffer>, i));
  source.buffer = buffer;
  source.connect(context.destination);
  source.start();
  const rendered = await context.startRendering();
  return Array.from({ length: rendered.numberOfChannels }, (_, c) => rendered.getChannelData(c).slice(0, outLength));
}

/** Average all channels into one. */
export function downmix(channels: Float32Array[]): Float32Array {
  if (channels.length === 1) return channels[0]!;
  const length = channels[0]?.length ?? 0;
  const out = new Float32Array(length);
  for (const c of channels) for (let i = 0; i < length; i++) out[i]! += c[i]!;
  const scale = 1 / channels.length;
  for (let i = 0; i < length; i++) out[i]! *= scale;
  return out;
}
