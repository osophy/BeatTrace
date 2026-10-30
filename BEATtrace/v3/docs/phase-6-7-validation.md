# Phases 6–7: estimated layers and melody contour

## Implemented

- Intermediate Mode shows five frequency-based practice views: drums/transients, bass/low band, melody/mid band, vocals/midrange, and effects/high band. The labels and notices state these are estimates, not isolated studio stems.
- Layer activity, visibility, solo, mute, volume, visual opacity, color, original-mix restore, Layer Practice, A/B comparison, and reset controls are available. Filter branches share the media element clock and are presented as approximate frequency filters.
- A normalized source-separation adapter contract exists. Demucs is not shipped or presented as active. Its upstream repository is archived; use a reviewed, licensed runtime/checkpoint before implementing that optional adapter. The current product remains usable with DSP estimates.
- The spectral contour estimates a dominant 120–1500 Hz peak, shows a continuous approximate pitch path, varies line weight by energy, and breaks during quiet or ambiguous frames.
- An optional loopback-only Spotify Basic Pitch bridge and adapter are implemented. Upload happens only after the user selects “Analyze with local Basic Pitch.” It normalizes note events into an 80 ms contour and marks gaps. The contour is a note-selection view, not a score; note velocity is not calibrated confidence.
- Cancellation, timeout, service failure, unsupported formats, and empty note output preserve or return to the spectral estimate.

## Model and dependency decisions

- Spotify Basic Pitch 0.4.0 is the optional note transcription implementation, under Apache-2.0. The upstream project recommends a clear single instrument for best results; the polyphonic fallback does not promise one correct melody in a dense mix.
- Its optional Python 3.10 environment is separate from BeatNet's environment. See the setup instructions in README. No model weights are bundled in the web build.
- Demucs is deferred as an optional stem provider. Do not distribute a checkpoint until its precise origin and redistribution terms have been reviewed.

## Validation status

- `npm run build`: passed after Phases 6–11 UI additions.
- Python syntax compilation for BeatNet and Basic Pitch service files: passed.
- Basic Pitch import/model startup: passed with the local compatibility shim for `resampy`'s resource-file lookup; the protected Conda environment did not need modification.
- Basic Pitch loopback service health: HTTP 200, reports Basic Pitch 0.4.0. CORS response for `http://localhost:5173` was verified.
- Real inference path: passed on a generated 3.6-second WAV containing four stepped sine notes; service returned four note events with MIDI values 69, 72, 76, and 74. This synthetic check validates model execution and response conversion, not music transcription accuracy.
- The built TypeScript adapter was also run against the local service; it returned 43 normalized 80 ms contour points and progress updates.
- Model processing-time measurements and contour quality across clear melody, vocal, dense polyphonic, and silent real tracks remain unverified because no such audio files are present in the workspace.

To start the optional service after environment validation:

```sh
MPLCONFIGDIR=/tmp/beattrace-basicpitch-mpl NUMBA_CACHE_DIR=/tmp/beattrace-basicpitch-numba \
  conda run -n beattrace-basicpitch python local-model/basic_pitch_service.py
```
