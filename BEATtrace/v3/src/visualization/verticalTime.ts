export const TIMELINE_LAYOUT = { height: 620, playheadY: 420, defaultPixelsPerSecond: 72 } as const

export function timeToY(eventTime: number, audioTime: number, pixelsPerSecond: number, playheadY = TIMELINE_LAYOUT.playheadY): number {
  return playheadY - (eventTime - audioTime) * pixelsPerSecond
}

export function visibleTimeRange(audioTime: number, pixelsPerSecond: number, height = TIMELINE_LAYOUT.height, playheadY = TIMELINE_LAYOUT.playheadY): [number, number] {
  return [audioTime - (height - playheadY) / pixelsPerSecond, audioTime + playheadY / pixelsPerSecond]
}
