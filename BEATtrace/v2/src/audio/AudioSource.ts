/** File acquisition, media playback, and decoding boundaries for Phase 2. */
export interface AudioSource {
  readonly name: string
  readonly mimeType: string
  readonly durationSeconds: number
}

export interface AudioDecoder {
  decode(file: File, signal?: AbortSignal): Promise<AudioBuffer>
}

export interface PlaybackController {
  play(): Promise<void>
  pause(): void
  seek(seconds: number): void
  restart(): void
  dispose(): void
}
