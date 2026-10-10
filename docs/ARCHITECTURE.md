# Speech Enhancement — Architecture

Status: **Draft v1**. Read with [SPEC.md](./SPEC.md).

## 1. Stack

| Concern | Choice | Why |
|---|---|---|
| Build | **Vite** + **React** + **TypeScript** (strict) | Static single-page app. Next.js would add a server-rendering pass the SDK's top-level `await` fights with and nothing we need. |
| State | **Zustand** (one store) | Small; easy to drive from worker messages. |
| Speech model | **`@desert-ant-labs/clear`** (browser entry) + peer **`@litertjs/core`** | Official SDK: WebAssembly core + LiteRT.js inference (XNNPACK CPU, optional WebGPU). |
| Demux / decode / encode / mux | **Mediabunny** (MPL-2.0) + lazy `@mediabunny/mp3-encoder`, `@mediabunny/aac-encoder`, `@mediabunny/flac-encoder` | Pure TypeScript. Copies video packets without re-encoding and can trim on keyframes. Uses WebCodecs where available, with WASM encoders as fallback. |
| Waveform | **Custom `<canvas>` component** | Two stacked lanes share one trim/playhead overlay. That's simpler to build ourselves than to keep two wavesurfer instances in sync. |
| Playback | **Web Audio API** | Two buffer sources and gain nodes give an instant dry/wet mix. |
| Tests | **Vitest** (units), **Playwright** (e2e on the built site) | Chromium is preinstalled in CI images. |
| Hosting | **GitHub Pages** via **GitHub Actions** (`actions/deploy-pages`) | Static, free. |

Pinned versions at time of writing: `@desert-ant-labs/clear` 3.6.0,
`@litertjs/core` 2.5.x, `mediabunny` 1.61.x.

## 2. Source layout

```
src/
  main.tsx, App.tsx            # routing by app phase: import | processing | editor
  store.ts                     # Zustand store: phase, file info, settings, trim, playback, export
  ui/                          # presentational components (Header, DropZone, StepList,
                               #   Waveform, Transport, Settings, ExportPanel, ConfirmDialog, Footer)
  media/
    probe.ts                   # Mediabunny Input → MediaInfo (container, tracks, codecs, duration, bitrate)
    decode.ts                  # audio track → Float32Array[] per channel at source rate
    formats.ts                 # "same as source" rules, codec↔container table, bitrate rules (pure)
    exportAudio.ts             # mix → loudness → encode → Blob
    exportVideo.ts             # copy video packets + new audio track → Blob
    keyframes.ts               # trim → keyframe-snapped range (pure + Mediabunny lookup)
  audio/
    engine.ts                  # AudioContext, two AudioBufferSourceNodes, dry/wet gains, clock
    mix.ts                     # s·wet + (1−s)·dry, chunked (pure)
    peaks.ts                   # min/max buckets for the waveform (pure, runs in worker)
    memory.ts                  # long-file estimate (pure)
  worker/
    enhance.worker.ts          # owns the Clear instance; see §4
    protocol.ts                # typed messages shared by main and worker
public/                        # favicon, og image
.github/workflows/             # ci.yml, deploy.yml
docs/                          # SPEC, ARCHITECTURE, ui mockups
```

## 3. Data flow

```
File ─▶ probe (main) ─▶ decode (main, Mediabunny/WebCodecs) ─▶ Float32 channels @ srcRate
                                                                     │ transfer
                                                                     ▼
                                     worker: Clear.enhance(channels, srcRate,
                                       { strength: 1, targetLUFS: null,
                                         channelMode, outputSampleRate: 48000 })
                                                                     │ transfer back
                                                                     ▼
           dry48 (original resampled to 48 kHz)  +  wet48 (enhanced)  +  peaks(dry), peaks(wet)
                         │                                  │
                         ▼                                  ▼
               audio/engine preview (live mix)     export: mix → loudness → encode/mux
```

- The model always runs at **full strength with mastering off**. The result is
  the "wet" buffer. Strength and loudness are applied later, so changing them
  never re-runs inference.
- The **original is resampled to 48 kHz** (`OfflineAudioContext`) so dry and
  wet are sample-aligned for mixing and A/B. When the source is already 48 kHz
  this is a no-op.
