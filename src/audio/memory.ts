// Long-file warning (SPEC §6.2). K is a placeholder until spike S3 measures it.
export const COPIES_K = 5;
const GB = 1024 ** 3;

/** Rough peak memory for processing `durationSec` of audio at 48 kHz float32. */
export function estimatePeakBytes(durationSec: number, channels: number, k = COPIES_K): number {
  return durationSec * 48_000 * 4 * Math.max(1, channels) * k;
}

export interface DeviceHints {
  mobile: boolean;
  /** `navigator.deviceMemory` in GB, when the browser exposes it. */
  deviceMemoryGB?: number;
}

export function shouldWarn(bytes: number, device: DeviceHints): boolean {
  if (device.mobile) return bytes > 1 * GB;
  const limit = device.deviceMemoryGB ? Math.min(2 * GB, device.deviceMemoryGB * GB * 0.5) : 2 * GB;
  return bytes > limit;
}

export function formatGB(bytes: number): string {
  const gb = bytes / GB;
  return gb < 1 ? `${Math.max(0.1, Math.round(gb * 10) / 10)} GB` : `${Math.round(gb * 10) / 10} GB`;
}

export function detectDevice(): DeviceHints {
  const nav = navigator as Navigator & { deviceMemory?: number; userAgentData?: { mobile?: boolean } };
  const mobile = nav.userAgentData?.mobile ?? /Android|iPhone|iPad|iPod|Mobile/i.test(nav.userAgent);
  return { mobile, deviceMemoryGB: nav.deviceMemory };
}
