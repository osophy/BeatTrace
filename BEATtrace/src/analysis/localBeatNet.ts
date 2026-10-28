import { normalizeModelResult, type RawModelResult } from './ModelAdapter'
import type { AnalysisSummary } from '../domain/analysis'

const SERVICE = 'http://127.0.0.1:8765'
const TIMEOUT_MS = 120_000

interface BeatNetResponse {
  model: string
  version: string
  beats: Array<{ time: number; beatPosition: number }>
}

/** Contacts loopback only. The file is sent only after the user explicitly asks to run this adapter. */
export async function analyzeWithLocalBeatNet(file: File, baseline: AnalysisSummary, signal?: AbortSignal): Promise<AnalysisSummary> {
  const controller = new AbortController()
  const onAbort = () => controller.abort()
  signal?.addEventListener('abort', onAbort, { once: true })
  const timeout = window.setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const health = await fetch(`${SERVICE}/health`, { signal: controller.signal, cache: 'no-store' })
    if (!health.ok) throw new Error('The local BeatNet service is not ready. Traditional analysis is still available.')
    const healthData = await health.json() as { available?: boolean }
    if (!healthData.available) throw new Error('BeatNet is not installed in the local service. Traditional analysis is still available.')

    const response = await fetch(`${SERVICE}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': file.type || 'application/octet-stream', 'X-Audio-Filename': encodeURIComponent(file.name) },
      body: file,
      signal: controller.signal,
    })
    if (!response.ok) throw new Error('Local BeatNet analysis failed. Your traditional analysis is unchanged.')
    const output = await response.json() as BeatNetResponse
    const beats = output.beats.filter((beat) => Number.isFinite(beat.time) && beat.time >= 0 && beat.time <= baseline.durationSeconds)
      .sort((a, b) => a.time - b.time)
    if (beats.length < 5) throw new Error('BeatNet returned too few beats to trust. Traditional analysis is unchanged.')

    const intervals = beats.slice(1).map((beat, index) => beat.time - beats[index].time).filter((interval) => interval >= 0.2 && interval <= 2)
    if (intervals.length < 4) throw new Error('BeatNet did not return a stable pulse. Traditional analysis is unchanged.')
    const medianInterval = [...intervals].sort((a, b) => a - b)[Math.floor(intervals.length / 2)]
    const timingConsistency = intervals.filter((interval) => Math.abs(interval - medianInterval) / medianInterval <= 0.2).length / intervals.length
    if (timingConsistency < 0.55) throw new Error('BeatNet timing was too inconsistent to use. Traditional analysis is unchanged.')

    const downbeats = beats.filter((beat) => beat.beatPosition === 1)
    const firstBeatSeconds = (downbeats[0] ?? beats[0]).time
    const meterLengths = downbeats.slice(1).map((beat, index) => {
      const from = beats.indexOf(downbeats[index])
      const to = beats.indexOf(beat)
      return to - from
    }).filter((length) => length >= 2 && length <= 12)
    const meterNumerator = meterLengths.length ? mode(meterLengths) : undefined
    const events: RawModelResult['events'] = beats.map((beat) => ({
      timestamp: beat.time,
      type: beat.beatPosition === 1 ? 'downbeat' : 'beat',
      confidence: timingConsistency,
      section: beat.beatPosition === 1 ? 'BeatNet downbeat' : 'BeatNet beat',
    }))
    const raw: RawModelResult = {
      durationSeconds: baseline.durationSeconds,
      estimatedBpm: 60 / medianInterval,
      bpmConfidence: timingConsistency,
      firstBeatSeconds,
      firstBeatConfidence: timingConsistency,
      meterNumerator,
      meterDenominator: 4,
      events,
    }
    return normalizeModelResult(raw, `beatnet-${output.version || 'local'}`, 'local-model', baseline)
  } catch (error) {
    if (signal?.aborted) throw new DOMException('Analysis cancelled', 'AbortError')
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('Local BeatNet timed out or was cancelled. Traditional analysis is still available.')
    }
    throw error
  } finally {
    window.clearTimeout(timeout)
    signal?.removeEventListener('abort', onAbort)
  }
}

function mode(values: number[]): number {
  const counts = new Map<number, number>()
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1)
  return [...counts].sort((a, b) => b[1] - a[1])[0][0]
}
