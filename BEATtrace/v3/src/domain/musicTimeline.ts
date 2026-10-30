import type { AnalysisSummary } from './analysis'

export type MusicTrackKind = 'pulse' | 'transient' | 'pitched' | 'bass-notes' | 'accompaniment-notes' | 'energy' | 'stem-vocals' | 'stem-drums' | 'stem-bass' | 'stem-other' | 'drum-kick' | 'drum-snare' | 'drum-hihat' | 'drum-other'
export type MusicEventKind = 'beat' | 'downbeat' | 'transient' | 'note' | 'energy-change' | 'stem-activity' | 'drum-hit'

export interface MusicTrack {
  id: MusicTrackKind
  label: string
  evidence: string
  color: string
}

export interface MusicEvent {
  id: string
  trackId: MusicTrackKind
  kind: MusicEventKind
  startTime: number
  endTime: number | null
  pitchMidi: number | null
  acousticStrength: number | null
  midiVelocity: null
  confidence: number | null
  confidenceStatus: 'estimated' | 'not_available'
  sourceModels: string[]
}

export interface MusicTimeline {
  schemaVersion: '1.0'
  durationSeconds: number
  tracks: MusicTrack[]
  events: MusicEvent[]
  featureCurves: {
    normalizedMixedEnergy: Array<{ time: number; value: number }>
    normalizedOnsetStrength: Array<{ time: number; value: number }>
    normalizedRhythmicDensity: Array<{ time: number; value: number }>
  }
  tempoMap: Array<{ startTime: number; estimatedBpm: number; meterNumerator: number | null; meterDenominator: number | null; source: string }>
  sections: SectionInterval[]
  warnings: string[]
}

export interface TranscribedNote {
  startSeconds: number
  endSeconds: number
  midi: number
  strength: number
  track?: 'pitched' | 'bass-notes' | 'accompaniment-notes'
  source?: string
}

export interface DrumHit {
  time: number
  category: 'kick' | 'snare' | 'hi-hat' | 'unclassified percussion'
  strength: number
  confidence: number | null
}

export interface SectionInterval {
  startTime: number
  endTime: number
  label: string
  confidence: number | null
  source: string
}

export interface StemActivityInterval {
  stem: 'vocals' | 'drums' | 'bass' | 'other'
  startSeconds: number
  endSeconds: number
  strength: number
}

const TRACKS: Record<MusicTrackKind, MusicTrack> = {
  pulse: { id: 'pulse', label: 'Pulse', evidence: 'BeatNet or DSP beat estimate', color: '#d2f36b' },
  transient: { id: 'transient', label: 'Transients', evidence: 'DSP onsets; drum type unknown', color: '#ff8d70' },
  pitched: { id: 'pitched', label: 'Pitched notes', evidence: 'Basic Pitch estimates; instrument unknown', color: '#a7e6e1' },
  'bass-notes': { id: 'bass-notes', label: 'Bass notes', evidence: 'Basic Pitch on Demucs bass stem', color: '#86bae8' },
  'accompaniment-notes': { id: 'accompaniment-notes', label: 'Accompaniment notes', evidence: 'Basic Pitch on Demucs other stem; instrument unknown', color: '#c5bd96' },
  energy: { id: 'energy', label: 'Energy changes', evidence: 'Measured from the mixed recording', color: '#b4a2ff' },
  'stem-vocals': { id: 'stem-vocals', label: 'Vocal stem', evidence: 'Demucs stem activity; may contain bleed', color: '#e9a4cf' },
  'stem-drums': { id: 'stem-drums', label: 'Drum stem', evidence: 'Demucs stem activity; hits unclassified', color: '#f3ad76' },
  'stem-bass': { id: 'stem-bass', label: 'Bass stem', evidence: 'Demucs stem activity; pitch unknown', color: '#86bae8' },
  'stem-other': { id: 'stem-other', label: 'Other stem', evidence: 'Demucs accompaniment activity', color: '#c5bd96' },
  'drum-kick': { id: 'drum-kick', label: 'Kick estimate', evidence: 'Demucs drum stem + spectral onset rules', color: '#ff806c' },
  'drum-snare': { id: 'drum-snare', label: 'Snare estimate', evidence: 'Demucs drum stem + spectral onset rules', color: '#ffb67e' },
  'drum-hihat': { id: 'drum-hihat', label: 'Hi-hat estimate', evidence: 'Demucs drum stem + spectral onset rules', color: '#f8d693' },
  'drum-other': { id: 'drum-other', label: 'Percussion', evidence: 'Unclassified drum-stem onset', color: '#b5ae98' },
}

