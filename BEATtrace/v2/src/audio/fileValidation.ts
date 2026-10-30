export const MAX_FILE_BYTES = 500 * 1024 * 1024

const acceptedExtensions = new Set([
  'mp3', 'wav', 'm4a', 'mp4', 'aac', 'oga', 'ogg', 'opus', 'flac', 'webm', 'aiff', 'aif', 'mpga', 'mpeg', 'mov', 'mkv', 'm4v',
])

export type FileValidationError = 'empty' | 'too-large' | 'unsupported'

export function validateAudioFile(file: File): FileValidationError | null {
  if (file.size === 0) return 'empty'
  if (file.size > MAX_FILE_BYTES) return 'too-large'

  const extension = file.name.split('.').pop()?.toLowerCase()
  const recognizedMime = file.type.startsWith('audio/') || file.type.startsWith('video/')
  if (!recognizedMime && (!extension || !acceptedExtensions.has(extension))) return 'unsupported'
  if (extension && !acceptedExtensions.has(extension) && !recognizedMime) return 'unsupported'
  return null
}

export function isMp4Video(file: File): boolean {
  return file.name.toLowerCase().endsWith('.mp4') || file.type.toLowerCase().split(';')[0] === 'video/mp4'
}

export function isVideoFile(file: File): boolean {
  return file.type.startsWith('video/') || /\.(mp4|mov|m4v|webm|mkv)$/i.test(file.name)
}

export function isAudioFile(file: File): boolean {
  return file.type.startsWith('audio/') || /\.(mp3|wav|m4a|aac|oga|ogg|opus|flac|aiff|aif|mpga|mpeg)$/i.test(file.name)
}