- **Mono mode** downmixes before inference and plays mono. **Stereo mode**
  uses `channelMode: "preserve"`.

## 4. Worker protocol

The Clear SDK uses a top-level `await` and a 46 MB WASM core, so it lives in a
**module worker**. The UI thread never blocks.

```ts
// main → worker
{ type: 'load' }                                   // instantiate SDK, download/cache model
{ type: 'enhance', id, channels: Float32Array[], sampleRate, channelMode }
{ type: 'master', id, channels: Float32Array[], target: number, ceiling: -1.5 } // see S2
{ type: 'peaks', id, channels: Float32Array[], buckets: number }
{ type: 'cancel', id }

// worker → main
{ type: 'progress', stage: 'download' | 'enhance', fraction }
{ type: 'loaded', cached: boolean }
{ type: 'enhanced', id, channels, measuredLUFS, processingSec, realtimeFactor }
{ type: 'mastered', id, channels, measuredLUFS, truePeak }
{ type: 'peaks', id, min: Float32Array, max: Float32Array }
{ type: 'error', id?, code: 'download' | 'oom' | 'runtime', message }
```

- All sample buffers are **transferred**, never copied.
- **Module worker + LiteRT.js:** LiteRT.js loads its Emscripten runtime with
  `importScripts` inside workers, which module workers reject.
  `worker/importScriptsShim.ts` replaces it with a synchronous fetch + global
  `eval`. Because the script is then eval'd, the worker also presets
  `self.Module.locateFile` so the runtime finds its `.wasm` under `litert/`.
