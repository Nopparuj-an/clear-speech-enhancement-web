import { AUDIO_FORMAT_ORDER, AUDIO_FORMATS, defaultAudioFormat, lossyBitrate, videoAudioCodec } from '../media/formats';
import { exportFileName, exportNow, setExportFormat, setExportTab } from '../session';
import { useStore } from '../store';
import { formatTime } from '../time';
import { DownloadIcon } from './icons';

function estimateMB(seconds: number, channels: number, bitsPerSecond: number | null, sampleRate: number): string {
  const bits = bitsPerSecond ?? sampleRate * 16 * channels;
  const mb = (seconds * bits) / 8 / 1_000_000;
  return mb < 1 ? '< 1 MB' : `≈ ${Math.round(mb)} MB`;
}

const CONTAINER_LABEL = { mp4: 'MP4', mov: 'MOV', webm: 'WebM', mkv: 'MKV' } as const;

/** Export controls; `variant` picks chips (desktop panel) or radio rows (mobile sheet). */
export function ExportControls({ variant }: { variant: 'panel' | 'sheet' }) {
  const info = useStore((s) => s.info);
  const tab = useStore((s) => s.exportTab);
  const format = useStore((s) => s.exportFormat);
  const reason = useStore((s) => s.formatReason);
  const supported = useStore((s) => s.supportedFormats);
  const trim = useStore((s) => s.trim);
  const duration = useStore((s) => s.duration);
  const snapped = useStore((s) => s.snappedVideoRange);
  const channelMode = useStore((s) => s.channelMode);
  const rate = useStore((s) => s.rate);
  const exporting = useStore((s) => s.exporting);
  const error = useStore((s) => s.exportError);
  if (!info) return null;

  const sourceFormat = defaultAudioFormat(info.audio.codec).value;
  const channels = channelMode === 'mono' ? 1 : info.audio.channels;
  const outRate = rate === 'source' ? info.audio.sampleRate : 48_000;
  const kept = trim.end - trim.start;
  const trimmed = trim.start > 0.01 || trim.end < duration - 0.01;
  const videoCodec = info.videoContainer ? videoAudioCodec(info.videoContainer, info.audio.codec) : null;
  const videoBitrate = videoCodec && videoCodec.value !== 'flac' && videoCodec.value !== 'pcm' ? lossyBitrate(videoCodec.value, info.audio.bitrate) : null;
  const snapDiffers = snapped && (Math.abs(snapped.start - trim.start) > 0.01 || Math.abs(snapped.end - trim.end) > 0.01);

  return (
    <>
      {info.videoContainer && (
        <div className="tabs" role="group" aria-label="Export type">
          <button type="button" className="tab" aria-pressed={tab === 'audio'} onClick={() => setExportTab('audio')}>
            Audio only
          </button>
          <button type="button" className="tab" aria-pressed={tab === 'video'} onClick={() => setExportTab('video')}>
            Video
          </button>
        </div>
      )}

      {tab === 'audio' || !info.videoContainer ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: variant === 'sheet' ? 8 : 10 }}>
          <div className={variant === 'panel' ? 'chips' : ''} role="radiogroup" aria-label="Audio format" style={variant === 'sheet' ? { display: 'flex', flexDirection: 'column', gap: 8 } : undefined}>
            {AUDIO_FORMAT_ORDER.map((id) => {
              const f = AUDIO_FORMATS[id];
              const disabled = supported ? !supported.has(id) : false;
              const isSource = id === sourceFormat;
              const bitrate = f.lossless ? null : lossyBitrate(f.codec, info.audio.bitrate);
              if (variant === 'panel') {
                return (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    className="chip"
                    aria-checked={format === id}
                    disabled={disabled}
                    title={disabled ? 'Not supported in this browser' : undefined}
                    onClick={() => setExportFormat(id)}
                  >
                    {f.label}
                    {isSource && <span className="tag">source</span>}
                  </button>
                );
              }
              return (
                <button key={id} type="button" role="radio" className="format-row" aria-checked={format === id} disabled={disabled} onClick={() => setExportFormat(id)}>
                  <span className="dot" />
                  <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontWeight: 600, fontSize: 15 }}>
                      {f.label}
                      {isSource && <span className="badge">same as source</span>}
                    </span>
                    <span style={{ fontSize: 12 }} className="muted">
                      {disabled ? 'Not supported in this browser' : `${f.note}${bitrate ? ` · ${bitrate / 1000} kbps` : ''}`}
                    </span>
                  </span>
                  <span className="mono muted" style={{ fontSize: 12 }}>
                    {estimateMB(kept, channels, f.id === 'flac' ? outRate * 16 * channels * 0.55 : bitrate, outRate)}
                  </span>
                </button>
              );
            })}
          </div>
          {reason && <p className="note">{reason}</p>}
          {variant === 'panel' && (
            <p className="note">
              {AUDIO_FORMATS[format].note}
              {!AUDIO_FORMATS[format].lossless && ` ${lossyBitrate(AUDIO_FORMATS[format].codec, info.audio.bitrate) / 1000} kbps.`} Defaults to the same format as your
              file.
            </p>
          )}
          <p className="note">
            {trimmed ? `Trimmed to ${formatTime(trim.start)} – ${formatTime(trim.end)}, exact to the sample.` : 'The whole file is exported.'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="kv">
            <span>Container</span>
            <span>{CONTAINER_LABEL[info.videoContainer]} (same as source)</span>
          </div>
          <div className="kv">
            <span>Video</span>
            <span>copied, not re-encoded</span>
          </div>
          <div className="kv">
            <span>Audio</span>
            <span>
              {videoCodec!.value.toUpperCase()}
              {videoBitrate ? ` ${videoBitrate / 1000} kbps` : ''}
              {videoCodec!.value === info.audio.codec ? ' (same as source)' : ''}
            </span>
          </div>
          {videoCodec?.reason && <p className="note">{videoCodec.reason}</p>}
          {trimmed && snapped && snapDiffers && (
            <div className="warn">
              Video can only be cut on keyframes, so your trim widens to{' '}
              <strong className="mono">
                {formatTime(snapped.start)} – {formatTime(snapped.end)}
              </strong>
              . Audio follows the same range.
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      <button type="button" className="btn-primary" onClick={() => void exportNow()} disabled={!!exporting}>
        <DownloadIcon />
        {exporting ? `Exporting… ${Math.round(exporting.fraction * 100)}%` : variant === 'sheet' ? `Save ${exportFileName().split('.').pop()!.toUpperCase()}` : `Export ${exportFileName()}`}
      </button>
      {variant === 'sheet' && (
        <span className="mono muted" style={{ fontSize: 12, textAlign: 'center' }}>
          {exportFileName()}
        </span>
      )}
    </>
  );
}
