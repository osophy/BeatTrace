import type { AnalysisFrame, AnalysisSummary } from '../domain/analysis'
import { timelineFrames } from '../visualization/TimelineModel'

export type LayerId = 'drums' | 'bass' | 'melody' | 'vocals' | 'effects'

export interface LayerDefinition {
  id: LayerId
  label: string
  description: string
  color: string
  filter: 'drums' | 'bass' | 'melody' | 'vocals' | 'effects'
}

export const LAYERS: LayerDefinition[] = [
  { id: 'drums', label: 'Drums', description: 'Transient emphasis · approximate', color: '#e7a466', filter: 'drums' },
  { id: 'bass', label: 'Bass', description: 'Low-frequency band · approximate', color: '#8cbde4', filter: 'bass' },
  { id: 'melody', label: 'Melody', description: 'Mid-frequency band · approximate', color: '#a6d38a', filter: 'melody' },
  { id: 'vocals', label: 'Vocals', description: 'Midrange emphasis · approximate', color: '#d69bc3', filter: 'vocals' },
  { id: 'effects', label: 'Sound effects', description: 'High-frequency / transient emphasis · approximate', color: '#d9cb78', filter: 'effects' },
]

export interface LayerPoint {
  timestamp: number
  value: number
}

export function deriveLayerSignals(summary: AnalysisSummary): Record<LayerId, LayerPoint[]> {
  const transientTimes = summary.events.filter((event) => event.type === 'transient').map((event) => event.timestamp)
  const transientWindow = summary.durationSeconds > 0 ? Math.max(0.025, summary.durationSeconds / 2000) : 0.05
  const signals: Record<LayerId, LayerPoint[]> = { drums: [], bass: [], melody: [], vocals: [], effects: [] }
  let transientIndex = 0
  for (const frame of timelineFrames(summary, 900)) {
    while (transientIndex < transientTimes.length && transientTimes[transientIndex] < frame.timestamp - transientWindow) transientIndex += 1
    const hasTransient = transientIndex < transientTimes.length && transientTimes[transientIndex] <= frame.timestamp + transientWindow
    signals.drums.push({ timestamp: frame.timestamp, value: clamp(Math.max(frame.onsetStrength * 0.82, hasTransient ? 0.9 : 0, frame.lowEnergy * 0.24 + frame.highEnergy * 0.12)) })
    signals.bass.push({ timestamp: frame.timestamp, value: clamp(frame.lowEnergy * 0.92) })
    signals.melody.push({ timestamp: frame.timestamp, value: clamp(frame.midEnergy * 0.74 + (frame.melodyConfidence ?? 0) * 0.18) })
    signals.vocals.push({ timestamp: frame.timestamp, value: clamp(frame.midEnergy * 0.62 + (frame.energy > 0.08 ? 0.08 : 0)) })
    signals.effects.push({ timestamp: frame.timestamp, value: clamp(frame.highEnergy * 0.68 + frame.onsetStrength * 0.3) })
  }
  return signals
}

export function melodyContourFrames(frames: AnalysisFrame[]) {
  return frames.map((frame) => ({
    timestamp: frame.timestamp,
    midi: frame.melodyMidi,
    confidence: frame.melodyConfidence ?? 0,
    energy: frame.energy,
  }))
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0))
}
