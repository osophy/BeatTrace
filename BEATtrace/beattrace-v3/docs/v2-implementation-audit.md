# BeatTrace v2 implementation audit — 2026-10-30

## Architecture and reuse

The existing application is React 19 + TypeScript + Vite. It runs in the browser with optional loopback Python services for BeatNet (beats), Spotify Basic Pitch (notes), and Demucs MLX (four stems). The original `HTMLMediaElement` remains the playback clock. Browser DSP and all prior beginner, intermediate, advanced, loop, volume, count-guide, and separation controls remain in place. Rate changes alter pitch in both the original player and buffer-based stem playback; pitch-preserving stretch is not implemented.

| Capability | Before this change | Decision and result |
| --- | --- | --- |
| Audio loading / playback | Browser local audio/video extraction, seek, volume | Kept; added 0.5–1.5× practice speed |
| Source separation | Optional local Demucs four-stem listening | Extended with measured activity intervals from the returned stem buffers |
| MIDI-style transcription | Basic Pitch returned a selected contour; no multi-instrument model | Basic Pitch note events now appear on separate bass and accompaniment lanes after Demucs; individual accompaniment instruments and MIDI export remain absent |
| Drum detection | Mixed-audio transient DSP only | Spectral onset rules on the Demucs drum stem estimate kick, snare, hi-hat, and unclassified percussion; real-song label accuracy is unmeasured |
| Track discovery | Five fixed frequency views | Added dynamic event lanes only when corresponding analyzer data exists; stem labels do not assert source presence |
| Structure | BeatNet optional; DSP beat grid and neutral sections | Added broad energy/density section cues; learned verse/chorus/drop and variable meter maps remain absent |
| Timeline | Horizontal energy and melody views | Kept as auxiliary views; added a vertical fixed-playhead event view |
| Loop / speed | Time loop; no user playback-rate control | Loop kept; added speed control using the same media clock as events and stems |
| Data export | Previously added local JSON/CSV controls | Removed the export controls at user request; MIDI export remains absent |

## Data path

`Uploaded file → browser DSP / optional BeatNet / optional Demucs + drum-stem rules / optional Basic Pitch on bass and other stems → buildMusicTimeline → validated MusicTimeline 1.0 → Advanced-only event lanes`.

`src/domain/musicTimeline.ts` normalizes and validates the analysis. It retains source provenance, nullable pitch/velocity/confidence, discrete onset versus interval timing, normalized mixed-audio feature curves, an estimated single-tempo entry, and explicitly heuristic sections. Drum labels are rule-based estimates, vocal-stem activity is not a vocal-presence assertion, and MIDI velocity is never fabricated. The renderer uses `timeToY(eventTime, media.currentTime, zoom)` with a fixed playhead at 420/620 = 67.7% of the event viewport. A `requestAnimationFrame` reads the media clock; frame counts never advance music time. Note bars map MIDI pitches 36–96 horizontally within the bass and accompaniment lanes. The whole-song overview and focus control support navigation and dense lanes.

## Real-song verification

