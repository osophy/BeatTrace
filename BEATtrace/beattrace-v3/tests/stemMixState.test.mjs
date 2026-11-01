import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildSync } from 'esbuild'

const bundled = buildSync({ entryPoints: ['src/audio/stemMixState.ts'], bundle: true, platform: 'node', format: 'esm', write: false })
const { defaultStemControls, effectiveStemVolume } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].contents).toString('base64')}`)

test('AI stems have four independent default controls', () => {
  const controls = defaultStemControls()
  assert.deepEqual(Object.keys(controls), ['vocals', 'drums', 'bass', 'other'])
  controls.vocals.volume = 0.2
  assert.equal(controls.drums.volume, 0.75)
})

test('AI Solo suppresses other stems without erasing their saved settings', () => {
  const controls = defaultStemControls()
  controls.bass.volume = 0.4
  assert.equal(effectiveStemVolume(controls.bass, 'bass', 'vocals'), 0)
  assert.equal(effectiveStemVolume(controls.bass, 'bass', null), 0.4)
  controls.vocals = { volume: 0, lastNonZeroVolume: 0.6, muted: true }
  assert.equal(effectiveStemVolume(controls.vocals, 'vocals', 'vocals'), 0.6)
  assert.equal(effectiveStemVolume(controls.vocals, 'vocals', null), 0)
})
