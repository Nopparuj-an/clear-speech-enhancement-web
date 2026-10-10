import { useEffect, useMemo, useRef, type KeyboardEvent, type PointerEvent } from 'react';
import { lerpPeaks, type Peaks } from '../audio/peaks';
import { seek, setTrim } from '../session';
import { useStore } from '../store';
import { formatTime } from '../time';

function useLaneCanvas(peaks: Peaks | null, color: string, scale: number) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const width = Math.max(1, Math.round(canvas.clientWidth * dpr));
      const height = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
      const ctx = canvas.getContext('2d')!;
      ctx.clearRect(0, 0, width, height);
      if (!peaks) return;
      ctx.fillStyle = color;
      const n = peaks.max.length;
      const bar = Math.max(1, Math.round(2 * dpr));
      const gap = Math.max(1, Math.round(dpr));
      const step = bar + gap;
      const mid = height / 2;
      const amp = (height / 2 - dpr) / scale;
      for (let x = 0; x < width; x += step) {
        const from = Math.floor((x / width) * n);
        const to = Math.max(from + 1, Math.floor(((x + step) / width) * n));
        let hi = 0;
        for (let i = from; i < to && i < n; i++) hi = Math.max(hi, Math.abs(peaks.max[i]!), Math.abs(peaks.min[i]!));
        const h = Math.max(dpr, hi * amp);
        ctx.fillRect(x, mid - h, bar, h * 2);
      }
    };
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [peaks, color, scale]);
  return ref;
}

function peakScale(peaks: Peaks | null): number {
  if (!peaks) return 1;
  let m = 0.05;
  for (let i = 0; i < peaks.max.length; i++) m = Math.max(m, Math.abs(peaks.max[i]!), Math.abs(peaks.min[i]!));
  return m;
}

function TrimHandle({ which, value, min, max, duration }: { which: 'start' | 'end'; value: number; min: number; max: number; duration: number }) {
  const onKey = (e: KeyboardEvent) => {
    const stepSize = e.shiftKey ? 1 : 0.1;
    const delta = e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -stepSize : e.key === 'ArrowRight' || e.key === 'ArrowUp' ? stepSize : 0;
    if (!delta) return;
    e.preventDefault();
    e.stopPropagation();
    const trim = useStore.getState().trim;
    setTrim(which === 'start' ? { ...trim, start: trim.start + delta } : { ...trim, end: trim.end + delta });
  };
  return (
    <button
      type="button"
      className="handle"
      data-handle={which}
      role="slider"
      aria-label={which === 'start' ? 'Trim start' : 'Trim end'}
      aria-valuemin={Math.round(min * 100) / 100}
      aria-valuemax={Math.round(max * 100) / 100}
      aria-valuenow={Math.round(value * 100) / 100}
      aria-valuetext={formatTime(value)}
      style={{ left: `${(value / duration) * 100}%` }}
      onKeyDown={onKey}
    >
      <span />
    </button>
  );
}

export function Waveform() {
  const enhanced = useStore((s) => s.enhanced);
  const duration = useStore((s) => s.duration) || 1;
  const trim = useStore((s) => s.trim);
  const position = useStore((s) => s.position);
  const listen = useStore((s) => s.listen);
  const strength = useStore((s) => s.strength);
  const peaksDry = useStore((s) => s.peaksDry);
  const peaksWet = useStore((s) => s.peaksWet);
  const peaksMix = useStore((s) => s.peaksMix);
  const peaksMixStrength = useStore((s) => s.peaksMixStrength);

  const mix = useMemo(() => {
    if (peaksMix && Math.abs(peaksMixStrength - strength) < 1e-3) return peaksMix;
    return peaksDry && peaksWet ? lerpPeaks(peaksDry, peaksWet, strength) : null;
  }, [peaksDry, peaksWet, peaksMix, peaksMixStrength, strength]);
  const scale = useMemo(() => peakScale(peaksDry), [peaksDry]);
  const dryRef = useLaneCanvas(peaksDry, '#9C9A93', scale);
  const mixRef = useLaneCanvas(mix, '#1F4FD1', scale);

  const area = useRef<HTMLDivElement>(null);
  const drag = useRef<'seek' | 'start' | 'end' | null>(null);

  const timeAt = (clientX: number) => {
    const rect = area.current!.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) * duration;
  };

  const onPointerDown = (e: PointerEvent) => {
    const target = (e.target as HTMLElement).closest<HTMLElement>('[data-handle]');
    drag.current = (target?.dataset.handle as 'start' | 'end' | undefined) ?? 'seek';
    area.current!.setPointerCapture(e.pointerId);
    if (drag.current === 'seek') seek(timeAt(e.clientX));
  };
  const onPointerMove = (e: PointerEvent) => {
    if (!drag.current) return;
    const t = timeAt(e.clientX);
    const current = useStore.getState().trim;
    if (drag.current === 'seek') seek(t);
    else if (drag.current === 'start') setTrim({ start: Math.min(t, current.end - 0.05), end: current.end });
    else setTrim({ start: current.start, end: Math.max(t, current.start + 0.05) });
  };
  const onPointerUp = () => {
    drag.current = null;
  };

  const pct = (t: number) => `${(t / duration) * 100}%`;
  const ticks = Array.from({ length: 7 }, (_, i) => (duration * i) / 6);

  return (
    <div className="wave">
      <div className="lane-label">
        <span>Original</span>
        {listen === 'original' && enhanced && <span className="listening">Listening</span>}
      </div>
      <div
        ref={area}
        style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 6, cursor: 'pointer' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        aria-label={`Waveform, ${formatTime(duration, 0)} long, trimmed to ${formatTime(trim.start)} – ${formatTime(trim.end)}. Click to seek.`}
        role="group"
      >
        <div className={`lane ${enhanced && listen !== 'original' ? 'dim' : ''}`}>
          <canvas ref={dryRef} />
        </div>
        {enhanced && (
          <>
            <div className="lane-label" style={{ marginTop: 4, padding: '0 12px' }}>
              <span>
                Enhanced <span className="mono muted">· {Math.round(strength * 100)}%</span>
              </span>
              {listen === 'enhanced' && <span className="listening">Listening</span>}
            </div>
            <div className={`lane ${listen === 'original' ? 'dim' : ''}`}>
              <canvas ref={mixRef} />
            </div>
          </>
        )}
        <div className="overlay" style={{ top: 0 }}>
          <div className="shade" style={{ left: 0, width: pct(trim.start) }} />
          <div className="shade" style={{ right: 0, width: `${(1 - trim.end / duration) * 100}%` }} />
          <div className="playhead" style={{ left: pct(position) }} />
          <TrimHandle which="start" value={trim.start} min={0} max={trim.end} duration={duration} />
          <TrimHandle which="end" value={trim.end} min={trim.start} max={duration} duration={duration} />
        </div>
      </div>
      <div className="ruler" aria-hidden="true">
        {ticks.map((t, i) => (
          <span key={i}>{formatTime(t, duration < 60 ? 1 : 0)}</span>
        ))}
      </div>
    </div>
  );
}
