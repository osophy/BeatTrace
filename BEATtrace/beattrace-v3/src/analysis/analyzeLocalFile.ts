import type { AnalysisSummary } from '../domain/analysis'
import { isVideoFile } from '../audio/fileValidation'

export interface AnalysisProgress {
  stage: string
  progress: number | null
}

export async function analyzeLocalFile(
  file: File,
  durationSeconds: number,
  options: { signal?: AbortSignal; onProgress?: (progress: AnalysisProgress) => void } = {},
): Promise<AnalysisSummary> {
  const { signal, onProgress } = options
  throwIfAborted(signal)
  onProgress?.({ stage: 'Preparing local audio analysis…', progress: 0.02 })
  const worker = new Worker(new URL('./dsp.worker.ts', import.meta.url), { type: 'module' })
  let pendingAck: (() => void) | null = null
  let rejectDone: ((error: Error) => void) | null = null
  let workerFailure: Error | null = null
  const done = new Promise<AnalysisSummary>((resolve, reject) => {
    rejectDone = reject
    worker.onmessage = (event: MessageEvent<{ type: string; progress?: number; summary?: AnalysisSummary; message?: string }>) => {
      if (event.data.type === 'ack') { pendingAck?.(); pendingAck = null }
      if (event.data.type === 'progress') onProgress?.({ stage: 'Analyzing rhythm and frequency bands…', progress: 0.08 + (event.data.progress ?? 0) * 0.88 })
      if (event.data.type === 'done' && event.data.summary) resolve(event.data.summary)
      if (event.data.type === 'error') {
        workerFailure = new Error(event.data.message ?? 'Audio analysis failed.')
        pendingAck?.()
        pendingAck = null
        reject(workerFailure)
      }
    }
    worker.onerror = (event) => {
      workerFailure = new Error(event.message || 'The analysis worker stopped unexpectedly.')
      pendingAck?.()
      pendingAck = null
      reject(workerFailure)
    }
  })
  void done.catch(() => undefined)
  const sendChunk = (channels: Float32Array[]) => new Promise<void>((resolve, reject) => {
    if (workerFailure) { reject(workerFailure); return }
    pendingAck = resolve
    worker.postMessage({ type: 'chunk', channels })
  })
  const abort = () => {
    worker.terminate()
    pendingAck?.()
    pendingAck = null
    rejectDone?.(new DOMException('Analysis cancelled', 'AbortError'))
  }
  signal?.addEventListener('abort', abort, { once: true })

  try {
    const canUseStreamingDecoder = await streamWithMediaBunny(file, durationSeconds, worker, sendChunk, onProgress, signal).catch((error: unknown) => {
      if (signal?.aborted) throw error
      if (isVideoFile(file)) throw error
      onProgress?.({ stage: 'Using the browser audio decoder…', progress: 0.04 })
      return false
    })
    if (!canUseStreamingDecoder) await decodeWithWebAudio(file, durationSeconds, worker, sendChunk, onProgress, signal)
    throwIfAborted(signal)
    worker.postMessage({ type: 'finish' })
    onProgress?.({ stage: 'Finishing beat and timeline estimates…', progress: 0.96 })
    const result = await done
    onProgress?.({ stage: 'Analysis ready', progress: 1 })
    return result
  } finally {
    signal?.removeEventListener('abort', abort)
    worker.terminate()
  }
}

async function streamWithMediaBunny(
  file: File,
  durationSeconds: number,
  worker: Worker,
  sendChunk: (channels: Float32Array[]) => Promise<void>,
  onProgress?: (progress: AnalysisProgress) => void,
  signal?: AbortSignal,
): Promise<boolean> {
  const { ALL_FORMATS, AudioSampleSink, BlobSource, Input } = await import('mediabunny')
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS })
  try {
    const track = await input.getPrimaryAudioTrack()
    if (!track || !(await track.canDecode())) return false
    throwIfAborted(signal)
    const firstTimestamp = await track.getFirstTimestamp()
    const sampleRate = await track.getSampleRate()
    const sink = new AudioSampleSink(track)
    const firstTime = Math.max(0, firstTimestamp)
    worker.postMessage({ type: 'start', sampleRate, durationSeconds, originSeconds: firstTime })
    onProgress?.({ stage: 'Reading audio frames locally…', progress: 0.06 })
    let hasSamples = false
    let expectedSampleTime = firstTime
    for await (const sample of sink.samples(firstTime, firstTime + durationSeconds)) {
      throwIfAborted(signal)
      try {
        const buffer = sample.toAudioBuffer()
        const channels = Array.from({ length: buffer.numberOfChannels }, (_, index) => buffer.getChannelData(index).slice())
        const gapSamples = Math.max(0, Math.round((sample.timestamp - expectedSampleTime) * sampleRate))
        if (gapSamples > 0) await sendChunk(Array.from({ length: buffer.numberOfChannels }, () => new Float32Array(gapSamples)))
        await sendChunk(channels)
        hasSamples = true
        expectedSampleTime = sample.timestamp + sample.duration
        const fraction = durationSeconds > 0 ? (sample.timestamp - firstTime) / durationSeconds : 0
        onProgress?.({ stage: 'Analyzing rhythm and frequency bands…', progress: Math.min(0.94, 0.08 + Math.max(0, fraction) * 0.86) })
      } finally {
        sample.close()
      }
    }
    return hasSamples
  } finally {
    input.dispose()
  }
}

async function decodeWithWebAudio(
  file: File,
  durationSeconds: number,
  worker: Worker,
  sendChunk: (channels: Float32Array[]) => Promise<void>,
  onProgress?: (progress: AnalysisProgress) => void,
  signal?: AbortSignal,
) {
  if (!window.AudioContext) throw new Error('This browser does not provide a local audio decoder for this file.')
  const context = new AudioContext()
  try {
    onProgress?.({ stage: 'Decoding audio locally in the browser…', progress: 0.05 })
    const decoded = await context.decodeAudioData(await file.arrayBuffer())
    throwIfAborted(signal)
    worker.postMessage({ type: 'start', sampleRate: decoded.sampleRate, durationSeconds: durationSeconds || decoded.duration, originSeconds: 0 })
    const blockLength = decoded.sampleRate * 4
    for (let start = 0; start < decoded.length; start += blockLength) {
      throwIfAborted(signal)
      const end = Math.min(decoded.length, start + blockLength)
      const channels = Array.from({ length: decoded.numberOfChannels }, (_, channel) => decoded.getChannelData(channel).slice(start, end))
      await sendChunk(channels)
      onProgress?.({ stage: 'Analyzing rhythm and frequency bands…', progress: Math.min(0.94, 0.08 + end / decoded.length * 0.86) })
    }
  } finally {
    await context.close()
  }
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException('Analysis cancelled', 'AbortError')
}
