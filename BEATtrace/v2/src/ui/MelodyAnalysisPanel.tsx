import type { AnalysisSummary, MelodyContourPoint } from '../domain/analysis'
import { MelodyContour } from './MelodyContour'

interface Props {
  summary: AnalysisSummary
  currentTime: number
  modelContour: MelodyContourPoint[] | null
  busy: boolean
  progress: number
  message: string
  onAnalyze: () => void
  onCancel: () => void
}

export function MelodyAnalysisPanel({ summary, currentTime, modelContour, busy, progress, message, onAnalyze, onCancel }: Props) {
  return <section className="melody-section" aria-label="Melody contour analysis">
    <MelodyContour summary={summary} currentTime={currentTime} modelContour={modelContour} />
    <div className="melody-model-actions"><p>Optional Basic Pitch analysis runs locally. The audio is sent to your own computer only after you choose to analyze. It works best on a clear melody or single instrument; dense mixes can produce overlapping or incorrect notes.</p><button type="button" className="secondary-button" disabled={busy} onClick={onAnalyze}>{busy ? `Analyzing… ${Math.round(progress * 100)}%` : 'Analyze with local Basic Pitch'}</button>{busy && <button type="button" className="secondary-button" onClick={onCancel}>Cancel</button>}</div>
    {message && <p className="model-status" role="status">{message}</p>}
  </section>
}
