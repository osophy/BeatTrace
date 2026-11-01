import { useState, type CSSProperties } from 'react'
import type { AnalysisSummary } from '../domain/analysis'
import { deriveLayerSignals, LAYERS, type LayerId, type LayerPoint } from '../analysis/layers'
import type { MixMode } from '../audio/layerAudioGraph'
import { effectiveLayerVolume, type LayerAudioState } from '../audio/layerMixState'
import type { SeparatedStemId } from '../analysis/demucsAdapter'
import type { StemActivityInterval } from '../domain/musicTimeline'
import type { StemControl } from '../audio/stemMixState'
import { AiStemPanel } from './AiStemPanel'

export interface LayerControl extends LayerAudioState {
  visible: boolean
  opacity: number
  color: string
}

interface Props {
  summary: AnalysisSummary
  currentTime: number
  controls: Record<LayerId, LayerControl>
  setControl: (id: LayerId, patch: Partial<Pick<LayerControl, 'visible' | 'opacity' | 'color'>>) => void
  setVolume: (id: LayerId, volume: number) => void
  toggleMute: (id: LayerId) => void
  mode: MixMode
  setMode: (mode: MixMode) => void
  solo: LayerId | null
  toggleSolo: (id: LayerId) => void
  reset: () => void
  onSeparate: () => void
  separationBusy: boolean
  separationMessage: string
  separationError: string
  separated: boolean
  stemActivity: StemActivityInterval[]
  stemControls: Record<SeparatedStemId, StemControl>
  stemSolo: SeparatedStemId | null
  setStemVolume: (id: SeparatedStemId, volume: number) => void
  toggleStemMute: (id: SeparatedStemId) => void
  toggleStemSolo: (id: SeparatedStemId) => void
  resetStemMix: () => void
}

export function LayerPracticePanel(props: Props) {
  const [displaySettingsOpen, setDisplaySettingsOpen] = useState(false)
  const signals = deriveLayerSignals(props.summary)
  return <div className="intermediate-panel">
    <div className="mode-intro"><div><span className="track-eyebrow">INTERMEDIATE MODE</span><h2>Practice one part of the mix</h2></div><p>Choose one listening source. DSP frequency layers and AI stems keep separate settings and never play together.</p></div>
    <div className="source-selector" role="group" aria-label="Current listening source"><span>Now listening to</span><button className={props.mode === 'original' ? 'secondary-button is-active' : 'secondary-button'} type="button" aria-pressed={props.mode === 'original'} onClick={() => props.setMode('original')}>Original mix</button><button className={props.mode === 'layers' ? 'secondary-button is-active' : 'secondary-button'} type="button" aria-pressed={props.mode === 'layers'} onClick={() => props.setMode('layers')}>DSP layers</button><button className={props.mode === 'separated' ? 'secondary-button is-active' : 'secondary-button'} type="button" aria-pressed={props.mode === 'separated'} disabled={!props.separated} onClick={() => props.setMode('separated')}>AI stems{!props.separated ? ' · analyze first' : ''}</button></div>
    <section className={`practice-source-section dsp-practice-section${props.mode === 'layers' ? ' is-current-source' : ''}`} aria-label="DSP frequency layer practice">
    <div className="practice-source-heading"><div><span className="track-eyebrow">FREQUENCY-BASED · DSP</span><h3>Five frequency layers</h3></div><span className={`source-status${props.mode === 'layers' ? ' is-active' : ''}`}>{props.mode === 'layers' ? 'Now listening' : 'Not listening'}</span></div>
    <div className="layer-mode-actions"><button type="button" className="secondary-button" onClick={() => props.setMode('layers')} disabled={props.mode === 'layers'}>Listen to DSP layers</button><button type="button" className="secondary-button" onClick={props.reset}>Reset DSP mix</button><button className="secondary-button display-settings-toggle" type="button" aria-expanded={displaySettingsOpen} aria-controls="layer-display-settings" onClick={() => setDisplaySettingsOpen(!displaySettingsOpen)}>Display settings {displaySettingsOpen ? '−' : '+'}</button></div>
    <p className="approximation-notice">This layer is an approximation, not an isolated studio stem. Frequency bands overlap in real instruments and vocals.</p>
    {props.mode !== 'layers' && <p className="source-feedback">DSP controls save their settings here. Switch to DSP layers above to hear them.</p>}
    <LayerSignalTimeline signals={signals} controls={props.controls} solo={props.solo} duration={props.summary.durationSeconds} currentTime={props.currentTime} />
    {props.solo && <p className="layer-solo-notice" role="status"><strong>{LAYERS.find((layer) => layer.id === props.solo)?.label} Solo</strong> · Other layers are temporarily muted. Turn Solo off to restore their saved levels.</p>}
    <div className="layer-mixer" aria-label="Frequency layer audio controls">
      <div className="layer-mixer-head" aria-hidden="true"><span>Frequency layer</span><span>Listen</span><span>Mute</span><span>Volume</span><span>Output</span></div>
      {LAYERS.map((layer) => {
        const control = props.controls[layer.id]
        const soloed = props.solo === layer.id
        const mutedBySolo = props.solo !== null && !soloed
        const displayedVolume = soloed && control.muted ? control.lastNonZeroVolume : control.volume
        const output = effectiveLayerVolume(control, layer.id, props.solo)
        return <article className={`layer-mixer-row${soloed ? ' is-solo' : ''}${mutedBySolo ? ' is-solo-muted' : ''}`} key={layer.id} style={{ '--layer-color': control.color } as CSSProperties}>
          <div className="layer-mixer-name"><i aria-hidden="true" /><div><strong>{layer.label}</strong><span>{layer.description}</span></div></div>
          <button type="button" className={soloed ? 'secondary-button is-active' : 'secondary-button'} aria-pressed={soloed} onClick={() => props.toggleSolo(layer.id)}>{soloed ? 'Solo on' : 'Solo'}</button>
          <button type="button" className={mutedBySolo || (control.muted && !soloed) ? 'secondary-button is-active' : 'secondary-button'} aria-pressed={mutedBySolo || (control.muted && !soloed)} disabled={mutedBySolo} title={mutedBySolo ? 'Temporarily muted by Solo; choose this layer’s Solo button to hear it' : undefined} onClick={() => props.toggleMute(layer.id)}>{mutedBySolo ? 'Muted by Solo' : soloed && control.muted ? 'Mute after Solo' : control.muted ? 'Muted' : 'Mute'}</button>
          <label className="layer-mixer-volume" htmlFor={`layer-volume-${layer.id}`}><span className="sr-only">{layer.label} volume</span><input id={`layer-volume-${layer.id}`} type="range" min="0" max="1" step="0.01" value={displayedVolume} disabled={mutedBySolo} aria-label={`${layer.label} volume`} onChange={(event) => props.setVolume(layer.id, Number(event.currentTarget.value))} /><span>{Math.round(displayedVolume * 100)}%{mutedBySolo && <small>{control.muted ? 'manual mute' : 'saved level'}</small>}</span></label>
          <strong className="layer-mixer-output">{Math.round(output * 100)}%</strong>
        </article>
      })}
    </div>
    {displaySettingsOpen && <div id="layer-display-settings" className="layer-display-settings"><h3>Layer display settings</h3><p>These controls change the activity graph only; the audio mix stays the same.</p><div className="layer-display-grid">{LAYERS.map((layer) => { const control = props.controls[layer.id]; return <div className="layer-display-row" key={layer.id}><label><input type="checkbox" checked={control.visible} onChange={(event) => props.setControl(layer.id, { visible: event.currentTarget.checked })} />{layer.label}</label><label htmlFor={`layer-opacity-${layer.id}`}>Graph opacity <input id={`layer-opacity-${layer.id}`} type="range" min="0.05" max="1" step="0.01" value={control.opacity} onChange={(event) => props.setControl(layer.id, { opacity: Number(event.currentTarget.value) })} /><span>{Math.round(control.opacity * 100)}%</span></label><label htmlFor={`layer-color-${layer.id}`}>Color <input id={`layer-color-${layer.id}`} type="color" value={control.color} onChange={(event) => props.setControl(layer.id, { color: event.currentTarget.value })} /></label></div> })}</div></div>}
    </section>
    <AiStemPanel active={props.mode === 'separated'} available={props.separated} busy={props.separationBusy} message={props.separationMessage} error={props.separationError} currentTime={props.currentTime} duration={props.summary.durationSeconds} activity={props.stemActivity} controls={props.stemControls} solo={props.stemSolo} onAnalyze={props.onSeparate} onSelect={() => props.setMode('separated')} onVolume={props.setStemVolume} onMute={props.toggleStemMute} onSolo={props.toggleStemSolo} onReset={props.resetStemMix} />
  </div>
}

