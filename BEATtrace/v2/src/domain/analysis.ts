export type AnalysisMode = 'traditional' | 'local-model' | 'cloud-model'

export type AnalysisEventType =
  | 'beat'
  | 'downbeat'
  | 'transient'
  | 'energy-change'
  | 'silence'
  | 'section'
  | 'layer-activity'
  | 'melody-contour'
  | 'transition'
  | 'upcoming-event'

export interface AnalysisEvent {
  id: string
  timestamp: number
  duration?: number
  type: AnalysisEventType
  source: string
  confidence?: number
  energy?: number
  frequencyRange?: [number, number]
  section?: string
  isUpcoming?: boolean
  analysisMode: AnalysisMode
  metadata?: Record<string, string | number | boolean>
}

export interface AnalysisSummary {
  durationSeconds: number
  estimatedBpm?: number
  bpmConfidence?: number
  firstBeatSeconds?: number
  firstBeatConfidence?: number
  meterNumerator?: number
  meterDenominator?: number
  /** Relative rhythmic activity estimate, not a genre or arrangement label. */
  averageDensity?: number
  /** Best rough onset-pattern similarity at a multi-second offset. */
  repetitionSimilarity?: number
  /** Sampled, normalized DSP values for timelines; never a model's raw output. */
  frames: AnalysisFrame[]
  mode: AnalysisMode
  events: AnalysisEvent[]
  generatedAt: string
}

export interface AnalysisFrame {
  timestamp: number
  energy: number
  lowEnergy: number
  midEnergy: number
  highEnergy: number
  onsetStrength: number
  density: number
  /** Approximate dominant melodic pitch; omitted when the frame is quiet or ambiguous. */
  melodyMidi?: number
  melodyConfidence?: number
}

export interface MelodyContourPoint {
  timestamp: number
  midi: number
  confidence: number
  energy: number
  source: 'spectral-estimate' | 'basic-pitch'
}

export interface LayerActivity {
  layer: 'drums' | 'bass' | 'melody' | 'vocals' | 'effects'
  timestamp: number
  value: number
  confidence?: number
  source: 'frequency-estimate' | 'separated-stem' | 'model'
}
