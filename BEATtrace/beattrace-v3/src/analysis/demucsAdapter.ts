export type SeparatedStemId = 'vocals' | 'drums' | 'bass' | 'other'
import type { DrumHit } from '../domain/musicTimeline'

export interface SeparatedStem {
  id: SeparatedStemId
  label: string
  url: string
}

export interface StemSeparationResult {
  runId: string
  modelId: string
  device: string
  stems: SeparatedStem[]
  drumHits: DrumHit[]
}

const SERVICE = 'http://127.0.0.1:8767'
const labels: Record<SeparatedStemId, string> = { vocals: 'Vocals', drums: 'Drums', bass: 'Bass', other: 'Other accompaniment' }

export async function separateLocally(file: File, signal: AbortSignal, onProgress: (message: string) => void): Promise<StemSeparationResult> {
  onProgress('Checking the local Demucs service…')
  const health = await fetch(`${SERVICE}/health`, { signal })
  if (!health.ok) throw new Error('The local separation service is unavailable.')
  const healthData = await health.json() as { available?: boolean; device?: string }
  if (!healthData.available) throw new Error('Demucs is not installed. Follow the local setup instructions in README.md.')

  onProgress('Decoding the audio locally for the separation model…')
  const context = new AudioContext()
  let wav: ArrayBuffer
  try {
    const decoded = await context.decodeAudioData(await file.arrayBuffer())
    wav = encodePcm16Wav(decoded)
  } finally {
    await context.close().catch(() => undefined)
  }
  onProgress('Separating vocals, drums, bass, and accompaniment on this computer…')
  const response = await fetch(`${SERVICE}/separate`, {
    method: 'POST',
    headers: { 'Content-Type': 'audio/wav', 'X-Audio-Filename': 'input.wav' },
    body: wav,
    signal,
  })
  const payload = await response.json() as { error?: string; runId?: string; modelId?: string; device?: string; stems?: string[]; drumEvents?: Array<{ time: number; category: string; strength: number; confidence: number | null }> }
  if (!response.ok || !payload.runId || !payload.stems) throw new Error(payload.error || 'The local source separation failed.')
  return {
    runId: payload.runId,
    modelId: payload.modelId ?? 'htdemucs',
    device: payload.device ?? healthData.device ?? 'local processor',
    stems: (payload.stems as SeparatedStemId[]).map((id) => ({ id, label: labels[id], url: `${SERVICE}/stems/${payload.runId}/${id}.wav` })),
    drumHits: (payload.drumEvents ?? []).filter((hit) => Number.isFinite(hit.time) && Number.isFinite(hit.strength) && ['kick', 'snare', 'hi-hat', 'unclassified percussion'].includes(hit.category)).map((hit) => ({ time: hit.time, category: hit.category as DrumHit['category'], strength: hit.strength, confidence: Number.isFinite(hit.confidence) ? hit.confidence : null })),
  }
}

function encodePcm16Wav(audio: AudioBuffer): ArrayBuffer {
  const channels = Math.min(2, audio.numberOfChannels)
  const bytesPerSample = 2
  const dataLength = audio.length * channels * bytesPerSample
  const buffer = new ArrayBuffer(44 + dataLength)
  const view = new DataView(buffer)
  const write = (offset: number, value: string) => { for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i)) }
  write(0, 'RIFF'); view.setUint32(4, 36 + dataLength, true); write(8, 'WAVE')
  write(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true)
  view.setUint16(22, channels, true); view.setUint32(24, audio.sampleRate, true)
  view.setUint32(28, audio.sampleRate * channels * bytesPerSample, true)
  view.setUint16(32, channels * bytesPerSample, true); view.setUint16(34, 16, true)
  write(36, 'data'); view.setUint32(40, dataLength, true)
  const channelData = Array.from({ length: channels }, (_, index) => audio.getChannelData(index))
  let offset = 44
  for (let frame = 0; frame < audio.length; frame++) for (let channel = 0; channel < channels; channel++) {
    const sample = Math.max(-1, Math.min(1, channelData[channel][frame]))
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true)
    offset += bytesPerSample
  }
  return buffer
}

export async function deleteLocalSeparation(runId: string) {
  await fetch(`${SERVICE}/stems/${runId}`, { method: 'DELETE', keepalive: true }).catch(() => undefined)
}
