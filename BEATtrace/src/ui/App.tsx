import { useEffect, useRef, useState, type CSSProperties, type DragEvent } from 'react'
import { mediaErrorForElement, messageForMediaFailure, openLocalMedia, type LocalMediaSession, type MediaLoadStep } from '../audio/localMedia'
import { analyzeLocalFile, type AnalysisProgress } from '../analysis/analyzeLocalFile'
import { analyzeWithLocalBeatNet } from '../analysis/localBeatNet'
import { analyzeBasicPitchDetailed } from '../analysis/basicPitchAdapter'
import { LAYERS, type LayerId } from '../analysis/layers'
import { LayerAudioGraph, type MixMode } from '../audio/layerAudioGraph'
import { SeparatedStemPlayback } from '../audio/separatedStemPlayback'
import { deleteLocalSeparation, separateLocally, type SeparatedStemId, type StemSeparationResult } from '../analysis/demucsAdapter'
import { countPattern, makeFakeCountBuffers, makeTaPattern, type CountSyllable } from '../audio/fakeVoice'
import type { AnalysisSummary, MelodyContourPoint } from '../domain/analysis'
import type { DrumHit, StemActivityInterval, TranscribedNote } from '../domain/musicTimeline'
import { EnergyTimeline } from './EnergyTimeline'
import { LayerPracticePanel, type LayerControl } from './LayerPracticePanel'
import { MelodyAnalysisPanel } from './MelodyAnalysisPanel'
import { VerticalMusicTimeline } from './VerticalMusicTimeline'

const loadingLabels: Record<MediaLoadStep, string> = {
  checking: 'Checking your file…',
  extracting: 'Finding and decoding the video audio track…',
  loading: 'Opening audio in your browser…',
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const wholeSeconds = Math.floor(seconds)
  const hours = Math.floor(wholeSeconds / 3600)
  const minutes = Math.floor((wholeSeconds % 3600) / 60)
  const remainder = wholeSeconds % 60
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
  return `${minutes}:${String(remainder).padStart(2, '0')}`
}

function defaultLayerControls(): Record<LayerId, LayerControl> {
  return Object.fromEntries(LAYERS.map((layer) => [layer.id, { visible: true, muted: false, volume: 0.3, opacity: 0.82, color: layer.color }])) as Record<LayerId, LayerControl>
}

