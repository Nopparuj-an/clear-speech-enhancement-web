# Speech Enhancement

A free web app that removes background noise and room echo from speech
recordings, entirely in your browser. Open an audio or video file, compare
the original and enhanced audio, set the enhancement strength, trim, and
export as audio or as video. The video is copied without re-encoding.

Enhancement uses the [Clear model by Desert Ant Labs](https://desertant.com/models/clear/),
who are not affiliated with this project.

> Status: v1 in progress. See [docs/SPEC.md](docs/SPEC.md) and
> [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Development

```bash
npm install
npm run dev        # http://localhost:5173/clear-speech-enhancement-web/
npm test           # unit tests
npm run test:e2e   # Playwright (builds must exist: npm run build)
```

Add `?mock-model` to the URL to swap the model for a fast fake (no download);
the end-to-end tests use it.

`/spike.html` runs the pre-build checks from ARCHITECTURE §11 against the real
model in your browser.
