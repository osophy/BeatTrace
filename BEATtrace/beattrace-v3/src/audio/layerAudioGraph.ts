import type { LayerId } from '../analysis/layers'
import { effectiveLayerVolume, type LayerAudioState } from './layerMixState'

export type MixMode = 'original' | 'layers' | 'separated'

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
  private readonly layerStates = new Map<LayerId, LayerAudioState>()
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
      this.layerStates.set(id, { volume: 0.3, lastNonZeroVolume: 0.3, muted: false })
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

  getAudioContext() { return this.context }

  private masterVolume = 0.45

  setMode(mode: MixMode) {
    this.mode = mode
    this.applyMode()
  }

  setLayerState(id: LayerId, state: LayerAudioState) {
    this.layerStates.set(id, { volume: state.volume, lastNonZeroVolume: state.lastNonZeroVolume, muted: state.muted })
    this.applyLayerGains()
  }

  setSolo(id: LayerId | null) {
    this.solo = id
    this.applyLayerGains()
  }

  private applyMode() {
    const now = this.context.currentTime
    this.originalGain.gain.setTargetAtTime(this.mode === 'original' ? this.masterVolume : 0, now, 0.02)
    this.applyLayerGains()
  }

  private applyLayerGains() {
    const now = this.context.currentTime
    for (const [id, gain] of this.layerGains) {
      const state = this.layerStates.get(id)
      const level = this.mode === 'layers' && state ? effectiveLayerVolume(state, id, this.solo) : 0
      gain.gain.setTargetAtTime(this.masterVolume * level * 0.52, now, 0.025)
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