function App() {
  const inputRef = useRef<HTMLInputElement>(null)
  const mediaHostRef = useRef<HTMLDivElement>(null)
  const sessionRef = useRef<LocalMediaSession | null>(null)
  const currentFileRef = useRef<File | null>(null)
  const traditionalAnalysisRef = useRef<AnalysisSummary | null>(null)
  const loadAbortRef = useRef<AbortController | null>(null)
  const analysisAbortRef = useRef<AbortController | null>(null)
  const tapTimesRef = useRef<number[]>([])
  const guideTimerRef = useRef<number | null>(null)
  const guideAudioRef = useRef<AudioContext | null>(null)
  const layerAudioGraphRef = useRef<LayerAudioGraph | null>(null)
  const melodyAbortRef = useRef<AbortController | null>(null)
  const separationAbortRef = useRef<AbortController | null>(null)
  const stemPitchAbortRef = useRef<AbortController | null>(null)
  const separationPlaybackRef = useRef<SeparatedStemPlayback | null>(null)
  const separationResultRef = useRef<StemSeparationResult | null>(null)
  const guideVolumeRef = useRef(0.6)
  const metronomeVolumeRef = useRef(0.55)
  const loopRef = useRef<{ start: number; end: number } | null>(null)
  const [session, setSession] = useState<LocalMediaSession | null>(null)
  const [fileName, setFileName] = useState('')
  const [loadingStep, setLoadingStep] = useState<MediaLoadStep | null>(null)
  const [error, setError] = useState('')
  const [currentTime, setCurrentTime] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isBuffering, setIsBuffering] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [musicVolume, setMusicVolume] = useState(0.45)
  const [playbackSpeed, setPlaybackSpeed] = useState(1)
  const [analysis, setAnalysis] = useState<AnalysisSummary | null>(null)
  const [analysisProgress, setAnalysisProgress] = useState<AnalysisProgress | null>(null)
  const [analysisError, setAnalysisError] = useState('')
  const [modelMessage, setModelMessage] = useState('')
  const [isTryingModel, setIsTryingModel] = useState(false)
  const [manualBpm, setManualBpm] = useState<number | null>(null)
  const [automaticBpm, setAutomaticBpm] = useState<number | null>(null)
  const [firstBeat, setFirstBeat] = useState<number | null>(null)
  const [automaticFirstBeat, setAutomaticFirstBeat] = useState<number | null>(null)
  const [beatIndex, setBeatIndex] = useState(0)
  const [pattern, setPattern] = useState(4)
  const [subdivision, setSubdivision] = useState(1)
  const [countStyle, setCountStyle] = useState<'numbers' | 'ta'>('numbers')
  const [guideOn, setGuideOn] = useState(false)
  const [guideVolume, setGuideVolume] = useState(0.6)
  const [metronomeOn, setMetronomeOn] = useState(false)
  const [metronomeVolume, setMetronomeVolume] = useState(0.55)
  const [loopStart, setLoopStart] = useState<number | null>(null)
  const [loopEnd, setLoopEnd] = useState<number | null>(null)
  const [activeMode, setActiveMode] = useState<'beginner' | 'intermediate' | 'advanced'>('beginner')
  const [mixMode, setMixMode] = useState<MixMode>('original')
  const [layerControls, setLayerControls] = useState<Record<LayerId, LayerControl>>(defaultLayerControls)
  const [layerSolo, setLayerSolo] = useState<LayerId | null>(null)
  const [aiMelodyContour, setAiMelodyContour] = useState<MelodyContourPoint[] | null>(null)
  const [aiNotes, setAiNotes] = useState<TranscribedNote[]>([])
  const [stemActivity, setStemActivity] = useState<StemActivityInterval[]>([])
  const [drumHits, setDrumHits] = useState<DrumHit[]>([])
  const [stemPitchBusy, setStemPitchBusy] = useState(false)
  const [stemPitchMessage, setStemPitchMessage] = useState('')
  const [melodyBusy, setMelodyBusy] = useState(false)
  const [melodyProgress, setMelodyProgress] = useState(0)
  const [melodyMessage, setMelodyMessage] = useState('')
  const [separationResult, setSeparationResult] = useState<StemSeparationResult | null>(null)
  const [separationBusy, setSeparationBusy] = useState(false)
  const [separationMessage, setSeparationMessage] = useState('')
  const [separationError, setSeparationError] = useState('')
  const [stemControls, setStemControls] = useState<Record<SeparatedStemId, { muted: boolean; volume: number }>>({ vocals: { muted: false, volume: 0.75 }, drums: { muted: false, volume: 0.75 }, bass: { muted: false, volume: 0.75 }, other: { muted: false, volume: 0.75 } })

  function clearCurrentSession() {
    loadAbortRef.current?.abort()
    loadAbortRef.current = null
    analysisAbortRef.current?.abort()
    analysisAbortRef.current = null
    melodyAbortRef.current?.abort()
    melodyAbortRef.current = null
    separationAbortRef.current?.abort()
    separationAbortRef.current = null
    stemPitchAbortRef.current?.abort()
    stemPitchAbortRef.current = null
    if (separationPlaybackRef.current) void separationPlaybackRef.current.dispose()
    separationPlaybackRef.current = null
    if (separationResultRef.current) void deleteLocalSeparation(separationResultRef.current.runId)
    separationResultRef.current = null
    if (layerAudioGraphRef.current) void layerAudioGraphRef.current.dispose()
    layerAudioGraphRef.current = null
    stopGuide()
    if (sessionRef.current) {
      sessionRef.current.element.pause()
      sessionRef.current.dispose()
      sessionRef.current = null
    }
    mediaHostRef.current?.replaceChildren()
    setSession(null)
    setIsPlaying(false)
    setIsBuffering(false)
    setCurrentTime(0)
    setAnalysis(null)
    setAnalysisProgress(null)
    setAnalysisError('')
    setModelMessage('')
    setIsTryingModel(false)
    setManualBpm(null)
    setAutomaticBpm(null)
    setFirstBeat(null)
    setAutomaticFirstBeat(null)
    currentFileRef.current = null
    traditionalAnalysisRef.current = null
    setLoopStart(null)
    setLoopEnd(null)
    loopRef.current = null
    setActiveMode('beginner')
    setMixMode('original')
    setLayerControls(defaultLayerControls())
    setLayerSolo(null)
    setAiMelodyContour(null)
    setAiNotes([])
    setStemActivity([])
    setDrumHits([])
    setStemPitchBusy(false)
    setStemPitchMessage('')
    setPlaybackSpeed(1)
    setMelodyBusy(false)
    setMelodyProgress(0)
    setMelodyMessage('')
    setSeparationResult(null)
    setSeparationBusy(false)
    setSeparationMessage('')
    setSeparationError('')
    setStemControls({ vocals: { muted: false, volume: 0.75 }, drums: { muted: false, volume: 0.75 }, bass: { muted: false, volume: 0.75 }, other: { muted: false, volume: 0.75 } })
  }

  function runAnalysis(file: File, duration: number) {
    analysisAbortRef.current?.abort()
    melodyAbortRef.current?.abort()
    melodyAbortRef.current = null
    setMelodyBusy(false)
    setAnalysis(null)
    setAnalysisError('')
    setModelMessage('')
    setIsTryingModel(false)
    setAnalysisProgress({ stage: 'Preparing local audio analysis…', progress: 0.02 })
    setAiMelodyContour(null)
    setAiNotes([])
    setMelodyMessage('')
    const analysisController = new AbortController()
    analysisAbortRef.current = analysisController
    void analyzeLocalFile(file, duration, {
      signal: analysisController.signal,
      onProgress: setAnalysisProgress,
    }).then((summary) => {
      if (analysisController.signal.aborted) return
      traditionalAnalysisRef.current = summary
      setAnalysis(summary)
      const detectedBpm = summary.estimatedBpm ?? null
      const detectedFirstBeat = summary.firstBeatSeconds ?? null
      setManualBpm(detectedBpm)
      setAutomaticBpm(detectedBpm)
      setFirstBeat(detectedFirstBeat)
      setAutomaticFirstBeat(detectedFirstBeat)
      setAnalysisProgress(null)
      analysisAbortRef.current = null
    }).catch((analysisFailure: unknown) => {
      if (analysisController.signal.aborted) return
      setAnalysisError(analysisFailure instanceof Error ? analysisFailure.message : 'Audio analysis could not be completed.')
      setAnalysisProgress(null)
      analysisAbortRef.current = null
    })
  }

  async function tryLocalModel() {
    const file = currentFileRef.current
    const traditional = traditionalAnalysisRef.current
    if (!file || !traditional) return
    analysisAbortRef.current?.abort()
    const controller = new AbortController()
    analysisAbortRef.current = controller
    setIsTryingModel(true)
    setModelMessage('Checking for the optional local BeatNet service…')
    try {
      const result = await analyzeWithLocalBeatNet(file, traditional, controller.signal)
      if (controller.signal.aborted) return
      setAnalysis(result)
      const detectedBpm = result.estimatedBpm ?? null
      const detectedFirstBeat = result.firstBeatSeconds ?? null
      setManualBpm(detectedBpm)
      setAutomaticBpm(detectedBpm)
      setFirstBeat(detectedFirstBeat)
      setAutomaticFirstBeat(detectedFirstBeat)
      setModelMessage('Using local BeatNet results. Confidence shown is a timing-consistency estimate, not a confidence score reported by BeatNet.')
    } catch (modelError) {
      if (controller.signal.aborted) return
      setAnalysis(traditional)
      setManualBpm(traditional.estimatedBpm ?? null)
      setAutomaticBpm(traditional.estimatedBpm ?? null)
      setFirstBeat(traditional.firstBeatSeconds ?? null)
      setAutomaticFirstBeat(traditional.firstBeatSeconds ?? null)
      const detail = modelError instanceof TypeError
        ? 'The local AI service is not running. From the project folder, start it with: conda run -n beattrace-beatnet python local-model/beatnet_service.py.'
        : modelError instanceof Error ? modelError.message : 'Local AI analysis failed.'
      setModelMessage(`${detail} Showing traditional analysis.`)
    } finally {
      if (analysisAbortRef.current === controller) analysisAbortRef.current = null
      setIsTryingModel(false)
    }
  }

  function cancelAnalysis() {
    const wasTryingModel = isTryingModel
    analysisAbortRef.current?.abort()
    analysisAbortRef.current = null
    setAnalysisProgress(null)
    setIsTryingModel(false)
    if (wasTryingModel) setModelMessage('Local BeatNet analysis cancelled. Showing traditional analysis.')
    else setAnalysisError('Audio analysis cancelled.')
  }

  function cancelMelodyAnalysis() {
    melodyAbortRef.current?.abort()
    setMelodyBusy(false)
    setMelodyMessage('Basic Pitch analysis cancelled. Showing the spectral estimate.')
  }

  async function tryBasicPitch() {
    const file = currentFileRef.current
    if (!file || !analysis) return
    melodyAbortRef.current?.abort()
    const controller = new AbortController()
    melodyAbortRef.current = controller
    setAiMelodyContour(null)
    setMelodyBusy(true)
    setMelodyProgress(0)
    setMelodyMessage('Checking the optional local Basic Pitch service…')
    try {
      const { contour, notes } = await analyzeBasicPitchDetailed(file, controller.signal, setMelodyProgress)
      if (controller.signal.aborted) return
      setAiMelodyContour(contour)
      setAiNotes((current) => [...current.filter((note) => note.track === 'bass-notes' || note.track === 'accompaniment-notes'), ...notes])
      setMelodyMessage('Showing a Basic Pitch note contour. Note strength is approximate and is not calibrated confidence.')
    } catch (failure) {
      if (controller.signal.aborted) return
      const detail = failure instanceof TypeError
        ? 'The Basic Pitch service is not running. Start it with: conda run -n beattrace-basicpitch python local-model/basic_pitch_service.py.'
        : failure instanceof Error ? failure.message : 'Basic Pitch analysis failed.'
      setMelodyMessage(`${detail} Showing the spectral estimate instead.`)
    } finally {
      if (melodyAbortRef.current === controller) melodyAbortRef.current = null
      setMelodyBusy(false)
    }
  }

  function setPracticeMixMode(mode: MixMode) {
    if (!session) return
    try {
      const graph = ensureLayerAudioGraph()
      if (!graph) return
      graph.setMode(mode)
      separationPlaybackRef.current?.setEnabled(mode === 'separated')
      setMixMode(mode)
    } catch (failure) {
      setError(failure instanceof Error ? `Layer audio is unavailable in this browser: ${failure.message}` : 'Layer audio is unavailable in this browser.')
      setMixMode('original')
    }
  }

  function ensureLayerAudioGraph() {
    if (!session) return null
    if (!layerAudioGraphRef.current) {
      layerAudioGraphRef.current = new LayerAudioGraph(session.element, musicVolume)
      for (const layer of LAYERS) {
        layerAudioGraphRef.current.setLayerVolume(layer.id, layerControls[layer.id].volume)
        layerAudioGraphRef.current.setMuted(layer.id, layerControls[layer.id].muted)
      }
      if (layerSolo) layerAudioGraphRef.current.setSolo(layerSolo)
    }
    return layerAudioGraphRef.current
  }

  function setStemControl(id: SeparatedStemId, patch: { muted?: boolean; volume?: number }) {
    setStemControls((current) => ({ ...current, [id]: { ...current[id], ...patch } }))
    if (patch.muted !== undefined) separationPlaybackRef.current?.setMuted(id, patch.muted)
    if (patch.volume !== undefined) separationPlaybackRef.current?.setVolume(id, patch.volume)
  }

  async function trySeparateStems(): Promise<StemSeparationResult | null> {
    const file = currentFileRef.current
    const activeSession = sessionRef.current
    if (!file || !activeSession) return null
    separationAbortRef.current?.abort()
    const controller = new AbortController()
    separationAbortRef.current = controller
    setSeparationBusy(true)
    setSeparationError('')
    setSeparationMessage('Preparing a local separation…')
    try {
      // Create/resume Web Audio during the button gesture so browsers do not block later stem playback.
      const graph = ensureLayerAudioGraph()
      if (!graph) throw new Error('The audio playback graph is unavailable.')
      const result = await separateLocally(file, controller.signal, setSeparationMessage)
      if (controller.signal.aborted) { void deleteLocalSeparation(result.runId); return null }
      const player = new SeparatedStemPlayback(activeSession.element, graph.getAudioContext())
      await player.load(result.stems)
      const nextStemActivity = player.getActivityIntervals()
      player.setMasterVolume(musicVolume)
      if (controller.signal.aborted) { void player.dispose(); void deleteLocalSeparation(result.runId); return null }
      if (separationPlaybackRef.current) void separationPlaybackRef.current.dispose()
      if (separationResultRef.current) void deleteLocalSeparation(separationResultRef.current.runId)
      separationPlaybackRef.current = player
      separationResultRef.current = result
      setSeparationResult(result)
      setStemActivity(nextStemActivity)
      setDrumHits(result.drumHits)
      setStemControls({ vocals: { muted: false, volume: 0.75 }, drums: { muted: false, volume: 0.75 }, bass: { muted: false, volume: 0.75 }, other: { muted: false, volume: 0.75 } })
      setSeparationMessage(`Ready · ${result.modelId} on ${result.device}.`)
      setPracticeMixMode('separated')
      return result
    } catch (failure) {
      if (!controller.signal.aborted) {
        const detail = failure instanceof TypeError
          ? 'The local separation service is not running. Start it using the instructions in README.md.'
          : failure instanceof Error ? failure.message : 'Local source separation failed.'
        setSeparationError(detail)
        setSeparationMessage('')
      }
      return null
    } finally {
      if (separationAbortRef.current === controller) separationAbortRef.current = null
      setSeparationBusy(false)
    }
  }

  async function tryTranscribeStems() {
    if (!currentFileRef.current) return
    stemPitchAbortRef.current?.abort()
    const controller = new AbortController()
    stemPitchAbortRef.current = controller
    setStemPitchBusy(true)
    setStemPitchMessage('Preparing local stem analysis…')
    try {
      const separation = separationResultRef.current ?? await trySeparateStems()
      if (!separation || controller.signal.aborted) {
        if (!controller.signal.aborted) setStemPitchMessage('Source separation is unavailable; the existing analysis remains visible.')
        return
      }
      const collected: TranscribedNote[] = []
      const failures: string[] = []
      for (const id of ['bass', 'other'] as const) {
        if (controller.signal.aborted) return
        const stem = separation.stems.find((item) => item.id === id)
        if (!stem) continue
        setStemPitchMessage(`Transcribing ${id === 'bass' ? 'bass' : 'accompaniment'} notes with Basic Pitch…`)
        try {
          const response = await fetch(stem.url, { signal: controller.signal })
          if (!response.ok) throw new Error('Stem audio could not be opened')
          const wav = new File([await response.blob()], `${id}.wav`, { type: 'audio/wav' })
          const result = await analyzeBasicPitchDetailed(wav, controller.signal)
          collected.push(...result.notes.map((note) => ({ ...note, track: id === 'bass' ? 'bass-notes' as const : 'accompaniment-notes' as const, source: `basic-pitch-on-demucs-${id}` })))
        } catch (failure) {
          if (controller.signal.aborted) return
          failures.push(`${id}: ${failure instanceof Error ? failure.message : 'analysis failed'}`)
        }
      }
      if (controller.signal.aborted) return
      setAiNotes((current) => [...current.filter((note) => note.track !== 'bass-notes' && note.track !== 'accompaniment-notes'), ...collected])
      setStemPitchMessage(`${collected.length} estimated notes from bass and accompaniment stems. ${failures.length ? `Unavailable: ${failures.join('; ')}` : 'Instrument names within accompaniment remain unknown.'}`)
    } catch (failure) {
      if (!controller.signal.aborted) setStemPitchMessage(failure instanceof Error ? `Advanced analysis failed: ${failure.message}` : 'Advanced analysis failed.')
    } finally {
      if (stemPitchAbortRef.current === controller) stemPitchAbortRef.current = null
      setStemPitchBusy(false)
    }
  }

  function updateLayerControl(id: LayerId, patch: Partial<LayerControl>) {
    setLayerControls((current) => ({ ...current, [id]: { ...current[id], ...patch } }))
    if (patch.volume !== undefined) layerAudioGraphRef.current?.setLayerVolume(id, patch.volume)
    if (patch.muted !== undefined) layerAudioGraphRef.current?.setMuted(id, patch.muted)
  }

  function toggleLayerSolo(id: LayerId) {
    const next = layerSolo === id ? null : id
    setLayerSolo(next)
    layerAudioGraphRef.current?.setSolo(id)
  }

  function resetLayerMix() {
    setLayerControls(defaultLayerControls())
    setLayerSolo(null)
    if (layerSolo) layerAudioGraphRef.current?.setSolo(layerSolo)
    for (const layer of LAYERS) {
      layerAudioGraphRef.current?.setLayerVolume(layer.id, 0.3)
      layerAudioGraphRef.current?.setMuted(layer.id, false)
    }
    setPracticeMixMode('original')
  }

  function stopGuide() {
    if (guideTimerRef.current !== null) window.clearInterval(guideTimerRef.current)
    guideTimerRef.current = null
    setGuideOn(false)
    setMetronomeOn(false)
  }

  async function loadFile(file?: File) {
    if (!file) return
    clearCurrentSession()
    setFileName(file.name)
    setError('')
    setLoadingStep('checking')
    const controller = new AbortController()
    loadAbortRef.current = controller

    try {
      const nextSession = await openLocalMedia(file, {
        signal: controller.signal,
        onStep: setLoadingStep,
      })
      if (controller.signal.aborted) {
        nextSession.dispose()
        return
      }
      const element = nextSession.element
      const host = mediaHostRef.current
      if (!host) {
        nextSession.dispose()
        return
      }
      host.replaceChildren(element)
      element.addEventListener('timeupdate', () => setCurrentTime(element.currentTime))
      element.addEventListener('play', () => setIsPlaying(true))
      element.addEventListener('pause', () => setIsPlaying(false))
      element.addEventListener('ended', () => setIsPlaying(false))
      element.addEventListener('waiting', () => setIsBuffering(true))
      element.addEventListener('playing', () => setIsBuffering(false))
      element.addEventListener('canplay', () => setIsBuffering(false))
      element.addEventListener('error', () => {
        setError(messageForMediaFailure(mediaErrorForElement(element)))
        setIsPlaying(false)
      })
      sessionRef.current = nextSession
      setSession(nextSession)
      setLoadingStep(null)
      loadAbortRef.current = null
      currentFileRef.current = file
      runAnalysis(file, nextSession.duration)
    } catch (loadError) {
      if (controller.signal.aborted) return
      setError(messageForMediaFailure(loadError))
      setLoadingStep(null)
      loadAbortRef.current = null
    }
  }

  useEffect(() => () => {
    loadAbortRef.current?.abort()
    analysisAbortRef.current?.abort()
    separationAbortRef.current?.abort()
    stemPitchAbortRef.current?.abort()
    if (guideTimerRef.current !== null) window.clearInterval(guideTimerRef.current)
    void guideAudioRef.current?.close()
    void layerAudioGraphRef.current?.dispose()
    layerAudioGraphRef.current = null
    void separationPlaybackRef.current?.dispose()
    separationPlaybackRef.current = null
    if (separationResultRef.current) void deleteLocalSeparation(separationResultRef.current.runId)
    separationResultRef.current = null
    sessionRef.current?.dispose()
    sessionRef.current = null
  }, [])

  useEffect(() => {
    if (layerAudioGraphRef.current) layerAudioGraphRef.current.setMasterVolume(musicVolume)
    else if (session) session.element.volume = musicVolume
    separationPlaybackRef.current?.setMasterVolume(musicVolume)
  }, [session, musicVolume])

  useEffect(() => {
    if (session) {
      // BufferSource stems change pitch with rate; match the original audio to that behavior.
      session.element.preservesPitch = false
      session.element.playbackRate = playbackSpeed
    }
  }, [session, playbackSpeed])

  const bpm = manualBpm ?? undefined
  const effectiveFirstBeat = firstBeat ?? undefined
  const beatPeriod = bpm && bpm > 0 ? 60 / bpm : 0
  const displayedBeat = beatPeriod > 0 && effectiveFirstBeat !== undefined && currentTime >= effectiveFirstBeat
    ? Math.floor((currentTime - effectiveFirstBeat) / beatPeriod) % 4 + 1
    : 0
  const displayedMeasure = beatPeriod > 0 && effectiveFirstBeat !== undefined && currentTime >= effectiveFirstBeat
    ? Math.floor((currentTime - effectiveFirstBeat) / (beatPeriod * 4)) + 1
    : 0

  useEffect(() => {
    setBeatIndex(displayedBeat)
  }, [displayedBeat])

  useEffect(() => {
    const activeSession = session
    if (!activeSession || !loopRef.current) return
    const onTimeUpdate = () => {
      const loop = loopRef.current
      if (loop && activeSession.element.currentTime >= loop.end) {
        activeSession.element.currentTime = loop.start
        setCurrentTime(loop.start)
      }
    }
    activeSession.element.addEventListener('timeupdate', onTimeUpdate)
    return () => activeSession.element.removeEventListener('timeupdate', onTimeUpdate)
  }, [session, loopStart, loopEnd])

  useEffect(() => {
    const activeSession = session
    if ((!guideOn && !metronomeOn) || !activeSession || !bpm || effectiveFirstBeat === undefined) return
    const context = new AudioContext()
    void context.resume()
    guideAudioRef.current = context
    const countBuffers = guideOn ? makeFakeCountBuffers(context) : null
    const limiter = context.createDynamicsCompressor()
    limiter.threshold.value = -4
    limiter.knee.value = 6
    limiter.ratio.value = 8
    limiter.attack.value = 0.003
    limiter.release.value = 0.08
    limiter.connect(context.destination)
    const period = 60 / bpm / subdivision
    let nextStep = Math.max(0, Math.ceil((activeSession.element.currentTime - effectiveFirstBeat) / period))
    let previousMediaTime = activeSession.element.currentTime
    const scheduleTick = () => {
      const now = activeSession.element.currentTime
      if (now + 0.12 < previousMediaTime) nextStep = Math.max(0, Math.ceil((now - effectiveFirstBeat) / period))
      previousMediaTime = now
      if (activeSession.element.paused || now + 0.12 < effectiveFirstBeat) return
      while (effectiveFirstBeat + nextStep * period <= now + 0.12) {
        const targetTime = effectiveFirstBeat + nextStep * period
        const countStep = countStyle === 'ta' ? makeTaPattern(nextStep, subdivision as 1 | 2 | 4) : countPattern(nextStep, subdivision as 1 | 2 | 4)
        const isStrongBeat = countStep.isStrong
        const startAt = context.currentTime + Math.max(0, (targetTime - now) / activeSession.element.playbackRate)
        if (metronomeOn && metronomeVolumeRef.current > 0) {
          const oscillator = context.createOscillator()
          const clickGain = context.createGain()
          oscillator.type = 'triangle'
          oscillator.frequency.value = isStrongBeat ? 1150 : 820
          clickGain.gain.setValueAtTime(0.0001, startAt)
          clickGain.gain.linearRampToValueAtTime(metronomeVolumeRef.current * (isStrongBeat ? 0.9 : 0.62), startAt + 0.002)
          clickGain.gain.exponentialRampToValueAtTime(0.0001, startAt + Math.min(0.045, period * 0.4))
          oscillator.connect(clickGain).connect(limiter)
          oscillator.start(startAt)
          oscillator.stop(startAt + Math.min(0.05, period * 0.45))
        }
        if (guideOn && countBuffers && guideVolumeRef.current > 0) {
          const voice = context.createBufferSource()
          const voiceGain = context.createGain()
          const buffer = countBuffers[countStep.syllable as CountSyllable]
          voice.buffer = buffer
          voice.playbackRate.value = Math.min(2.7, Math.max(1, buffer.duration / Math.max(0.04, period * 0.88)))
          voiceGain.gain.setValueAtTime(0, startAt)
          voiceGain.gain.linearRampToValueAtTime(guideVolumeRef.current * (isStrongBeat ? 1 : 0.72), startAt + 0.004)
          voiceGain.gain.exponentialRampToValueAtTime(0.001, startAt + Math.min(0.22, period * 0.94))
          voice.connect(voiceGain).connect(limiter)
          voice.start(startAt)
          voice.stop(startAt + Math.min(buffer.duration / voice.playbackRate.value, period * 0.98))
        }
        nextStep += 1
      }
    }
    const timer = window.setInterval(scheduleTick, 25)
    guideTimerRef.current = timer
    return () => {
      window.clearInterval(timer)
      if (guideTimerRef.current === timer) guideTimerRef.current = null
      void context.close()
      if (guideAudioRef.current === context) guideAudioRef.current = null
    }
  }, [guideOn, metronomeOn, session, bpm, effectiveFirstBeat, subdivision, countStyle])

  function adjustBeatOffset(delta: number) {
    if (effectiveFirstBeat === undefined) return
    const next = Math.max(0, Math.min(session?.duration ?? Number.MAX_SAFE_INTEGER, effectiveFirstBeat + delta))
    setFirstBeat(next)
  }

  function tapToAlign() {
    const now = session?.element.currentTime ?? 0
    const history = [...tapTimesRef.current.filter((time) => now - time <= 3), now]
    tapTimesRef.current = history.slice(-8)
    setFirstBeat(history.at(-1) ?? now)
    if (history.length >= 2) {
      const intervals = history.slice(1).map((time, index) => time - history[index]).filter((interval) => interval >= 0.25 && interval <= 1)
      if (intervals.length) setManualBpm(Math.round(60 / (intervals.reduce((sum, value) => sum + value, 0) / intervals.length)))
    }
  }

  function startLoop() {
    if (!session || currentTime >= session.duration) return
    const end = Math.min(session.duration, currentTime + pattern * 60 / (bpm ?? 120))
    setLoopStart(currentTime)
    setLoopEnd(end)
    loopRef.current = { start: currentTime, end }
    session.element.currentTime = currentTime
  }

  function resetAlignment() {
    setFirstBeat(automaticFirstBeat)
    setManualBpm(automaticBpm)
    tapTimesRef.current = []
  }

  async function togglePlayback() {
    if (!session) return
    setError('')
    if (!session.element.paused) {
      session.element.pause()
      return
    }
    try {
      await session.element.play()
    } catch {
      setError('Playback was blocked by the browser. Press Play again to start the audio.')
    }
  }

  function restart() {
    if (!session) return
    const shouldResume = !session.element.paused
    session.element.currentTime = 0
    setCurrentTime(0)
    if (shouldResume) void session.element.play().catch(() => setError('Playback could not restart. Press Play to try again.'))
  }

  function seek(value: string) {
    if (!session) return
    const time = Number(value)
    session.element.currentTime = time
    setCurrentTime(time)
  }

  function onDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault()
    setIsDragging(false)
    void loadFile(event.dataTransfer.files[0])
  }

  return (
    <main className="app-shell player-shell">
      <header className="topbar">
        <a className="wordmark" href="#top" aria-label="BeatTrace home"><span className="mark">b</span>beattrace</a>
        <div className="topbar-note"><span className="status-dot" /> Music for movement</div>
      <span className="phase-tag">{activeMode.toUpperCase()} MODE</span>
      </header>

      <section className="player-intro" id="top">
        <div className="eyebrow"><span>START WITH A SONG</span><span className="eyebrow-line" /></div>
        <h1>Listen closer.<br /><em>Move your way.</em></h1>
        <p className="hero-description">Bring in a track from your device. BeatTrace opens it in your browser so you can listen and practice with your music close at hand.</p>
      </section>

      <section
        className={`drop-zone${isDragging ? ' is-dragging' : ''}${session ? ' has-track' : ''}`}
        onDragEnter={(event) => { event.preventDefault(); setIsDragging(true) }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => {
          const nextTarget = event.relatedTarget
          if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) setIsDragging(false)
        }}
        onDrop={onDrop}
        aria-label="Local audio file area"
      >
        {!session && !loadingStep ? (
          <>
            <div className="upload-symbol" aria-hidden="true">↑</div>
            <h2>Bring your music in</h2>
            <p>Drop a file here, or choose one from your device.</p>
            <button className="primary-button upload-button" onClick={() => inputRef.current?.click()} type="button">Choose a file <span aria-hidden="true">↗</span></button>
            <span className="format-note">MP3 · WAV · M4A · MP4 · and browser-supported audio</span>
          </>
        ) : loadingStep ? (
          <div className="loading-state" role="status"><span className="loading-orbit" /><strong>{loadingLabels[loadingStep]}</strong><span>{fileName}</span></div>
        ) : (
          <div className="track-header">
            <div className="track-icon" aria-hidden="true">♫</div>
            <div className="track-meta"><span className="track-eyebrow">NOW LISTENING</span><h2 title={fileName}>{fileName}</h2><p>{session?.isVideoContainer ? `${fileName.toLowerCase().endsWith('.mp4') ? 'MP4' : 'Video'} audio track · video image ignored` : 'Playing from your device'}</p></div>
            <button className="change-button" onClick={() => inputRef.current?.click()} type="button">Change file <span aria-hidden="true">↗</span></button>
          </div>
        )}
        <input
          ref={inputRef}
          className="file-input"
          type="file"
          accept="audio/*,video/*,.mp3,.wav,.m4a,.mp4,.aac,.oga,.ogg,.opus,.flac,.aiff,.aif,.mpga,.mpeg,.webm,.mov,.mkv,.m4v"
          onChange={(event) => { void loadFile(event.currentTarget.files?.[0]); event.currentTarget.value = '' }}
          aria-label="Choose audio or video file"
        />
        <div className="media-host" ref={mediaHostRef} aria-hidden="true" />

        {session && (
          <div className="player-controls" aria-label="Audio playback controls">
            <div className="transport-row">
              <button className="transport-button restart-button" type="button" onClick={restart} aria-label="Restart">↺</button>
              <button className="transport-button play-button" type="button" onClick={() => void togglePlayback()} aria-label={isPlaying ? 'Pause' : 'Play'}>{isPlaying ? 'Ⅱ' : '▶'}</button>
              <span className="playback-status">{isBuffering ? 'Buffering…' : isPlaying ? 'Playing' : 'Ready'}</span>
              <button className="change-button compact-change" onClick={() => inputRef.current?.click()} type="button">Change file</button>
            </div>
            <div className="seek-row">
              <span>{formatTime(currentTime)}</span>
              <input type="range" min="0" max={session.duration} step="0.05" value={Math.min(currentTime, session.duration)} onChange={(event) => seek(event.currentTarget.value)} aria-label="Seek through audio" style={{ '--seek-progress': `${(currentTime / session.duration) * 100}%` } as CSSProperties} />
              <span>{formatTime(session.duration)}</span>
            </div>
            <div className="music-volume-row"><label htmlFor="music-volume">Music volume <strong>{Math.round(musicVolume * 100)}%</strong></label><input id="music-volume" type="range" min="0" max="1" step="0.01" value={musicVolume} onChange={(event) => setMusicVolume(Number(event.currentTarget.value))} aria-label="Uploaded music volume" /></div>
            <div className="music-volume-row"><label htmlFor="playback-speed">Practice speed <strong>{playbackSpeed.toFixed(2)}×</strong></label><input id="playback-speed" type="range" min="0.5" max="1.5" step="0.05" value={playbackSpeed} onChange={(event) => setPlaybackSpeed(Number(event.currentTarget.value))} aria-label="Practice playback speed" /></div>
            <p className="speed-note">Changing speed also changes pitch so the original mix and optional AI stems stay consistent.</p>
          </div>
        )}
      </section>

      {error && <div className="error-message" role="alert"><span aria-hidden="true">!</span><p>{error}</p><button type="button" onClick={() => setError('')} aria-label="Dismiss error">×</button></div>}

      <section className="privacy-card" aria-label="Privacy information">
        <div className="privacy-icon" aria-hidden="true">◌</div>
        <div><h2>Your music stays yours.</h2><p>Audio is processed locally in your browser whenever possible and is not uploaded by default. Optional AI sends the file only to this computer after you choose its analysis button; the local service removes its temporary copy. No cloud analysis is connected.</p></div>
        {session && <button type="button" className="remove-button" onClick={() => { clearCurrentSession(); mediaHostRef.current?.replaceChildren(); setFileName(''); setError('') }}>Remove audio</button>}
      </section>

      {session && <nav className="mode-tabs" aria-label="Practice mode"><button type="button" className={activeMode === 'beginner' ? 'is-active' : ''} onClick={() => setActiveMode('beginner')}>Beginner mode</button><button type="button" className={activeMode === 'intermediate' ? 'is-active' : ''} onClick={() => setActiveMode('intermediate')}>Intermediate mode</button><button type="button" className={activeMode === 'advanced' ? 'is-active' : ''} onClick={() => setActiveMode('advanced')}>Advanced mode</button></nav>}

      {session && analysis && activeMode === 'advanced' && <section className="advanced-model-actions"><div><span className="track-eyebrow">ADVANCED ANALYSIS</span><h2>Drums and pitched layers</h2><p>Run local Demucs to estimate kick, snare, hi-hat and other drum attacks, then Basic Pitch on the bass and accompaniment stems. Drum categories use spectral rules, and accompaniment instruments are not individually identified.</p></div><button className="secondary-button" type="button" onClick={() => void tryTranscribeStems()} disabled={stemPitchBusy || separationBusy}>{stemPitchBusy ? 'Analyzing locally…' : 'Analyze musical details'}</button>{stemPitchBusy && <button className="secondary-button" type="button" onClick={() => { stemPitchAbortRef.current?.abort(); separationAbortRef.current?.abort(); setStemPitchMessage('Advanced analysis cancelled.') }}>Cancel</button>}{stemPitchMessage && <p className="model-status" role="status">{stemPitchMessage}</p>}</section>}

      {session && analysis && activeMode === 'advanced' && <VerticalMusicTimeline summary={analysis} notes={aiNotes} stemActivity={stemActivity} drumHits={drumHits} media={session.element} onSeek={(seconds) => seek(String(seconds))} loop={loopStart !== null && loopEnd !== null ? { start: loopStart, end: loopEnd } : null} />}

      {session && activeMode === 'beginner' && <section className="beginner-panel" aria-label="Beginner practice tools">
        <div className="section-heading"><div><span className="track-eyebrow">BEGINNER MODE</span><h2>Find a pulse. Make it yours.</h2></div><span className="analysis-badge">{analysis?.mode === 'local-model' ? 'LOCAL AI · BEATNET' : analysis?.mode === 'cloud-model' ? 'CLOUD AI' : analysis ? 'TRADITIONAL DSP' : analysisProgress ? 'ANALYZING' : 'READY'}</span></div>
        {analysisProgress && <div className="analysis-progress" role="status"><span>{analysisProgress.stage}</span><span>{analysisProgress.progress === null ? '…' : `${Math.round(analysisProgress.progress * 100)}%`}</span><button type="button" className="text-button" onClick={cancelAnalysis}>Cancel</button><div><i style={{ width: `${Math.round((analysisProgress.progress ?? 0.08) * 100)}%` }} /></div></div>}
        {analysisError && <div className="analysis-error" role="alert"><span>{analysisError}</span><button type="button" onClick={() => { if (currentFileRef.current && session) runAnalysis(currentFileRef.current, session.duration) }}>Retry analysis</button><button type="button" onClick={() => setAnalysisError('')}>Dismiss</button></div>}
        {analysis && <>
          <div className="model-choice"><div><strong>Optional local AI beat analysis</strong><p>BeatNet runs on this computer through a local service. Your file is sent only to that service after you choose the button. Traditional analysis remains available if it is missing, times out, or returns uncertain results.</p></div><div className="model-choice-actions"><button type="button" className="secondary-button" onClick={tryLocalModel} disabled={isTryingModel}>{isTryingModel ? 'Analyzing locally…' : 'Try local AI'}</button>{isTryingModel && <button type="button" className="secondary-button" onClick={cancelAnalysis}>Cancel</button>}</div></div>
          {modelMessage && <p className="model-status" role="status">{modelMessage}</p>}
          <div className="practice-summary">
            <div className="bpm-card"><span>ESTIMATED TEMPO</span><strong>{bpm ? `${bpm}` : '—'}<small> BPM</small></strong><span>{analysis.bpmConfidence === undefined ? 'No reliable pulse found' : `Approx. ${Math.round(analysis.bpmConfidence * 100)}% pulse confidence`}</span><span>{analysis.firstBeatConfidence === undefined ? 'First beat uncertain' : `First-beat confidence · approx. ${Math.round(analysis.firstBeatConfidence * 100)}%`}</span></div>
            <div className="beat-cue" aria-live="polite"><span>4-BEAT PRACTICE GRID</span><strong className={beatIndex === 1 ? 'beat-flash is-strong' : 'beat-flash'}>{beatIndex || '·'}</strong><span>{beatIndex ? `Beat ${beatIndex} · Measure ${displayedMeasure}` : 'Press play to follow'}</span></div>
            <div className="bpm-adjust"><label htmlFor="bpm-range">Adjust tempo <strong>{bpm ?? 120} BPM</strong></label><input id="bpm-range" type="range" min="60" max="200" step="1" value={bpm ?? 120} onChange={(event) => setManualBpm(Number(event.currentTarget.value))} /></div>
          </div>
          <div className="analysis-metrics"><div><span>RHYTHMIC DENSITY</span><strong>{Math.round((analysis.averageDensity ?? 0) * 100)}%</strong><small>Relative onset activity in active audio</small></div><div><span>REPEAT SIMILARITY</span><strong>{analysis.repetitionSimilarity === undefined ? '—' : `${Math.round(analysis.repetitionSimilarity * 100)}%`}</strong><small>Rough onset-pattern match over a multi-second offset</small></div></div>
          <p className="practice-caveat">Tempo and first beat are estimates. The 4-beat grid is a practice aid, not a verified meter; tap or nudge it to match what you hear.{analysis.meterNumerator ? ` Local model meter estimate: ${analysis.meterNumerator}/${analysis.meterDenominator ?? 4}.` : ''}</p>
          <div className="alignment-controls"><span>First beat {effectiveFirstBeat === undefined ? 'not found' : `${effectiveFirstBeat.toFixed(2)}s`}</span><button className="secondary-button" type="button" onClick={tapToAlign}>Tap to align</button><button className="secondary-button" type="button" onClick={() => adjustBeatOffset(-0.05)} disabled={effectiveFirstBeat === undefined}>Earlier 50 ms</button><button className="secondary-button" type="button" onClick={() => adjustBeatOffset(0.05)} disabled={effectiveFirstBeat === undefined}>Later 50 ms</button><button className="secondary-button" type="button" onClick={resetAlignment} disabled={automaticFirstBeat === null && automaticBpm === null}>Reset alignment</button><button className="secondary-button" type="button" onClick={() => { if (currentFileRef.current && session) runAnalysis(currentFileRef.current, session.duration) }}>Re-analyze</button></div>
          <EnergyTimeline summary={analysis} currentTime={currentTime} onSeek={(time) => seek(String(time))} firstBeatSeconds={effectiveFirstBeat} bpm={bpm} />
          <div className="practice-tools">
            <div className="practice-tool"><h3>Practice a short pattern</h3><div className="control-row"><label htmlFor="pattern-length">Pattern</label><select id="pattern-length" value={pattern} onChange={(event) => setPattern(Number(event.currentTarget.value))}><option value="4">4 beats</option><option value="8">8 beats</option><option value="16">16 beats</option></select><button type="button" className="secondary-button" onClick={startLoop}>Set loop here</button><button type="button" className="text-button" onClick={() => { loopRef.current = null; setLoopStart(null); setLoopEnd(null) }} disabled={loopStart === null}>Clear loop</button></div>{loopStart !== null && loopEnd !== null && <p className="loop-state">Loop {formatTime(loopStart)} – {formatTime(loopEnd)}</p>}</div>
            <div className="practice-tool"><h3>Practice sounds</h3><div className="control-row"><label htmlFor="subdivision">Subdivision</label><select id="subdivision" value={subdivision} onChange={(event) => setSubdivision(Number(event.currentTarget.value))}><option value="1">Quarter notes</option><option value="2">Eighth notes</option><option value="4">Sixteenth notes</option></select><label htmlFor="count-style">Count style</label><select id="count-style" value={countStyle} onChange={(event) => setCountStyle(event.currentTarget.value as 'numbers' | 'ta')}><option value="numbers">1 and 2 and…</option><option value="ta">1 ta ta ta…</option></select></div><div className="sound-volume-row"><button type="button" className={metronomeOn ? 'secondary-button is-active' : 'secondary-button'} onClick={() => setMetronomeOn(!metronomeOn)}>{metronomeOn ? 'Metronome on' : 'Metronome off'}</button><label htmlFor="metronome-volume">Click volume <strong>{Math.round(metronomeVolume * 100)}%</strong></label><input id="metronome-volume" type="range" min="0" max="1" step="0.01" value={metronomeVolume} onChange={(event) => { const volume = Number(event.currentTarget.value); metronomeVolumeRef.current = volume; setMetronomeVolume(volume) }} aria-label="Metronome volume" /></div><div className="sound-volume-row"><button type="button" className={guideOn ? 'secondary-button is-active' : 'secondary-button'} onClick={() => setGuideOn(!guideOn)}>{guideOn ? 'Count guide on' : 'Count guide off'}</button><label htmlFor="guide-volume">Voice-like volume <strong>{Math.round(guideVolume * 100)}%</strong></label><input id="guide-volume" type="range" min="0" max="1" step="0.01" value={guideVolume} onChange={(event) => { const volume = Number(event.currentTarget.value); guideVolumeRef.current = volume; setGuideVolume(volume) }} aria-label="Voice-like count guide volume" /></div><p className="loop-state">The count guide uses locally synthesized formant-shaped syllables, not a person, AI, system TTS, recording, or network service. Beat one is accented. A compressor controls peaks when both guides play together.</p></div>
          </div>
        </>}
      </section>}

      {session && activeMode === 'intermediate' && analysis && <section className="beginner-panel intermediate-section" aria-label="Intermediate layer practice">
        <div className="section-heading"><div><span className="track-eyebrow">INTERMEDIATE MODE</span><h2>Estimated musical layers</h2></div><span className="analysis-badge">FREQUENCY APPROXIMATION</span></div>
        <LayerPracticePanel summary={analysis} currentTime={currentTime} controls={layerControls} setControl={updateLayerControl} mode={mixMode} setMode={setPracticeMixMode} solo={layerSolo} toggleSolo={toggleLayerSolo} reset={resetLayerMix} masterVolume={musicVolume} onA={() => setPracticeMixMode(mixMode === 'original' ? 'layers' : 'original')} onSeparate={() => void trySeparateStems()} separationBusy={separationBusy} separationMessage={separationMessage} separationError={separationError} separated={Boolean(separationResult)} stemControls={stemControls} setStemControl={setStemControl} />
      </section>}

      {session && activeMode === 'intermediate' && !analysis && analysisProgress && <section className="beginner-panel" aria-live="polite"><p className="model-status">{analysisProgress.stage} · {Math.round((analysisProgress.progress ?? 0) * 100)}%</p><button type="button" className="secondary-button" onClick={cancelAnalysis}>Cancel analysis</button></section>}

      {session && analysis && activeMode === 'advanced' && <FullSongStructure summary={analysis} currentTime={currentTime} onSeek={(seconds) => seek(String(seconds))} />}
      {session && analysis && activeMode === 'advanced' && <section className="advanced-events"><h2>Upcoming musical events</h2><p>These cues come from pre-analysis of this file. They are estimates, not predictions of unknown audio.</p>{analysis.events.filter((event) => event.timestamp >= currentTime - 1).slice(0, 12).map((event) => <button type="button" key={event.id} onClick={() => seek(String(event.timestamp))}><strong>{Math.abs(event.timestamp - currentTime) <= 1 ? 'CURRENT' : 'UPCOMING'}</strong><span>{event.section ?? event.type.replace('-', ' ')}</span><small>{event.timestamp.toFixed(1)}s{event.confidence === undefined ? ' · estimated' : ` · approx. ${Math.round(event.confidence * 100)}%`}</small></button>)}</section>}

      {session && analysis && activeMode !== 'beginner' && <MelodyAnalysisPanel summary={analysis} currentTime={currentTime} modelContour={aiMelodyContour} busy={melodyBusy} progress={melodyProgress} message={melodyMessage} onAnalyze={() => void tryBasicPitch()} onCancel={cancelMelodyAnalysis} />}

      <section className="phase-note"><span className="phase-note-number">06–17</span><p><strong>Estimated musical structure and melody contour.</strong> Frequency layers are not isolated instruments, and pitch or event timing can be uncertain in dense mixes. Use these cues as practice aids.</p></section>
      <footer className="footer"><span>BEATTRACE <span className="footer-dot">·</span> MUSIC FOR MOVEMENT</span><span>Understand the music. Make it your own.</span></footer>
    </main>
  )
}

