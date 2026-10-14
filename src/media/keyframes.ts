export interface TimeRange {
  start: number;
  end: number;
}

/**
 * Widen a trim range to keyframe boundaries so video packets can be copied
 * (SPEC §3.3, ARCHITECTURE §6.2): start at the last keyframe at or before the
 * requested start, end at the next keyframe after the requested end (the end
 * of its GOP) or the media end.
 *
 * `keyframes` are presentation timestamps in seconds, ascending.
 */
export function snapToKeyframes(keyframes: number[], requested: TimeRange, duration: number): TimeRange {
  const first = keyframes[0] ?? 0;
  let start = first;
  for (const k of keyframes) {
    if (k <= requested.start + 1e-6) start = k;
    else break;
  }
  let end = duration;
  for (const k of keyframes) {
    if (k >= requested.end - 1e-6 && k > start) {
      end = k;
      break;
    }
  }
  return { start, end: Math.min(end, duration) };
}

/** True when snapping changed the range by more than a millisecond. */
export function rangeChanged(a: TimeRange, b: TimeRange): boolean {
  return Math.abs(a.start - b.start) > 1e-3 || Math.abs(a.end - b.end) > 1e-3;
}
