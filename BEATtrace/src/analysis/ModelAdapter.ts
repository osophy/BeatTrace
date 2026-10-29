import type { AnalysisEvent, AnalysisSummary } from '../domain/analysis'

export interface RawModelResult {
  durationSeconds: number
  estimatedBpm?: number
  bpmConfidence?: number
  firstBeatSeconds?: number
  firstBeatConfidence?: number
  meterNumerator?: number
  meterDenominator?: number
  /** Confidence from the model when available; BeatNet itself does not expose one. */
  confidence?: number
  events: Array<{
    timestamp: number
    duration?: number
    type: AnalysisEvent['type']
    confidence?: number
    energy?: number
    frequencyRange?: [number, number]
    section?: string
  }>
}

export interface ModelAdapter {
  readonly id: string
  readonly runtime: 'browser' | 'local-service' | 'cloud'
  analyze(audio: AudioBuffer, signal?: AbortSignal): Promise<RawModelResult>
}

export function normalizeModelResult(
  result: RawModelResult,
  source: string,
  mode: AnalysisSummary['mode'],
  baseline?: AnalysisSummary,
): AnalysisSummary {
  const validEvents = result.events.filter((event) => Number.isFinite(event.timestamp) && event.timestamp >= 0 && event.timestamp <= result.durationSeconds)
  const events: AnalysisEvent[] = validEvents.map((event, index) => ({
    ...event,
    id: `${source}-${index}-${event.timestamp}`,
    source,
    analysisMode: mode,
  }))

  return {
    ...baseline,
    durationSeconds: result.durationSeconds,
    estimatedBpm: isValidBpm(result.estimatedBpm) ? result.estimatedBpm : baseline?.estimatedBpm,
    bpmConfidence: clampConfidence(result.bpmConfidence) ?? baseline?.bpmConfidence,
    firstBeatSeconds: Number.isFinite(result.firstBeatSeconds) ? result.firstBeatSeconds : baseline?.firstBeatSeconds,
    firstBeatConfidence: clampConfidence(result.firstBeatConfidence) ?? baseline?.firstBeatConfidence,
    meterNumerator: isValidMeter(result.meterNumerator) ? result.meterNumerator : baseline?.meterNumerator,
    meterDenominator: isValidMeter(result.meterDenominator) ? result.meterDenominator : baseline?.meterDenominator,
    mode,
    events: [...(baseline?.events ?? []).filter((event) => event.type !== 'beat' && event.type !== 'downbeat'), ...events].sort((a, b) => a.timestamp - b.timestamp),
    frames: baseline?.frames ?? [],
    generatedAt: new Date().toISOString(),
  }
}

function clampConfidence(value: number | undefined): number | undefined {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value!)) : undefined
}

function isValidBpm(value: number | undefined): value is number {
  return Number.isFinite(value) && value! >= 30 && value! <= 300
}

function isValidMeter(value: number | undefined): value is number {
  return Number.isInteger(value) && value! >= 2 && value! <= 12
}
