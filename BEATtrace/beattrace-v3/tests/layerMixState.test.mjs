import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildSync } from 'esbuild'

const bundled = buildSync({ entryPoints: ['src/audio/layerMixState.ts'], bundle: true, platform: 'node', format: 'esm', write: false })
const { withLayerVolume, muteLayer, toggleLayerMute, effectiveLayerVolume } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].contents).toString('base64')}`)

test('manual mute reads as 0% and restores the saved level', () => {
  const initial = { volume: 0.64, lastNonZeroVolume: 0.64, muted: false }
  const muted = toggleLayerMute(initial)
  assert.equal(muted.volume, 0)
  assert.equal(effectiveLayerVolume(muted, 'drums', null), 0)
  assert.equal(toggleLayerMute(muted).volume, 0.64)
  assert.deepEqual(withLayerVolume(muted, 0.42), { volume: 0.42, lastNonZeroVolume: 0.42, muted: false })
  assert.equal(withLayerVolume(initial, 0).muted, true)
})

test('solo temporarily silences other layers without changing their saved states', () => {
  const drums = { volume: 0.64, lastNonZeroVolume: 0.64, muted: false }
  const bass = { volume: 0.42, lastNonZeroVolume: 0.42, muted: false }
  const mutedVocals = muteLayer({ volume: 0.55, lastNonZeroVolume: 0.55, muted: false })
  assert.equal(effectiveLayerVolume(drums, 'drums', 'drums'), 0.64)
  assert.equal(effectiveLayerVolume(bass, 'bass', 'drums'), 0)
  assert.equal(effectiveLayerVolume(bass, 'bass', null), 0.42)
  assert.equal(effectiveLayerVolume(mutedVocals, 'vocals', 'vocals'), 0.55)
  assert.equal(effectiveLayerVolume(mutedVocals, 'vocals', null), 0)
})
