import type { AnalysisEvent, AnalysisFrame, AnalysisSummary } from '../domain/analysis'

const FFT_SIZE = 2048
const HOP_SIZE = 1024
const LOW_EDGE = 160
const MID_EDGE = 2000
const HIGH_EDGE = 10000

interface StartMessage { type: 'start'; sampleRate: number; durationSeconds: number; originSeconds: number }
interface ChunkMessage { type: 'chunk'; channels: Float32Array[] }
interface FinishMessage { type: 'finish' }
type WorkerMessage = StartMessage | ChunkMessage | FinishMessage
type WorkerResponse = { type: 'ack' } | { type: 'progress'; progress: number } | { type: 'done'; summary: AnalysisSummary } | { type: 'error'; message: string }

const workerScope = self as unknown as {
  onmessage: ((event: MessageEvent<WorkerMessage>) => void) | null
  postMessage(message: WorkerResponse): void
}

type RawFrame = { timestamp: number; rms: number; low: number; mid: number; high: number; flux: number; melodyMidi?: number; melodyConfidence?: number }
let sampleRate = 44100
let durationSeconds = 0
let originSeconds = 0
let consumedSamples = 0
let totalSamples = 0
let tail = new Float32Array(0)
let rawFrames: RawFrame[] = []
let previousMagnitude = new Float32Array(FFT_SIZE / 2)
let windowFunction = new Float32Array(FFT_SIZE)

workerScope.onmessage = (event) => {
  try {
    const message = event.data
    if (message.type === 'start') { reset(message); return }
    if (message.type === 'chunk') {
      if (message.channels[0]) totalSamples += message.channels[0].length
      processChunk(message.channels)
      workerScope.postMessage({ type: 'ack' })
      return
    }
    workerScope.postMessage({ type: 'done', summary: finalize() })
  } catch (error) {
    workerScope.postMessage({ type: 'error', message: error instanceof Error ? error.message : 'Audio analysis failed.' })
  }
}

function reset(message: StartMessage) {
  sampleRate = message.sampleRate
  durationSeconds = message.durationSeconds
  originSeconds = message.originSeconds
  consumedSamples = 0
  totalSamples = 0
  tail = new Float32Array(0)
  rawFrames = []
  previousMagnitude = new Float32Array(FFT_SIZE / 2)
  windowFunction = Float32Array.from({ length: FFT_SIZE }, (_, index) => 0.5 - 0.5 * Math.cos((2 * Math.PI * index) / (FFT_SIZE - 1)))
}

function processChunk(channels: Float32Array[]) {
  if (channels.length === 0) return
  const frameCount = channels[0].length
  const mono = new Float32Array(frameCount)
  for (const channel of channels) {
    for (let index = 0; index < frameCount; index += 1) mono[index] += channel[index] / channels.length
  }
  const joined = new Float32Array(tail.length + mono.length)
  joined.set(tail)
  joined.set(mono, tail.length)
  let offset = 0
  while (offset + FFT_SIZE <= joined.length) {
    analyzeFrame(joined, offset, (consumedSamples + offset) / sampleRate + originSeconds)
    offset += HOP_SIZE
    consumedSamples += HOP_SIZE
  }
  tail = joined.slice(offset)
  if (durationSeconds > 0) workerScope.postMessage({ type: 'progress', progress: Math.min(0.94, consumedSamples / sampleRate / durationSeconds) })
}

