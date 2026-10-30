import type { LayerId } from '../analysis/layers'

export type MixMode = 'original' | 'layers'

const filters: Record<LayerId, { type: BiquadFilterType; frequency: number; q: number }> = {
  drums: { type: 'bandpass', frequency: 920, q: 0.65 },
  bass: { type: 'lowpass', frequency: 180, q: 0.7 },
  melody: { type: 'bandpass', frequency: 920, q: 0.55 },
  vocals: { type: 'bandpass', frequency: 1350, q: 0.8 },
  effects: { type: 'highpass', frequency: 2300, q: 0.7 },
}

/** Frequency-filtered practice branches share one media clock; they are not isolated stems. */
export class LayerAudioGraph {
  private readonly context: AudioContext
  private readonly source: MediaElementAudioSourceNode
  private readonly originalGain: GainNode
  private readonly layerGains = new Map<LayerId, GainNode>()
  private readonly compressor: DynamicsCompressorNode
  private readonly volumes = new Map<LayerId, number>()
  private readonly muted = new Map<LayerId, boolean>()
  private solo: LayerId | null = null
  private mode: MixMode = 'original'

  constructor(media: HTMLMediaElement, masterVolume: number) {
    this.context = new AudioContext()
    this.source = this.context.createMediaElementSource(media)
    this.originalGain = this.context.createGain()
    this.compressor = this.context.createDynamicsCompressor()
    this.compressor.threshold.value = -6
    this.compressor.knee.value = 7
    this.compressor.ratio.value = 8
    this.compressor.attack.value = 0.004
    this.compressor.release.value = 0.12
    this.originalGain.gain.value = 1
    this.source.connect(this.originalGain).connect(this.compressor)
    for (const [id, config] of Object.entries(filters) as Array<[LayerId, typeof filters[LayerId]]>) {
      const filter = this.context.createBiquadFilter()
      filter.type = config.type
      filter.frequency.value = config.frequency
      filter.Q.value = config.q
      const gain = this.context.createGain()
      gain.gain.value = 0
      this.source.connect(filter).connect(gain).connect(this.compressor)
      this.layerGains.set(id, gain)
      this.volumes.set(id, 0.3)
      this.muted.set(id, false)
    }
    this.compressor.connect(this.context.destination)
    this.context.resume().catch(() => undefined)
    media.volume = 1
    this.setMasterVolume(masterVolume)
    this.applyMode()
  }

  setMasterVolume(value: number) {
    // Keep the familiar music-volume control as a master for both mix modes.
    this.masterVolume = clamp(value, 0, 1)
    this.applyMode()
  }

  private masterVolume = 0.45

  setMode(mode: MixMode) {
    this.mode = mode
    this.applyMode()
  }

  setLayerVolume(id: LayerId, value: number) {
    this.volumes.set(id, clamp(value, 0, 1))
    this.applyLayerGains()
  }

  setMuted(id: LayerId, muted: boolean) {
    this.muted.set(id, muted)
    this.applyLayerGains()
  }

  setSolo(id: LayerId | null) {
    this.solo = this.solo === id ? null : id
    this.applyLayerGains()
    return this.solo
  }

  private applyMode() {
    const now = this.context.currentTime
    this.originalGain.gain.setTargetAtTime(this.mode === 'original' ? this.masterVolume : 0, now, 0.02)
    this.applyLayerGains()
  }

  private applyLayerGains() {
    const now = this.context.currentTime
    for (const [id, gain] of this.layerGains) {
      const allowed = this.mode === 'layers' && !this.muted.get(id) && (!this.solo || this.solo === id)
      gain.gain.setTargetAtTime(allowed ? this.masterVolume * (this.volumes.get(id) ?? 0) * 0.52 : 0, now, 0.025)
    }
  }

  async dispose() {
    this.source.disconnect()
    this.originalGain.disconnect()
    this.compressor.disconnect()
    for (const gain of this.layerGains.values()) gain.disconnect()
    await this.context.close().catch(() => undefined)
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min))
}
