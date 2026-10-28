import type { AnalysisSummary } from '../domain/analysis'
import { eventsInWindow, timelineFrames } from '../visualization/TimelineModel'

interface Props {
  summary: AnalysisSummary
  currentTime: number
  onSeek: (seconds: number) => void
  firstBeatSeconds?: number
  bpm?: number
}

const width = 1000
const height = 176

export function EnergyTimeline({ summary, currentTime, onSeek, firstBeatSeconds, bpm }: Props) {
  const frames = timelineFrames(summary)
  if (frames.length === 0) return <div className="timeline-empty">Frequency and energy picture is unavailable for this file.</div>
  const duration = Math.max(0.01, summary.durationSeconds)
  const path = (key: 'energy' | 'lowEnergy' | 'midEnergy' | 'highEnergy') => frames.map((frame, index) => {
    const x = (frame.timestamp / duration) * width
    const y = height - 18 - frame[key] * (height - 36)
    return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
  const beatPeriod = bpm && bpm > 0 ? 60 / bpm : 0
  const beats: number[] = []
  if (firstBeatSeconds !== undefined && beatPeriod > 0) {
    for (let time = firstBeatSeconds; time < duration && beats.length < 1200; time += beatPeriod) beats.push(time)
  }
  const visibleEvents = eventsInWindow(summary, 0, duration)
  return <div className="timeline-wrap">
    <svg className="energy-timeline" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Audio energy and frequency-band timeline with estimated beat markers" onClick={(event) => {
      const bounds = event.currentTarget.getBoundingClientRect()
      onSeek(Math.max(0, Math.min(duration, ((event.clientX - bounds.left) / bounds.width) * duration)))
    }}>
      {[0.25, 0.5, 0.75].map((fraction) => <line key={fraction} x1="0" x2={width} y1={height - 18 - fraction * (height - 36)} y2={height - 18 - fraction * (height - 36)} className="timeline-grid" />)}
      {beats.map((time, index) => <line key={`beat-${index}`} x1={time / duration * width} x2={time / duration * width} y1="12" y2={height - 12} className={index % 4 === 0 ? 'beat-mark downbeat-mark' : 'beat-mark'} />)}
      {visibleEvents.filter((event) => event.type === 'silence' && event.duration).map((event) => <rect key={`silence-${event.id}`} x={event.timestamp / duration * width} y="12" width={Math.max(1, (event.duration ?? 0) / duration * width)} height={height - 24} className="silence-region" />)}
      {visibleEvents.filter((event) => event.type === 'transient' || event.type === 'energy-change' || event.type === 'transition').map((event) => <g key={`event-${event.id}`} className={event.timestamp > currentTime ? 'event-upcoming' : 'event-past'}><line x1={event.timestamp / duration * width} x2={event.timestamp / duration * width} y1="10" y2="25" /><title>{event.timestamp > currentTime ? 'Upcoming estimated event' : 'Past event'} · {event.type.replace('-', ' ')} · {event.timestamp.toFixed(1)}s</title></g>)}
      <path d={path('lowEnergy')} className="band-path low-path" />
      <path d={path('midEnergy')} className="band-path mid-path" />
      <path d={path('highEnergy')} className="band-path high-path" />
      <path d={path('energy')} className="energy-path" />
      <line x1={currentTime / duration * width} x2={currentTime / duration * width} y1="6" y2={height - 6} className="playhead-line" />
    </svg>
    <div className="timeline-legend"><span><i className="legend-energy" />Overall</span><span><i className="legend-low" />Low</span><span><i className="legend-mid" />Mid</span><span><i className="legend-high" />High</span><span className="legend-note">Approximate frequency bands · not separated instruments</span></div>
  </div>
}