function analyzeFrame(samples: Float32Array, offset: number, baseTime: number) {
  const real = new Float32Array(FFT_SIZE)
  const imaginary = new Float32Array(FFT_SIZE)
  let squares = 0
  for (let index = 0; index < FFT_SIZE; index += 1) {
    const value = samples[offset + index]
    squares += value * value
    real[index] = value * windowFunction[index]
  }
  fft(real, imaginary)

  let low = 0
  let mid = 0
  let high = 0
  let flux = 0
  let totalMagnitude = 0
  let melodyPower = 0
  let strongestMelodyBin = 0
  let strongestMelodyMagnitude = 0
  for (let bin = 1; bin < FFT_SIZE / 2; bin += 1) {
    const magnitude = Math.hypot(real[bin], imaginary[bin])
    const frequency = (bin * sampleRate) / FFT_SIZE
    if (frequency >= 120 && frequency <= 1500) {
      melodyPower += magnitude
      if (magnitude > strongestMelodyMagnitude) {
        strongestMelodyMagnitude = magnitude
        strongestMelodyBin = bin
      }
    }
    if (frequency < LOW_EDGE) low += magnitude
    else if (frequency < MID_EDGE) mid += magnitude
    else if (frequency < HIGH_EDGE) high += magnitude
    totalMagnitude += magnitude
    flux += Math.max(0, magnitude - previousMagnitude[bin])
    previousMagnitude[bin] = magnitude
  }
  const rms = Math.sqrt(squares / FFT_SIZE)
  const melodyConfidence = melodyPower > 0 ? strongestMelodyMagnitude / melodyPower : 0
  const hasMelodyCandidate = rms >= 0.008 && melodyConfidence >= 0.08 && strongestMelodyBin > 0
  const midi = hasMelodyCandidate ? 69 + 12 * Math.log2(((strongestMelodyBin * sampleRate) / FFT_SIZE) / 440) : undefined
  rawFrames.push({ timestamp: baseTime + FFT_SIZE / (2 * sampleRate), rms, low, mid, high, flux: totalMagnitude > 0 ? flux / totalMagnitude : 0, melodyMidi: midi, melodyConfidence: hasMelodyCandidate ? Math.min(1, melodyConfidence * 2.5) : 0 })
}

function fft(real: Float32Array, imaginary: Float32Array) {
  let reversed = 0
  for (let index = 1; index < FFT_SIZE; index += 1) {
    let bit = FFT_SIZE >> 1
    while (reversed & bit) { reversed ^= bit; bit >>= 1 }
    reversed ^= bit
    if (index < reversed) {
      ;[real[index], real[reversed]] = [real[reversed], real[index]]
      ;[imaginary[index], imaginary[reversed]] = [imaginary[reversed], imaginary[index]]
    }
  }
  for (let length = 2; length <= FFT_SIZE; length <<= 1) {
    const angle = (-2 * Math.PI) / length
    const stepReal = Math.cos(angle)
    const stepImaginary = Math.sin(angle)
    for (let start = 0; start < FFT_SIZE; start += length) {
      let twiddleReal = 1
      let twiddleImaginary = 0
      for (let index = 0; index < length / 2; index += 1) {
        const even = start + index
        const odd = even + length / 2
        const oddReal = real[odd] * twiddleReal - imaginary[odd] * twiddleImaginary
        const oddImaginary = real[odd] * twiddleImaginary + imaginary[odd] * twiddleReal
        real[odd] = real[even] - oddReal
        imaginary[odd] = imaginary[even] - oddImaginary
        real[even] += oddReal
        imaginary[even] += oddImaginary
        const nextReal = twiddleReal * stepReal - twiddleImaginary * stepImaginary
        twiddleImaginary = twiddleReal * stepImaginary + twiddleImaginary * stepReal
        twiddleReal = nextReal
      }
    }
  }
}

function finalize(): AnalysisSummary {
  if (rawFrames.length === 0) throw new Error('No audio samples could be analyzed.')
  if (durationSeconds <= 0 && totalSamples > 0) durationSeconds = totalSamples / sampleRate
  const framesPerSecond = sampleRate / HOP_SIZE
  const beatResult = estimateBeatGrid(rawFrames, framesPerSecond, durationSeconds)
  const frames = normalizeFrames(rawFrames)
  const events = buildEvents(rawFrames, frames, beatResult, framesPerSecond, durationSeconds)
  const activeDensity = frames.filter((frame) => frame.energy > 0.08).map((frame) => frame.density)
  return {
    durationSeconds,
    estimatedBpm: beatResult.bpm,
    bpmConfidence: beatResult.bpmConfidence,
    firstBeatSeconds: beatResult.firstBeatSeconds,
    firstBeatConfidence: beatResult.firstBeatConfidence,
    meterNumerator: 4,
    meterDenominator: 4,
    averageDensity: activeDensity.length ? activeDensity.reduce((sum, value) => sum + value, 0) / activeDensity.length : 0,
    repetitionSimilarity: estimateRepetitionSimilarity(rawFrames, framesPerSecond),
    frames,
    mode: 'traditional',
    events,
    generatedAt: new Date().toISOString(),
  }
}

