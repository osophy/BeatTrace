import type { LayerId } from '../analysis/layers'

export interface LayerAudioState {
  volume: number
  lastNonZeroVolume: number
  muted: boolean
}

function clamp(value: number) {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0
}

export function withLayerVolume<T extends LayerAudioState>(state: T, value: number): T {
  const volume = clamp(value)
  return { ...state, volume, muted: volume === 0, lastNonZeroVolume: volume > 0 ? volume : state.lastNonZeroVolume }
}

export function muteLayer<T extends LayerAudioState>(state: T): T {
  return { ...state, volume: 0, muted: true, lastNonZeroVolume: state.volume > 0 ? state.volume : state.lastNonZeroVolume }
}

export function toggleLayerMute<T extends LayerAudioState>(state: T): T {
  return state.muted || state.volume === 0
    ? withLayerVolume(state, state.lastNonZeroVolume || 0.3)
    : muteLayer(state)
}

export function effectiveLayerVolume(state: LayerAudioState, id: LayerId, solo: LayerId | null): number {
  if (solo && solo !== id) return 0
  if (solo === id) return state.volume > 0 ? state.volume : state.lastNonZeroVolume
  return state.muted ? 0 : state.volume
}
