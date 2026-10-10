# Speech Enhancement — Product Spec

Status: **Draft v1**, approved UI direction. No code yet.
Companion docs: [ARCHITECTURE.md](./ARCHITECTURE.md) · UI mockups in [`ui/`](./ui/)

## 1. Summary

A free, static web app that cleans up speech recordings entirely in the browser.
The user opens an audio or video file, the app removes background noise and room
echo with the **Clear** model, and the user can:

- compare the original and enhanced audio on two waveforms,
- set how much enhancement to apply with a dry/wet slider,
- trim the file,
- export as audio, or as video with the original picture copied untouched.

Nothing is uploaded: decoding, inference and encoding all happen on the device.
It works on desktop and mobile browsers and is hosted on GitHub Pages.

### Positioning and credit

- Product name: **Speech Enhancement**.
- This is an **independent, unofficial** app. It is not made by, endorsed by or
  affiliated with Desert Ant Labs.
- **Rule:** every place the UI mentions Desert Ant Labs or the Clear model says,
  in the same sentence, that they are not affiliated with this app. Canonical
  copy:

  > Enhancement uses the [Clear model by Desert Ant Labs](https://desertant.com/models/clear/),
  > who are not affiliated with this app; the model sends them anonymous usage
  > counts (no audio).

  This also satisfies the Clear license's attribution requirement
  (see ARCHITECTURE §9).

### Goals

1. One-file speech cleanup with no account, install or upload.
2. Instant preview: moving the strength slider never re-runs the model.
3. Video in, video out with **no video re-encode**.
4. Usable one-handed on a phone.

### Non-goals (v1)

Multi-file batch, recording from the microphone, a multi-track editor, effects
other than Clear, cloud processing, user accounts, dark theme, offline/PWA
install (see §10 Roadmap).

## 2. User flow

```
Import ──▶ Processing ──▶ Editor ──▶ Export
  ▲                          │
  └──── Start over (confirm) ┘
```

1. **Import:** the user drops a file or picks one.
2. **Processing:**
   - If the file is long enough to risk memory trouble, show a warning (§6.2).
     The user can continue anyway; it never blocks.
   - Download the model on first use, with progress, then cache it.
   - Decode the audio track, run Clear once, and build the waveforms.
3. **Editor:** play or scrub, A/B between Original and Enhanced, set strength,
   loudness, channels and sample rate, and trim.
4. **Export:** pick audio or video (video only for video sources) and a format,
   then save.
5. **Start over:** close the file after confirming, and return to Import.

## 3. Screens

The mockups are the reference for layout and copy. The tables below are the
contract.

| Screen | Desktop | Mobile |
|---|---|---|
| Import | `ui/Import.dc.html` | `ui/MobileImport.dc.html` |
| Processing | `ui/Processing.dc.html` | same content, stacked |
| Editor | `ui/Main.dc.html` | `ui/MobileEditor.dc.html` |
| Export | panel inside the Editor | `ui/MobileExport.dc.html` (bottom sheet) |

### 3.1 Import

- **Hero:** "Make speech sound studio-clean", plus one line on what it does and
  that it runs on the device.
- **Drop zone** with a "Choose a file" button (on mobile, one large "Choose
  audio or video" button). `accept="audio/*,video/*"`.
- **Supported formats line:** MP3 · WAV · M4A · FLAC · OGG · MP4 · MOV · WebM ·
  MKV.
- **Three short facts:** Private (never uploaded) · Keeps your video (only the
  audio track is replaced) · Works best on speech (tuned for English voice;
  music and overlapping talkers clean up less well).
- **Note:** "The first time you use it, the cleanup model downloads once
  (about N MB) and is cached." N is measured at build time (see ARCHITECTURE
  spike S5).
- **Footer:** the canonical credit and privacy copy, plus a link to the GitHub
  source.
- **Unsupported file:** show an inline error under the drop zone saying which
  format was detected and that it can't be read, and stay on Import.

### 3.2 Processing

The screen is a vertical step list. Each step shows a pending, active or done
icon and a status line:

1. Download the cleanup model, with a percentage. Skipped when cached ("Done.
   Cached, so next time it starts instantly.").
2. Read the audio track.
3. Remove noise and echo, with a progress bar, time left and an "N× faster
   than real time" figure.
4. Build waveform.

There is a **Cancel** button; cancelling returns to Import. A line under the
card says "Keep this tab open…".

If the long-file warning applies (§6.2), it appears **above** the card and
processing waits for the user to choose:

- "Continue anyway"
- "Trim before cleaning": opens the Editor with the original waveform only,
  lets the user set a trim, then processes only that range.

### 3.3 Editor

**Header**
- Logo and the name "Speech Enhancement".
- File name, duration and a codec/sample-rate summary.
- A **"✕ Close file & start over"** button. On mobile this is a labelled
  "✕ Start over" button, never icon-only.
- It always opens a confirmation:

  > **Close this file and start over?** The enhanced audio and your trim are
  > discarded. Anything you already exported is kept.
  > [Keep working] [Close and choose a file]

**Preview area**
- **Video preview:** only for video sources. It is muted and follows the
  playhead.
- **Last run card (desktop):** processing time, × real time, input LUFS and
  output LUFS. Output LUFS shows "—" when loudness is Off.

**Waveforms: two stacked lanes**
- *Original* on top, in neutral grey.
- *Enhanced · NN%* below, in blue.
- The Enhanced lane shows the **current mix** and updates while the slider
  moves.
- The lane that is **not** being heard is dimmed, and the heard one is
  labelled "Listening".
- The **trim region, handles and playhead** span both lanes. The areas outside
  the trim are shaded.
- **Interactions:**
  - Click or tap a lane to seek.
  - Drag a handle to trim. On touch the hit area is at least 24 px wide.
  - A time ruler sits under the lanes.

**Transport**
- Play/Pause.
- The time "m:ss.cc / total".
- A segmented **Listen to: Original | Enhanced** control. It switches instantly
  and keeps the playhead position.

**Trim row (desktop)**
- Start and end times, and the kept duration.
- "Set start to playhead" and "Reset".
- Mobile shows the start and end times under the waveform; precise editing
  is by dragging.

**Settings**

| Control | Values | Default | Notes |
|---|---|---|---|
| Enhancement strength | 0–100 % slider | 100 % | 0 = original, 100 = full model output. Live, with no re-run. (Mockups show 80 % as an example.) |
| Loudness | Off · Podcast −19 · Streaming −14 · Broadcast −23 LUFS | Podcast −19 | Applied at export, with a −1.5 dBTP peak ceiling. |
| Channels | Mono · Stereo | Mono | Stereo runs the model once per channel (~2× time) and shows a note. Changing it **re-runs** the model after a confirm. |
| Sample rate | 48 kHz · Source | 48 kHz | "Source" resamples back to the input rate on export. |

On mobile, Loudness, Channels and Sample rate collapse into one **Options**
row. Its collapsed state shows a summary, e.g. "Podcast −19 · Mono · 48 kHz".

**Export panel (desktop) or sheet (mobile)**
- Tabs: **Audio only** and **Video**. The Video tab exists only for video
  sources, and is the default when it exists.
- **Audio tab:**
  - Format chips on desktop, radio rows with estimated sizes on mobile:
    WAV · FLAC · MP3 · M4A (AAC) · Opus.
  - The format **matching the source** is pre-selected and marked "source" /
    "same as source" (§5).
  - A note on the selected format. Audio trim is exact to the sample.
- **Video tab:**
  - Shows the container (same as source), "Video: copied, not re-encoded", and
    the audio codec and bitrate with "(same as source)" when it matches.
  - When a trim is set, a notice gives the **actual keyframe-snapped range**:
    "Video can only be cut on keyframes, so your trim widens to
    0:30.00 – 11:48.00."
- **Primary button:** "Export ‹name›-enhanced.‹ext›". It shows progress while
  encoding, then the browser saves the file.

### 3.4 Copy and tone

Plain, short sentences. Say "enhance" and "enhanced"; avoid jargon in labels
and keep the numbers (LUFS, kHz) as secondary text.

## 4. Behaviour details

- **Strength mix:**
  - Preview is `out = s·enhanced + (1−s)·original`, computed live in Web
    Audio.
  - Export uses the same formula, then loudness.
  - Strength affects export and preview only; it never triggers inference.
- **What triggers a model re-run:** only changing Channels, or choosing "Trim
  before cleaning".
- **Playback state is kept** across A/B switches, slider moves and setting
  changes.
- **Original length is preserved.** The enhanced track is sample-aligned to
  the original, so A/B switching has no audible jump. ARCHITECTURE spike S1
  verifies this.
- **Mono sources** hide the Channels control.
- **Audio-only sources** hide the video preview and the Video export tab.
- **Leaving the page** with an unexported result triggers the browser's
  `beforeunload` prompt.

## 5. Export defaults: "same as source"

The default output matches the input wherever the browser can encode it.

| Source audio | Default audio export | Note shown when different |
|---|---|---|
| MP3 | MP3 | — |
| AAC (M4A / MP4 / MOV) | M4A (AAC) | — |
| FLAC | FLAC | — |
| WAV / PCM | WAV | — |
| Opus (OGG / WebM) | Opus | — |
| Vorbis (OGG / WebM / MKV) | Opus | "OGG Vorbis can't be written in the browser; saving as Opus." |
| Other lossless (AIFF, ALAC, …) | FLAC | "… saving as FLAC (lossless)." |
| Other lossy (WMA, AC-3, …) | M4A (AAC) | "… saving as M4A." |

**Video export:**
- The container is always the source's (MP4, MOV, WebM or MKV), and video
  packets are copied.
- Audio keeps the source codec when the container accepts it and we can
  encode it.
- Otherwise the nearest codec that container accepts is used: AAC for
  MP4/MOV, Opus for WebM/MKV.

**Bitrate (lossy):** match the source bitrate, with a floor of **128 kbps** and
a ceiling of **320 kbps**. For unknown or variable bitrate, use 192 kbps (AAC,
MP3) or 96 kbps (Opus).

**Encoder availability:** if a format cannot be encoded in this browser even
with the bundled fallback encoders, its chip is disabled with a tooltip ("Not
supported in this browser"). The default then falls back by the same rules.

## 6. Limits, warnings and errors

### 6.1 Supported inputs

These are whatever Mediabunny can demux and the browser can decode:

- Containers: MP4/M4A/MOV, WebM/MKV, MP3, WAV, OGG, FLAC, ADTS AAC.
- Audio codecs: AAC, MP3, Opus, Vorbis, FLAC, PCM.

Files with no audio track show the error "This file has no audio track."

### 6.2 Long files: warn, never block

- **Estimate peak memory:**
  `duration × 48 000 × 4 B × channels × K`, where K ≈ 5 covers the original,
  enhanced, worker and SDK copies, and the export buffer. K is to be measured
  (spike S3).
- **Thresholds:**
  - Warn when the estimate exceeds **1 GB on mobile**.
  - Warn when it exceeds **50 % of `navigator.deviceMemory`, or 2 GB, on
    desktop**.
- **Copy:** "This file is 1 h 34 min long. Long files need a lot of memory
  (roughly X GB here) and the tab may crash, especially on phones. Trimming
  to the part you need first is faster."
- **Actions:** [Continue anyway] [Trim before cleaning].

### 6.3 Errors

Each error has one sentence on what happened and one action:

| Situation | Message (short form) | Action |
|---|---|---|
| Model download failed | "Couldn't download the model. Check your connection." | Retry |
| Out of memory or worker crash | "Your device ran out of memory." | Try trimming first |
| Decode failed | "This file's audio can't be read in this browser." | Choose another file |
| Export failed | "Export failed." | Try another format |

## 7. Accessibility

- Every control is a real `<button>`, `<input>` or `<a>`, with visible focus
  and touch targets of at least 44 px.
- **Keyboard:** Space plays or pauses; ←/→ seek 1 s (Shift = 5 s); `A` toggles
  Original/Enhanced; `[` and `]` set the trim start and end at the playhead.
  These only fire when focus is not in a text field.
- The waveform has an `aria-label` that summarises duration and trim. The trim
  handles are focusable sliders (`role="slider"`, arrow keys nudge by
  10 ms/100 ms).
- Text contrast is at least 4.5:1. Original and Enhanced differ in lightness
  as well as hue.
- Processing progress uses `role="progressbar"`. Errors and warnings use
  `role="alert"`.

## 8. Visual design

- **Look:** minimal and light; there is no dark theme in v1.
- **Fonts:** IBM Plex Sans for UI, IBM Plex Mono for times and numbers.
- **Colours:**
  - Ground `#F3F2EE`, surfaces `#FFFFFF`, ink `#16171A`, muted text `#5B5E66`,
    lines `#E2E0DA`.
  - Accent / enhanced `#1F4FD1`, original waveform `#9C9A93`, playhead
    `#D4462F`, warning surface `#FFF5E6`.
- **Radii:** 10–14 px. No gradients, no shadows beyond 1 px separators on
  active tabs.
- **Layout:**
  - Desktop: content with a 340 px settings column, max width 1280 px.
  - Below ~900 px the settings column wraps under the preview.
  - Phone layout: single column with a sticky Export button.

## 9. Browser support (target)

Latest two versions of Chrome, Edge, Firefox and Safari (macOS and iOS), plus
Chrome on Android. This needs WebAssembly, Web Workers and Web Audio.
WebCodecs is used where present, with WASM fallbacks (ARCHITECTURE §6).
Unsupported browsers get a single "Your browser can't run this app" page.

## 10. Roadmap (after v1)

1. **Natural variant**, which keeps room tone. It depends on Desert Ant Labs
   shipping it in the JS SDK, or on self-hosting the weights.
2. Offline / installable PWA (service-worker caching of app, runtime and
   model).
3. Record from the microphone.
4. Batch processing of several files.
5. Dark theme.
6. Optional localisation.