interface BeatResult { bpm?: number; bpmConfidence?: number; firstBeatSeconds?: number; firstBeatConfidence?: number; beatPeriod?: number }

function estimateBeatGrid(frames: RawFrame[], framesPerSecond: number, duration: number): BeatResult {
  if (frames.length < framesPerSecond * 1.5) return {}
  const values = frames.map((frame) => frame.flux)
  const minLag = Math.max(2, Math.floor((60 / 200) * framesPerSecond))
  const maxLag = Math.min(Math.floor((60 / 60) * framesPerSecond), Math.floor(values.length / 2))
  const correlations: number[] = []
  const correlationAtLag = new Map<number, number>()
  let bestLag = 0
  let bestCorrelation = 0
  for (let lag = minLag; lag <= maxLag; lag += 1) {
    let cross = 0
    let leftPower = 0
    let rightPower = 0
    for (let index = lag; index < values.length; index += 1) {
      const left = values[index]
      const right = values[index - lag]
      cross += left * right
      leftPower += left * left
      rightPower += right * right
    }
    const correlation = cross / (Math.sqrt(leftPower * rightPower) + 1e-9)
    correlations.push(correlation)
    correlationAtLag.set(lag, correlation)
    if (correlation > bestCorrelation) { bestCorrelation = correlation; bestLag = lag }
  }
  if (!bestLag || bestCorrelation < 0.04) return {}

  // Repeating every other beat often makes half-time look equally plausible.
  // Prefer the faster candidate only when its correlation is essentially tied.
  let selectedLag = bestLag
  let harmonicAmbiguity = false
  while (Math.round(selectedLag / 2) >= minLag) {
    const halfLag = Math.round(selectedLag / 2)
    const halfCorrelation = correlationAtLag.get(halfLag) ?? 0
    if (halfCorrelation < bestCorrelation * 0.96) break
    selectedLag = halfLag
    harmonicAmbiguity = true
  }

  const bpm = 60 * framesPerSecond / selectedLag
  const bpmConfidence = clamp((bestCorrelation - percentile(correlations, 0.5)) * 4 * (harmonicAmbiguity ? 0.65 : 1), 0.08, 0.92)
  const periodFrames = 60 * framesPerSecond / bpm
  const periodSeconds = 60 / bpm
  let bestPhase = 0
  let secondPhaseScore = 0
  let bestPhaseScore = -Infinity
  for (let phase = 0; phase < Math.ceil(periodFrames); phase += 1) {
    let score = 0
    for (let beat = phase; beat < values.length; beat += periodFrames) {
      const center = Math.round(beat)
      let peak = 0
      for (let nearby = Math.max(0, center - 2); nearby <= Math.min(values.length - 1, center + 2); nearby += 1) peak = Math.max(peak, values[nearby])
      score += peak
    }
    if (score > bestPhaseScore) { secondPhaseScore = bestPhaseScore; bestPhaseScore = score; bestPhase = phase }
    else if (score > secondPhaseScore) secondPhaseScore = score
  }

  const beatAccents = [0, 0, 0, 0]
  const beatCounts = [0, 0, 0, 0]
  for (let beat = bestPhase; beat < values.length; beat += periodFrames) {
    const frame = frames[Math.min(frames.length - 1, Math.round(beat))]
    const beatIndex = Math.round((beat - bestPhase) / periodFrames) % 4
    beatAccents[beatIndex] += frame.low + frame.rms * 0.25
    beatCounts[beatIndex] += 1
  }
  const accentScores = beatAccents.map((score, index) => score / Math.max(1, beatCounts[index]))
  const sortedAccents = [...accentScores].sort((left, right) => right - left)
  const accentConfidence = clamp((sortedAccents[0] - sortedAccents[1]) / (sortedAccents[0] + 1e-6), 0, 1)
  const phaseSeconds = (bestPhase * HOP_SIZE) / sampleRate
  const activeThreshold = percentile(frames.map((frame) => frame.rms), 0.35)
  const onsetThreshold = Math.max(percentile(values, 0.7) * 0.22, 0.004)
  let firstBeatSeconds = originSeconds + phaseSeconds
  const candidateCount = Math.ceil((duration - phaseSeconds) / periodSeconds)
  for (let candidateBeat = 0; candidateBeat < candidateCount; candidateBeat += 1) {
    const candidate = phaseSeconds + candidateBeat * periodSeconds
    const index = Math.round(candidate * framesPerSecond)
    const nearbyEnergy = frames.slice(Math.max(0, index - 2), Math.min(frames.length, index + 3)).some((frame) => frame.rms >= activeThreshold)
    const nearbyOnset = values.slice(Math.max(0, index - 2), Math.min(values.length, index + 3)).some((value) => value >= onsetThreshold)
    if (nearbyEnergy && nearbyOnset) { firstBeatSeconds = originSeconds + candidate; break }
  }
  const phaseConfidence = clamp((bestPhaseScore - Math.max(0, secondPhaseScore)) / (bestPhaseScore + 1e-6), 0, 1)
  const firstBeatConfidence = clamp((0.45 * bpmConfidence + 0.3 * phaseConfidence + 0.25 * accentConfidence) * 0.8, 0.05, 0.85)
  return { bpm: Math.round(bpm), bpmConfidence, firstBeatSeconds, firstBeatConfidence, beatPeriod: periodSeconds }
}

