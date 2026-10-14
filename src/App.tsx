import { useEffect } from 'react';
import { seek, setListen, setTrim, tick, togglePlay } from './session';
import { get, useStore } from './store';
import { ConfirmDialogs } from './ui/Dialogs';
import { EditorScreen } from './ui/EditorScreen';
import { ImportScreen } from './ui/ImportScreen';
import { ProcessingScreen } from './ui/ProcessingScreen';

function usePlaybackClock() {
  const playing = useStore((s) => s.playing);
  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    const loop = () => {
      tick();
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [playing]);
}

/** SPEC §7 shortcuts, only in the editor and never while typing or in a dialog. */
function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = get();
      if (s.phase !== 'editor' || s.confirm || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement;
      if (target.closest('input, textarea, select, [role="slider"], [role="dialog"]')) return;
      const step = e.shiftKey ? 5 : 1;
      switch (e.key) {
        case ' ':
          if (target.closest('button')) return;
          e.preventDefault();
          togglePlay();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          seek(s.position - step);
          break;
        case 'ArrowRight':
          e.preventDefault();
          seek(s.position + step);
          break;
        case 'a':
        case 'A':
          if (s.enhanced) setListen(s.listen === 'original' ? 'enhanced' : 'original');
          break;
        case '[':
          setTrim({ start: Math.min(s.position, s.trim.end - 0.05), end: s.trim.end });
          break;
        case ']':
          setTrim({ start: s.trim.start, end: Math.max(s.position, s.trim.start + 0.05) });
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

function useLeaveWarning() {
  const unexported = useStore((s) => s.unexported);
  useEffect(() => {
    if (!unexported) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [unexported]);
}

export function App() {
  const phase = useStore((s) => s.phase);
  usePlaybackClock();
  useShortcuts();
  useLeaveWarning();
  return (
    <>
      {phase === 'import' && <ImportScreen />}
      {phase === 'processing' && <ProcessingScreen />}
      {phase === 'editor' && <EditorScreen />}
      <ConfirmDialogs />
    </>
  );
}
