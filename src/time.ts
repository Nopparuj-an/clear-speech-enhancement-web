/** `754.5` → `12:34.50`; `5654` → `1:34:14.00`. `decimals` 0 drops the fraction. */
export function formatTime(seconds: number, decimals = 2): string {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const factor = 10 ** decimals;
  const total = Math.floor(safe * factor + 1e-6) / factor;
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total - h * 3600 - m * 60;
  const sec = s.toFixed(decimals).padStart(decimals ? decimals + 3 : 2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

/** `5652` → `1 h 34 min`; `95` → `1 min 35 s`. */
export function formatDurationWords(seconds: number): string {
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h} h ${m} min`;
  if (m > 0) return `${m} min ${s % 60} s`;
  return `${s} s`;
}