function normalizeFrames(frames: RawFrame[]): AnalysisFrame[] {
  const stride = Math.max(1, Math.ceil(frames.length / 6000))
  const sampled: RawFrame[] = []
  const sampledIndices: number[] = []
  for (let index = 0; index < frames.length; index += stride) { sampled.push(frames[index]); sampledIndices.push(index) }
  const scale = (values: number[]) => Math.max(percentile(values, 0.98), 1e-8)
  const rmsScale = scale(sampled.map((frame) => frame.rms))
  const lowScale = scale(sampled.map((frame) => frame.low))
  const midScale = scale(sampled.map((frame) => frame.mid))
  const highScale = scale(sampled.map((frame) => frame.high))
  const fluxScale = scale(sampled.map((frame) => frame.flux))
  const peakThreshold = Math.max(percentile(frames.map((frame) => frame.flux), 0.72) * 0.65, 0.008)
  const peakIndices: number[] = []
  for (let index = 1; index < frames.length - 1; index += 1) {
    if (frames[index].flux >= peakThreshold && frames[index].flux >= frames[index - 1].flux && frames[index].flux > frames[index + 1].flux) peakIndices.push(index)
  }
  const radius = Math.max(1, Math.round(sampleRate / HOP_SIZE / 2))
  let lowPeak = 0
  let highPeak = 0
  const densityCounts = sampledIndices.map((sourceIndex) => {
    while (lowPeak < peakIndices.length && peakIndices[lowPeak] < sourceIndex - radius) lowPeak += 1
    if (highPeak < lowPeak) highPeak = lowPeak
    while (highPeak < peakIndices.length && peakIndices[highPeak] <= sourceIndex + radius) highPeak += 1
    return highPeak - lowPeak
  })
  const maximumDensity = Math.max(1, densityCounts.reduce((max, value) => Math.max(max, value), 1))
  return sampled.map((frame, index) => ({
    timestamp: Number(frame.timestamp.toFixed(3)),
    energy: clamp(frame.rms / rmsScale, 0, 1),
    lowEnergy: clamp(frame.low / lowScale, 0, 1),
    midEnergy: clamp(frame.mid / midScale, 0, 1),
    highEnergy: clamp(frame.high / highScale, 0, 1),
    onsetStrength: clamp(frame.flux / fluxScale, 0, 1),
    density: clamp(densityCounts[index] / maximumDensity, 0, 1),
    melodyMidi: frame.melodyConfidence && frame.melodyConfidence >= 0.12 ? frame.melodyMidi : undefined,
    melodyConfidence: clamp(frame.melodyConfidence ?? 0, 0, 1),
  }))
}

function estimateRepetitionSimilarity(frames: RawFrame[], framesPerSecond: number): number | undefined {
  if (frames.length < framesPerSecond * 8) return undefined
  const minLag = Math.floor(framesPerSecond * 4)
  const maxLag = Math.min(Math.floor(framesPerSecond * 24), Math.floor(frames.length * 0.75))
  let best = 0
  for (let lag = minLag; lag <= maxLag; lag += Math.max(1, Math.floor(framesPerSecond))) {
    let cross = 0
    let leftPower = 0
    let rightPower = 0
    let samples = 0
    for (let index = 0; index + lag < frames.length; index += 4) {
      const left = frames[index].flux
      const right = frames[index + lag].flux
      cross += left * right
      leftPower += left * left
      rightPower += right * right
      samples += 1
    }
    if (samples > 20) best = Math.max(best, cross / (Math.sqrt(leftPower * rightPower) + 1e-9))
  }
  return clamp(best, 0, 1)
}

