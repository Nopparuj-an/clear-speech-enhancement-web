import { useEffect, useMemo, useRef, useState } from 'react';
import { enhanceSelection, requestChannelMode, setListen, setLoudness, setRate, setStrength, setTrim, togglePlay } from '../session';
import { LOUDNESS, set, useStore, type LoudnessId } from '../store';
import { formatTime } from '../time';
import { Brand, Footer, Header } from './Chrome';
import { Sheet } from './Dialogs';
import { ExportControls } from './ExportPanel';
import { FileMeta } from './FileMeta';
import { ChevronIcon, CloseIcon, DownloadIcon, PauseIcon, PlayIcon, ScissorsIcon } from './icons';
import { Waveform } from './Waveform';

function VideoPreview() {
  const info = useStore((s) => s.info);
  const ref = useRef<HTMLVideoElement>(null);
  const url = useMemo(() => (info?.video ? URL.createObjectURL(info.file) : null), [info]);
  useEffect(() => () => (url ? URL.revokeObjectURL(url) : undefined), [url]);

  useEffect(() => {
    if (!info?.video) return;
    let frame = 0;
    const sync = () => {
      const video = ref.current;
      const { playing, position, timelineOffset } = useStore.getState();
      if (video && video.readyState > 0) {
        const target = info.audioStart + timelineOffset + position;
        if (playing) {
          if (video.paused) void video.play().catch(() => {});
          if (Math.abs(video.currentTime - target) > 0.08) video.currentTime = target;
        } else {
          if (!video.paused) video.pause();
          if (Math.abs(video.currentTime - target) > 0.04) video.currentTime = target;
        }
      }
      frame = requestAnimationFrame(sync);
    };
    frame = requestAnimationFrame(sync);
    return () => cancelAnimationFrame(frame);
  }, [info]);

  if (!url) return null;
  return (
    <div className="video">
      <video ref={ref} src={url} muted playsInline preload="auto" aria-label="Video preview (muted, follows the playhead)" />
    </div>
  );
}

function Stats() {
  const stats = useStore((s) => s.stats);
  if (!stats) return null;
  const fmt = (v: number | null) => (v === null ? '—' : v.toFixed(1).replace('-', '−'));
  return (
    <div className="card stats" style={{ gap: 10, padding: 16 }}>
      <span className="note">Last run</span>
      <div className="stats-grid">
        <div>
          <div className="stat-value">{stats.processingSec.toFixed(1)} s</div>
          <div className="stat-label">processing time</div>
        </div>
        <div>
          <div className="stat-value">{Math.round(stats.realtimeFactor)}×</div>
          <div className="stat-label">faster than real time</div>
        </div>
        <div>
          <div className="stat-value">{fmt(stats.inputLUFS)}</div>
          <div className="stat-label">input LUFS</div>
        </div>
        <div>
          <div className="stat-value">{fmt(stats.outputLUFS)}</div>
          <div className="stat-label">output LUFS</div>
        </div>
      </div>
    </div>
  );
}

function Transport() {
  const playing = useStore((s) => s.playing);
  const position = useStore((s) => s.position);
  const duration = useStore((s) => s.duration);
  const listen = useStore((s) => s.listen);
  const enhanced = useStore((s) => s.enhanced);
  return (
    <div className="transport">
      <button type="button" className="play" aria-label={playing ? 'Pause' : 'Play'} onClick={togglePlay}>
        {playing ? <PauseIcon /> : <PlayIcon />}
      </button>
      <span className="time desktop-only">
        {formatTime(position)} <span className="muted">/ {formatTime(duration)}</span>
      </span>
      <span className="time mobile-only">
        {formatTime(position, 0)} <span className="muted">/ {formatTime(duration, 0)}</span>
      </span>
      {enhanced && (
        <div className="tabs" role="group" aria-label="Listen to">
          <button type="button" className="tab" aria-pressed={listen === 'original'} onClick={() => setListen('original')}>
            Original
          </button>
          <button type="button" className="tab" aria-pressed={listen === 'enhanced'} onClick={() => setListen('enhanced')}>
            Enhanced
          </button>
        </div>
      )}
    </div>
  );
}

function TrimRow() {
  const trim = useStore((s) => s.trim);
  const duration = useStore((s) => s.duration);
  const position = useStore((s) => s.position);
  return (
    <div className="trim-row">
      <span className="muted" style={{ display: 'flex' }}>
        <ScissorsIcon />
      </span>
      <span>Trim</span>
      <span className="time-box">{formatTime(trim.start)}</span>
      <span className="muted">to</span>
      <span className="time-box">{formatTime(trim.end)}</span>
      <span className="muted desktop-only">· {formatTime(trim.end - trim.start)} kept</span>
      <button type="button" className="btn push" onClick={() => setTrim({ start: Math.min(position, trim.end - 0.05), end: trim.end })}>
        Set start to playhead
      </button>
      <button type="button" className="btn desktop-only" onClick={() => setTrim({ start: trim.start, end: Math.max(position, trim.start + 0.05) })}>
        Set end to playhead
      </button>
      <button type="button" className="btn desktop-only" onClick={() => setTrim({ start: 0, end: duration })}>
        Reset
      </button>
    </div>
  );
}

function StrengthControl() {
  const strength = useStore((s) => s.strength);
  const percent = Math.round(strength * 100);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div className="label-row">
        <label htmlFor="strength" className="card-title">
          Enhancement strength
        </label>
        <span className="mono" style={{ fontWeight: 500 }}>
          {percent}%
        </span>
      </div>
      <input
        id="strength"
        className="range"
        type="range"
        min={0}
        max={100}
        step={1}
        value={percent}
        onChange={(e) => setStrength(Number(e.target.value) / 100, false)}
        onPointerUp={(e) => setStrength(Number((e.target as HTMLInputElement).value) / 100, true)}
        onKeyUp={(e) => setStrength(Number((e.target as HTMLInputElement).value) / 100, true)}
      />
      <div className="label-row note" style={{ fontSize: 12 }}>
        <span>Original</span>
        <span>Fully enhanced</span>
      </div>
    </div>
  );
}

