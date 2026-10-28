import { isAudioFile, isMp4Video, isVideoFile, validateAudioFile } from './fileValidation'

export type MediaFailureKind = 'empty' | 'too-large' | 'unsupported' | 'missing-audio' | 'corrupt' | 'decode' | 'playback'

export class MediaFailure extends Error {
  constructor(readonly kind: MediaFailureKind, message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'MediaFailure'
  }
}

export type MediaLoadStep = 'checking' | 'extracting' | 'loading'

export interface LocalMediaSession {
  readonly element: HTMLAudioElement | HTMLVideoElement
  readonly objectUrl: string
  readonly duration: number
  readonly isVideoContainer: boolean
  dispose(): void
}

function abortIfNeeded(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException('Loading cancelled', 'AbortError')
}

function translateValidationError(code: ReturnType<typeof validateAudioFile>): MediaFailure | null {
  if (!code) return null
  const messages: Record<typeof code, string> = {
    empty: 'This file is empty. Choose an audio file with content.',
    'too-large': 'This file is larger than 500 MB. Choose a smaller file.',
    unsupported: 'This file type is not supported. Choose an audio file or a supported video.',
  }
  return new MediaFailure(code, messages[code])
}

async function inspectAndDecodeVideoAudio(file: File, signal?: AbortSignal) {
  const { AudioSampleSink, BlobSource, Input, MATROSKA, MP4, WEBM } = await import('mediabunny')
  const extension = file.name.split('.').pop()?.toLowerCase()
  const mimeType = file.type.toLowerCase()
  const format = extension === 'webm' || mimeType.includes('webm')
    ? WEBM
    : extension === 'mkv' || mimeType.includes('matroska')
      ? MATROSKA
      : isMp4Video(file) || ['mov', 'm4v'].includes(extension ?? '') || mimeType.includes('quicktime')
        ? MP4
        : null
  if (!format) {
    throw new MediaFailure('unsupported', 'This video container is not supported for local audio extraction.')
  }
  const input = new Input({ source: new BlobSource(file), formats: [format] })
  try {
    abortIfNeeded(signal)
    const audioTrack = await input.getPrimaryAudioTrack()
    if (!audioTrack) {
      throw new MediaFailure('missing-audio', 'This video does not contain an audio track. Choose a video with sound.')
    }
    if (!(await audioTrack.canDecode())) {
      throw new MediaFailure('decode', 'This video has an audio track, but this browser cannot decode its audio format.')
    }
    abortIfNeeded(signal)
    const sink = new AudioSampleSink(audioTrack)
    const firstTimestamp = await audioTrack.getFirstTimestamp()
    const sample = await sink.getSample(Math.max(0, firstTimestamp))
    if (!sample) {
      throw new MediaFailure('corrupt', 'The audio track could not be read. The file may be incomplete or corrupted.')
    }
    try {
      // Force one real audio decode before making the file available for playback.
      const decoded = sample.toAudioBuffer()
      if (decoded.length === 0 || decoded.numberOfChannels === 0) {
        throw new MediaFailure('decode', 'The audio track could not be decoded in this browser.')
      }
    } finally {
      sample.close()
    }
  } catch (error) {
    if (error instanceof MediaFailure || (error instanceof DOMException && error.name === 'AbortError')) throw error
    throw new MediaFailure('corrupt', 'The video could not be read. It may be unsupported or corrupted.', { cause: error })
  } finally {
    input.dispose()
  }
}

export function mediaErrorForElement(element: HTMLMediaElement): MediaFailure {
  const code = element.error?.code
  if (code === MediaError.MEDIA_ERR_DECODE) {
    return new MediaFailure('corrupt', 'The audio could not be decoded. The file may be incomplete or corrupted.')
  }
  if (code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED && element.canPlayType(element.dataset.expectedMime ?? '') === '') {
    return new MediaFailure('unsupported', 'This browser cannot play the audio format in this file.')
  }
  return new MediaFailure('corrupt', 'The browser could not read this file. It may be corrupted or use an unsupported audio format.')
}

function expectedMimeType(file: File): string {
  if (file.type) return file.type
  const extension = file.name.split('.').pop()?.toLowerCase()
  const audioTypes: Record<string, string> = {
    mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', aac: 'audio/aac',
    oga: 'audio/ogg', ogg: 'audio/ogg', opus: 'audio/opus', flac: 'audio/flac',
    aiff: 'audio/aiff', aif: 'audio/aiff', mpga: 'audio/mpeg', mpeg: 'audio/mpeg',
  }
  if (isMp4Video(file)) return 'video/mp4'
  if (extension && /^(mov|m4v|webm|mkv)$/.test(extension)) return extension === 'webm' ? 'video/webm' : 'video/mp4'
  return audioTypes[extension ?? ''] ?? ''
}

function waitForMetadata(element: HTMLMediaElement, signal?: AbortSignal): Promise<number> {
  return new Promise((resolve, reject) => {
    const clean = () => {
      element.removeEventListener('loadedmetadata', onLoaded)
      element.removeEventListener('error', onError)
      signal?.removeEventListener('abort', onAbort)
    }
    const onLoaded = () => {
      clean()
      if (!Number.isFinite(element.duration) || element.duration <= 0) {
        reject(new MediaFailure('corrupt', 'The file has no usable audio duration. It may be empty or corrupted.'))
      } else resolve(element.duration)
    }
    const onError = () => { clean(); reject(mediaErrorForElement(element)) }
    const onAbort = () => { clean(); reject(new DOMException('Loading cancelled', 'AbortError')) }
    element.addEventListener('loadedmetadata', onLoaded, { once: true })
    element.addEventListener('error', onError, { once: true })
    signal?.addEventListener('abort', onAbort, { once: true })
    if (signal?.aborted) onAbort()
  })
}

export async function openLocalMedia(
  file: File,
  options: { signal?: AbortSignal; onStep?: (step: MediaLoadStep) => void } = {},
): Promise<LocalMediaSession> {
  const { signal, onStep } = options
  const validationFailure = translateValidationError(validateAudioFile(file))
  if (validationFailure) throw validationFailure
  abortIfNeeded(signal)
  onStep?.('checking')

  const videoContainer = isVideoFile(file)
  if (videoContainer) {
    onStep?.('extracting')
    await inspectAndDecodeVideoAudio(file, signal)
  } else if (!isAudioFile(file)) {
    throw new MediaFailure('unsupported', 'This file type is not supported by BeatTrace.')
  }

  abortIfNeeded(signal)
  const objectUrl = URL.createObjectURL(file)
  const element = videoContainer ? document.createElement('video') : document.createElement('audio')
  element.dataset.expectedMime = expectedMimeType(file)
  element.preload = 'metadata'
  element.src = objectUrl
  if (element instanceof HTMLVideoElement) element.playsInline = true
  onStep?.('loading')

  try {
    const duration = await waitForMetadata(element, signal)
    abortIfNeeded(signal)
    return {
      element,
      objectUrl,
      duration,
      isVideoContainer: videoContainer,
      dispose() {
        element.pause()
        element.removeAttribute('src')
        element.load()
        URL.revokeObjectURL(objectUrl)
      },
    }
  } catch (error) {
    element.removeAttribute('src')
    element.load()
    URL.revokeObjectURL(objectUrl)
    throw error
  }
}

export function messageForMediaFailure(error: unknown): string {
  if (error instanceof MediaFailure) return error.message
  if (error instanceof DOMException && error.name === 'AbortError') return 'Loading was cancelled.'
  return 'Something went wrong while opening this file. Try another file.'
}
