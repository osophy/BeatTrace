/**
 * Deterministic procedural syllable samples for the practice guide.
 * This is a deliberately synthetic, formant-shaped voice-like timbre: no speech
 * model, browser speech synthesis, system TTS, network call, or voice recording.
 */
export type CountSyllable = 'one' | 'two' | 'three' | 'four' | 'and' | 'ee' | 'a' | 'ta'

const syllableSpecs: Record<CountSyllable, { duration: number; formants: [number, number, number]; consonant: 'none' | 'stop' | 'fricative'; pitch: [number, number] }> = {
  one: { duration: 0.235, formants: [610, 1180, 2500], consonant: 'none', pitch: [142, 116] },
  two: { duration: 0.215, formants: [340, 890, 2250], consonant: 'stop', pitch: [145, 120] },
  three: { duration: 0.23, formants: [320, 2180, 2850], consonant: 'fricative', pitch: [148, 119] },
  four: { duration: 0.23, formants: [520, 1050, 2350], consonant: 'fricative', pitch: [144, 112] },
  and: { duration: 0.16, formants: [670, 1660, 2580], consonant: 'none', pitch: [138, 114] },
  ee: { duration: 0.13, formants: [300, 2290, 3000], consonant: 'none', pitch: [142, 118] },
  a: { duration: 0.13, formants: [560, 1320, 2520], consonant: 'none', pitch: [140, 116] },
  ta: { duration: 0.145, formants: [730, 1280, 2580], consonant: 'stop', pitch: [145, 118] },
}

const countSyllables = Object.keys(syllableSpecs) as CountSyllable[]

export function makeFakeCountBuffers(context: BaseAudioContext): Record<CountSyllable, AudioBuffer> {
  return Object.fromEntries(countSyllables.map((syllable) => {
    const spec = syllableSpecs[syllable]
    const length = Math.ceil(context.sampleRate * spec.duration)
    const samples = synthesizeSyllable(syllable, context.sampleRate, length)
    const buffer = context.createBuffer(1, length, context.sampleRate)
    buffer.getChannelData(0).set(samples)
    return [syllable, buffer]
  })) as Record<CountSyllable, AudioBuffer>
}

export function countPattern(step: number, subdivision: 1 | 2 | 4): { syllable: CountSyllable; isBeat: boolean; isStrong: boolean } {
  const beat = Math.floor(step / subdivision) % 4
  const withinBeat = step % subdivision
  if (subdivision === 1) {
    const syllable = (['one', 'two', 'three', 'four'] as const)[beat]
    return { syllable, isBeat: true, isStrong: beat === 0 }
  }
  if (subdivision === 2) {
    if (withinBeat === 0) {
      const syllable = (['one', 'two', 'three', 'four'] as const)[beat]
      return { syllable, isBeat: true, isStrong: beat === 0 }
    }
    return { syllable: 'and', isBeat: false, isStrong: false }
  }
  const sixteenth: CountSyllable[] = ['one', 'ee', 'and', 'a']
  return { syllable: sixteenth[withinBeat], isBeat: withinBeat === 0, isStrong: beat === 0 && withinBeat === 0 }
}

export function makeTaPattern(step: number, subdivision: 1 | 2 | 4): { syllable: CountSyllable; isBeat: boolean; isStrong: boolean } {
  const beat = Math.floor(step / subdivision) % 4
  const withinBeat = step % subdivision
  if (withinBeat === 0) {
    const syllable = (['one', 'two', 'three', 'four'] as const)[beat]
    return { syllable, isBeat: true, isStrong: beat === 0 }
  }
  return { syllable: 'ta', isBeat: false, isStrong: false }
}

function synthesizeSyllable(syllable: CountSyllable, sampleRate: number, length: number): Float32Array {
  const { duration, formants, consonant, pitch } = syllableSpecs[syllable]
  const output = new Float32Array(length)
  const voicedStart = consonant === 'stop' ? 0.012 : consonant === 'fricative' ? 0.034 : 0
  const voicedDuration = Math.max(0.04, duration - voicedStart)
  const formantBandwidth = [115, 175, 240]
  const harmonicCount = Math.min(40, Math.floor((sampleRate * 0.48) / pitch[0]))
  const centerPitch = (pitch[0] + pitch[1]) / 2
  const harmonicLevels = Array.from({ length: harmonicCount + 1 }, (_, harmonic) => {
    if (harmonic === 0) return 0
    const frequency = centerPitch * harmonic
    const spectralShape = formants.reduce((sum, formant, formantIndex) => {
      const distance = (frequency - formant) / formantBandwidth[formantIndex]
      return sum + Math.exp(-0.5 * distance * distance) / (1 + formantIndex * 0.35)
    }, 0)
    return spectralShape / Math.pow(harmonic, 0.72)
  })
  let seed = 0x5eed + countSyllables.indexOf(syllable) * 997

  for (let index = 0; index < length; index += 1) {
    const time = index / sampleRate
    const normalizedTime = time / duration
    const voicedTime = Math.max(0, time - voicedStart)
    const voiceProgress = Math.min(1, voicedTime / voicedDuration)
    const fundamental = pitch[0] + (pitch[1] - pitch[0]) * voiceProgress + Math.sin(time * 2 * Math.PI * 5.2) * 1.6
    const attack = Math.min(1, voicedTime / 0.012)
    const release = Math.min(1, Math.max(0, (duration - time) / 0.026))
    let voiced = 0

    for (let harmonic = 1; harmonic <= harmonicCount; harmonic += 1) {
      const frequency = fundamental * harmonic
      voiced += Math.sin((2 * Math.PI * frequency * time) + 0.035 * Math.sin(time * 13)) * harmonicLevels[harmonic]
    }

    let noise = 0
    if ((consonant === 'stop' && time < voicedStart) || (consonant === 'fricative' && time < voicedStart)) {
      seed = (seed * 1664525 + 1013904223) >>> 0
      const random = (seed / 0xffffffff) * 2 - 1
      const consonantEnvelope = consonant === 'stop'
        ? Math.max(0, 1 - time / voicedStart) ** 2
        : Math.sin(Math.PI * Math.min(1, time / voicedStart)) ** 0.6
      noise = random * consonantEnvelope * (consonant === 'stop' ? 0.42 : 0.28)
    }

    const syllableShape = syllable === 'one' || syllable === 'and' ? 0.92 - 0.16 * normalizedTime : 1
    output[index] = Math.tanh((voiced * 0.22 + noise) * attack * release * syllableShape)
  }

  let peak = 0
  for (const value of output) peak = Math.max(peak, Math.abs(value))
  if (peak > 0) for (let index = 0; index < output.length; index += 1) output[index] *= 0.88 / peak
  return output
}
