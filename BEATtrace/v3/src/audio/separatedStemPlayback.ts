import type { SeparatedStem, SeparatedStemId } from '../analysis/demucsAdapter'
import type { StemActivityInterval } from '../domain/musicTimeline'
import type { LayerAudioState } from './layerMixState'
import { effectiveStemVolume } from './stemMixState'

type StemState = { buffer: AudioBuffer; gain: GainNode } & LayerAudioState

/** Plays model stems against the original media element's shared playhead. */
export class SeparatedStemPlayback {
  private readonly stems = new Map<SeparatedStemId, StemState>()
  private activeSources: AudioBufferSourceNode[] = []
  private enabled = false
  private disposed = false
  private masterVolume = 1
  private solo: SeparatedStemId | null = null
  private readonly onPlay = () => { if (this.enabled) void this.startAtMediaTime() }
  private readonly onPause = () => this.stopSources()
  private readonly onSeeking = () => this.stopSources()
  private readonly onSeeked = () => { if (this.enabled && !this.media.paused) void this.startAtMediaTime() }
  private readonly onRateChange = () => { if (this.enabled && !this.media.paused) void this.startAtMediaTime() }

  constructor(private readonly media: HTMLMediaElement, private readonly context: AudioContext) {
    media.addEventListener('play', this.onPlay)
    media.addEventListener('pause', this.onPause)
    media.addEventListener('ended', this.onPause)
    media.addEventListener('seeking', this.onSeeking)
    media.addEventListener('seeked', this.onSeeked)
    media.addEventListener('ratechange', this.onRateChange)
  }

  async load(stems: SeparatedStem[]) {
    this.clearBuffers()
    for (const stem of stems) {
      const response = await fetch(stem.url)
      if (!response.ok) throw new Error(`Could not load the ${stem.label} stem.`)
      const buffer = await this.context.decodeAudioData(await response.arrayBuffer())
      const gain = this.context.createGain()
      gain.connect(this.context.destination)
      this.stems.set(stem.id, { buffer, gain, volume: 0.75, lastNonZeroVolume: 0.75, muted: false })
      this.applyGain(stem.id)
    }
    if (this.enabled && !this.media.paused) await this.startAtMediaTime()
  }

  get available() { return this.stems.size > 0 }

  /** A lightweight RMS activity estimate over actual model output, not source-presence classification. */
  getActivityIntervals(): StemActivityInterval[] {
    const intervals: StemActivityInterval[] = []
    for (const [stemId, stem] of this.stems) {
      const buffer = stem.buffer
      const hop = Math.max(1, Math.round(buffer.sampleRate * 0.1))
      const channels = Array.from({ length: buffer.numberOfChannels }, (_, index) => buffer.getChannelData(index))
      const rms: number[] = []
      for (let start = 0; start < buffer.length; start += hop) {
        let power = 0
        const end = Math.min(buffer.length, start + hop)
        for (let index = start; index < end; index += 2) for (const channel of channels) power += channel[index] * channel[index]
        rms.push(Math.sqrt(power / Math.max(1, Math.ceil((end - start) / 2) * channels.length)))
      }
      const peak = rms.reduce((maximum, value) => Math.max(maximum, value), 0)
      if (peak < 0.005) continue
      const threshold = Math.max(0.005, peak * 0.14)
      let start = -1
      let strength = 0
      for (let index = 0; index <= rms.length; index += 1) {
        const active = index < rms.length && rms[index] >= threshold
        if (active && start < 0) { start = index; strength = 0 }
        if (active) strength = Math.max(strength, rms[index] / peak)
        if (!active && start >= 0) {
          const end = index
          if (end - start >= 2) intervals.push({ stem: stemId, startSeconds: start * hop / buffer.sampleRate, endSeconds: Math.min(buffer.duration, end * hop / buffer.sampleRate), strength })
          start = -1
        }
      }
    }
    return intervals
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled
    if (enabled && !this.media.paused) void this.startAtMediaTime()
    else this.stopSources()
  }

  setStemState(id: SeparatedStemId, state: LayerAudioState) {
    const stem = this.stems.get(id)
    if (stem) {
      stem.volume = state.volume
      stem.lastNonZeroVolume = state.lastNonZeroVolume
      stem.muted = state.muted
      this.applyGain(id)
    }
  }

  setSolo(id: SeparatedStemId | null) {
    this.solo = id
    for (const stemId of this.stems.keys()) this.applyGain(stemId)
  }

  setMasterVolume(value: number) {
    this.masterVolume = Math.max(0, Math.min(1, value))
    for (const id of this.stems.keys()) this.applyGain(id)
  }

  private applyGain(id: SeparatedStemId) {
    const stem = this.stems.get(id)
    if (!stem) return
    const level = effectiveStemVolume(stem, id, this.solo)
    stem.gain.gain.setTargetAtTime(level * this.masterVolume, this.context.currentTime, 0.015)
  }

  private async startAtMediaTime() {
    this.stopSources()
    if (this.disposed || !this.enabled || this.media.paused) return
    await this.context.resume().catch(() => undefined)
    const offset = Math.max(0, this.media.currentTime)
    for (const stem of this.stems.values()) {
      if (offset >= stem.buffer.duration) continue
      const source = this.context.createBufferSource()
      source.buffer = stem.buffer
      source.playbackRate.value = this.media.playbackRate
      source.connect(stem.gain)
      source.start(0, offset)
      this.activeSources.push(source)
    }
  }

  private stopSources() {
    for (const source of this.activeSources) {
      try { source.stop() } catch { /* already stopped */ }
      source.disconnect()
    }
    this.activeSources = []
  }

  private clearBuffers() {
    this.stopSources()
    for (const stem of this.stems.values()) stem.gain.disconnect()
    this.stems.clear()
  }

  async dispose() {
    this.disposed = true
    this.enabled = false
    this.media.removeEventListener('play', this.onPlay)
    this.media.removeEventListener('pause', this.onPause)
    this.media.removeEventListener('ended', this.onPause)
    this.media.removeEventListener('seeking', this.onSeeking)
    this.media.removeEventListener('seeked', this.onSeeked)
    this.media.removeEventListener('ratechange', this.onRateChange)
    this.clearBuffers()
  }
}
