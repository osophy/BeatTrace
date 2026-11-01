export const COUNT_WORDS = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'] as const
export type CountWord = typeof COUNT_WORDS[number]

export function countPattern(step: number, subdivision: 1 | 2 | 4): { word: CountWord | null; isStrong: boolean } {
  const beat = Math.floor(step / subdivision)
  const onBeat = step % subdivision === 0
  return {
    word: onBeat ? COUNT_WORDS[beat % COUNT_WORDS.length] : null,
    isStrong: onBeat && beat % 4 === 0,
  }
}

export async function loadCountBuffers(context: BaseAudioContext, signal?: AbortSignal): Promise<Record<CountWord, AudioBuffer>> {
  const entries = await Promise.all(COUNT_WORDS.map(async (word) => {
    const response = await fetch(new URL(`audio/counts/${word}.wav`, document.baseURI), { signal })
    if (!response.ok) throw new Error(`Could not load ${word} count audio.`)
    return [word, await context.decodeAudioData(await response.arrayBuffer())] as const
  }))
  return Object.fromEntries(entries) as Record<CountWord, AudioBuffer>
}

/** A short, damped woodblock-like tap with a noisy attack instead of a pure tone. */
export function makeMetronomeBuffers(context: BaseAudioContext): { regular: AudioBuffer; accent: AudioBuffer } {
  const create = (accent: boolean) => {
    const sampleRate = context.sampleRate
    const length = Math.ceil(sampleRate * (accent ? 0.078 : 0.062))
    const buffer = context.createBuffer(1, length, sampleRate)
    const samples = buffer.getChannelData(0)
    const low = accent ? 1180 : 950
    const high = accent ? 2330 : 1840
    let seed = accent ? 0x48a9 : 0x2b73
    let previousNoise = 0
    for (let i = 0; i < length; i += 1) {
      const time = i / sampleRate
      seed = (seed * 1664525 + 1013904223) >>> 0
      const noise = seed / 0xffffffff * 2 - 1
      const attack = 1 - Math.exp(-time * 2500)
      const body = Math.sin(2 * Math.PI * low * time) * Math.exp(-time * 72)
        + 0.42 * Math.sin(2 * Math.PI * high * time) * Math.exp(-time * 105)
      const tap = (noise - previousNoise * 0.65) * Math.exp(-time * 165) * 0.38
      previousNoise = noise
      samples[i] = attack * (body + tap)
    }
    const peak = samples.reduce((value, sample) => Math.max(value, Math.abs(sample)), 0)
    if (peak > 0) for (let i = 0; i < length; i += 1) samples[i] = samples[i] / peak * 0.82
    return buffer
  }
  return { regular: create(false), accent: create(true) }
}