const clamp = (value: number) => Math.max(0, Math.min(1, value))

/** Fuses existing, real analyzer outputs without promoting DSP bands into instrument labels. */
export function buildMusicTimeline(summary: AnalysisSummary, notes: TranscribedNote[] = [], stemActivity: StemActivityInterval[] = [], drumHits: DrumHit[] = [], sectionIntervals: SectionInterval[] = []): MusicTimeline {
  const duration = summary.durationSeconds
  const events: MusicEvent[] = []
  const warnings: string[] = []
  const featureCurves = {
    normalizedMixedEnergy: summary.frames.map((frame) => ({ time: frame.timestamp, value: frame.energy })),
    normalizedOnsetStrength: summary.frames.map((frame) => ({ time: frame.timestamp, value: frame.onsetStrength })),
    normalizedRhythmicDensity: summary.frames.map((frame) => ({ time: frame.timestamp, value: frame.density })),
  }
  const tempoMap = summary.estimatedBpm && Number.isFinite(summary.estimatedBpm) ? [{ startTime: 0, estimatedBpm: summary.estimatedBpm, meterNumerator: summary.meterNumerator ?? null, meterDenominator: summary.meterDenominator ?? null, source: summary.mode === 'local-model' ? 'beatnet-estimate' : 'traditional-dsp-estimate' }] : []
  const sections = sectionIntervals.filter((section) => Number.isFinite(section.startTime) && Number.isFinite(section.endTime) && section.startTime >= 0 && section.endTime > section.startTime && section.endTime <= duration)
  if (!Number.isFinite(duration) || duration <= 0) return { schemaVersion: '1.0', durationSeconds: 0, tracks: [], events, featureCurves, tempoMap, sections, warnings: ['Invalid audio duration'] }

  for (const source of summary.events) {
    const trackId: MusicTrackKind | null = source.type === 'beat' || source.type === 'downbeat' ? 'pulse'
      : source.type === 'transient' ? 'transient'
      : source.type === 'energy-change' ? 'energy' : null
    if (!trackId || !Number.isFinite(source.timestamp) || source.timestamp < 0 || source.timestamp >= duration) continue
    events.push({
      id: source.id,
      trackId,
      kind: source.type as MusicEventKind,
      startTime: source.timestamp,
      endTime: null,
      pitchMidi: null,
      acousticStrength: source.energy === undefined || !Number.isFinite(source.energy) ? null : clamp(source.energy),
      midiVelocity: null,
      confidence: source.confidence === undefined || !Number.isFinite(source.confidence) ? null : clamp(source.confidence),
      confidenceStatus: source.confidence === undefined ? 'not_available' : 'estimated',
      sourceModels: [source.source],
    })
  }
  for (const [index, note] of notes.entries()) {
    if (![note.startSeconds, note.endSeconds, note.midi, note.strength].every(Number.isFinite)
      || note.startSeconds < 0 || note.startSeconds >= duration || note.endSeconds <= note.startSeconds
      || note.midi < 0 || note.midi > 127) { warnings.push(`Discarded invalid note ${index + 1}`); continue }
    events.push({
      id: `basic-pitch-note-${index}`,
      trackId: note.track ?? 'pitched', kind: 'note', startTime: note.startSeconds,
      endTime: Math.min(duration, note.endSeconds), pitchMidi: note.midi,
      acousticStrength: clamp(note.strength), midiVelocity: null,
      confidence: null, confidenceStatus: 'not_available',
      sourceModels: [note.source ?? 'spotify-basic-pitch'],
    })
  }
  for (const [index, interval] of stemActivity.entries()) {
    if (![interval.startSeconds, interval.endSeconds, interval.strength].every(Number.isFinite)
      || interval.startSeconds < 0 || interval.startSeconds >= duration || interval.endSeconds <= interval.startSeconds) {
      warnings.push(`Discarded invalid stem interval ${index + 1}`); continue
    }
    events.push({
      id: `demucs-${interval.stem}-${index}`, trackId: `stem-${interval.stem}`, kind: 'stem-activity',
      startTime: interval.startSeconds, endTime: Math.min(duration, interval.endSeconds),
      pitchMidi: null, acousticStrength: clamp(interval.strength), midiVelocity: null,
      confidence: null, confidenceStatus: 'not_available', sourceModels: ['demucs-htdemucs'],
    })
  }
  const drumTracks: Record<DrumHit['category'], MusicTrackKind> = { kick: 'drum-kick', snare: 'drum-snare', 'hi-hat': 'drum-hihat', 'unclassified percussion': 'drum-other' }
  for (const [index, hit] of drumHits.entries()) {
    if (!Number.isFinite(hit.time) || hit.time < 0 || hit.time >= duration || !Number.isFinite(hit.strength)) {
      warnings.push(`Discarded invalid drum hit ${index + 1}`); continue
    }
    events.push({
      id: `drum-hit-${index}`, trackId: drumTracks[hit.category], kind: 'drum-hit',
      startTime: hit.time, endTime: null, pitchMidi: null, acousticStrength: clamp(hit.strength), midiVelocity: null,
      confidence: hit.confidence === null || !Number.isFinite(hit.confidence) ? null : clamp(hit.confidence),
      confidenceStatus: hit.confidence === null ? 'not_available' : 'estimated', sourceModels: ['demucs-drum-stem-dsp'],
    })
  }
  events.sort((a, b) => a.startTime - b.startTime || a.id.localeCompare(b.id))
  const active = new Set(events.map((event) => event.trackId))
  const tracks = (Object.keys(TRACKS) as MusicTrackKind[]).filter((kind) => active.has(kind)).map((kind) => TRACKS[kind])
  return { schemaVersion: '1.0', durationSeconds: duration, tracks, events, featureCurves, tempoMap, sections, warnings }
}

