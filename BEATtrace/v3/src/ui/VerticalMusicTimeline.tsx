import { useEffect, useMemo, useState } from 'react'
import type { AnalysisSummary } from '../domain/analysis'
import { buildMusicTimeline, validateMusicTimeline, type DrumHit, type MusicTrackKind, type StemActivityInterval, type TranscribedNote } from '../domain/musicTimeline'
import { TIMELINE_LAYOUT, timeToY, visibleTimeRange } from '../visualization/verticalTime'
import { inferSections } from '../analysis/sectionInference'

const VIEW_HEIGHT = TIMELINE_LAYOUT.height
const PLAYHEAD_Y = TIMELINE_LAYOUT.playheadY
const RULER_WIDTH = 82
const MIN_SVG_WIDTH = 1000

interface Props {
  summary: AnalysisSummary
  notes: TranscribedNote[]
  stemActivity: StemActivityInterval[]
  drumHits: DrumHit[]
  media: HTMLMediaElement
  onSeek: (seconds: number) => void
  loop: { start: number; end: number } | null
}

export function VerticalMusicTimeline({ summary, notes, stemActivity, drumHits, media, onSeek, loop }: Props) {
  const inferredSections = useMemo(() => inferSections(summary), [summary])
  const timeline = useMemo(() => buildMusicTimeline(summary, notes, stemActivity, drumHits, inferredSections), [summary, notes, stemActivity, drumHits, inferredSections])
  const errors = useMemo(() => validateMusicTimeline(timeline), [timeline])
  const [clock, setClock] = useState(media.currentTime)
  const [zoom, setZoom] = useState<number>(TIMELINE_LAYOUT.defaultPixelsPerSecond)
  const [focus, setFocus] = useState<MusicTrackKind | 'all'>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    let frame = 0
    let last = 0
    const tick = (now: number) => {
      if (now - last > 16) { setClock(media.currentTime); last = now }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [media])

  const tracks = focus === 'all' ? timeline.tracks : timeline.tracks.filter((track) => track.id === focus)
  const svgWidth = Math.max(MIN_SVG_WIDTH, RULER_WIDTH + tracks.length * 136)
  const laneWidth = (svgWidth - RULER_WIDTH) / Math.max(1, tracks.length)
  const y = (time: number) => timeToY(time, clock, zoom)
  const [firstVisible, lastVisible] = visibleTimeRange(clock, zoom)
  const visible = timeline.events.filter((event) => tracks.some((track) => track.id === event.trackId)
    && event.startTime <= lastVisible && (event.endTime ?? event.startTime) >= firstVisible)
  const selected = timeline.events.find((event) => event.id === selectedId)
  const beatEvents = timeline.events.filter((event) => event.trackId === 'pulse')
  const beatNumber = beatEvents.findIndex((event) => event.startTime > clock)
  const displayBeat = beatNumber < 0 ? beatEvents.length : beatNumber

  return <section className="vertical-music-panel" aria-label="Vertical music event timeline">
    <div className="section-heading"><div><span className="track-eyebrow">NEON KINETIC · EVENT VIEW</span><h2>Hear the moment before it arrives</h2></div><span className="analysis-badge">FIXED PLAYHEAD</span></div>
    <p className="vertical-note">Events move past the fixed line. Drum labels come from spectral rules on the separated drum stem; note lanes require Basic Pitch. Both are estimates. Section labels are broad acoustic cues, not verified verse or chorus names.</p>
    <div className="vertical-controls">
      <label>Zoom <input type="range" min="30" max="150" step="2" value={zoom} onChange={(event) => setZoom(Number(event.currentTarget.value))} aria-label="Timeline zoom" /> <strong>{zoom} px/s</strong></label>
      <label>Focus <select value={focus} onChange={(event) => setFocus(event.currentTarget.value as MusicTrackKind | 'all')}><option value="all">All detected tracks</option>{timeline.tracks.map((track) => <option value={track.id} key={track.id}>{track.label}</option>)}</select></label>
      <span>{displayBeat ? `Beat ${displayBeat}` : 'Before first beat'} · {clock.toFixed(2)}s</span>
    </div>
    {errors.length > 0 && <p className="analysis-error" role="alert">Timeline data issue: {errors[0]}</p>}
    <div className="vertical-stage">
      <div className="vertical-overview" aria-label="Whole song navigation">
        <span>SONG</span>
        <div className="vertical-overview-map" onClick={(event) => {
          const bounds = event.currentTarget.getBoundingClientRect()
          onSeek(Math.max(0, Math.min(timeline.durationSeconds, (event.clientY - bounds.top) / bounds.height * timeline.durationSeconds)))
        }} role="slider" tabIndex={0} aria-label="Navigate whole song" aria-valuemin={0} aria-valuemax={timeline.durationSeconds} aria-valuenow={clock} onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); onSeek(Math.max(0, Math.min(timeline.durationSeconds, clock + (event.key === 'ArrowDown' ? 2 : -2)))) }
        }}>
          {summary.frames.filter((_, index) => index % Math.max(1, Math.ceil(summary.frames.length / 220)) === 0).map((frame, index) => <i key={index} style={{ top: `${frame.timestamp / timeline.durationSeconds * 100}%`, width: `${Math.max(8, frame.energy * 100)}%` }} />)}
          {loop && <b className="vertical-overview-loop" style={{ top: `${loop.start / timeline.durationSeconds * 100}%`, height: `${(loop.end - loop.start) / timeline.durationSeconds * 100}%` }} />}
          <b className="vertical-overview-position" style={{ top: `${clock / timeline.durationSeconds * 100}%` }} />
        </div>
        <small>{Math.round(timeline.durationSeconds)}s</small>
      </div>
      <svg viewBox={`0 0 ${svgWidth} ${VIEW_HEIGHT}`} style={{ minWidth: `${svgWidth}px` }} className="vertical-timeline" role="img" aria-label="Upcoming events above a fixed horizontal playhead; past events below">
        <defs><filter id="event-glow"><feGaussianBlur stdDeviation="4" /></filter><clipPath id="timeline-clip"><rect x="0" y="0" width={svgWidth} height={VIEW_HEIGHT} /></clipPath></defs>
        <g clipPath="url(#timeline-clip)">
          <rect width={svgWidth} height={VIEW_HEIGHT} fill="#121712" />
          <rect x="0" y="0" width={svgWidth} height={PLAYHEAD_Y} fill="#b7dc69" opacity="0.04" />
          <rect x="0" y={PLAYHEAD_Y} width={svgWidth} height={VIEW_HEIGHT - PLAYHEAD_Y} fill="#000" opacity="0.16" />
          {tracks.map((track, index) => <g key={track.id}><title>{track.label}: {track.evidence}</title><rect x={RULER_WIDTH + index * laneWidth} y="0" width={laneWidth} height={VIEW_HEIGHT} fill={index % 2 ? '#1a2019' : '#171c17'} opacity="0.7" /><line x1={RULER_WIDTH + index * laneWidth} x2={RULER_WIDTH + index * laneWidth} y1="0" y2={VIEW_HEIGHT} stroke="#424d3f" strokeWidth="1" /><text x={RULER_WIDTH + index * laneWidth + 8} y="25" fill={track.color} fontSize={tracks.length > 5 ? 10 : 13} fontFamily="monospace">{track.label.toUpperCase()}</text>{tracks.length <= 4 && <text x={RULER_WIDTH + index * laneWidth + 8} y="42" fill="#879385" fontSize="8" fontFamily="monospace">{track.evidence}</text>}</g>)}
          {timeline.sections.filter((section) => section.endTime >= firstVisible && section.startTime <= lastVisible).map((section, index) => <g key={`section-${index}`}><rect x={RULER_WIDTH} y={Math.max(0, y(section.endTime))} width={svgWidth - RULER_WIDTH} height={Math.max(0, Math.min(VIEW_HEIGHT, y(section.startTime)) - Math.max(0, y(section.endTime)))} fill={index % 2 ? '#8dceae' : '#e8cb83'} opacity="0.035" /><line x1={RULER_WIDTH} x2={svgWidth} y1={y(section.startTime)} y2={y(section.startTime)} stroke="#e1e7d1" strokeDasharray="4 7" opacity="0.22" /><text x={svgWidth - 154} y={y(section.startTime) + 14} fill="#bfc8b7" fontSize="10" fontFamily="monospace">{section.label.toUpperCase()}</text></g>)}
          {tracks.filter((track) => track.id === 'pitched' || track.id === 'bass-notes' || track.id === 'accompaniment-notes').flatMap((track) => {
            const index = tracks.findIndex((candidate) => candidate.id === track.id)
            const x = RULER_WIDTH + index * laneWidth
            return [48, 60, 72, 84].map((midi) => <g key={`${track.id}-${midi}`}><line x1={x + 24 + (midi - 36) / 60 * Math.max(10, laneWidth - 48)} x2={x + 24 + (midi - 36) / 60 * Math.max(10, laneWidth - 48)} y1="44" y2={VIEW_HEIGHT} stroke={track.color} opacity="0.12" strokeWidth="1" /><text x={x + 24 + (midi - 36) / 60 * Math.max(10, laneWidth - 48)} y="57" textAnchor="middle" fill="#8c9c93" fontSize="8" fontFamily="monospace">{midiName(midi)}</text></g>)
          })}
          {beatEvents.filter((event) => event.startTime >= firstVisible && event.startTime <= lastVisible).map((event) => <g key={`ruler-${event.id}`}><line x1="0" x2={svgWidth} y1={y(event.startTime)} y2={y(event.startTime)} stroke={event.kind === 'downbeat' ? '#b8d663' : '#66765a'} strokeWidth={event.kind === 'downbeat' ? 1.2 : 0.6} opacity="0.43" /><text x="8" y={y(event.startTime) - 5} fill={event.kind === 'downbeat' ? '#d2f36b' : '#93a28c'} fontSize="10" fontFamily="monospace">{event.kind === 'downbeat' ? 'BAR' : '·'} {beatEvents.indexOf(event) + 1}</text></g>)}
          {visible.map((event) => {
            const index = tracks.findIndex((track) => track.id === event.trackId)
            const x = RULER_WIDTH + index * laneWidth
            const center = x + laneWidth / 2
            const strength = event.acousticStrength ?? 0.5
            const radius = 4 + strength * 9
            const age = clock - event.startTime
            const active = event.endTime !== null ? age >= 0 && clock <= event.endTime : age >= 0 && age < 0.18
            const past = event.endTime !== null ? clock > event.endTime : age >= 0.18
            const opacity = past ? 0.3 : active ? 1 : 0.67
            const color = tracks[index].color
            const eventY = y(event.startTime)
            const pitchX = event.pitchMidi === null ? center : x + 24 + Math.max(0, Math.min(1, (event.pitchMidi - 36) / 60)) * Math.max(10, laneWidth - 48)
            const spanTop = event.endTime === null ? eventY : Math.max(0, y(event.endTime))
            const spanBottom = Math.min(VIEW_HEIGHT, eventY)
            return <g key={event.id} opacity={opacity} onClick={() => setSelectedId(event.id === selectedId ? null : event.id)} className="timeline-event" aria-label={`${event.kind} at ${event.startTime.toFixed(2)} seconds`}>
              {active && <circle cx={event.kind === 'note' ? pitchX : center} cy={event.endTime === null ? eventY : PLAYHEAD_Y} r={radius * 2.3} fill={color} opacity="0.26" filter="url(#event-glow)" />}
              {event.kind === 'note' && event.endTime !== null ? <rect x={pitchX - Math.max(3, radius / 2)} y={spanTop} width={Math.max(6, radius)} height={Math.max(3, spanBottom - spanTop)} rx="3" fill={color} stroke={selectedId === event.id ? '#fff' : 'none'} />
                : event.kind === 'stem-activity' && event.endTime !== null ? <rect x={center - radius} y={spanTop} width={radius * 2} height={Math.max(3, spanBottom - spanTop)} rx={radius} fill={color} opacity="0.82" stroke={selectedId === event.id ? '#fff' : 'none'} />
                : event.trackId === 'drum-snare' ? <path d={`M ${center-radius} ${eventY-radius} L ${center+radius} ${eventY+radius} M ${center+radius} ${eventY-radius} L ${center-radius} ${eventY+radius}`} fill="none" stroke={color} strokeWidth={Math.max(2, radius / 3)} strokeLinecap="round" />
                : event.trackId === 'drum-hihat' ? <path d={`M ${center-radius} ${eventY} L ${center+radius} ${eventY} M ${center} ${eventY-radius} L ${center} ${eventY+radius}`} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" />
                : event.trackId === 'drum-kick' ? <circle cx={center} cy={eventY} r={radius} fill={color} stroke={selectedId === event.id ? '#fff' : color} strokeWidth="2" />
                : event.kind === 'transient' ? <path d={`M ${center} ${eventY - radius} L ${center + radius} ${eventY} L ${center} ${eventY + radius} L ${center - radius} ${eventY} Z`} fill={color} stroke={selectedId === event.id ? '#fff' : 'none'} />
                  : event.kind === 'energy-change' ? <rect x={center - radius} y={eventY - 2} width={radius * 2} height="4" rx="2" fill={color} stroke={selectedId === event.id ? '#fff' : 'none'} />
                    : <circle cx={center} cy={eventY} r={event.kind === 'downbeat' ? radius : radius * 0.68} fill={event.kind === 'downbeat' ? color : '#182019'} stroke={selectedId === event.id ? '#fff' : color} strokeWidth="2" />}
              <title>{event.kind} · {event.pitchMidi === null ? '' : `${midiName(event.pitchMidi)} · `}{event.startTime.toFixed(2)}s · {event.sourceModels.join(', ')}</title>
            </g>
          })}
          <line x1="0" x2={svgWidth} y1={PLAYHEAD_Y} y2={PLAYHEAD_Y} stroke="#fbf9e8" strokeWidth="2" />
          <rect x="0" y={PLAYHEAD_Y - 13} width="73" height="26" fill="#d2f36b" />
          <text x="7" y={PLAYHEAD_Y + 4} fill="#182019" fontSize="11" fontFamily="monospace">{clock.toFixed(2)}s</text>
        </g>
      </svg>
    </div>
    <div className="vertical-footer"><span>UPCOMING ↑</span><span>PLAYHEAD · FIXED AT 68%</span><span>PAST ↓</span></div>
    {timeline.sections.length > 0 && <div className="vertical-sections" aria-label="Estimated song sections">{timeline.sections.map((section, index) => <button type="button" key={index} onClick={() => onSeek(section.startTime)}><strong>{section.label}</strong><small>{Math.round(section.startTime)}–{Math.round(section.endTime)}s</small></button>)}</div>}
    <div className="vertical-track-key">{tracks.map((track) => <span key={track.id}><i style={{ background: track.color }} />{track.label}: {track.evidence}</span>)}</div>
    {selected && <div className="vertical-inspector"><strong>{selected.kind} · {selected.startTime.toFixed(3)}s</strong><span>Source: {selected.sourceModels.join(', ')} · {selected.pitchMidi === null ? 'Pitch unavailable' : `MIDI ${selected.pitchMidi}`} · {selected.confidenceStatus === 'not_available' ? 'Model confidence unavailable' : `Timing estimate ${Math.round((selected.confidence ?? 0) * 100)}%`}</span><button type="button" className="secondary-button" onClick={() => onSeek(selected.startTime)}>Seek to event</button></div>}
    {timeline.warnings.length > 0 && <p className="vertical-note">{timeline.warnings.length} invalid note event(s) were skipped.</p>}
  </section>
}

function midiName(midi: number) {
  return `${['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'][Math.round(midi) % 12]}${Math.floor(midi / 12) - 1}`
}