function LayerSignalTimeline({ signals, controls, solo, duration, currentTime }: { signals: Record<LayerId, LayerPoint[]>; controls: Record<LayerId, LayerControl>; solo: LayerId | null; duration: number; currentTime: number }) {
  const width = 1000
  const height = 180
  return <div className="layer-timeline-wrap"><svg className="layer-timeline" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Approximate frequency-based activity for five musical layers">
    {[0.25, 0.5, 0.75].map((fraction) => <line key={fraction} x1="0" x2={width} y1={height - 12 - fraction * (height - 24)} y2={height - 12 - fraction * (height - 24)} className="timeline-grid" />)}
    {LAYERS.filter((layer) => controls[layer.id].visible).map((layer) => {
      const points = signals[layer.id]
      if (!points.length) return null
      const d = points.map((point, index) => `${index === 0 ? 'M' : 'L'}${(point.timestamp / Math.max(0.01, duration) * width).toFixed(1)},${(height - 12 - point.value * (height - 24)).toFixed(1)}`).join(' ')
      const dimmed = solo ? solo !== layer.id : controls[layer.id].muted
      return <path key={layer.id} d={d} fill="none" stroke={controls[layer.id].color} strokeWidth={solo === layer.id ? 2.8 : 2} strokeOpacity={controls[layer.id].opacity * (dimmed ? 0.18 : 1)} strokeLinejoin="round" strokeLinecap="round" />
    })}
    <line x1={currentTime / Math.max(0.01, duration) * width} x2={currentTime / Math.max(0.01, duration) * width} y1="5" y2={height - 5} className="playhead-line" />
  </svg><div className="layer-legend">{LAYERS.filter((layer) => controls[layer.id].visible).map((layer) => { const dimmed = solo ? solo !== layer.id : controls[layer.id].muted; return <span key={layer.id} style={{ opacity: dimmed ? 0.45 : 1 }}><i style={{ background: controls[layer.id].color, opacity: controls[layer.id].opacity }} />{layer.label}{dimmed && <small>muted</small>}</span> })}</div></div>
}
