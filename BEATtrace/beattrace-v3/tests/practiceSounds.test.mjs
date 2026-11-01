import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { buildSync } from 'esbuild'

const bundled = buildSync({ entryPoints: ['src/audio/practiceSounds.ts'], bundle: true, platform: 'node', format: 'esm', write: false })
const { COUNT_WORDS, countPattern } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].contents).toString('base64')}`)

test('voice counts one through eight on beats only, including with metronome subdivisions', () => {
  assert.deepEqual(COUNT_WORDS, ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'])
  for (const subdivision of [1, 2, 4]) {
    const steps = Array.from({ length: subdivision * 16 }, (_, step) => countPattern(step, subdivision))
    assert.deepEqual(steps.map((item) => item.word).filter(Boolean), [...COUNT_WORDS, ...COUNT_WORDS])
    assert.equal(steps.filter((item) => item.word === null).length, 16 * (subdivision - 1))
    assert.deepEqual(steps.map((item, index) => item.isStrong ? index : null).filter((index) => index !== null), [0, 4, 8, 12].map((beat) => beat * subdivision))
  }
})

test('all eight bundled count clips are short, nonempty WAV files', async () => {
  for (const word of COUNT_WORDS) {
    const bytes = await readFile(`public/audio/counts/${word}.wav`)
    assert.equal(bytes.toString('ascii', 0, 4), 'RIFF')
    assert.equal(bytes.toString('ascii', 8, 12), 'WAVE')
    const sampleRate = bytes.readUInt32LE(24)
    const dataBytes = bytes.readUInt32LE(40)
    assert.ok(dataBytes > 0 && dataBytes / (sampleRate * 2) < 0.5, `${word} duration`)
  }
})
