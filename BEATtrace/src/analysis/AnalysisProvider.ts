import type { AnalysisSummary } from '../domain/analysis'

export interface AnalysisInput {
  audio: AudioBuffer
  signal?: AbortSignal
  onProgress?: (progress: number) => void
}

/** Analysis implementations return normalized data and never depend on UI rendering. */
export interface AnalysisProvider {
  readonly id: string
  readonly mode: AnalysisSummary['mode']
  analyze(input: AnalysisInput): Promise<AnalysisSummary>
}
