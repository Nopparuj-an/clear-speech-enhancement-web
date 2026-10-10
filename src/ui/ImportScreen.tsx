import { useState, type DragEvent } from 'react';
import { openFile } from '../session';
import { useStore } from '../store';
import { Footer, Header } from './Chrome';
import { UploadIcon } from './icons';

export function ImportScreen() {
  const error = useStore((s) => s.importError);
  const [over, setOver] = useState(false);

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    const file = e.dataTransfer.files[0];
    if (file) void openFile(file);
  };

  return (
    <>
      <Header />
      <main className="page import">
        <div className="hero">
          <h1>Make speech sound studio-clean</h1>
          <p>Removes background noise and room echo from voice recordings, then evens out the loudness. Free, and everything runs on your device.</p>
        </div>

        <label
          htmlFor="file"
          className={`drop ${over ? 'over' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={onDrop}
        >
          <span style={{ color: 'var(--accent)' }}>
            <UploadIcon />
          </span>
          <span className="title">Drop an audio or video file here</span>
          <span className="or muted">or</span>
          <span className="btn btn-dark" style={{ minHeight: 52, fontSize: 16, padding: '0 22px' }}>
            <span className="desktop-only">Choose a file</span>
            <span className="mobile-only">Choose audio or video</span>
          </span>
          <span className="formats">MP3 · WAV · M4A · FLAC · OGG · MP4 · MOV · WebM · MKV</span>
          <input
            id="file"
            type="file"
            accept="audio/*,video/*,.mkv,.opus,.flac"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) void openFile(file);
            }}
          />
        </label>
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}

        <div className="facts">
          <div>
            <strong>Private</strong>
            <span>Your file is processed in this browser tab and is never uploaded.</span>
          </div>
          <div>
            <strong>Keeps your video</strong>
            <span>Video is copied untouched. Only the audio track is replaced.</span>
          </div>
          <div>
            <strong>Works best on speech</strong>
            <span>Tuned for English voice. Music and overlapping talkers clean up less well.</span>
          </div>
        </div>
        <p className="note">The first time you use it, the cleanup model downloads once (several tens of MB) and is cached for next time.</p>
      </main>
      <Footer />
    </>
  );
}