export function validateMusicTimeline(timeline: MusicTimeline): string[] {
  const errors: string[] = []
  if (!Number.isFinite(timeline.durationSeconds) || timeline.durationSeconds <= 0) errors.push('Invalid song duration')
  const ids = new Set<string>()
  const tracks = new Set(timeline.tracks.map((track) => track.id))
  let previous = -Infinity
  for (const event of timeline.events) {
    if (ids.has(event.id)) errors.push(`Duplicate event ID: ${event.id}`)
    ids.add(event.id)
    if (!tracks.has(event.trackId)) errors.push(`Missing track: ${event.trackId}`)
    if (!Number.isFinite(event.startTime) || event.startTime < 0 || event.startTime > timeline.durationSeconds) errors.push(`Invalid timestamp: ${event.id}`)
    if (event.endTime !== null && (!Number.isFinite(event.endTime) || event.endTime <= event.startTime || event.endTime > timeline.durationSeconds)) errors.push(`Invalid end time: ${event.id}`)
    if (event.startTime < previous) errors.push(`Events out of order: ${event.id}`)
    previous = event.startTime
  }
  for (const [name, curve] of Object.entries(timeline.featureCurves)) {
    let lastTime = -Infinity
    for (const point of curve) {
      if (!Number.isFinite(point.time) || point.time < 0 || point.time > timeline.durationSeconds || point.time < lastTime || !Number.isFinite(point.value) || point.value < 0 || point.value > 1) {
        errors.push(`Invalid curve point: ${name}`)
        break
      }
      lastTime = point.time
    }
  }
  for (const tempo of timeline.tempoMap) {
    if (!Number.isFinite(tempo.startTime) || tempo.startTime < 0 || tempo.startTime > timeline.durationSeconds || !Number.isFinite(tempo.estimatedBpm) || tempo.estimatedBpm <= 0) errors.push('Invalid tempo map')
  }
  for (const section of timeline.sections) {
    if (!Number.isFinite(section.startTime) || !Number.isFinite(section.endTime) || section.startTime < 0 || section.endTime <= section.startTime || section.endTime > timeline.durationSeconds) errors.push('Invalid section interval')
  }
  return errors
}
