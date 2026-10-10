// Inline stroke icons (decorative: always aria-hidden; buttons carry the label).
type P = { size?: number };

export const LogoIcon = ({ size = 28 }: P) => (
  <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden="true">
    <rect width="28" height="28" rx="8" fill="#16171A" />
    <path d="M7 14h2M11 10v8M15 7v14M19 11v6M23 14h-2" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

export const CloseIcon = ({ size = 18 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...stroke} strokeWidth={2} aria-hidden="true">
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);
export const UploadIcon = ({ size = 44 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...stroke} strokeWidth={1.6} aria-hidden="true">
    <path d="M12 16V4M7 9l5-5 5 5M4 20h16" />
  </svg>
);
export const DownloadIcon = ({ size = 20 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...stroke} strokeWidth={2} aria-hidden="true">
    <path d="M12 4v12M7 11l5 5 5-5M4 20h16" />
  </svg>
);
export const PlayIcon = ({ size = 20 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M8 5v14l11-7z" />
  </svg>
);
export const PauseIcon = ({ size = 20 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <rect x="6" y="5" width="4" height="14" rx="1" />
    <rect x="14" y="5" width="4" height="14" rx="1" />
  </svg>
);
export const VideoIcon = ({ size = 18 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...stroke} aria-hidden="true">
    <rect x="3" y="5" width="13" height="14" rx="2" />
    <path d="M16 10l5-3v10l-5-3" />
  </svg>
);
export const AudioIcon = ({ size = 18 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...stroke} aria-hidden="true">
    <path d="M9 18V6l10-2v12" />
    <circle cx="6" cy="18" r="3" />
    <circle cx="16" cy="16" r="3" />
  </svg>
);
export const ScissorsIcon = ({ size = 18 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...stroke} aria-hidden="true">
    <circle cx="6" cy="6" r="3" />
    <circle cx="6" cy="18" r="3" />
    <path d="M20 4L8.1 15.9M14.5 14.5L20 20M8.1 8.1L12 12" />
  </svg>
);
export const CheckCircleIcon = ({ size = 24 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#1F4FD1" strokeWidth="2" aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <path d="M8 12l3 3 5-6" />
  </svg>
);
export const ActiveCircleIcon = ({ size = 24 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#16171A" strokeWidth="2" aria-hidden="true">
    <circle cx="12" cy="12" r="9" strokeDasharray="4 3" />
  </svg>
);
export const PendingCircleIcon = ({ size = 24 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#9EA2AB" strokeWidth="2" aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
  </svg>
);
export const WarnIcon = ({ size = 22 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...stroke} style={{ flex: 'none' }} aria-hidden="true">
    <path d="M12 3l10 18H2z" />
    <path d="M12 10v5M12 18h.01" />
  </svg>
);
export const ChevronIcon = ({ open }: { open: boolean }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" {...stroke} strokeWidth={2} aria-hidden="true">
    <path d={open ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6'} />
  </svg>
);
