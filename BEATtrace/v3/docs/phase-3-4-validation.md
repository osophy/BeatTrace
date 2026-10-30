# Phase 3 and Phase 4 validation

## Implemented

- Local traditional analysis without an AI model, in a module Web Worker.
- Chunked Mediabunny audio decoding where supported, including MP4 audio-track input; browser Web Audio decoding is the audio-file fallback.
- BPM and first-active-beat estimates, beat/downbeat candidates on a four-beat practice grid, confidence indicators, normalized RMS/spectral energy frames, low/mid/high frequency bands, transient events, silence spans, energy-change events, onset-density estimate, and rough onset-pattern similarity.
- A synchronized SVG timeline for energy/frequency bands, beat lines, transients, silence and energy changes.
- Beginner Mode with adjustable BPM, tap-to-align, earlier/later beat shift, reset/re-analyze controls, beat and measure indicators, selectable 4/8/16-beat practice loops, a separate uploaded-music level (45% initial setting), independent metronome and count-guide volume controls (0–100%), and a synthetic voice-like guide with quarter, eighth, and sixteenth count patterns.
- The metronome click and synthetic count are separate toggles and are mixed through a dynamics compressor. The uploaded track keeps its own media-element volume control.
- Original formant-shaped syllable buffers for “one, two, three, four,” “and,” “e,” “a,” and “ta.” Buffers are synthesized locally in memory and scheduled with the AudioContext clock; no AI, system TTS, prerecorded human voice, or network service is used.
- Worker cancellation/error handling; changing or removing a track aborts its analysis.
- The privacy notice remains visible, and audio is not sent to a server.

## Validation performed

- `npm run build` — passed. This runs `tsc -b` and the Vite production build. The build emits a separate DSP worker bundle.
- Browser smoke test with a generated 20-second WAV containing a three-second quiet intro, 120 BPM low-frequency pulses, a 440 Hz tone section, and a two-second silence break. The UI returned an estimated 117 BPM and first active beat at 3.16 seconds. This confirms analysis and visual controls work, while showing the expected approximate nature of tempo/phase estimates.
- The same fixture produced three distinct frequency-band curves, 90 transient markers, and two silence regions. In the SVG energy curve, average y-value was about 80 for the active 8–12s section and 156 for the 13–15s silent section (lower activity appears farther down the SVG).
- Browser smoke test with the local `audio-only.mp4` fixture — MP4 audio loaded locally, displayed as an audio track with video ignored, and produced an analysis summary.
- Browser interaction check — playback advanced the displayed beat/measure; 8-beat loop selection, loop start, eighth-note subdivision, and click-guide toggle all updated and remained usable.
- Alignment check — shifting later by 50 ms changed the first-beat value; Reset alignment restored the automatic 3.16s value. Re-analyze completed without browser console errors.
- Fake-voice sample check — all eight generated syllable buffers had nonzero peaks/RMS at 44.1 kHz. Pattern mapping produced “1 e and a” for each beat in sixteenths and “1 ta ta ta” for the alternative syllable style. After precomputing formant weights, generating the buffers took about 216 ms on this machine.
- Very short WAV check — the file produced an analysis view with “No reliable pulse found” and no BPM/first-beat estimate, rather than failing playback or inventing a value.
- Phase 2's previous validation record covers file acceptance/errors and core player cases. This phase did not rerun the full Phase 2 matrix.
- No lint or test script is defined in `package.json`; no separate automated test suite was run.

## Known limitations

- BPM/autocorrelation may choose a half-time or double-time interpretation; first-beat/downbeat detection can be wrong, especially for syncopation, pickups, vocal intros, unclear downbeats, and non-four-beat meters. Values and confidence are heuristic. User correction is available.
- The displayed four-beat meter is an explicit practice assumption, not meter recognition.
- Frequency bands are approximate spectral ranges, not drums/bass/melody/vocal stems. Density and repetition are rough onset-envelope summaries; they do not identify song sections or semantic musical repetition.
- The count guide is a deliberately fake, formant-shaped voice-like sound. It is not natural or recorded speech, and intelligibility across speakers/headphones has not been user-tested. It is clearly labeled in the interface.
- Count samples are synthesized when the guide starts and cached only for that playback session; changing guide settings regenerates them. No sample audio file is distributed.
- Audio durations that cannot be decoded by a browser or Mediabunny will surface as analysis errors; browser codec support varies.

Phase 5 (AI-assisted analysis, source separation, and model inference) has not been started.
