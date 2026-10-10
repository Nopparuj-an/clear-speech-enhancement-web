import {
  AudioSampleSource,
  BufferTarget,
  EncodedPacketSink,
  EncodedVideoPacketSource,
  MkvOutputFormat,
  MovOutputFormat,
  Mp4OutputFormat,
  Output,
  WebMOutputFormat,
  type EncodedPacket,
  type OutputFormat,
} from 'mediabunny';
import { addPlanarAudio, ensureEncoder, mediabunnyCodec } from './encode';
import { lossyBitrate, videoAudioCodec, type VideoContainer } from './formats';
import { snapToKeyframes, type TimeRange } from './keyframes';
import { openInput, type MediaInfo } from './source';
import type { RenderedAudio } from './exportAudio';

function videoOutputFormat(container: VideoContainer): OutputFormat {
  switch (container) {
    case 'mp4':
      return new Mp4OutputFormat({ fastStart: 'in-memory' });
    case 'mov':
      return new MovOutputFormat({ fastStart: 'in-memory' });
    case 'webm':
      return new WebMOutputFormat();
    case 'mkv':
      return new MkvOutputFormat();
  }
}

/** Packets bounding a keyframe-snapped range, in source time. */
async function snapPackets(sink: EncodedPacketSink, requested: TimeRange, duration: number) {
  const startKey = (await sink.getKeyPacket(requested.start)) ?? (await sink.getFirstKeyPacket());
  if (!startKey) throw new Error('The video track has no keyframes.');
  const keys = [startKey.timestamp];
  let endKey: EncodedPacket | null = null;
  if (requested.end < duration - 1e-3) {
    let probe = await sink.getKeyPacket(requested.end);
    if (probe && probe.timestamp < requested.end - 1e-6) probe = await sink.getNextKeyPacket(probe);
    if (probe && probe.timestamp > startKey.timestamp) {
      endKey = probe;
      keys.push(probe.timestamp);
    }
  }
  return { startKey, endKey, range: snapToKeyframes(keys, requested, duration) };
}

/** The range a video export will actually cover (shown in the UI before export). */
export async function snapVideoRange(info: MediaInfo, requested: TimeRange): Promise<TimeRange> {
  const input = openInput(info.file);
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) return requested;
    return (await snapPackets(new EncodedPacketSink(track), requested, info.duration)).range;
  } finally {
    input.dispose();
  }
}

export interface VideoExportOptions {
  /** Requested range in source time (seconds). */
  range: TimeRange;
  /** Renders processed audio for a source-time range; called once with the snapped range. */
  renderAudio: (range: TimeRange) => Promise<RenderedAudio>;
  onProgress?: (fraction: number) => void;
}

export interface VideoExportResult {
  blob: Blob;
  range: TimeRange;
}

/** Copy the video packets untouched and replace the audio (ARCHITECTURE §6.2). */
export async function exportVideo(info: MediaInfo, options: VideoExportOptions): Promise<VideoExportResult> {
  const container = info.videoContainer;
  if (!container) throw new Error('This file has no video to export.');
  const input = openInput(info.file);
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track || !track.codec) throw new Error("This file's video track can't be copied.");
    const sink = new EncodedPacketSink(track);
    const { startKey, endKey, range } = await snapPackets(sink, options.range, info.duration);
    const audio = await options.renderAudio(range);

    const codec = videoAudioCodec(container, info.audio.codec).value;
    const bitrate = codec === 'pcm' || codec === 'flac' ? undefined : lossyBitrate(codec, info.audio.bitrate);
    const target = { numberOfChannels: audio.channels.length, sampleRate: audio.sampleRate, bitrate };
    if (!(await ensureEncoder(codec, target))) throw new Error(`${codec.toUpperCase()} audio can't be encoded in this browser.`);

    const output = new Output({ format: videoOutputFormat(container), target: new BufferTarget() });
    const videoSource = new EncodedVideoPacketSource(track.codec);
    output.addVideoTrack(videoSource, { rotation: track.rotation });
    const audioSource = new AudioSampleSource({ codec: mediabunnyCodec(codec), bitrate });
    output.addAudioTrack(audioSource);
    await output.start();

    const decoderConfig = (await track.getDecoderConfig()) ?? undefined;
    const span = Math.max(1e-6, range.end - range.start);
    let videoDone = 0;
    let audioDone = 0;
    const report = () => options.onProgress?.(Math.min(1, (videoDone + audioDone) / 2));

    // Feed both tracks concurrently so the muxer can interleave them.
    const feedVideo = async () => {
      let first = true;
      for await (const packet of sink.packets(startKey, endKey ?? undefined)) {
        await videoSource.add(packet.clone({ timestamp: packet.timestamp - range.start }), first ? { decoderConfig } : undefined);
        first = false;
        videoDone = (packet.timestamp - range.start) / span;
        report();
      }
      videoSource.close();
    };
    const feedAudio = async () => {
      await addPlanarAudio(audioSource, audio.channels, audio.sampleRate, (f) => {
        audioDone = f;
        report();
      });
      audioSource.close();
    };
    await Promise.all([feedVideo(), feedAudio()]);
    await output.finalize();
    return { blob: new Blob([output.target.buffer!], { type: await output.getMimeType() }), range };
  } finally {
    input.dispose();
  }
}
