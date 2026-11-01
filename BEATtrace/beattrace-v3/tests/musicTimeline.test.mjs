import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildSync } from 'esbuild'

function loadTypeScript(path) {
  const bundled = buildSync({ entryPoints: [path], bundle: true, platform: 'node', format: 'esm', write: false })
  return import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].contents).toString('base64')}`)
}

const { buildMusicTimeline, validateMusicTimeline } = await loadTypeScript('src/domain/musicTimeline.ts')
const { timeToY, visibleTimeRange } = await loadTypeScript('src/visualization/verticalTime.ts')
const { inferSections } = await loadTypeScript('src/analysis/sectionInference.ts')

const summary = {
  durationSeconds: 10,
  frames: [],
  events: [
    { id: 'hit', timestamp: 2.1, type: 'transient', source: 'traditional-dsp', energy: 0.6, confidence: 0.4 },
    { id: 'beat', timestamp: 2, type: 'downbeat', source: 'beatnet-local' },
  ],
}

test('fuses real outputs in time order without inventing instrument or MIDI velocity', () => {
  const timeline = buildMusicTimeline(summary, [{ startSeconds: 2.2, endSeconds: 2.8, midi: 64, strength: 0.7 }], [
    { stem: 'bass', startSeconds: 1.5, endSeconds: 3, strength: 0.8 },
  ])
  assert.deepEqual(timeline.tracks.map((track) => track.id), ['pulse', 'transient', 'pitched', 'stem-bass'])
  assert.deepEqual(timeline.events.map((event) => event.startTime), [1.5, 2, 2.1, 2.2])
  assert.equal(timeline.events.find((event) => event.kind === 'note').midiVelocity, null)
  assert.equal(timeline.events.find((event) => event.kind === 'transient').trackId, 'transient')
  assert.deepEqual(validateMusicTimeline(timeline), [])
})

test('invalid note timing is rejected and does not create a track', () => {
  const timeline = buildMusicTimeline(summary, [{ startSeconds: 4, endSeconds: 3, midi: 60, strength: 0.8 }])
  assert.equal(timeline.warnings.length, 1)
  assert.equal(timeline.tracks.some((track) => track.id === 'pitched'), false)
})

test('fixed playhead mapping survives seek, loop, and zoom without accumulated drift', () => {
  assert.equal(timeToY(8, 8, 72), 420)
  assert.equal(timeToY(9, 8, 72), 348)
  assert.equal(timeToY(7, 8, 72), 492)
  assert.equal(timeToY(8, 4, 72), 132)
  assert.equal(timeToY(8, 8, 150), 420)
  assert.equal(timeToY(8, 4, 72), timeToY(8, 4, 72))
  assert.deepEqual(visibleTimeRange(8, 100), [6, 12.2])
})

test('stem note, drum, and section estimates retain their source and avoid invented MIDI velocity', () => {
  const timeline = buildMusicTimeline(summary,
    [{ startSeconds: 1, endSeconds: 1.4, midi: 48, strength: 0.8, track: 'bass-notes', source: 'basic-pitch-on-demucs-bass' },
      { startSeconds: 2, endSeconds: 2.3, midi: 72, strength: 0.4, track: 'accompaniment-notes', source: 'basic-pitch-on-demucs-other' }],
    [],
    [{ time: 1.2, category: 'kick', strength: 0.7, confidence: null }, { time: 2.2, category: 'hi-hat', strength: 0.5, confidence: null }],
    [{ startTime: 0, endTime: 10, label: 'section change', confidence: null, source: 'mixed-audio-structure-heuristic' }])
  assert.deepEqual(timeline.tracks.filter((track) => track.id.includes('notes') || track.id.startsWith('drum-')).map((track) => track.id),
    ['bass-notes', 'accompaniment-notes', 'drum-kick', 'drum-hihat'])
  assert.equal(timeline.sections.length, 1)
  assert.equal(timeline.events.filter((event) => event.kind === 'note' || event.kind === 'drum-hit').every((event) => event.midiVelocity === null), true)
  assert.equal(timeline.events.find((event) => event.trackId === 'drum-kick').confidence, null)
  assert.deepEqual(validateMusicTimeline(timeline), [])
})

test('structure inference uses bounded neutral estimates', () => {
  const frames = Array.from({ length: 120 }, (_, i) => ({ timestamp: i / 2, energy: i < 40 ? 0.2 : i < 80 ? 0.75 : 0.4,
    lowEnergy: i < 40 ? 0.2 : 0.7, onsetStrength: i < 40 ? 0.1 : 0.6, density: i < 40 ? 0.1 : 0.65 }))
  const sections = inferSections({ ...summary, durationSeconds: 60, frames })
  assert.ok(sections.length >= 2)
  assert.equal(sections[0].startTime, 0)
  assert.equal(sections.at(-1).endTime, 60)
  assert.ok(sections.every((section) => section.confidence === null && !/verse|chorus/.test(section.label)))
})
