import { useEffect, useRef, type ReactNode } from 'react';
import { applyChannelMode, startOver } from '../session';
import { set, useStore } from '../store';
import { CloseIcon } from './icons';

function useEscape(onClose: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
}

export function Dialog({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  useEscape(onClose);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('button')?.focus();
  }, []);
  return (
    <div className="backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title">
        <h2 id="dialog-title">{title}</h2>
        {children}
      </div>
    </div>
  );
}

export function Sheet({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  useEscape(onClose);
  return (
    <div className="backdrop sheet-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <section className="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
        <span className="grabber" />
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <h2 id="sheet-title" style={{ margin: 0, flex: 1, fontSize: 20, fontWeight: 600 }}>
            {title}
          </h2>
          <button type="button" className="btn" style={{ border: 0, background: 'transparent', width: 44, padding: 0 }} aria-label="Close" onClick={onClose}>
            <CloseIcon size={20} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}

export function ConfirmDialogs() {
  const confirm = useStore((s) => s.confirm);
  const pending = useStore((s) => s.pendingChannelMode);
  const close = () => set({ confirm: null, pendingChannelMode: null });
  if (confirm === 'close') {
    return (
      <Dialog title="Close this file and start over?" onClose={close}>
        <p>The enhanced audio and your trim are discarded. Anything you already exported is kept.</p>
        <div className="actions">
          <button type="button" className="btn" onClick={close}>
            Keep working
          </button>
          <button type="button" className="btn btn-dark" onClick={startOver}>
            Close and choose a file
          </button>
        </div>
      </Dialog>
    );
  }
  if (confirm === 'channels') {
    return (
      <Dialog title={pending === 'preserve' ? 'Keep stereo?' : 'Switch to mono?'} onClose={close}>
        <p>
          This runs the model again on the whole file.
          {pending === 'preserve' && ' Stereo runs it once per channel, so it takes about twice as long.'}
        </p>
        <div className="actions">
          <button type="button" className="btn" onClick={close}>
            Cancel
          </button>
          <button type="button" className="btn btn-dark" onClick={applyChannelMode}>
            Run again
          </button>
        </div>
      </Dialog>
    );
  }
  return null;
}
