import { AudioSampleSource, BufferTarget, Output } from 'mediabunny';
import { addPlanarAudio, audioOutputFormat, ensureEncoder, mediabunnyCodec } from './encode';
import { AUDIO_FORMATS, lossyBitrate, type AudioFormatId } from './formats';

export interface RenderedAudio {
  channels: Float32Array[];
  sampleRate: number;
}

export interface AudioExportOptions {
  format: AudioFormatId;
  /** Source bitrate, for "same as source" lossy bitrates. */
  sourceBitrate: number | null;
  onProgress?: (fraction: number) => void;
}

export async function encodeAudioFile(audio: RenderedAudio, options: AudioExportOptions): Promise<Blob> {
  const info = AUDIO_FORMATS[options.format];
  const bitrate = info.lossless ? undefined : lossyBitrate(info.codec, options.sourceBitrate);
  const target = { numberOfChannels: audio.channels.length, sampleRate: audio.sampleRate, bitrate };
  if (!(await ensureEncoder(info.codec, target))) {
    throw new Error(`${info.label} can't be encoded in this browser.`);
  }
  const output = new Output({ format: audioOutputFormat(options.format), target: new BufferTarget() });
  const source = new AudioSampleSource({ codec: mediabunnyCodec(info.codec), bitrate });
  output.addAudioTrack(source);
  await output.start();
  await addPlanarAudio(source, audio.channels, audio.sampleRate, options.onProgress);
  await output.finalize();
  return new Blob([output.target.buffer!], { type: await output.getMimeType() });
}