- Baseline `npm run build` passed before modifications.
- `npm test`: five focused tests passed for provenance/ordering, invalid-note rejection, fixed-playhead time mapping, new event lanes, and bounded section inference. Python's synthetic kick/snare/hi-hat fixture and syntax compilation passed.
- `npm run build`: TypeScript and Vite passed after changes.
- The browser loaded `/Users/js/Downloads/luv.aac`. Its browser duration displayed about 70 seconds. The DSP view rendered real beat, transient, and energy-change events; the new vertical view showed those three lanes.
- In the browser, playback advanced the vertical time readout; seek to the end and back to zero updated it immediately; speed was changed to 0.95×.
- The installed local Demucs MLX service returned four stems for this file. After loading their buffers, the event view displayed vocal, drum, bass, and other stem activity lanes. These are **stem-energy estimates**, not verified instrument-presence classifications.
- The installed local Basic Pitch service processed the same file. The pitched-note lane appeared from its returned note events. The model amplitude is stored as acoustic strength, not as a verified MIDI velocity or calibrated confidence.
- In the current version, the browser's Advanced action on `luv.aac` produced 422 estimated notes across bass and accompaniment. The drum-stem rule system returned 238 attacks: 95 kick, 13 snare, 3 hi-hat, and 127 unclassified. The event view displayed all four category lanes alongside the stem lanes. Its heuristic sections were `possible intro` (0–8 s), `section change` (8–26 s), `dense section` (26–42 s), and `section change` (42–71 s). These are output checks, not proof of musical accuracy; the large unclassified share and sparse hi-hat labels show this classifier needs evaluation and likely improvement.
- Browser mode checks found the moving event view absent in Beginner and Intermediate, present in Advanced, with Live Performance and export controls absent. The prior browser export test belongs to an earlier build; exports have now been removed.

## Known limits and next implementation gates

1. **Specific drums:** The new kick/snare/hi-hat rules operate on the separated drum stem. Clap, ride, tom, and other detailed categories remain unclassified. Accuracy needs hand-labeled real-song events; separation bleed can cause errors.
2. **Instrument discovery:** The new bass and accompaniment note streams are source-aware transcription, not per-instrument transcription within accompaniment. MuScriptor could be researched further, but its official weights are non-commercial; it has not been installed or benchmarked.
3. **Structure:** The new broad section cues respond to energy, density, and onset changes. All-In-One has not been integrated; verse/chorus/drop predictions and a verified variable-tempo map remain absent.
4. **Absence detection:** Four Demucs output files always exist. This version treats their RMS activity as uncertain; there is no calibrated present/absent test, especially for instrumental songs where bleed can enter the vocal stem.
5. **Quality and deployment:** No multi-genre hand-annotated benchmark, measured onset/pitch F1, mobile memory measurement, or commercial model-weight clearance exists. The local Python services remain optional; a web-only visitor receives DSP lanes.
6. **Timing:** Browser UI sync was observed, but audio-to-event alignment has not been measured against annotated transients. Basic Pitch note timing may differ from the browser decoded timeline and needs explicit offset evaluation.

## Candidate model and license decisions

| Candidate | Status | Official source and decision |
| --- | --- | --- |
| Demucs / Demucs MLX | Installed for local evaluation | Four-stem output works. Code is MIT; upstream pretrained-weight commercial rights remain unclear. Do not package the weights for paid release without clearance. [Demucs](https://github.com/adefossez/demucs), [Demucs MLX](https://pypi.org/project/demucs-mlx/) |
| Spotify Basic Pitch | Installed for local evaluation | Its official `predict()` returns note events. We preserve onset, offset, pitch, and amplitude; amplitude is not claimed as velocity/confidence. [Basic Pitch](https://github.com/spotify/basic-pitch) |
| MuScriptor | Evaluated, not installed | Official code MIT; weights CC BY-NC 4.0. Keep behind a future research-only adapter pending resource and commercial-use decisions. [MuScriptor](https://github.com/muscriptor/muscriptor) |
| drum2midi | Evaluated, not installed | Its repository says code MIT but dependent model weights have separate restrictions; CPU separation cost conflicts with the 30-second goal for full songs. Model and speed need controlled benchmarking first. [drum2midi](https://github.com/miraer/drum2midi) |
| All-In-One | Evaluated, not installed | Official implementation provides music structure analysis, but its legacy NATTEN dependencies require a compatibility trial on this Mac before product integration. Weight licensing needs a separate check. [All-In-One](https://github.com/mir-aidj/all-in-one) |

The 30-second processing target is a product goal, not a verified guarantee for the full proposed hybrid pipeline. Prior local Demucs runs on a short cached song were faster than first-run model download, but combined multi-model time and memory have not been measured here.
