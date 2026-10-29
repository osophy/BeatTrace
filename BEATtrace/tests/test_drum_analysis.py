"""Synthetic signal checks for the honest DSP category adapter.

These fixtures verify code paths, not accuracy on recorded music.
"""
import sys
import tempfile
import unittest
import wave
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "local-model"))
from drum_analysis import analyze_drum_stem  # noqa: E402


class DrumAnalysisTest(unittest.TestCase):
    def test_three_distinct_synthetic_attacks(self):
        sr = 44100
        rng = np.random.default_rng(12)
        audio = np.zeros(sr * 4, dtype=np.float32)
        for time, category in [(0.5, "kick"), (1.4, "snare"), (2.3, "hi-hat")]:
            n = int(sr * 0.18)
            t = np.arange(n) / sr
            if category == "kick":
                burst = np.sin(2 * np.pi * 70 * t) * np.exp(-t * 24)
            else:
                noise = rng.normal(size=n)
                spectrum = np.fft.rfft(noise)
                frequencies = np.fft.rfftfreq(n, 1 / sr)
                if category == "snare":
                    spectrum[(frequencies < 250) | (frequencies > 3800)] = 0
                    burst = np.fft.irfft(spectrum, n) * np.exp(-t * 22) * 0.45
                else:
                    spectrum[frequencies < 5000] = 0
                    burst = np.fft.irfft(spectrum, n) * np.exp(-t * 45) * 0.3
            start = int(time * sr)
            audio[start:start + n] += burst
        with tempfile.NamedTemporaryFile(suffix=".wav") as temporary:
            with wave.open(temporary.name, "wb") as output:
                output.setnchannels(1)
                output.setsampwidth(2)
                output.setframerate(sr)
                output.writeframes((np.clip(audio, -1, 1) * 32767).astype("<i2").tobytes())
            hits = analyze_drum_stem(Path(temporary.name))
        self.assertEqual([hit["category"] for hit in hits], ["kick", "snare", "hi-hat"])
        self.assertTrue(all(hit["confidence"] is None for hit in hits))
        self.assertTrue(all(abs(hit["time"] - expected) < 0.03 for hit, expected in zip(hits, [0.5, 1.4, 2.3])))


if __name__ == "__main__":
    unittest.main()
