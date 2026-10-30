import type { MelodyContourPoint } from '../domain/analysis'
import type { MelodyContourAdapter } from './OptionalMusicModels'

interface BasicPitchResponse {
  available?: boolean
  model?: string
  version?: string
  durationSeconds: number
  notes: Array<{ startSeconds: number; endSeconds: number; midi: number; velocity: number }>
}

const ENDPOINT = 'http://127.0.0.1:8766'
const REQUEST_TIMEOUT_MS = 120_000

export const basicPitchAdapter: MelodyContourAdapter = {
  id: 'spotify-basic-pitch-local',
  async analyze(file, signal, onProgress) {
    const controller = new AbortController()
    const abort = () => controller.abort()
    signal.addEventListener('abort', abort, { once: true })
    const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    try {
      const health = await fetch(`${ENDPOINT}/health`, { cache: 'no-store', signal: controller.signal })
      if (!health.ok || !(await health.json() as { available?: boolean }).available) {
        throw new Error('Basic Pitch local service is not ready. The spectral contour remains available.')
      }
      onProgress?.(0.06)
      const response = await fetch(`${ENDPOINT}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': file.type || 'application/octet-stream', 'X-Audio-Filename': encodeURIComponent(file.name) },
        body: file,
        signal: controller.signal,
      })
      if (!response.ok) throw new Error('Basic Pitch could not analyze this file. The spectral contour remains available.')
      const result = await response.json() as BasicPitchResponse
      onProgress?.(1)
      if (!Number.isFinite(result.durationSeconds) || result.durationSeconds <= 0) throw new Error('Basic Pitch returned an invalid duration.')
      const notes = result.notes.filter((note) => Number.isFinite(note.startSeconds) && Number.isFinite(note.endSeconds) && Number.isFinite(note.midi) && note.endSeconds > note.startSeconds && note.midi >= 0 && note.midi <= 127).sort((a, b) => a.startSeconds - b.startSeconds)
      const hop = 0.08
      const points: MelodyContourPoint[] = []
      const active: typeof notes = []
      let nextNoteIndex = 0
      for (let timestamp = 0; timestamp < result.durationSeconds; timestamp += hop) {
        while (nextNoteIndex < notes.length && notes[nextNoteIndex].startSeconds <= timestamp + hop / 2) active.push(notes[nextNoteIndex++])
        for (let index = active.length - 1; index >= 0; index -= 1) if (active[index].endSeconds < timestamp) active.splice(index, 1)
        if (!active.length) continue
        const strongest = Math.max(...active.map((note) => note.velocity))
        const melody = active.filter((note) => note.velocity >= strongest * 0.72).sort((a, b) => b.midi - a.midi)[0]
        points.push({ timestamp: Number(timestamp.toFixed(3)), midi: melody.midi, confidence: clamp(melody.velocity, 0, 1), energy: clamp(melody.velocity, 0, 1), source: 'basic-pitch' })
      }
      if (!points.length) throw new Error('Basic Pitch found no reliable note events. The spectral contour remains available.')
      return points
    } catch (error) {
      if (signal.aborted) throw new DOMException('Melody analysis cancelled', 'AbortError')
      if (error instanceof DOMException && error.name === 'AbortError') throw new Error('Basic Pitch timed out. The spectral contour remains available.')
      throw error
    } finally {
      window.clearTimeout(timeout)
      signal.removeEventListener('abort', abort)
    }
  },
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min))
}
