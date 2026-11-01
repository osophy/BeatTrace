import type { CSSProperties } from 'react'
import type { SeparatedStemId } from '../analysis/demucsAdapter'
import type { StemActivityInterval } from '../domain/musicTimeline'
import { effectiveStemVolume, type StemControl } from '../audio/stemMixState'

export const STEM_ROWS: Array<{ id: SeparatedStemId; label: string; detail: string; color: string }> = [
  { id: 'vocals', label: 'Vocals', detail: 'Estimated vocal stem', color: '#d69bc3' },
  { id: 'drums', label: 'Drums', detail: 'Estimated drum and percussion stem', color: '#e7a466' },
  { id: 'bass', label: 'Bass', detail: 'Estimated bass stem', color: '#8cbde4' },
  { id: 'other', label: 'Other accompaniment', detail: 'Remaining instruments together', color: '#a6d38a' },
]

interface Props {
  active: boolean
  available: boolean
  busy: boolean
  message: string
  error: string
  currentTime: number
  duration: number
  activity: StemActivityInterval[]
  controls: Record<SeparatedStemId, StemControl>
  solo: SeparatedStemId | null
  onAnalyze: () => void
  onSelect: () => void
  onVolume: (id: SeparatedStemId, volume: number) => void
  onMute: (id: SeparatedStemId) => void
  onSolo: (id: SeparatedStemId) => void
  onReset: () => void
}

export function AiStemPanel(props: Props) {
  return <section className={`practice-source-section ai-practice-section${props.active ? ' is-current-source' : ''}`} aria-label="AI stem practice">
    <div className="practice-source-heading"><div><span className="track-eyebrow">AI SOURCE SEPARATION · LOCAL DEMUCS</span><h3>AI four-stem practice</h3></div><span className={`source-status${props.active ? ' is-active' : ''}`}>{props.active ? 'Now listening' : props.available ? 'Not listening' : 'Analysis needed'}</span></div>
    <p className="practice-source-detail">Model estimates for vocals, drums, bass, and other accompaniment. Sounds can leak between stems; “other” is not one instrument.</p>
    <div className="layer-mode-actions ai-stem-actions"><button type="button" className="secondary-button" onClick={props.onAnalyze} disabled={props.busy}>{props.busy ? 'Separating…' : props.available ? 'Analyze again' : 'Analyze locally'}</button>{props.available && <><button type="button" className="secondary-button" onClick={props.onSelect} disabled={props.active}>Listen to AI stems</button><button type="button" className="secondary-button" onClick={props.onReset}>Reset AI mix</button></>}</div>
    {props.message && <p className="source-feedback" role="status">{props.message}</p>}{props.error && <p className="source-feedback is-error" role="alert">{props.error}</p>}
    {props.available && <>
      <p className="source-feedback">Only the selected playback source is heard. AI stem controls keep their settings while another source plays.</p>
      <div className="ai-stem-timeline" role="img" aria-label="Estimated activity of four AI stems aligned to the current playhead">
        <div className="ai-stem-ruler"><span>0:00</span><span>25%</span><span>50%</span><span>75%</span><span>{formatDuration(props.duration)}</span></div>
        {STEM_ROWS.map((stem) => {
          const dimmed = props.solo ? props.solo !== stem.id : props.controls[stem.id].muted
          const intervals = props.activity.filter((item) => item.stem === stem.id)
          return <div className={`ai-stem-track${dimmed ? ' is-dimmed' : ''}`} key={stem.id}>
            <strong style={{ color: stem.color }}>{stem.label}</strong>
            <div className="ai-stem-track-bed" style={{ '--stem-color': stem.color } as CSSProperties}>
              {intervals.map((interval, index) => <i key={index} style={{ left: `${Math.max(0, interval.startSeconds / props.duration * 100)}%`, width: `${Math.max(0.16, (interval.endSeconds - interval.startSeconds) / props.duration * 100)}%`, opacity: 0.25 + interval.strength * 0.7 }} />)}
              <b className="ai-stem-playhead" style={{ left: `${Math.min(100, Math.max(0, props.currentTime / props.duration * 100))}%` }} />
            </div>
          </div>
        })}
      </div>
      <p className="source-feedback">Activity shows where each estimated stem has audible energy. It is not a waveform or a guarantee that a specific instrument is present.</p>
      {props.solo && <p className="layer-solo-notice" role="status"><strong>{STEM_ROWS.find((stem) => stem.id === props.solo)?.label} Solo</strong> · Other AI stems are temporarily muted. Turn Solo off to restore their saved levels.</p>}
      <div className="layer-mixer" aria-label="AI stem audio controls">
        <div className="layer-mixer-head" aria-hidden="true"><span>AI stem</span><span>Listen</span><span>Mute</span><span>Volume</span><span>Output</span></div>
        {STEM_ROWS.map((stem) => {
          const control = props.controls[stem.id]
          const soloed = props.solo === stem.id
          const mutedBySolo = props.solo !== null && !soloed
          const displayedVolume = soloed && control.muted ? control.lastNonZeroVolume : control.volume
          const output = effectiveStemVolume(control, stem.id, props.solo)
          return <article className={`layer-mixer-row${soloed ? ' is-solo' : ''}${mutedBySolo ? ' is-solo-muted' : ''}`} key={stem.id} style={{ '--layer-color': stem.color } as CSSProperties}>
            <div className="layer-mixer-name"><i aria-hidden="true" /><div><strong>{stem.label}</strong><span>{stem.detail}</span></div></div>
            <button type="button" className={soloed ? 'secondary-button is-active' : 'secondary-button'} aria-pressed={soloed} onClick={() => props.onSolo(stem.id)}>{soloed ? 'Solo on' : 'Solo'}</button>
            <button type="button" className={mutedBySolo || (control.muted && !soloed) ? 'secondary-button is-active' : 'secondary-button'} aria-pressed={mutedBySolo || (control.muted && !soloed)} disabled={mutedBySolo} onClick={() => props.onMute(stem.id)}>{mutedBySolo ? 'Muted by Solo' : soloed && control.muted ? 'Mute after Solo' : control.muted ? 'Muted' : 'Mute'}</button>
            <label className="layer-mixer-volume" htmlFor={`stem-volume-${stem.id}`}><span className="sr-only">{stem.label} volume</span><input id={`stem-volume-${stem.id}`} type="range" min="0" max="1" step="0.01" value={displayedVolume} disabled={mutedBySolo} aria-label={`${stem.label} AI stem volume`} onChange={(event) => props.onVolume(stem.id, Number(event.currentTarget.value))} /><span>{Math.round(displayedVolume * 100)}%{mutedBySolo && <small>{control.muted ? 'manual mute' : 'saved level'}</small>}</span></label>
            <strong className="layer-mixer-output">{Math.round(output * 100)}%</strong>
          </article>
        })}
      </div>
    </>}
  </section>
}

function formatDuration(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds))
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`
}
