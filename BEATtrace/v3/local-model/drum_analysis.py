"""Conservative, signal-derived drum-stem onset categories.

This is not a learned drum transcription model. Labels are estimates from
Demucs' drums stem and are deliberately allowed to remain unclassified.
"""
from __future__ import annotations

import wave
from pathlib import Path

import numpy as np


def analyze_drum_stem(path: Path) -> list[dict]:
    with wave.open(str(path), "rb") as audio:
        sample_rate = audio.getframerate()
        channels = audio.getnchannels()
        frames = audio.getnframes()
        if audio.getsampwidth() != 2 or channels not in (1, 2) or frames < 4096:
            return []
        samples = np.frombuffer(audio.readframes(frames), dtype="<i2").reshape(-1, channels).astype(np.float32).mean(axis=1) / 32768.0

    window_size, hop = 2048, 512
    count = 1 + (samples.size - window_size) // hop
    if count < 5:
        return []
    frequencies = np.fft.rfftfreq(window_size, 1 / sample_rate)
    bands = [(35, 170), (170, 3000), (3000, min(12000, sample_rate / 2))]
    masks = [(frequencies >= low) & (frequencies < high) for low, high in bands]
    window = np.hanning(window_size).astype(np.float32)
    energy = np.empty((count, 3), dtype=np.float32)
    rms = np.empty(count, dtype=np.float32)

    for start in range(0, count, 256):
        stop = min(count, start + 256)
        indices = (np.arange(start, stop)[:, None] * hop + np.arange(window_size)[None, :])
        block = samples[indices]
        rms[start:stop] = np.sqrt(np.mean(block * block, axis=1))
        power = np.abs(np.fft.rfft(block * window, axis=1)) ** 2
        for band_index, mask in enumerate(masks):
            energy[start:stop, band_index] = np.mean(power[:, mask], axis=1) if mask.any() else 0

    # A two-hop difference responds to attacks while reducing frame-to-frame jitter.
    scale = np.maximum(np.quantile(energy, 0.9, axis=0), 1e-6)
    normalized = energy / scale
    novelty = np.maximum(0, normalized - np.roll(normalized, 2, axis=0))
    novelty[:2] = 0
    thresholds = np.maximum(np.quantile(novelty, 0.78, axis=0) * 1.5, 0.10)
    hits: list[dict] = []
    last_time = -1.0
    last_strength = 0.0
    rms_scale = max(float(np.quantile(rms, 0.98)), 1e-5)

    for index in range(3, count - 3):
        scores = novelty[index]
        if not np.any(scores >= thresholds):
            continue
        if np.max(scores) < np.max(novelty[index - 2:index + 3]):
            continue
        low, mid, high = [float(value) for value in scores]
        body = np.max(energy[index:index + 4], axis=0)
        body_ratios = body / max(float(np.sum(body)), 1e-8)
        low_body, mid_body, high_body = [float(value) for value in body_ratios]
        if low >= thresholds[0] and low_body >= 0.48:
            category = "kick"
        elif high >= thresholds[2] and high_body >= 0.60:
            category = "hi-hat"
        elif mid >= thresholds[1] and mid_body >= 0.36 and high_body >= 0.06:
            category = "snare"
        else:
            category = "unclassified percussion"
        timestamp = (index * hop + window_size / 2) / sample_rate
        strength = float(min(1, rms[index] / rms_scale))
        if strength < 0.06 or timestamp - last_time < 0.075:
            continue
        if timestamp - last_time < 0.20 and strength < last_strength * 0.38:
            continue
        last_time, last_strength = timestamp, strength
        hits.append({
            "time": round(float(timestamp), 3),
            "category": category,
            "strength": round(strength, 3),
            "confidence": None,  # This rule system has no calibrated probability.
            "method": "demucs-drum-stem-dsp",
        })
    return hits
