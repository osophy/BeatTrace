import type { AnalysisSummary, MelodyContourPoint } from '../domain/analysis'

interface Props {
  summary: AnalysisSummary
  currentTime: number
  modelContour?: MelodyContourPoint[] | null
}

const width = 1000
const height = 230
const minMidi = 40
const maxMidi = 88

export function MelodyContour({ summary, currentTime, modelContour }: Props) {
  const frames = summary.frames
  const fromModel = Boolean(modelContour?.length)
  const points = fromModel
    ? (modelContour ?? []).map((point) => ({ timestamp: point.timestamp, x: point.timestamp / Math.max(0.01, summary.durationSeconds) * width, y: height - 24 - (clamp(point.midi, minMidi, maxMidi) - minMidi) / (maxMidi - minMidi) * (height - 48), confidence: point.confidence, energy: point.energy, valid: point.confidence >= 0.08 }))
    : frames.map((frame) => {
    const valid = frame.melodyMidi !== undefined && (frame.melodyConfidence ?? 0) >= 0.14 && frame.energy >= 0.035
    return {
      timestamp: frame.timestamp,
      x: frame.timestamp / Math.max(0.01, summary.durationSeconds) * width,
      y: height - 24 - (clamp(frame.melodyMidi ?? minMidi, minMidi, maxMidi) - minMidi) / (maxMidi - minMidi) * (height - 48),
      confidence: frame.melodyConfidence ?? 0,
      energy: frame.energy,
      valid,
    }
  })
  const usable = points.filter((point) => point.valid)
  const lines = []
  for (let index = 1; index < points.length; index += 1) {
    const left = points[index - 1]
    const right = points[index]
    if (!left.valid || !right.valid || right.timestamp - left.timestamp > 0.18) continue
    lines.push(<line key={index} x1={left.x} y1={left.y} x2={right.x} y2={right.y} stroke="#c9ed80" strokeWidth={1.15 + Math.min(1, (left.energy + right.energy) / 2) * 2.4} strokeOpacity={0.28 + Math.min(left.confidence, right.confidence) * 0.72} strokeLinecap="round" />)
  }
  return <div className="melody-panel">
    <div className="melody-heading"><div><span className="track-eyebrow">MELODY CONTOUR</span><h3>Approximate pitch movement</h3></div><span className="approximate-tag">{fromModel ? 'BASIC PITCH · AI ESTIMATE' : 'SPECTRAL ESTIMATE'}</span></div>
    <p className="melody-note">{fromModel ? 'A model-selected note contour from polyphonic audio, not a score. Line strength is a note-amplitude estimate, not calibrated confidence; gaps mark note-free or uncertain regions.' : 'A rough contour from the strongest spectral peak, not a score or exact transcription. Upward means a higher pitch tendency; line thickness follows energy. Gaps mark quiet or uncertain regions.'}</p>
    <svg className="melody-contour" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Approximate melody contour with gaps where pitch confidence is low">
      {[0.25, 0.5, 0.75].map((fraction) => <line key={fraction} x1="0" x2={width} y1={height - 24 - fraction * (height - 48)} y2={height - 24 - fraction * (height - 48)} className="timeline-grid" />)}
      {lines}
      <line x1={currentTime / Math.max(0.01, summary.durationSeconds) * width} x2={currentTime / Math.max(0.01, summary.durationSeconds) * width} y1="6" y2={height - 6} className="playhead-line" />
    </svg>
    <div className="melody-legend"><span>Lower pitch tendency</span><span>{usable.length ? `${Math.round(usable.length / Math.max(1, points.length) * 100)}% of frames show a contour` : 'No clear melodic pitch detected'}</span><span>Higher pitch tendency</span></div>
  </div>
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value))
}
