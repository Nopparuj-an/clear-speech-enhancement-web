import { useStore } from '../store';
import { formatTime } from '../time';
import { AudioIcon, VideoIcon } from './icons';

const CODEC_NAMES: Record<string, string> = { avc: 'H.264', hevc: 'H.265', vp8: 'VP8', vp9: 'VP9', av1: 'AV1' };

function codecLabel(codec: string | null | undefined): string {
  if (!codec) return '?';
  if (CODEC_NAMES[codec]) return CODEC_NAMES[codec]!;
  if (codec.startsWith('pcm')) return 'PCM';
  return codec.toUpperCase();
}

export function FileMeta() {
  const info = useStore((s) => s.info);
  if (!info) return null;
  const channels = info.audio.channels === 1 ? 'mono' : info.audio.channels === 2 ? 'stereo' : `${info.audio.channels} ch`;
  const codecs = info.video ? `${codecLabel(info.video.codec)} + ${codecLabel(info.audio.codec)}` : codecLabel(info.audio.codec);
  return (
    <div className="file-meta">
      <span className="muted" style={{ display: 'flex' }}>
        {info.video ? <VideoIcon /> : <AudioIcon />}
      </span>
      <div style={{ minWidth: 0, display: 'flex', flexWrap: 'wrap', columnGap: 10 }}>
        <span className="name">{info.file.name}</span>
        <span className="detail">
          {formatTime(info.duration, 0)} · {codecs} · {Math.round(info.audio.sampleRate / 100) / 10} kHz {channels}
        </span>
      </div>
    </div>
  );
}
