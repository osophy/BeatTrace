# Phase 5: optional local beat model

## Implementation

- Traditional browser DSP remains the default and runs without any model installation.
- “Try local AI” explicitly checks the loopback BeatNet service at `127.0.0.1:8765`. The browser sends the selected file only after this action and only to that loopback address.
- `local-model/beatnet_service.py` loads BeatNet model 1 (the upstream GTZAN-trained checkpoint) in offline mode with the DBN decoder on CPU. It listens only on `127.0.0.1`, accepts requests only from the local development origin, limits input to 250 MB, and removes temporary audio files after processing.
- `src/analysis/localBeatNet.ts` converts beat positions into normalized beat/downbeat events. It derives BPM from the median beat interval and meter from the count between downbeats. Existing DSP timeline frames and metrics remain available.
- BeatNet’s published output has no calibrated confidence score. The adapter uses the share of beat intervals within 20% of the median interval as a timing-consistency estimate and declines the result below 55%. The UI calls it an estimate. Too few beats, irregular timing, service errors, and a 120-second timeout retain the traditional result.

## Model and dependency notes

- Upstream: [mjhydri/BeatNet](https://github.com/mjhydri/BeatNet), repository README identifies v1.2.0 and CC-BY-4.0.
- Runtime: optional local Python service, CPU inference, BeatNet offline mode and DBN decoder. It requires BeatNet's Python/PyTorch, Librosa, Madmom, and related packages; use the setup commands in the project README. These packages are not bundled with the web app.
- Input: BeatNet's file processing resamples to 22050 Hz. It returns beat timestamps and within-bar position. First downbeat is used as the first-beat estimate.
- Checkpoint: upstream code selects checkpoint 1 (`model_1_weights.pt`, described as trained on GTZAN). No checkpoint is bundled. Verify the checkpoint's provenance/redistribution rights before distributing the service or weights.
- Tested environment: macOS Apple Silicon, Python 3.9.25, BeatNet 1.2.0 at commit `81cedd4beeb7235262db80969a0c9ce9a48a0ed4`, PyTorch 2.8.0, Librosa 0.11.0, Madmom 0.16.1, PyAudio 0.2.14, NumPy 1.23.5, Cython 0.29.37, PortAudio 19.7.0. Python 3.9 and NumPy/Cython pins avoid the compatibility issue BeatNet documents for Madmom with newer Python/NumPy.

## Validation status

- BeatNet import and model 1 checkpoint initialization: passed on CPU.
- Local service health: HTTP 200, reports BeatNet 1.2.0. Browser preflight from `http://localhost:5173` to the loopback service: HTTP 204 with the required POST/header allowances.
- Ran the actual TypeScript frontend adapter against the service and the project DSP worker on three documented sample tracks. Results are estimates; no hand-labeled beat ground truth was used.

| Sample | BeatNet BPM / first downbeat / meter | DSP BPM / first beat | Warm adapter time |
|---|---|---|---:|
| Brahms, Hungarian Dance #5 (public domain recording) | 150 / 0.30 s / 2/4 | 161 (confidence 0.08) / 0.46 s | 1.00 s |
| Tchaikovsky, Dance of the Sugar Plum Fairy (Kevin MacLeod, CC BY 3.0) | 111 / 1.16 s / 2/4 | 108 (confidence 0.67) / 11.75 s | 3.23 s |
| “Choice” drum-and-bass excerpt (Admiral Bob, CC BY-NC; internal check only) | 136 / 0.02 s / 2/4 | 68 (confidence 0.92) / 0.00 s | 0.61 s |

BeatNet corrected the DSP half-time tempo choice on the drum-and-bass excerpt, but the first-beat estimate can differ substantially, as on the Tchaikovsky excerpt. BeatNet returned 2/4 on all three; that may reflect model/decoder behavior and is not verified meter. DSP confidence is also heuristic. The first cold model request (BeatNet's bundled 808 test clip) took 51.62 s; subsequent warm requests were 0.45–3.23 s. Service startup time was not measured.

- `npm run build`: passed.
- `python3 -m py_compile local-model/beatnet_service.py`: passed.
- No-model behavior: DSP remains the default and is computed first. Unavailable, failed, timed out, or low-consistency model results fall back to the traditional summary. No AI output is fabricated for validation.
- Validation audio was stored under `/tmp` and was not added to the project. The sample licenses and attributions came from librosa's example metadata.

## Known limitations

- The timing-consistency metric is a derived heuristic, not model confidence or a calibrated probability.
- Model 1 is trained on GTZAN; three sample comparisons do not establish performance across genres, live recordings, intros, vocals, syncopation, or unusual meters.
- BeatNet's published offline decoder supports 2/3/4-beat bars; meter estimates outside that range should not be expected.
- The optional service accepts an audio file path through BeatNet/Librosa. Formats unsupported by that local Librosa installation, including some video containers, fall back to traditional browser DSP.
- Results vary by track. The current test set is small and should be expanded with representative user-selected tracks before relying on the model for practice.
