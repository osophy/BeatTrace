import type { CSSProperties } from 'react'
import type { AnalysisSummary } from '../domain/analysis'
import { deriveLayerSignals, LAYERS, type LayerId, type LayerPoint } from '../analysis/layers'
import type { MixMode } from '../audio/layerAudioGraph'

export interface LayerControl {
  visible: boolean
  muted: boolean
  volume: number
  opacity: number
  color: string
}

interface Props {
  summary: AnalysisSummary
  currentTime: number
  controls: Record<LayerId, LayerControl>
  setControl: (id: LayerId, patch: Partial<LayerControl>) => void
  mode: MixMode
  setMode: (mode: MixMode) => void
  solo: LayerId | null
  toggleSolo: (id: LayerId) => void
  reset: () => void
  masterVolume: number
  onA: () => void
}

export function LayerPracticePanel(props: Props) {
  const signals = deriveLayerSignals(props.summary)
  return <div className="intermediate-panel">
    <div className="mode-intro"><div><span className="track-eyebrow">INTERMEDIATE MODE</span><h2>Practice one part of the mix</h2></div><p>Estimated layer analysis · Approximate frequency-based layers. These are filtered views of the same mix, not isolated studio stems.</p></div>
    <div className="layer-mode-actions">
      <button className={props.mode === 'original' ? 'secondary-button is-active' : 'secondary-button'} type="button" onClick={() => props.setMode('original')}>Original mix</button>
      <button className={props.mode === 'layers' ? 'secondary-button is-active' : 'secondary-button'} type="button" onClick={() => props.setMode('layers')}>Layer practice mode</button>
      <button className="secondary-button" type="button" onClick={props.onA}>A/B compare</button>
      <button className="secondary-button" type="button" onClick={props.reset}>Reset mix</button>
    </div>
    <p className="approximation-notice">This layer is an approximation, not an isolated studio stem. Frequency bands overlap in real instruments and vocals.</p>
    <LayerSignalTimeline signals={signals} controls={props.controls} duration={props.summary.durationSeconds} currentTime={props.currentTime} />
    <div className="layer-cards">
      {LAYERS.map((layer) => {
        const control = props.controls[layer.id]
        return <article className="layer-card" key={layer.id} style={{ '--layer-color': control.color, '--layer-opacity': control.opacity } as CSSProperties}>
          <div className="layer-card-head"><label><input type="checkbox" checked={control.visible} onChange={(event) => props.setControl(layer.id, { visible: event.currentTarget.checked })} /> <strong>{layer.label}</strong></label><span>{layer.description}</span></div>
          <div className="layer-card-actions"><button type="button" className={props.solo === layer.id ? 'secondary-button is-active' : 'secondary-button'} onClick={() => props.toggleSolo(layer.id)}>{props.solo === layer.id ? 'Solo on' : 'Solo'}</button><button type="button" className={control.muted ? 'secondary-button is-active' : 'secondary-button'} onClick={() => props.setControl(layer.id, { muted: !control.muted })}>{control.muted ? 'Muted' : 'Mute'}</button></div>
          <label className="layer-slider" htmlFor={`layer-volume-${layer.id}`}><span>Volume</span><strong>{Math.round(control.volume * 100)}%</strong><input id={`layer-volume-${layer.id}`} type="range" min="0" max="1" step="0.01" value={control.volume} onChange={(event) => props.setControl(layer.id, { volume: Number(event.currentTarget.value) })} /></label>
          <label className="layer-slider" htmlFor={`layer-opacity-${layer.id}`}><span>Visual opacity</span><strong>{Math.round(control.opacity * 100)}%</strong><input id={`layer-opacity-${layer.id}`} type="range" min="0.05" max="1" step="0.01" value={control.opacity} onChange={(event) => props.setControl(layer.id, { opacity: Number(event.currentTarget.value) })} /></label>
          <label className="layer-color" htmlFor={`layer-color-${layer.id}`}>Color <input id={`layer-color-${layer.id}`} type="color" value={control.color} onChange={(event) => props.setControl(layer.id, { color: event.currentTarget.value })} /></label>
        </article>
      })}
    </div>
    <div className="separation-status"><strong>AI source separation is not installed.</strong><span>These frequency-based estimates remain available without AI. No vocal, drum, or bass stem is being presented as isolated audio.</span></div>
  </div>
}

function LayerSignalTimeline({ signals, controls, duration, currentTime }: { signals: Record<LayerId, LayerPoint[]>; controls: Record<LayerId, LayerControl>; duration: number; currentTime: number }) {
  const width = 1000
  const height = 180
  return <div className="layer-timeline-wrap"><svg className="layer-timeline" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Approximate frequency-based activity for five musical layers">
    {[0.25, 0.5, 0.75].map((fraction) => <line key={fraction} x1="0" x2={width} y1={height - 12 - fraction * (height - 24)} y2={height - 12 - fraction * (height - 24)} className="timeline-grid" />)}
    {LAYERS.filter((layer) => controls[layer.id].visible).map((layer) => {
      const points = signals[layer.id]
      if (!points.length) return null
      const d = points.map((point, index) => `${index === 0 ? 'M' : 'L'}${(point.timestamp / Math.max(0.01, duration) * width).toFixed(1)},${(height - 12 - point.value * (height - 24)).toFixed(1)}`).join(' ')
      return <path key={layer.id} d={d} fill="none" stroke={controls[layer.id].color} strokeWidth="2" strokeOpacity={controls[layer.id].opacity} strokeLinejoin="round" strokeLinecap="round" />
    })}
    <line x1={currentTime / Math.max(0.01, duration) * width} x2={currentTime / Math.max(0.01, duration) * width} y1="5" y2={height - 5} className="playhead-line" />
  </svg><div className="layer-legend">{LAYERS.filter((layer) => controls[layer.id].visible).map((layer) => <span key={layer.id}><i style={{ background: controls[layer.id].color, opacity: controls[layer.id].opacity }} />{layer.label}</span>)}</div></div>
}
