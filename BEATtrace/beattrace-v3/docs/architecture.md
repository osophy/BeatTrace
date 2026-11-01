# BeatTrace architecture

## Product and platform

BeatTrace is a desktop-first responsive web app for beginner, intermediate, and advanced freestyle dancers. It makes musical structure easier to notice without prescribing movement. Local/browser processing is the default direction; the first architecture has no account, audio upload endpoint, analytics, or platform integration. A future cloud provider must sit behind explicit consent and a replaceable adapter.

## Selected stack

- React 19.1.0 + TypeScript 5.9.2 for the UI and strict domain contracts.
- Vite 6.4.5 for local development and static production builds.
- Browser media elements for long-form playback; Web Audio `AudioBuffer`/`AudioContext` behind decoding and analysis boundaries when needed. Browser codec support varies, so supported formats must be capability-checked in Phase 2.
- Mediabunny 1.61.3 for lazy, local demux/decode checks on MP4 and selected video containers. The module is dynamically imported only for video files; it is not in the initial page chunk.
- No DSP or AI model dependency. This keeps audio analysis behind the later phase gate and avoids shipping model weights or native runtimes before a measured need.

Versions are exact in `package.json` and `package-lock.json`. No AI model or remote font is currently bundled; the page uses local system font fallbacks. No audio-related browser traffic is initiated by the Phase 1 shell.

## Boundaries and project structure

```text
src/
  audio/          file decode and playback contracts
  analysis/       provider contract and model-output normalization
  domain/         normalized analysis events and summaries
  visualization/  pure timeline selectors; UI rendering stays separate
  ui/             React application and styles
docs/             architecture and dependency decisions
```

The UI consumes normalized domain objects. Audio acquisition/playback is separate from analysis providers. Traditional DSP and any future AI implementation implement the same provider contract and return `AnalysisSummary`. Model-specific raw output is translated in `ModelAdapter`; visualization code consumes domain events and does not import model packages. Privacy/consent belongs at the orchestration boundary before any cloud adapter is invoked. Error and cancellation handling will be added with the relevant execution flows.

## Normalized data model

`src/domain/analysis.ts` defines `AnalysisEvent`, `AnalysisSummary`, `AnalysisMode`, and `LayerActivity`. Events include timestamp, optional duration, type, source, optional confidence/energy/frequency range/section/upcoming flag, and analysis mode. The representative downbeat example is supported directly. Confidence remains optional and must not be fabricated. `src/analysis/ModelAdapter.ts` maps model timestamps and event values into this common structure.

## Phase 2 implementation

- Local file selection and drag-and-drop use `src/audio/fileValidation.ts` and `src/audio/localMedia.ts`.
- MP4, MOV, M4V, WebM, and Matroska containers are inspected locally with Mediabunny. BeatTrace requires an audio track and verifies it can decode a sample; then it uses a hidden browser media element to stream the selected file's audio track. Video pixels are never rendered.
- Common audio files use the browser's native audio element. Codec/container support depends on the browser; clear decode/playback errors are shown when a file is not supported.
- Playback stays in the media element so a whole song is not copied into one in-memory AudioBuffer. Seek, play, pause, restart, duration, buffering status, and track changes are synchronized to its media events.
- Files over 500 MB are rejected before reading. Blob object URLs are revoked, media elements are detached, and playback is stopped when a track is replaced, removed, or the page unmounts.
- No audio is posted to a server. The notice states: “Audio is processed locally in your browser whenever possible and is not uploaded by default.” The uploaded file is not persisted by the app.

## Current phase status

Phases 3–17 are implemented to a first version as documented in [phase-6-17-report.md](phase-6-17-report.md). Optional BeatNet beat analysis and Basic Pitch melody analysis use separate loopback-only Python services after explicit user action. Demucs source separation and cloud inference are deferred; the browser DSP fallback works without optional models.

## Phase 3: traditional DSP baseline

`src/analysis/analyzeLocalFile.ts` streams decoded local audio chunks into `src/analysis/dsp.worker.ts`. The worker runs a Hann-windowed radix-2 FFT, then estimates RMS energy, low/mid/high spectral magnitude, spectral flux, transient peaks, silence spans, energy changes, a beat period, a first active beat, local onset density, and a rough repeated-onset similarity. The output uses `AnalysisSummary` and `AnalysisEvent`; the UI never reads worker-specific data.

The energy timeline in `src/ui/EnergyTimeline.tsx` draws normalized energy and frequency-band curves with estimated beat/downbeat markers, transients, silence regions, energy changes, and a playback cursor. The bands are approximate frequency ranges; they are not separated instruments. Density and repetition are exploratory onset-envelope estimates, not arrangement analysis. Beat and first-beat confidence are heuristic and should not be treated as calibrated probabilities.

## Phase 4: Beginner Mode

The player starts analysis after opening a file and keeps playback available during analysis. Beginner Mode shows the tempo estimate, confidence indicators, beat and measure position, adjustable BPM, tap alignment, 50 ms earlier/later correction, reset/re-analysis controls, practice patterns of 4/8/16 beats, and a loop set at the current position. An uploaded-music volume control changes only the media element volume, initially 45%. `src/audio/practiceSounds.ts` loads eight short locally bundled speech clips for “one” through “eight” and repeats them on quarter-note beats. Eighth/sixteenth subdivisions apply only to the metronome click. The voice was generated offline; no model runs in the browser.

Count samples and optional metronome clicks are scheduled against `AudioContext.currentTime` with a 120 ms look-ahead and mapped to media playback time; the scheduler checks every 25 ms and handles loop rewinds. Beats one and five are accented. Music, metronome clicks, and counts have independent volume controls; the two practice signals pass through a compressor. The guide uses no runtime TTS or remote service.

The app treats four beats as a practice grid rather than verified meter. Users can correct the first-beat phase. The count voice is generated speech, not a human recording; see `public/audio/counts/README.md` for attribution.

## Current project structure

```text
src/
  analysis/       local-file analysis orchestration, DSP worker, model adapters and layer estimates
  audio/          file validation, local MP4 demux/decode and playback
  domain/         normalized events, summaries, frames, and layer contracts
  ui/             React player, Beginner/Intermediate/Advanced modes, timelines, styles
  visualization/  pure analysis frame/event selectors
public/           app assets
docs/             architecture, dependency decisions, phase validation
```

Analysis runs in the browser or in optional loopback-only local Python services. The DSP worker receives audio samples only. Files reach a local model service only after the user chooses its analysis action; service temporary files are removed. No cloud provider, account, remote audio upload, or source-separation model is included.
