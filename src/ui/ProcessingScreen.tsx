import { useEffect, useState } from 'react';
import { formatGB } from '../audio/memory';
import { cancelProcessing, continueAnyway, retry, startOver, trimBeforeCleaning } from '../session';
import { useStore, type Step, type StepId } from '../store';
import { formatDurationWords } from '../time';
import { Brand, Header } from './Chrome';
import { FileMeta } from './FileMeta';
import { ActiveCircleIcon, CheckCircleIcon, PendingCircleIcon, WarnIcon } from './icons';

const LABELS: Record<StepId, string> = {
  download: 'Download the cleanup model',
  decode: 'Read the audio track',
  enhance: 'Remove noise and echo',
  waveform: 'Build waveform',
};

function useElapsed(active: boolean) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!active) return;
    const started = Date.now();
    const id = setInterval(() => setSeconds((Date.now() - started) / 1000), 500);
    return () => {
      clearInterval(id);
      setSeconds(0);
    };
  }, [active]);
  return seconds;
}

function detailFor(id: StepId, step: Step, elapsed: number): string | null {
  if (step.status === 'done') {
    if (id === 'download') return step.detail === 'cached' ? 'Done. Cached, so next time it starts instantly.' : 'Done. Cached for next time.';
    if (id === 'enhance' && step.detail) return `Done in ${step.detail}.`;
    return 'Done.';
  }
  if (step.status !== 'active') return null;
  if (id === 'enhance') return `Running on your device · ${Math.floor(elapsed)} s so far`;
  if (id === 'download') return 'Downloads once, then it is cached.';
  return null;
}

function StepRow({ id, step }: { id: StepId; step: Step }) {
  const elapsed = useElapsed(id === 'enhance' && step.status === 'active');
  const detail = detailFor(id, step, elapsed);
  const showBar = step.status === 'active' && id !== 'waveform';
  const percent = step.fraction !== undefined ? Math.round(step.fraction * 100) : null;
  return (
    <div className={`step ${step.status}`}>
      {step.status === 'done' ? <CheckCircleIcon /> : step.status === 'active' ? <ActiveCircleIcon /> : <PendingCircleIcon />}
      <div className="step-body">
        <div className="label-row">
          <span style={{ fontWeight: 500 }}>{LABELS[id]}</span>
          {showBar && percent !== null && <span className="mono">{percent}%</span>}
        </div>
        {showBar && (
          <div
            className={`bar ${percent === null ? 'indeterminate' : ''}`}
            role="progressbar"
            aria-label={LABELS[id]}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent ?? undefined}
          >
            <div style={percent === null ? undefined : { width: `${percent}%` }} />
          </div>
        )}
        {detail && <span className="note">{detail}</span>}
      </div>
    </div>
  );
}

export function ProcessingScreen() {
  const steps = useStore((s) => s.steps);
  const longFile = useStore((s) => s.longFile);
  const error = useStore((s) => s.processingError);
  const duration = useStore((s) => s.duration);

  return (
    <>
      <Header>
        <Brand />
        <FileMeta />
      </Header>
      <main className="page processing">
        {longFile && (
          <div className="warn" role="alert" style={{ display: 'flex', gap: 12, padding: 16, fontSize: 14 }}>
            <WarnIcon />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <span>
                <strong>This file is {formatDurationWords(duration)} long.</strong> Long files need a lot of memory (roughly {formatGB(longFile.bytes)} here)
                and the tab may crash, especially on phones. Trimming to the part you need first is faster.
              </span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <button type="button" className="btn btn-warn" onClick={continueAnyway}>
                  Continue anyway
                </button>
                <button type="button" className="btn" style={{ color: 'var(--warn-ink)' }} onClick={() => void trimBeforeCleaning()}>
                  Trim before cleaning
                </button>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="error" role="alert" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <span>{error.message}</span>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {error.action === 'retry' && (
                <button type="button" className="btn" onClick={retry}>
                  Try again
                </button>
              )}
              {error.action === 'trim' && (
                <button type="button" className="btn" onClick={() => void trimBeforeCleaning()}>
                  Trim first
                </button>
              )}
              <button type="button" className="btn" onClick={startOver}>
                Choose another file
              </button>
            </div>
          </div>
        )}

        {!longFile && (
          <div className="card steps">
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 600 }}>Cleaning your audio</h1>
            {(Object.keys(LABELS) as StepId[]).map((id) => (
              <StepRow key={id} id={id} step={steps[id]} />
            ))}
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="button" className="btn" onClick={cancelProcessing}>
                Cancel
              </button>
            </div>
          </div>
        )}
        {!longFile && <p className="note">Keep this tab open. Processing happens on your device, so speed depends on your computer.</p>}
      </main>
    </>
  );
}
