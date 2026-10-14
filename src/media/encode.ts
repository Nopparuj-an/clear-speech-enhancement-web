import {
  AudioSample,
  AudioSampleSource,
  canEncodeAudio,
  FlacOutputFormat,
  Mp3OutputFormat,
  Mp4OutputFormat,
  OggOutputFormat,
  WavOutputFormat,
  type AudioCodec,
  type OutputFormat,
} from 'mediabunny';
import { AUDIO_FORMATS, type AudioFormatId, type EncodableCodec } from './formats';

export function mediabunnyCodec(codec: EncodableCodec): AudioCodec {
  return codec === 'pcm' ? 'pcm-s16' : codec;
}

const registered = new Set<EncodableCodec>();

/** Lazily register a WASM encoder when WebCodecs can't encode `codec` here. */
async function registerFallback(codec: EncodableCodec): Promise<boolean> {
  if (registered.has(codec)) return true;
  if (codec === 'mp3') (await import('@mediabunny/mp3-encoder')).registerMp3Encoder();
  else if (codec === 'aac') (await import('@mediabunny/aac-encoder')).registerAacEncoder();
  else if (codec === 'flac') (await import('@mediabunny/flac-encoder')).registerFlacEncoder();
  else return false;
  registered.add(codec);
  return true;
}

export interface EncodeTarget {
  numberOfChannels: number;
  sampleRate: number;
  bitrate?: number;
}

/** Make sure `codec` can be encoded, registering a fallback encoder if needed. */
export async function ensureEncoder(codec: EncodableCodec, target: EncodeTarget): Promise<boolean> {
  const options = { numberOfChannels: target.numberOfChannels, sampleRate: target.sampleRate, bitrate: target.bitrate };
  if (await canEncodeAudio(mediabunnyCodec(codec), options).catch(() => false)) return true;
  if (!(await registerFallback(codec))) return false;
  return canEncodeAudio(mediabunnyCodec(codec), options).catch(() => false);
}

/** Which audio formats this browser can export for a given layout. */
export async function supportedAudioFormats(target: EncodeTarget): Promise<Set<AudioFormatId>> {
  const ids = Object.keys(AUDIO_FORMATS) as AudioFormatId[];
  // MP3, AAC and FLAC always have a WASM fallback, loaded only when exporting;
  // PCM is built in. Only Opus depends on the browser's own encoder.
  const ok = await Promise.all(
    ids.map((id) => {
      const codec = AUDIO_FORMATS[id].codec;
      if (codec !== 'opus') return true;
      return canEncodeAudio('opus', { numberOfChannels: target.numberOfChannels, sampleRate: target.sampleRate }).catch(() => false);
    }),
  );
  return new Set(ids.filter((_, i) => ok[i]));
}

export function audioOutputFormat(id: AudioFormatId): OutputFormat {
  switch (id) {
    case 'wav':
      return new WavOutputFormat();
    case 'flac':
      return new FlacOutputFormat();
    case 'mp3':
      return new Mp3OutputFormat();
    case 'm4a':
      return new Mp4OutputFormat({ fastStart: 'in-memory' });
    case 'opus':
      return new OggOutputFormat();
  }
}

/** Feed planar float audio to an encoder source in ~1 s blocks. */
export async function addPlanarAudio(
  source: AudioSampleSource,
  channels: Float32Array[],
  sampleRate: number,
  onProgress?: (fraction: number) => void,
): Promise<void> {
  const total = channels[0]?.length ?? 0;
  const block = sampleRate;
  const count = channels.length;
  for (let pos = 0; pos < total; pos += block) {
    const frames = Math.min(block, total - pos);
    const data = new Float32Array(frames * count);
    for (let c = 0; c < count; c++) data.set(channels[c]!.subarray(pos, pos + frames), c * frames);
    const sample = new AudioSample({ data, format: 'f32-planar', numberOfChannels: count, sampleRate, timestamp: pos / sampleRate });
    await source.add(sample);
    sample.close();
    onProgress?.((pos + frames) / total);
  }
}
