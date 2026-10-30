import type { LayerId } from './layers'
import type { MelodyContourPoint } from '../domain/analysis'

export interface NormalizedAudioStem {
  id: string
  layer: Extract<LayerId, 'drums' | 'bass' | 'vocals'> | 'other'
  audioUrl: string
  durationSeconds: number
  sampleRate: number
  source: 'ai-separated'
  modelId: string
}

export interface NormalizedSeparationResult {
  durationSeconds: number
  modelId: string
  stems: NormalizedAudioStem[]
}

/** Replaceable local or cloud source-separation contract; audio products must be labeled as estimates. */
export interface SourceSeparationAdapter {
  readonly id: string
  separate(file: File, signal: AbortSignal, onProgress?: (fraction: number) => void): Promise<NormalizedSeparationResult>
}

/** Model-specific note events are converted to this small renderable contour shape first. */
export interface MelodyContourAdapter {
  readonly id: string
  analyze(file: File, signal: AbortSignal, onProgress?: (fraction: number) => void): Promise<MelodyContourPoint[]>
}