function buildEvents(raw: RawFrame[], normalized: AnalysisFrame[], beat: BeatResult, framesPerSecond: number, duration: number): AnalysisEvent[] {
  const events: AnalysisEvent[] = []
  let id = 0
  if (beat.bpm && beat.beatPeriod && beat.firstBeatSeconds !== undefined) {
    let beatNumber = 0
    for (let timestamp = beat.firstBeatSeconds; timestamp < duration; timestamp += beat.beatPeriod) {
      const downbeat = beatNumber % 4 === 0
      const frameIndex = Math.min(normalized.length - 1, Math.round(timestamp * framesPerSecond * normalized.length / raw.length))
      events.push({ id: `dsp-${id++}`, timestamp: Number(timestamp.toFixed(3)), duration: 0.08, type: downbeat ? 'downbeat' : 'beat', source: 'traditional-dsp', confidence: downbeat ? beat.firstBeatConfidence : beat.bpmConfidence, energy: normalized[frameIndex]?.energy ?? 0, analysisMode: 'traditional' })
      beatNumber += 1
    }
  }

  const fluxValues = raw.map((frame) => frame.flux)
  const onsetThreshold = Math.max(percentile(fluxValues, 0.72) * 0.65, 0.008)
  let lastTransient = -1
  for (let index = 2; index < raw.length - 2; index += 1) {
    const current = raw[index]
    if (current.flux >= onsetThreshold && current.flux >= raw[index - 1].flux && current.flux > raw[index + 1].flux && current.timestamp - lastTransient >= 0.09) {
      const frameIndex = Math.min(normalized.length - 1, Math.floor(index * normalized.length / raw.length))
      events.push({ id: `dsp-${id++}`, timestamp: Number(current.timestamp.toFixed(3)), type: 'transient', source: 'traditional-dsp', confidence: clamp(current.flux / (onsetThreshold * 2), 0.1, 0.85), energy: normalized[frameIndex]?.energy, analysisMode: 'traditional' })
      lastTransient = current.timestamp
    }
  }

  const silenceThreshold = Math.max(percentile(raw.map((frame) => frame.rms), 0.9) * 0.025, 0.001)
  let silentStart: number | null = null
  raw.forEach((frame, index) => {
    if (frame.rms < silenceThreshold) silentStart ??= frame.timestamp
    else if (silentStart !== null) {
      const silenceDuration = frame.timestamp - silentStart
      if (silenceDuration >= 0.3) events.push({ id: `dsp-${id++}`, timestamp: Number(silentStart.toFixed(3)), duration: Number(silenceDuration.toFixed(3)), type: 'silence', source: 'traditional-dsp', confidence: 0.65, energy: 0, analysisMode: 'traditional' })
      silentStart = null
    }
    if (index > 4 && index % 5 === 0) {
      const change = frame.rms - raw[index - 5].rms
      if (Math.abs(change) > Math.max(silenceThreshold * 2, 0.015)) {
        const frameIndex = Math.min(normalized.length - 1, Math.floor(index * normalized.length / raw.length))
        events.push({ id: `dsp-${id++}`, timestamp: Number(frame.timestamp.toFixed(3)), type: 'energy-change', source: 'traditional-dsp', confidence: 0.5, energy: normalized[frameIndex]?.energy, analysisMode: 'traditional' })
      }
    }
  })
  const trailingSilenceStart = silentStart as number | null
  if (trailingSilenceStart !== null && duration - trailingSilenceStart >= 0.3) events.push({ id: `dsp-${id++}`, timestamp: Number(trailingSilenceStart.toFixed(3)), duration: Number((duration - trailingSilenceStart).toFixed(3)), type: 'silence', source: 'traditional-dsp', confidence: 0.65, energy: 0, analysisMode: 'traditional' })
  return events.sort((left, right) => left.timestamp - right.timestamp)
}

function percentile(values: number[], fraction: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * fraction))]
}

function clamp(value: number, minimum: number, maximum: number): number { return Math.min(maximum, Math.max(minimum, value)) }
