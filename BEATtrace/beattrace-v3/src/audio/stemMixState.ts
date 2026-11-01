import type { SeparatedStemId } from '../analysis/demucsAdapter'
import type { LayerAudioState } from './layerMixState'

export type StemControl = LayerAudioState

export function defaultStemControls(): Record<SeparatedStemId, StemControl> {
  return Object.fromEntries((['vocals', 'drums', 'bass', 'other'] as const).map((id) => [id, { muted: false, volume: 0.75, lastNonZeroVolume: 0.75 }])) as Record<SeparatedStemId, StemControl>
}

export function effectiveStemVolume(state: StemControl, id: SeparatedStemId, solo: SeparatedStemId | null): number {
  if (solo && solo !== id) return 0
  if (solo === id) return state.volume || state.lastNonZeroVolume
  return state.muted ? 0 : state.volume
}