- **Test double:** `?mock-model` in the page URL makes the worker use
  `worker/mockClear.ts` (a fast fake with the SDK's shape) instead of
  downloading the model. The Playwright flow tests use it.
- **Peaks** are computed on the main thread (`audio/peaks.ts`). It's fast
  enough for long files, and avoids copying buffers to the worker. The
  worker's `peaks` message stays available if profiling says otherwise.
- **Cancel** terminates the worker and starts a new one. A single
  `enhance()` call can't be interrupted, and the model files stay in the
  browser cache, so restarting is cheap.
- **Progress:**
  - Download progress comes from `Clear.load({ onProgress })`.
  - Inference progress: the SDK has no per-chunk callback, so we either run
    `enhance()` on ~60 s chunks with overlap and crossfade (gives real
    progress and lower peak memory), or show an indeterminate bar with an
    estimate from file duration.
  - Spike **S4** decides which. v1 ships the indeterminate bar with an
    elapsed-time counter.

## 5. Playback and preview

- **One `AudioContext`** at 48 kHz.
- **Two `AudioBufferSourceNode`s** (dry, wet), started at the same
  `context.currentTime` with the same offset, each through its own `GainNode`
  into the destination.
- **Strength `s`:** the wet gain is `s` and the dry gain is `1−s`, the same
  linear blend as export. Changes use `setTargetAtTime` (~10 ms) to avoid
  zipper noise.
- **Listen: Original** sets the gains to dry 1 and wet 0. Switching is
  instant, with no seek.
- **Seeking or trim preview** stops both sources and starts new ones at the
  offset. Playback loops inside the trim region if the user enables that
  (desktop: `L`).
- **Video sync:** a muted `<video>` element is slaved to the audio clock.
  Every animation frame, if the drift is over 80 ms, set `video.currentTime`.
  When paused, `video.currentTime` follows the playhead.
- **Waveform lanes:**
  - Dry and wet peaks are computed once in the worker
    (`peaks(buckets = devicePixelWidth × zoom)`).
  - While the slider is dragged, the Enhanced lane draws a lerp of the dry and
    wet peak envelopes, which is cheap and visually close enough.
  - On slider release, the worker recomputes exact peaks of the mix.

## 6. Export

### 6.1 Audio

1. Slice dry and wet to the trim range (sample-exact).
2. `mix.ts`: `s·wet + (1−s)·dry`, processed in 1 s chunks to limit peak
   memory.
3. **Loudness**, if not Off: worker `master` runs our own BS.1770-4 meter and
   a look-ahead true-peak limiter (`audio/loudness.ts`), with a target LUFS,
   a −1.5 dBTP ceiling and at most +9 dB of gain, like the SDK. Spike S2
   showed the SDK can master arbitrary audio, but only by running the model
   again. Our meter reads within 0.05 LU of the SDK and ffmpeg's `ebur128`.
4. **Resample** to the source rate if Sample rate = Source.
5. **Encode** with a Mediabunny `Output`, using the format from `formats.ts`.
   The encoder is chosen by `canEncodeAudio(codec, config)`:
   - **WAV:** `WavOutputFormat`, PCM 16-bit (24-bit if the source was 24-bit).
   - **FLAC:** `FlacOutputFormat`, WebCodecs, or lazy-load
     `@mediabunny/flac-encoder`.
   - **MP3:** `Mp3OutputFormat`, lazy-load `@mediabunny/mp3-encoder` (LAME).
   - **M4A:** `Mp4OutputFormat` with AAC, WebCodecs, or lazy-load
     `@mediabunny/aac-encoder` (e.g. Firefox).
   - **Opus:** `OggOutputFormat`, WebCodecs only. If unavailable the chip is
     disabled.
6. Feed it through `AudioBufferSource` / `AudioSampleSource`, `finalize()`,
   then save the Blob through an `<a download>` click. On iOS this opens the
   share sheet / Files.

### 6.2 Video: no video re-encode

Built by hand from Mediabunny primitives, not the high-level `Conversion`, so
we control exactly which audio goes in:

1. **Open the source:**
   - `Input(BlobSource(file))` → primary video track →
     `EncodedPacketSink`.
   - Other tracks (subtitles, extra audio) are dropped in v1.
2. **Keyframe snap** (`keyframes.ts`):
   - Start = the key packet at or before the requested start, from
     `getKeyPacket(start)`.
   - End = the end of the GOP that contains the requested end (expand
     policy).
   - This range is shown in the UI before export (SPEC §3.3), and the audio is
     cut to the **same** range so A/V stay in sync.
3. **Create the output:**
   - `Output` with the source container format.
   - `EncodedVideoPacketSource(codec)` gets the copied packets with their
     original decoder config, timestamps shifted by −start.
   - An `AudioSampleSource` receives the processed audio, encoded with the
     codec from `formats.ts`.
4. **Interleave:** Mediabunny's muxer handles ordering. Stream packets so the
   whole video never sits in memory: `StreamTarget` → a `Blob` assembled from
   chunks, or `showSaveFilePicker` + `FileSystemWritableFileStream` where
   available.
5. **Metadata:** rotation and language are copied where Mediabunny exposes
   them.

## 7. Model loading, caching and network

- The **SDK WASM** (`ClearWeb.wasm`, ~46 MB) is emitted by Vite as an asset
  through `new URL(…, import.meta.url)` and served from our Pages origin.
- The **LiteRT.js runtime** defaults to jsDelivr. We set `litertWasmDir` to
  our own origin (copied from `node_modules/@litertjs/core/wasm/` at build)
  so the app has no runtime dependency on a third-party CDN.
- **Model weights** are fetched by the SDK from Hugging Face at a pinned
  revision and stored in the browser cache. Self-hosting through
  `modelBaseUrl` is possible later, but redistributing weights must first be
  checked against the license.
- **Telemetry:** the SDK's default usage reporting to
  `events.desertant.com` stays **on** (decision). No audio or file data is
  sent. It is disclosed in the footer copy.
- **Cross-origin isolation:** not required. LiteRT runs single-threaded
  without `SharedArrayBuffer`. Multi-threading would need COOP/COEP headers,
  which GitHub Pages can't set. That's a possible later optimisation through
  `coi-serviceworker` (S6).

## 8. Build and deploy

- `vite.config.ts`:
  - `base: '/clear-speech-enhancement-web/'`
  - `build.target: 'es2022'` (top-level await)
  - `worker.format: 'es'`
  - `optimizeDeps.exclude` for the SDK (keeps its `import.meta.url` asset
    resolution intact)
- **`.github/workflows/ci.yml`** (pull requests and pushes): `npm ci` →
  `tsc --noEmit` → `eslint` → `vitest run` → `vite build` → Playwright smoke
  against `vite preview`.
- **`.github/workflows/deploy.yml`** (push to `main`): build →
  `actions/upload-pages-artifact` → `actions/deploy-pages`. Pages source is
  set to "GitHub Actions".
- **Size budget:** the app JS stays under 300 KB gzip excluding the SDK WASM
  and the lazy encoders. The CI build step reports bundle sizes.

## 9. Licensing

| Component | License | Obligation |
|---|---|---|
| This repo | Apache-2.0 | — |
| `@desert-ant-labs/clear`, `/core`, model weights | Desert Ant Labs Source-Available License 1.0 | Free below 100k monthly active devices per platform per model. **Credit Desert Ant Labs in the app** (footer copy). Don't use model outputs to train a competing model. |
| Mediabunny + encoder extensions | MPL-2.0 | Keep license notices. Modifications to MPL files must be published. We use them unmodified. |
| LAME (via mp3-encoder), libavcodec AAC, libFLAC | LGPL / BSD (per package) | Unmodified npm packages, lazy-loaded. List them on the `/licenses` page. |
| `@litertjs/core` | Apache-2.0 | Notice. |

A generated **Licenses / credits** page (rollup license plugin output) is
linked from the footer.

## 10. Testing

- **Unit (Vitest):**
  - `formats.ts`: every row of the SPEC §5 table, bitrate clamps, container ↔
    codec compatibility.
  - `mix.ts`: endpoints s = 0 and s = 1 are bit-exact to dry and wet.
  - `peaks.ts`, `memory.ts`, and `keyframes.ts` against a fake key-packet
    list.
- **Worker:** the SDK is mocked in CI so tests don't download the model;
  `enhance` returns an attenuated copy. The protocol and cancel paths are
  tested.
- **E2E (Playwright, Chromium):** with the worker mocked, import fixtures
  (short WAV, MP3, MP4 with H.264 + AAC, WebM with VP9 + Opus), move the
  slider, trim, then:
  - export each audio format and check that the output decodes with the
    right duration;
  - export video and check the video packets are byte-identical to the source
    for the kept GOPs.
- **Real-model check:** a manual or nightly workflow with network access runs
  one real `enhance()` on a 10 s fixture and asserts output length and
  measured loudness.

## 11. Spikes to run before building features

Results (GitHub runner, 100 s of noisy speech): S1 passed (same length, lag 0,
`strength` is exactly linear). S2: works but re-runs inference, so we master
locally. S4: no speed gain, so we keep one call. S6: no GPU on CI. Speed was
about 8× real time on 2 CPU cores.

| ID | Question | Pass criterion |
|---|---|---|
| S1 | Is the `strength: 1` output sample-aligned with the input, at the same length? Is SDK `strength` a linear blend? | Cross-correlation peak at lag 0; `enhance(x, {strength: s})` ≈ `s·wet + (1−s)·x`. |
| S2 | Can the SDK master arbitrary audio: `enhance(mix, {strength: 0, targetLUFS})`? Does strength 0 skip inference? | Output = mix × gain, limited to the ceiling, and fast. If not: implement BS.1770-4 integrated loudness + a look-ahead true-peak limiter ourselves (~200 lines). |
| S3 | Real peak memory per minute of audio, desktop Chrome and iOS Safari. | Fill in K for SPEC §6.2. |
| S4 | Chunked `enhance()` (60 s with 1 s overlap, crossfade) vs one call: audible seams? speed? | No audible seam at chunk joins in an A/B listening test → use chunking for progress and memory. |
| S5 | Download sizes: ClearWeb.wasm (gzip/brotli on Pages), LiteRT WASM, model file. | Number for the Import screen copy. |
| S6 | WebGPU accelerator vs default CPU: speed and correctness on desktop and Android. | Enable WebGPU by default only if faster with identical output. |
| — | How to run them | Open `/spike.html` in a browser, pick a 2–5 min speech file, then press Run. CI also runs them on every push (`spikes` job, `e2e/spike.spec.ts` with `e2e/fixtures/noisy-speech.mp3`) and uploads `spike-results.json`. |
| S7 | Browser coverage: WebCodecs AudioDecoder/Encoder (AAC, Opus, FLAC) in Safari/iOS and Firefox; fallback decode via `decodeAudioData` for audio-only files. | A matrix filled in; fallbacks wired. |