function OptionControls({ compact }: { compact: boolean }) {
  const info = useStore((s) => s.info);
  const loudness = useStore((s) => s.loudness);
  const channelMode = useStore((s) => s.channelMode);
  const rate = useStore((s) => s.rate);
  const stereoSource = (info?.audio.channels ?? 1) > 1;
  const showRate = info && info.audio.sampleRate !== 48_000;
  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span className={compact ? '' : 'card-title'} style={compact ? { fontSize: 13, fontWeight: 500 } : undefined}>
          Loudness
        </span>
        <div className="seg-group" role="group" aria-label="Loudness target">
          {(Object.keys(LOUDNESS) as LoudnessId[]).map((id) => (
            <button key={id} type="button" className="seg" aria-pressed={loudness === id} onClick={() => setLoudness(id)}>
              {compact && id === 'stream' ? 'Stream' : compact && id === 'broadcast' ? 'Broadc.' : LOUDNESS[id].label}
              <small>{LOUDNESS[id].short}</small>
            </button>
          ))}
        </div>
      </div>
      {(stereoSource || showRate) && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
          {stereoSource && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span className={compact ? '' : 'card-title'} style={compact ? { fontSize: 13, fontWeight: 500 } : undefined}>
                Channels
              </span>
              <div className="seg-group" role="group" aria-label="Channels">
                <button type="button" className="seg" aria-pressed={channelMode === 'mono'} onClick={() => requestChannelMode('mono')}>
                  Mono
                </button>
                <button type="button" className="seg" aria-pressed={channelMode === 'preserve'} onClick={() => requestChannelMode('preserve')}>
                  Stereo
                </button>
              </div>
            </div>
          )}
          {showRate && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span className={compact ? '' : 'card-title'} style={compact ? { fontSize: 13, fontWeight: 500 } : undefined}>
                Sample rate
              </span>
              <div className="seg-group" role="group" aria-label="Sample rate">
                <button type="button" className="seg" aria-pressed={rate === '48'} onClick={() => setRate('48')}>
                  48 kHz
                </button>
                <button type="button" className="seg" aria-pressed={rate === 'source'} onClick={() => setRate('source')}>
                  Source
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      {channelMode === 'preserve' && <p className="note">Keeping stereo runs the model once per channel, so processing takes about twice as long.</p>}
    </>
  );
}

function MobileOptions() {
  const [open, setOpen] = useState(false);
  const loudness = useStore((s) => s.loudness);
  const channelMode = useStore((s) => s.channelMode);
  const rate = useStore((s) => s.rate);
  const summary = [
    loudness === 'off' ? 'Loudness off' : `${LOUDNESS[loudness].label} ${LOUDNESS[loudness].short}`,
    channelMode === 'mono' ? 'Mono' : 'Stereo',
    rate === '48' ? '48 kHz' : 'Source rate',
  ].join(' · ');
  return (
    <div className="card mobile-only" style={{ padding: 0, gap: 0 }}>
      <button type="button" className="options-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span style={{ fontWeight: 600, fontSize: 15 }}>Options</span>
        <span className="muted" style={{ flex: 1, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {summary}
        </span>
        <ChevronIcon open={open} />
      </button>
      {open && (
        <div style={{ padding: '0 14px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <OptionControls compact />
        </div>
      )}
    </div>
  );
}

function EnhanceSelectionCard() {
  const trim = useStore((s) => s.trim);
  return (
    <div className="card">
      <span className="card-title">Choose the part to clean</span>
      <p className="note">Drag the handles to the part you need, then clean just that part. Shorter selections use less memory.</p>
      <button type="button" className="btn-primary" onClick={() => void enhanceSelection()}>
        Clean {formatTime(trim.end - trim.start, 0)} selected
      </button>
    </div>
  );
}

export function EditorScreen() {
  const enhanced = useStore((s) => s.enhanced);
  const [sheet, setSheet] = useState(false);
  return (
    <>
      <Header>
        <Brand className="desktop-only" />
        <FileMeta />
        <button type="button" className="btn" onClick={() => set({ confirm: 'close' })}>
          <CloseIcon />
          <span className="desktop-only">Close file &amp; start over</span>
          <span className="mobile-only">Start over</span>
        </button>
      </Header>

      <main className="page editor">
        <section className="editor-main" aria-label="Preview">
          <div className="preview-row">
            <VideoPreview />
            <Stats />
          </div>
          <div className="card" style={{ gap: 10, padding: 16 }}>
            <Waveform />
            <Transport />
            <TrimRow />
          </div>
        </section>

        <aside className="editor-side" aria-label="Settings and export">
          {enhanced ? (
            <>
              <div className="card">
                <StrengthControl />
                <div className="desktop-only" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                  <OptionControls compact={false} />
                </div>
              </div>
              <MobileOptions />
              <div className="card side-export">
                <span className="card-title">Export</span>
                <ExportControls variant="panel" />
              </div>
            </>
          ) : (
            <EnhanceSelectionCard />
          )}
        </aside>
      </main>

      {enhanced && (
        <div className="sticky-export">
          <button type="button" className="btn-primary" onClick={() => setSheet(true)}>
            <DownloadIcon />
            Export
          </button>
        </div>
      )}
      {sheet && (
        <Sheet title="Export" onClose={() => setSheet(false)}>
          <ExportControls variant="sheet" />
        </Sheet>
      )}
      <Footer privacy className="editor-footer" />
    </>
  );
}