export default App

function FullSongStructure({ summary, currentTime, onSeek }: { summary: AnalysisSummary; currentTime: number; onSeek: (seconds: number) => void }) {
  const frames = summary.frames
  const buckets = Array.from({ length: 48 }, (_, index) => {
    const start = Math.floor(index * frames.length / 48)
    const end = Math.max(start + 1, Math.floor((index + 1) * frames.length / 48))
    const group = frames.slice(start, end)
    return { index, energy: group.reduce((sum, frame) => sum + frame.energy, 0) / Math.max(1, group.length), density: group.reduce((sum, frame) => sum + frame.density, 0) / Math.max(1, group.length) }
  })
  const span = Math.min(summary.durationSeconds, Math.max(12, 8 * (60 / (summary.estimatedBpm ?? 100)) * 4))
  const focusStart = Math.max(0, Math.min(summary.durationSeconds - span, currentTime - span * 0.45))
  const focusSection = String.fromCharCode(65 + Math.min(5, Math.floor(focusStart / Math.max(0.01, summary.durationSeconds) * 6)))
  const upcoming = summary.events.filter((event) => event.timestamp >= currentTime && event.timestamp <= currentTime + 16).slice(0, 8)
  return <section className="structure-panel" aria-label="Full song structure">
    <div className="section-heading"><div><span className="track-eyebrow">MUSIC ANALYSIS</span><h2>Full-song structure</h2></div><span className="analysis-badge">ESTIMATED · LOCAL DSP</span></div>
    <p className="structure-caveat">Neutral sections and event cues are derived from energy, density, and silence. They do not identify verse, chorus, or bridge.</p>
    <div className="structure-overview" role="group" aria-label="Song overview timeline">
      {buckets.map((bucket) => <button key={bucket.index} type="button" title={`Section ${String.fromCharCode(65 + Math.floor(bucket.index / 8))} · energy ${Math.round(bucket.energy * 100)}% · density ${Math.round(bucket.density * 100)}%`} aria-label={`Seek to ${Math.round(bucket.index / 48 * summary.durationSeconds)} seconds; estimated energy ${Math.round(bucket.energy * 100)} percent`} onClick={() => onSeek(bucket.index / 48 * summary.durationSeconds)} style={{ height: `${Math.max(5, bucket.energy * 100)}%`, opacity: `${0.35 + bucket.density * 0.65}` }} />)}
      <i className="structure-playhead" style={{ left: `${summary.durationSeconds ? currentTime / summary.durationSeconds * 100 : 0}%` }} />
      <i className="structure-focus" style={{ left: `${summary.durationSeconds ? focusStart / summary.durationSeconds * 100 : 0}%`, width: `${summary.durationSeconds ? span / summary.durationSeconds * 100 : 0}%` }} />
    </div>
    <div className="structure-legend"><span>Low energy / sparse</span><span>High energy / dense</span><span>Focus window ≈ {Math.round(span)}s</span></div>
    <div className="structure-sections">{buckets.filter((_, i) => i % 8 === 0).map((_, i) => <button type="button" key={i} onClick={() => onSeek(i / 6 * summary.durationSeconds)}>Section {String.fromCharCode(65 + i)}</button>)}</div>
    <div className="focus-events"><strong>Current section focus · Section {focusSection}</strong><span>Previous: {currentTime > 0 ? 'music and energy already analyzed' : 'start of track'}</span><span>Next: {upcoming.map((event) => `${Math.round(event.timestamp - currentTime)}s ${event.section ?? event.type.replace('-', ' ')}`).join(' · ') || 'No notable event estimated nearby'}</span></div>
  </section>
}
