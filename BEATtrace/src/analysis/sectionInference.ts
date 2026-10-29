import type { AnalysisSummary, AnalysisFrame } from '../domain/analysis'
import type { SectionInterval } from '../domain/musicTimeline'

type Bucket = { start: number; energy: number; low: number; onset: number; density: number }

/** Broad, explicitly heuristic structure cues. No verse/chorus assertion. */
export function inferSections(summary: AnalysisSummary): SectionInterval[] {
  if (summary.durationSeconds < 12 || summary.frames.length < 20) return []
  const bucketSeconds = 2
  const count = Math.ceil(summary.durationSeconds / bucketSeconds)
  const buckets: Bucket[] = Array.from({ length: count }, (_, index) => {
    const start = index * bucketSeconds
    const frames = summary.frames.filter((frame) => frame.timestamp >= start && frame.timestamp < start + bucketSeconds)
    return {
      start, energy: average(frames, 'energy'), low: average(frames, 'lowEnergy'),
      onset: average(frames, 'onsetStrength'), density: average(frames, 'density'),
    }
  })
  const novelty = buckets.map((_, index) => {
    if (index < 2 || index > buckets.length - 3) return 0
    const before = meanBucket(buckets.slice(index - 2, index))
    const after = meanBucket(buckets.slice(index, index + 2))
    return Math.abs(after.energy - before.energy) * 0.32 + Math.abs(after.low - before.low) * 0.24
      + Math.abs(after.onset - before.onset) * 0.23 + Math.abs(after.density - before.density) * 0.21
  })
  const sorted = [...novelty].sort((a, b) => a - b)
  const cutoff = Math.max(0.035, sorted[Math.floor(sorted.length * 0.78)] ?? 0)
  const candidates = novelty.map((value, index) => ({ value, index })).filter(({ value, index }) => value >= cutoff && value >= (novelty[index - 1] ?? 0) && value >= (novelty[index + 1] ?? 0)).sort((a, b) => b.value - a.value)
  const boundaries = [0, summary.durationSeconds]
  for (const candidate of candidates) {
    const time = candidate.index * bucketSeconds
    if (boundaries.every((boundary) => Math.abs(boundary - time) >= 6)) boundaries.push(time)
    if (boundaries.length >= 12) break
  }
  boundaries.sort((a, b) => a - b)
  const songEnergy = meanBucket(buckets).energy
  const songDensity = meanBucket(buckets).density
  const sections: SectionInterval[] = []
  for (let index = 0; index < boundaries.length - 1; index += 1) {
    const startTime = boundaries[index]
    const endTime = boundaries[index + 1]
    const within = buckets.filter((bucket) => bucket.start >= startTime && bucket.start < endTime)
    const first = meanBucket(within.slice(0, Math.max(1, Math.floor(within.length / 3))))
    const last = meanBucket(within.slice(-Math.max(1, Math.floor(within.length / 3))))
    const whole = meanBucket(within)
    let label = 'section change'
    if (index === 0 && endTime <= summary.durationSeconds * 0.3) label = 'possible intro'
    else if (index === boundaries.length - 2 && startTime >= summary.durationSeconds * 0.7) label = 'possible outro'
    else if (whole.energy < songEnergy * 0.7 && whole.density < songDensity * 0.75) label = 'breakdown estimate'
    else if (last.energy - first.energy > 0.13 && last.density - first.density > 0.09) label = 'build-up estimate'
    else if (sections.at(-1)?.label === 'build-up estimate' && first.low > sectionsEnergy(buckets, sections.at(-1)!) + 0.12 && first.onset > 0.13) label = 'drop estimate'
    else if (whole.energy > songEnergy * 1.15 && whole.density > songDensity * 1.1) label = 'dense section'
    sections.push({ startTime, endTime, label, confidence: null, source: 'mixed-audio-structure-heuristic' })
  }
  return sections
}

function average(frames: AnalysisFrame[], key: keyof Pick<AnalysisFrame, 'energy' | 'lowEnergy' | 'onsetStrength' | 'density'>): number {
  return frames.length ? frames.reduce((sum, frame) => sum + frame[key], 0) / frames.length : 0
}

function meanBucket(buckets: Bucket[]): Bucket {
  if (!buckets.length) return { start: 0, energy: 0, low: 0, onset: 0, density: 0 }
  return {
    start: buckets[0].start,
    energy: buckets.reduce((sum, bucket) => sum + bucket.energy, 0) / buckets.length,
    low: buckets.reduce((sum, bucket) => sum + bucket.low, 0) / buckets.length,
    onset: buckets.reduce((sum, bucket) => sum + bucket.onset, 0) / buckets.length,
    density: buckets.reduce((sum, bucket) => sum + bucket.density, 0) / buckets.length,
  }
}

function sectionsEnergy(buckets: Bucket[], section: SectionInterval): number {
  return meanBucket(buckets.filter((bucket) => bucket.start >= section.startTime && bucket.start < section.endTime)).low
}
