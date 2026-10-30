import type { AnalysisEvent, AnalysisFrame, AnalysisSummary } from '../domain/analysis'

export function eventsInWindow(summary: AnalysisSummary, startSeconds: number, endSeconds: number): AnalysisEvent[] {
  return summary.events.filter((event) => event.timestamp >= startSeconds && event.timestamp <= endSeconds)
}

export function timelineFrames(summary: AnalysisSummary, maximumFrames = 900): AnalysisFrame[] {
  if (summary.frames.length <= maximumFrames) return summary.frames
  const stride = Math.ceil(summary.frames.length / maximumFrames)
  return summary.frames.filter((_, index) => index % stride === 0)
}
