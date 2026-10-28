# Phases 6–17 implementation and validation report

## Phase 6 — Intermediate Mode and music layers

Intermediate Mode shows estimated drums/transients, bass, melody, vocals, and sound-effect activity. It supports visibility, solo, mute, layer volume, visual opacity, color, original mix, Layer Practice, A/B switching, and reset. A shared media element clock keeps the filtered branches aligned. The labels state that these are frequency-based approximations, not isolated studio stems.

Source separation has a normalized provider contract only. Demucs is not installed or presented as available. The upstream [Demucs project](https://github.com/facebookresearch/demucs) is archived, and checkpoint redistribution rights must be reviewed separately before bundling any weights.

## Phase 7 — Melody contour

The browser DSP shows a dominant-spectrum pitch estimate with line thickness from energy and gaps during quiet or ambiguous frames. Optional Spotify Basic Pitch 0.4.0 local inference converts note events to a normalized contour. Its note strength is explicitly not a calibrated confidence score, and its contour is not a score.

The [Basic Pitch project](https://github.com/spotify/basic-pitch) is Apache-2.0. Its note-event API is documented in the upstream [inference implementation](https://github.com/spotify/basic-pitch/blob/main/basic_pitch/inference.py). The service is Python 3.10, loopback-only, explicit-action-only, limited to 250 MB, and deletes temporary audio. A small compatibility shim exposes only `pkg_resources.resource_filename`, which the installed resampy uses to locate bundled filter tables; this avoids needing to alter the protected Conda environment.

## Phases 8–11 — Song structure, visuals, modes, upcoming events

- Advanced Mode displays a 48-bucket full-song energy/density overview, neutral Sections A–F, a focused current window, and estimated event list.
- Current playback position, focus window, silence, and event timing are represented on the timeline. Upcoming cues come from pre-analysis of the loaded file, not from predictions of unheard music.
- Live Performance emphasizes the current beat and nearby events; Music Analysis keeps the study panels. Switching modes preserves the media element, position, and analysis.
- Existing visual channels remain distinct: beat flashes and markers, low/mid/high curves, silence regions, layer traces with separate colors, and a broken melody contour. The timeline is capped at 900 sampled frames for rendering; layer traces use the same bounded view.
- Semantic section names such as Verse/Chorus/Bridge are intentionally absent. Neutral labels and estimates are used because semantic recognition is not implemented.

## Phase 12 — Privacy and fallback

- Browser DSP is the default and needs no account, API key, cloud, or model service.
- BeatNet and Basic Pitch are separate optional local services, only contacted after the user selects the matching analysis action. Both bind to loopback and constrain accepted origins; temporary audio is removed.
- Failure, unavailable service, timeout, cancellation, or uncertain model output leaves the browser DSP summary/contour available.
- No cloud inference interface exists, so there is no silent upload path. A future cloud provider must request consent before sending audio and explain retention/deletion first.
- Removing audio stops playback and revokes its object URL through the local media session cleanup.

## Phase 13 — Music-platform boundary

Version one supports local file selection and drag-and-drop only. There is no Spotify, Apple Music, QQ Music, or NetEase Cloud Music playback, scraping, downloading, or protected-audio extraction. A future link display/open action would require a lawful official integration; platform audio analysis is not enabled.

## Phase 14 — Performance and reliability

- Audio decoding/DSP runs off the UI thread and reports progress with cancellation.
- Timeline and layer SVG data are bounded to 900 points; long-song overview is fixed at 48 buckets.
- Audio playback remains in the media element; Web Audio layer filters share its clock. Track replacement/removal disposes the graph and media session.
- BeatNet and Basic Pitch requests have cancellation/timeout handling and report DSP fallback.
- Full benchmark profiling across initial load, memory, frame rate, and very long files was not performed. Do not infer measured performance from the bounded data sizes.

## Phase 15 — Complete validation status

| Validation | Result |
|---|---|
| Production TypeScript/Vite build | Passed after current implementation |
| BeatNet and Basic Pitch Python syntax compilation | Passed |
| BeatNet local model and three-song comparison | Passed earlier; results and limitations in [Phase 5 validation](phase-5-validation.md) |
| Basic Pitch model startup / health | Passed; local service reports 0.4.0 |
| Basic Pitch real inference path | Passed on a generated 3.6-second four-note WAV: returned four note events. This checks the path only, not music recognition quality. |
| Basic Pitch real-song, vocal, dense polyphonic, and silence accuracy | Not verified; no suitable test tracks are in the project workspace |
| Basic Pitch CORS response from app origin | Passed for `http://localhost:5173` |
| Browser UI end-to-end interaction | Not run in this environment; user can inspect the running local site |
| MP4 with/without audio, unsupported formats, long-file, and all listed edge cases | Existing implementation/Phase 2 notes cover core file handling; full matrix was not rerun in this pass |
| Cloud consent accept/decline | Not applicable: no cloud-analysis path is implemented |

The Phase 15 matrix should be completed with the participant-supplied tracks and browsers intended for release. No results are invented for unavailable files.

## Phase 16 — Small-user testing preparation

The [Phase 16 test plan](phase-16-user-test-plan.md) includes beginner/intermediate/advanced tasks, a session outline, and a blank observation template. No user test has been run.

## Phase 17 — Deliverables

1. Source code: project `src/`, `local-model/`, and `public/`.
2. Setup/run/build: this README.
3. Feature list: this README.
4. Approximate/incomplete features: frequency layers, DSP pitch, section boundaries, event cues, tempo/first beat, and confidence values are heuristic; Basic Pitch contour is not a score; no isolated stems.
5. Privacy: browser-local by default; optional local-only inference after explicit action; no cloud path or account.
6. User test plan and blank observation template: `phase-16-user-test-plan.md`.
7. Technical limits: browser codecs vary; dense polyphonic audio confuses pitch estimates; dominant spectral peak can track bass/harmonics instead of melody; model inference performance/quality across tracks remains unmeasured.
8. Traditional signal processing: local Web Audio decode, FFT spectral magnitude/flux, energy, onset, silence, beat-period and pitch-peak estimates; frequency filters are not source separation.
9. Open-source models: BeatNet 1.2.0 at commit `81cedd4beeb7235262db80969a0c9ce9a48a0ed4`, CC-BY-4.0 (details in Phase 5 report); Spotify Basic Pitch 0.4.0, Apache-2.0. No model weights are bundled in the web build.
10. AI fallback: Browser DSP remains available when either local model is absent or fails.
11. Model replacement: implement the normalized `AnalysisProvider`, `MelodyContourAdapter`, or `SourceSeparationAdapter`; keep provider-specific data behind those contracts and preserve the local fallback.
12. Phase-by-phase report: Phases 6–17 are summarized in this document; Phases 0–5 are documented in `architecture.md`, `dependency-decisions.md`, and the earlier validation records.
13. Known issues: actual Basic Pitch music quality has not been evaluated on diverse tracks; layer filters are broad and overlap; mobile/background browser audio behavior varies; full performance profiling and final browser end-to-end pass remain outstanding.
14. Deferred beyond v1: AI source separation, semantic section labeling, lyric transcription, cloud inference, accounts, third-party platform playback, and advanced song-key/chord analysis.
