import type { ReactNode } from 'react';
import { LogoIcon } from './icons';

export const REPO_URL = 'https://github.com/nopparuj-an/clear-speech-enhancement-web';

/** SPEC §1: every mention of the maker says, in the same sentence, they are not affiliated. */
export function Credit() {
  return (
    <>
      Enhancement uses the <a href="https://desertant.com/models/clear/">Clear model by Desert Ant Labs</a>, who are not
      affiliated with this app; the model sends them anonymous usage counts (no audio).
    </>
  );
}

export function Brand({ className }: { className?: string }) {
  return (
    <div className={`brand ${className ?? ''}`}>
      <LogoIcon />
      <span>Speech Enhancement</span>
    </div>
  );
}

export function Header({ children }: { children?: ReactNode }) {
  return <header className="header">{children ?? <Brand />}</header>;
}

export function Footer({ privacy = false, className }: { privacy?: boolean; className?: string }) {
  return (
    <footer className={`footer ${className ?? ''}`}>
      <span>
        {privacy && 'Your audio is processed in this browser and never uploaded. '}
        <Credit />
      </span>
      <a href={REPO_URL}>Source on GitHub</a>
    </footer>
  );
}
