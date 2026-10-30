# BeatTrace

BeatTrace helps freestyle dancers notice a song's pulse, layers, and changes while leaving movement choices to the dancer.

## Features

- Local audio file selection, drag and drop, playback, seek, removal, and MP4-family audio extraction.
- Traditional browser DSP for estimated pulse, first beat, energy, density, transients, silence, frequency bands, and melody contour.
- Beginner Mode with tempo adjustment, tap alignment, beat nudges, 4/8/16-beat loops, metronome, and a synthetic voice-like count guide.
- Intermediate Mode with five approximate frequency layers, show/hide, solo, mute, volume, opacity, color, A/B comparison, and reset.
- Advanced Mode with a full-song energy/density overview, neutral sections, focused timeline, and pre-analyzed estimated events.
- Live Performance and Music Analysis presentation modes; switching preserves playback and analysis.
- Optional local BeatNet beat analysis and Spotify Basic Pitch melody contour. Traditional DSP remains available if either local service is missing.

All rhythmic, layer, section, pitch, and upcoming-event cues are estimates. Frequency layers are not isolated instruments; Basic Pitch contours are not scores. No cloud inference is implemented.

The count guide is an explicitly artificial, locally synthesized voice-like timbre. It does not use a person, AI voice, system TTS, recording, or network service.

## Run locally

Requires Node.js 20 or newer.

```sh
npm ci
npm run dev
```

## Optional local BeatNet (Phase 5)

To enable optional beat analysis on macOS:

```sh
brew install portaudio
conda create -y -n beattrace-beatnet python=3.9 pip
conda run -n beattrace-beatnet python -m pip install 'numpy==1.23.5' 'Cython==0.29.37' 'librosa==0.11.0'
conda run -n beattrace-beatnet python -m pip install --no-build-isolation 'madmom==0.16.1'
conda run -n beattrace-beatnet python -m pip install 'torch==2.8.0' 'pyaudio==0.2.14' 'git+https://github.com/mjhydri/BeatNet.git@81cedd4beeb7235262db80969a0c9ce9a48a0ed4'
```

With the app running, start in a second terminal from this project folder:

```sh
MPLCONFIGDIR=/tmp/beattrace-mpl conda run -n beattrace-beatnet python local-model/beatnet_service.py
```

Load a track and choose **Try local AI**. The app sends audio only to this computer after that action. See [Phase 5 validation](docs/phase-5-validation.md) for tested version, comparison results, model limitations, and licensing notes.

## Optional local Basic Pitch melody contour (Phases 6–7)

The app works without Basic Pitch and displays its spectral contour instead. To install the optional service in a separate Python 3.10 environment:

```sh
conda create -y -n beattrace-basicpitch python=3.10 pip
conda run -n beattrace-basicpitch python -m pip install 'basic-pitch==0.4.0'
```

Start it from the project folder (the command creates writable runtime folders under `/tmp`):

```sh
mkdir -p /tmp/beattrace-basicpitch-tmp /tmp/beattrace-basicpitch-mpl /tmp/beattrace-basicpitch-numba
TMPDIR=/tmp/beattrace-basicpitch-tmp \
MPLCONFIGDIR=/tmp/beattrace-basicpitch-mpl \
NUMBA_CACHE_DIR=/tmp/beattrace-basicpitch-numba \
  conda run -n beattrace-basicpitch python local-model/basic_pitch_service.py
```

Choose **Analyze with local Basic Pitch** in Intermediate or Advanced Music Analysis mode. The service listens only on `127.0.0.1:8766`, accepts the local app origins, and removes its temporary audio after processing. The Basic Pitch 0.4.0 package is Apache-2.0 licensed ([official repository](https://github.com/spotify/basic-pitch)). Its contour is an estimate and note strength is not calibrated confidence. Setup, inference validation, and limitations are in [Phase 6–7 validation](docs/phase-6-7-validation.md).

## Privacy

File playback and traditional analysis run in the browser. Optional AI analysis sends the selected file to a loopback-only local Python service only after the user explicitly selects the corresponding button; the services delete their temporary copies. BeatTrace has no account, cloud inference, remote audio endpoint, or third-party music platform integration.

## Build

```sh
npm run build
npm run preview
```

## Validation and user testing

- [Phase 2 validation](docs/phase-2-validation.md)
- [Phase 3–4 validation](docs/phase-3-4-validation.md)
- [Phase 5 validation](docs/phase-5-validation.md)
- [Phase 6–7 validation](docs/phase-6-7-validation.md)
- [Phases 6–17 implementation report](docs/phase-6-17-report.md)
- [Small-user test plan and observation form](docs/phase-16-user-test-plan.md)
- [Architecture](docs/architecture.md) and [dependency decisions](docs/dependency-decisions.md)
