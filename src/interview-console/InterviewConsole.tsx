import ManualQuestionInput from './ManualQuestionInput'
import InterviewRecordsPanel from './InterviewRecordsPanel'
import { createInterviewRecorder, type RecorderStatus } from './interviewRecorder'
import { classifyInterviewQuestion } from './questionIntent'
import { INTERVIEW_PROFILE_EVENT, INTERVIEW_PROFILE_STORAGE_KEY, loadInterviewProfile, resolveInterviewScope, interviewScopeLabel, type InterviewProfile, type InterviewRetrievalScope } from './interviewScope'
import { useEffect, useMemo, useReducer, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type UIEvent as ReactUIEvent } from 'react'
import { Activity, ChevronDown, CircleStop, Headphones, History as HistoryIcon, Mic, Play, Radio, RotateCcw, Settings, Sparkles, Timer } from 'lucide-react'
import { splitGistLineStreaming } from '../lib/displayMarkup'
import { DEMO_ANSWER, DEMO_HITS, DEMO_QUESTION, DEMO_TRANSCRIPT, type SessionStatus, nextStatusAfterStart } from './demoSession'
import { appendFinalTurn, buildRecentInterviewContext, isTranscriptAtOrBefore, shouldTriggerInterviewAnswer, type InterviewTurn } from './interviewContext'
import { shouldAcceptQuestionFinal, isAnswerableInterviewQuestion } from './questionTiming'
import { normalizeInterviewQuestion } from './questionNormalization'
import { toSimplifiedChinese } from './simplifiedChinese'
import { buildInterviewConsolePrompt } from './interviewPrompt'
import { hasIntroductionEvidence, createAnswerPrewarmCache } from './answerPrewarm'
import { loadInterviewPrompt } from './interviewPromptSettings'
import { createPartialPrewarmGate } from './partialPrewarm'
import { createCandidateGenerationController } from './candidateGeneration'
import { createProviderDeadlineController } from './providerDeadlineController'
import { answerHistoryReducer, createAnswerHistoryState, getSelectedAnswer, type InterviewAnswerHit, type InterviewAnswerItem, type AnswerHistoryAction } from './answerHistory'
import { createLatencyTrace, interviewProviderDeadlineMs, type LatencyRecord } from './latencyTelemetry'
import { recordRoundEvent, resetRoundEvents, recordTranscriptDiagnostics, recordTranscriptResetDiagnostics, computeAcceptedFinalGaps } from './roundEventsWindow'
import { createQuestionRoundCoordinator, type RoundAction } from './questionRoundCoordinator'
import { INTERVIEW_FONT_DEFAULTS, INTERVIEW_FONT_MAX, INTERVIEW_FONT_MIN, adjustInterviewFontSize, loadInterviewFontSizes, saveInterviewFontSizes, type InterviewFontSizes } from './interviewFontSettings'
import { loadCandidateContextEnabled, saveCandidateContextEnabled } from './candidateContextSettings'
import { INTERVIEW_ANSWER_LEVEL_OPTIONS, loadInterviewAnswerLevel, saveInterviewAnswerLevel, type InterviewAnswerLevel } from './interviewAnswerLevel'
import { createCandidateSpeechCleanupCoordinator, type CandidateCleanupStatus, type CandidateSpeechCleanupCoordinator } from './candidateSpeechCleanup'
import { createInterviewerDisplayCorrectionCoordinator, type InterviewerDisplayCorrectionCoordinator } from './interviewerDisplayCorrection'
import { createQuestionCorrectionExtractor, flushResolvedCorrectionExtractor, stripCorrectionSection, type CorrectionExtractor } from './questionCorrectionExtractor'
import { buildTranscriptDisplayWindow, isNearTranscriptBottom, type TranscriptDisplayWindow } from './transcriptDisplayWindow'
import { buildLongSessionHealthSnapshot, LONG_SESSION_HEALTH_INTERVAL_MS, type LongSessionHealthSnapshot } from './longSessionHealth'
import WindowControls from '../components/WindowControls'
import './InterviewConsole.css'

const STATUS_COPY: Record<SessionStatus, string> = { ready: '准备就绪', recording: '正在采集', transcribing: '识别中', answered: '回答已生成' }
const formatTime = (seconds: number) => `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`

type Hit = InterviewAnswerHit
type InterviewConsoleProps = { onOpenSettings: (tab: string) => void }
type AnswerJob = { id: number; question: string; analysisQuestion: string; conversationContext: string; answerLevel: InterviewAnswerLevel; englishMode: boolean; customInstructions: string; profile: InterviewProfile; scope: InterviewRetrievalScope; currentProjects: string[]; manual: boolean; generation: number; roundId: number; attemptId: number; roundSessionGeneration: number }
type ActiveAnswer = AnswerJob & { streamId?: number; settled: boolean; stale: boolean }
type CandidateStream = { generationId: number; question: string; streamId?: number; settled: boolean }
type LatencyTrace = ReturnType<typeof createLatencyTrace>
type TranscriptProbeEvent = {
  kind: 'partial' | 'final' | 'reset'
  sequence: number
  sessionId: number
  speaker: string
  segmentId?: number
}
type InterviewLatencyWindow = Window & {
  __nativelyInterviewLatencyRecords?: LatencyRecord[]
  __nativelyInjectInterviewProviderTimeout?: boolean
  __nativelyInterviewTranscriptEvents?: TranscriptProbeEvent[]
  __nativelyInterviewHealthSnapshots?: LongSessionHealthSnapshot[]
}

type PerformanceWithMemory = Performance & { memory?: { usedJSHeapSize?: number } }

const answerExtractorKey = (answerId: number, attemptId: number) => `answer:${answerId}:${attemptId}`

const ANSWER_STATUS_COPY: Record<InterviewAnswerItem['status'], string> = {
  queued: '排队中',
  generating: '生成中',
  answered: '已完成',
  error: '生成失败',
  interrupted: '已中断',
}

function AnswerPanel({ demo, question, answer, candidateText, hits, history, selectedId, answerStatus, answerSource, answerError, onSelectAnswer, onLoadDemo }: {
  demo: boolean;
  question: string;
  answer: string;
  candidateText: string;
  hits: Hit[];
  history: InterviewAnswerItem[];
  selectedId: number | null;
  answerStatus: InterviewAnswerItem['status'] | null;
  answerSource?: InterviewAnswerItem['answerSource'];
  answerError?: string;
  onSelectAnswer: (id: number) => void;
  onLoadDemo: () => void;
}) {
  if (!demo && !question && !answer && history.length === 0) return <div className="answer-empty"><div className="empty-orb"><Sparkles size={22} /></div><h3>回答区已就绪</h3><p>确认问题后，这里会显示题库命中、流式回答和追问提示。</p><button onClick={onLoadDemo}>加载演示内容</button></div>
  const shownHits = demo ? DEMO_HITS : hits
  const spokenAnswer = demo ? DEMO_ANSWER.spoken : splitGistLineStreaming(answer).body
  const answerOutputLabel = answerStatus === 'error'
    ? answerSource === 'model' ? '回答未完成' : answerSource === 'reference' ? '题库参考' : answerSource === 'guidance' ? '作答提示' : '未生成答案'
    : '流式输出'
  const historyItems = history.slice().reverse()
  return <div className="answer-content">
    {!demo && history.length > 0 && <div className="answer-history" aria-label="历史问题"><div className="section-label"><span className="history-heading"><HistoryIcon size={13} />历史问题</span><span>{history.length}/10</span></div>{historyItems.map((item) => <button type="button" key={item.id} className={`history-item${item.id === selectedId ? ' selected' : ''}`} aria-pressed={item.id === selectedId} onClick={() => onSelectAnswer(item.id)}><span className="history-question">{item.question}</span><span className={`history-status status-${item.status}`}>{ANSWER_STATUS_COPY[item.status]}</span></button>)}</div>}
    {candidateText && <div className="spoken-answer candidate-answer"><div className="section-label">候选回答 <span className="accent-label">实时生成</span></div><p>{splitGistLineStreaming(candidateText).body}</p></div>}
    <div className="spoken-answer"><div className="section-label">{answerStatus === 'error' && answerSource !== 'model' ? '备用参考' : '口述版回答'} <span className="accent-label">{answerOutputLabel}</span></div><p>{spokenAnswer || '正在生成回答…'}</p></div>
    {answerStatus === 'error' && answerError && <p className="rail-error" role="status">生成未完成：{answerError}</p>}
    <div className="answer-divider" />
    <div className="hit-section"><div className="section-label">题库命中 <span>TOP {shownHits.length}</span></div>{shownHits.map((hit) => <div className="hit-row" key={hit.id}><div className="hit-index">{hit.id.split('.')[1] || '·'}</div><div className="hit-main"><strong>{hit.title}</strong><p>{hit.excerpt}</p><small>{hit.source === 'resume_fact' ? '简历事实' : '准备答案'} · {hit.score.toFixed(2)}</small></div></div>)}</div>
    {demo && <><div className="project-line"><span>结合我的项目</span><p>{DEMO_ANSWER.project}</p></div><div className="followup-line"><span>可能追问</span><ul>{DEMO_ANSWER.followUps.map((item) => <li key={item}>{item}</li>)}</ul></div><div className="boundary-line"><span>边界提醒</span><ul>{DEMO_ANSWER.boundaries.map((item) => <li key={item}>{item}</li>)}</ul></div></>}
  </div>
}

export default function InterviewConsole({ onOpenSettings }: InterviewConsoleProps) {
  const [status, setStatus] = useState<SessionStatus>('ready')
  const [audioCaptureActive, setAudioCaptureActive] = useState(false)
  const [source, setSource] = useState<'microphone' | 'system'>('system')
  const manualSubmitRef = useRef(false)
  const recognitionLanguageSyncRef = useRef(false)
  const [inputDevice, setInputDevice] = useState('default')
  const [outputDevice, setOutputDevice] = useState('default')
  const [audioDevices, setAudioDevices] = useState<Array<{ id: string; name: string }>>([])
  const [deviceError, setDeviceError] = useState('')
  const device = source === 'microphone' ? inputDevice : outputDevice
  useEffect(() => {
    let active = true
    let pending = false
    const refresh = async () => {
      if (pending) return
      pending = true
      try {
        const devices = source === 'microphone'
          ? await window.electronAPI?.getInputDevices?.()
          : await window.electronAPI?.getOutputDevices?.()
        if (active) { setAudioDevices(devices ?? []); setDeviceError('') }
      } catch { if (active) setDeviceError('读取音频设备失败，请检查连接') }
      finally { pending = false }
    }
    setAudioDevices([])
    void refresh()
    const interval = audioCaptureActive ? undefined : window.setInterval(() => { void refresh() }, 3000)
    return () => { active = false; window.clearInterval(interval) }
  }, [source, audioCaptureActive])
  const [chunkDuration, setChunkDuration] = useState('1 秒')
  const [elapsed, setElapsed] = useState(0)
  const [interviewerTranscriptWindow, setInterviewerTranscriptWindow] = useState<TranscriptDisplayWindow>({ text: '', folded: false })
  const [candidateTranscriptWindow, setCandidateTranscriptWindow] = useState<TranscriptDisplayWindow>({ text: '', folded: false })
  const [confirmedQuestion, setConfirmedQuestion] = useState('')
  const [answerState, dispatchVisibleAnswer] = useReducer(answerHistoryReducer, createAnswerHistoryState(10))
  const [recordsOpen, setRecordsOpen] = useState(false)
  const [recordStatus, setRecordStatus] = useState<RecorderStatus>({ kind: 'idle' })
  const [sessionBusy, setSessionBusy] = useState(false)
  const sessionBusyRef = useRef(false)
  const modelSnapshotRef = useRef('')
  const recorderRef = useRef<ReturnType<typeof createInterviewRecorder> | null>(null)
  if (!recorderRef.current) recorderRef.current = createInterviewRecorder({ api: window.electronAPI, onStatus: setRecordStatus })
  function dispatchAnswer(action: AnswerHistoryAction, context?: { model?: string; profile?: InterviewProfile; scope?: InterviewRetrievalScope; answerLevel?: string; englishMode?: boolean }) {
    dispatchVisibleAnswer(action)
    recorderRef.current?.action(action, context)
  }
  useEffect(() => () => { void recorderRef.current?.end('interrupted'); recorderRef.current?.dispose() }, [])
  const [error, setError] = useState('')
  const [showDemo, setShowDemo] = useState(false)
  const [candidateText, setCandidateText] = useState('')
  const [fontSizes, setFontSizes] = useState<InterviewFontSizes>(() => loadInterviewFontSizes())
  const [candidateContextEnabled, setCandidateContextEnabled] = useState(() => loadCandidateContextEnabled())
  const [englishMode, setEnglishMode] = useState(false)
  const [languageBusy, setLanguageBusy] = useState(true)
  const englishModeRef = useRef(false)
  useEffect(() => {
    let active = true
    window.electronAPI?.getAiResponseLanguage?.().then((value) => {
      if (!active) return
      englishModeRef.current = /^(English|en|en-US)$/i.test(value)
      setEnglishMode(englishModeRef.current)
    }).catch(() => {}).finally(() => { if (active) setLanguageBusy(false) })
    if (!window.electronAPI) setLanguageBusy(false)
    return () => { active = false }
  }, [])
  const [interviewProfile, setInterviewProfile] = useState(() => loadInterviewProfile())
  const interviewProfileRef = useRef(interviewProfile)
  const currentProjectsRef = useRef<string[]>([])
  const [activeScope, setActiveScope] = useState<InterviewRetrievalScope>({})
  const [answerLevel, setAnswerLevel] = useState<InterviewAnswerLevel>(() => loadInterviewAnswerLevel())
  const [candidateCleanupStatus, setCandidateCleanupStatus] = useState<CandidateCleanupStatus>('idle')
  const [followLatestTranscript, setFollowLatestTranscript] = useState(true)
  const [sttEngineLabel, setSttEngineLabel] = useState('Whisper')
  const consoleDragHandleRef = useRef<HTMLDivElement | null>(null)
  const transcriptScrollRef = useRef<HTMLDivElement | null>(null)
  const transcriptDisplayRef = useRef({ interviewer: interviewerTranscriptWindow, candidate: candidateTranscriptWindow })
  transcriptDisplayRef.current = { interviewer: interviewerTranscriptWindow, candidate: candidateTranscriptWindow }
  const sessionActiveRef = useRef(false)
  // Native capture is independent of the internal text/answer session.
  const audioCaptureRef = useRef(false)
  const committedInterviewerRef = useRef<InterviewTurn[]>([])
  const committedCandidateRef = useRef<InterviewTurn[]>([])
  const conversationTurnsRef = useRef<InterviewTurn[]>([])
  const candidateContextEnabledRef = useRef(candidateContextEnabled)
  candidateContextEnabledRef.current = source === 'system' && candidateContextEnabled
  const answerLevelRef = useRef(answerLevel)
  useEffect(() => {
    let active = true
    window.electronAPI?.getStoredCredentials?.().then((credentials) => {
      if (!active) return
      const labels: Partial<Record<typeof credentials.sttProvider, string>> = {
        'local-funasr': 'FunASR',
        'local-whisper': 'Whisper',
        'alibaba-fun-asr': '阿里云 FunASR',
        google: 'Google',
        groq: 'Groq Whisper',
        openai: 'OpenAI Whisper',
        deepgram: 'Deepgram',
      }
      setSttEngineLabel(labels[credentials.sttProvider] ?? credentials.sttProvider)
    }).catch(() => {})
    return () => { active = false }
  }, [])
  const interviewerDisplayCorrectionRef = useRef<InterviewerDisplayCorrectionCoordinator | null>(null)
  if (!interviewerDisplayCorrectionRef.current) {
    interviewerDisplayCorrectionRef.current = createInterviewerDisplayCorrectionCoordinator({
      correct: async (text) => window.electronAPI?.correctTranscriptText?.(text)
        ?? { status: 'original', text },
      cancelRemote: () => window.electronAPI?.cancelTranscriptTextCorrection?.(),
      onDisplayChanged: () => {
        const coordinator = interviewerDisplayCorrectionRef.current
        if (!coordinator) return
        setInterviewerTranscriptWindow(buildTranscriptDisplayWindow(
          coordinator.apply(committedInterviewerRef.current),
        ))
      },
    })
  }
  // Per-stream extractors for the 【问题修正】…【/问题修正】 section the model
  // emits at the start of an answer. Keyed by a stable stream identity, since
  // meta.streamId may be absent while generation ids are always unique.
  const questionCorrectionExtractorsRef = useRef(new Map<string, CorrectionExtractor>())
  function extractorForStream(key: string, question: string): CorrectionExtractor {
    const existing = questionCorrectionExtractorsRef.current.get(key)
    if (existing) return existing
    const extractor = createQuestionCorrectionExtractor(question)
    questionCorrectionExtractorsRef.current.set(key, extractor)
    return extractor
  }
  function clearAnswerExtractor(active: Pick<ActiveAnswer, 'id' | 'attemptId'>): void {
    questionCorrectionExtractorsRef.current.delete(answerExtractorKey(active.id, active.attemptId))
  }
  function clearCandidateExtractor(generationId: number): void {
    questionCorrectionExtractorsRef.current.delete(`candidate:${generationId}`)
  }
  function applyExternalCorrection(question: string, corrected: string) {
    interviewerDisplayCorrectionRef.current?.putExternalByText(question, corrected)
  }
  const candidateCleanupRef = useRef<CandidateSpeechCleanupCoordinator | null>(null)
  if (!candidateCleanupRef.current) {
    candidateCleanupRef.current = createCandidateSpeechCleanupCoordinator({
      cleanup: async (text) => window.electronAPI?.cleanupCandidateSpeech?.(text)
        ?? { status: 'original', text },
      cancelRemote: () => window.electronAPI?.cancelCandidateSpeechCleanup?.(),
      onStatus: setCandidateCleanupStatus,
    })
  }
  const answerPreparationVersionRef = useRef(0)
  const answerSequenceRef = useRef(0)
  // Phase 18 Step 5: the pure coordinator owns round/attempt identity. Answer ids
  // still come from answerSequenceRef so history/telemetry numbering is unchanged.
  const lastSettledQuestionRef = useRef('')
  const roundCoordinatorRef = useRef(createQuestionRoundCoordinator({
    isQuestionReady: (question) => isAnswerableInterviewQuestion(question, Boolean(lastSettledQuestionRef.current)),
    allocateAnswerId: () => ++answerSequenceRef.current,
  }))
  const lastAnsweredQuestionRef = useRef<InterviewTurn | null>(null)
  const roundTickRef = useRef<number | null>(null)
  const answerQueueRef = useRef<AnswerJob[]>([])
  const answerPrewarmRef = useRef(createAnswerPrewarmCache(async (question, scope) => {
    const retrieval = await window.electronAPI?.retrieveInterviewKnowledge?.(question, scope)
    return retrieval || { success: true }
  }))
  const partialPrewarmRef = useRef(createPartialPrewarmGate({
    onStable: ({ question, segmentId }) => {
      if (!sessionActiveRef.current) return
      void answerPrewarmRef.current.prewarm(question, getConversationContext(), answerLevelRef.current, englishModeRef.current, loadInterviewPrompt(), interviewProfileRef.current, currentProjectsRef.current)
        .then((prewarmed) => startCandidateStream(question, prewarmed, segmentId))
        .catch(() => {})
    },
  }))
  const candidateControllerRef = useRef(createCandidateGenerationController({
    onCancel: () => window.electronAPI?.cancelChatStream?.(),
  }))
  const providerDeadlineControllerRef = useRef(createProviderDeadlineController({
    onTimeout: (answerId) => handleProviderTimeout(answerId),
  }))
  const candidateStreamRef = useRef<CandidateStream | null>(null)
  const candidateGenerationRef = useRef(0)
  const activeAnswerRef = useRef<ActiveAnswer | null>(null)
  const sessionGenerationRef = useRef(0)
  const lastSeenStreamIdRef = useRef(0)
  const meetingStartedAtRef = useRef(0)
  const pendingLatencyTraceRef = useRef<LatencyTrace | null>(null)
  const latencyTraceByAnswerIdRef = useRef(new Map<number, LatencyTrace>())
  const completedLatencyAnswerIdsRef = useRef(new Set<number>())
  const latencyTokenCountByAnswerIdRef = useRef(new Map<number, number>())
  const demoEnabled = new URLSearchParams(window.location.search).get('demo') === '1'
  const isLive = audioCaptureActive
  const waveform = useMemo(() => Array.from({ length: 32 }, (_, index) => 18 + ((index * 17) % 43)), [])
  const selectedAnswer = getSelectedAnswer(answerState)
  // A submitted manual question that is queued/generating must not be discarded
  // by a main "Start interview" click. Only relevant when no audio capture runs.
  const manualGenerationPending = !isLive && answerState.items.some((item) => item.status === 'generating' || item.status === 'queued')
  async function toggleEnglishMode() {
    if (languageBusy) return
    const api = window.electronAPI
    const next = !englishModeRef.current
    setLanguageBusy(true)
    try {
      if (!api) throw new Error('请在桌面 App 中切换语言')
      if (!audioCaptureRef.current) {
        const result = await api.setAiResponseLanguage(next ? 'English' : 'Chinese')
        if (!result.success) throw new Error(result.error || '回答语言切换失败')
        englishModeRef.current = next; setEnglishMode(next); answerPrewarmRef.current.clear()
        recognitionLanguageSyncRef.current = true
        return
      }
      const oldStt = await api.getSttLanguage()
      const stt = await api.setRecognitionLanguage(next ? 'english-us' : 'chinese')
      if (!stt.success) throw new Error(stt.error || '识别语言切换失败')
      try {
        const ai = await api.setAiResponseLanguage(next ? 'English' : 'Chinese')
        if (!ai.success) throw new Error(ai.error || '回答语言切换失败')
      } catch (error) {
        await api.setRecognitionLanguage(oldStt)
        throw error
      }
      englishModeRef.current = next
      setEnglishMode(next)
      answerPrewarmRef.current.clear()
    } catch (error) {
      setError(error instanceof Error ? error.message : '语言切换失败')
    } finally { setLanguageBusy(false) }
  }

  const selectedAnswerLevel = INTERVIEW_ANSWER_LEVEL_OPTIONS.find((option) => option.value === answerLevel)

  function publishLatencyTrace(trace: LatencyTrace): void {
    const target = window as InterviewLatencyWindow
    const record = trace.snapshot()
    const records = target.__nativelyInterviewLatencyRecords || []
    target.__nativelyInterviewLatencyRecords = [...records, record].slice(-100)
  }

  function traceForAnswer(id: number): LatencyTrace | null {
    return latencyTraceByAnswerIdRef.current.get(id) || null
  }

  function completeLatencyTrace(id: number, outcome: 'success' | 'timeout' | 'error', error?: string): void {
    if (completedLatencyAnswerIdsRef.current.has(id)) return
    const trace = traceForAnswer(id)
    if (!trace) return
    const existing = trace.snapshot()
    if (outcome === 'success') {
      trace.setProvider({ outcome: 'success' })
    } else {
      if (existing.events.providerError === undefined) trace.mark('providerError')
      trace.setProvider({ outcome, timeout: outcome === 'timeout', ...(error ? { error } : {}) })
      if (existing.events.fallbackAnswerStart === undefined) trace.mark('fallbackAnswerStart')
      if (trace.snapshot().events.firstAnswerToken === undefined) trace.mark('firstAnswerToken')
    }
    if (trace.snapshot().events.answerDone === undefined) trace.mark('answerDone')
    if (outcome === 'success') {
      const finalEvents = trace.snapshot().events
      const tokenCount = latencyTokenCountByAnswerIdRef.current.get(id) || 0
      if (tokenCount > 0 && typeof finalEvents.firstAnswerToken === 'number' && typeof finalEvents.answerDone === 'number') {
        const durationSeconds = Math.max(0.001, (finalEvents.answerDone - finalEvents.firstAnswerToken) / 1000)
        trace.setProvider({ tokensPerSecond: tokenCount / durationSeconds })
      }
    }
    publishLatencyTrace(trace)
    completedLatencyAnswerIdsRef.current.add(id)
  }

  function handleProviderTimeout(answerId: number): void {
    const active = activeAnswerRef.current
    if (!active || active.id !== answerId || active.generation !== sessionGenerationRef.current || active.settled) return
    clearAnswerExtractor(active)
    active.settled = true
    const timeoutMessage = '模型响应超时，本次未能生成完整回答'
    const trace = traceForAnswer(active.id)
    if (trace && trace.snapshot().events.providerDeadline === undefined) trace.mark('providerDeadline')
    providerDeadlineControllerRef.current.clear()
    if (typeof active.streamId === 'number') {
      lastSeenStreamIdRef.current = Math.max(lastSeenStreamIdRef.current, active.streamId)
    }
    window.electronAPI?.cancelChatStream?.()
    completeLatencyTrace(active.id, 'timeout', timeoutMessage)
    dispatchAnswer({ type: 'error', id: active.id, error: timeoutMessage })
    setError(timeoutMessage)
    setStatus('ready')
    activeAnswerRef.current = null
    void pumpAnswerQueue()
  }

  useEffect(() => { if (!isLive) return undefined; const timer = window.setInterval(() => setElapsed((value) => value + 1), 1000); return () => window.clearInterval(timer) }, [isLive])

  function isCurrentAnswer(active: ActiveAnswer): boolean {
    return activeAnswerRef.current === active
      && active.generation === sessionGenerationRef.current
      && sessionActiveRef.current
      && !active.stale
  }

  function scheduleRoundTick(delayMs: number): void {
    if (roundTickRef.current !== null) window.clearTimeout(roundTickRef.current)
    roundTickRef.current = window.setTimeout(() => {
      roundTickRef.current = null
      if (!sessionActiveRef.current) return
      applyRoundActions(roundCoordinatorRef.current.tick(performance.now()).actions)
    }, delayMs)
  }

  function cancelSupersededAttempt(action: { answerId: number; attemptId: number }): void {
    const active = activeAnswerRef.current
    if (!active || active.id !== action.answerId || active.attemptId !== action.attemptId) return
    active.stale = true
    active.settled = true
    providerDeadlineControllerRef.current.clear()
    if (typeof active.streamId === 'number') {
      lastSeenStreamIdRef.current = Math.max(lastSeenStreamIdRef.current, active.streamId)
    }
    void window.electronAPI?.cancelChatStream?.()
    clearAnswerExtractor(active)
    dispatchAnswer({ type: 'interrupted', id: active.id })
    recordRoundEvent({ type: 'answer-lifecycle', stage: 'cancel', answerId: active.id, streamId: active.streamId, reason: 'round-restart' })
    activeAnswerRef.current = null
  }

  async function startRoundGeneration(action: { type: 'generate'; roundId: number; answerId: number; attemptId: number; question: string; reason: 'provisional' | 'restart' }, manual = false): Promise<void> {
    const preparationVersion = ++answerPreparationVersionRef.current
    const generation = sessionGenerationRef.current
    cancelCandidateStream()
    const question = toSimplifiedChinese(action.question)
    // Manual (typed) submissions are already exact and skip ASR normalization;
    // audio questions keep the simplified + normalized pipeline.
    const effectiveQuestion = manual ? action.question : question
    const contextTurns = await candidateCleanupRef.current!.buildContextTurns(
      conversationTurnsRef.current,
      candidateContextEnabledRef.current,
      300,
    )
    if (preparationVersion !== answerPreparationVersionRef.current
      || generation !== sessionGenerationRef.current
      || !sessionActiveRef.current) return
    const conversationContext = buildRecentInterviewContext(contextTurns, {
      includeCandidateSpeech: candidateContextEnabledRef.current,
    })
    const profile = interviewProfileRef.current
    const currentProjects = [...currentProjectsRef.current]
    const scope = resolveInterviewScope(effectiveQuestion, profile, currentProjects)
    // Keep the discussion topic across unrelated/HR turns without applying it to their retrieval.
    if (scope.projectIds?.length) currentProjectsRef.current = [...scope.projectIds]
    setActiveScope(scope)
    const job: AnswerJob = {
      id: action.answerId,
      question: effectiveQuestion,
      analysisQuestion: normalizeInterviewQuestion(question),
      conversationContext,
      answerLevel: answerLevelRef.current,
      englishMode: englishModeRef.current,
      customInstructions: loadInterviewPrompt(),
      profile, scope, currentProjects,
      manual,
      generation: sessionGenerationRef.current,
      roundId: action.roundId,
      attemptId: action.attemptId,
      roundSessionGeneration: roundCoordinatorRef.current.getSnapshot().sessionGeneration,
    }
    if (manual) job.analysisQuestion = effectiveQuestion
    const latencyTrace = pendingLatencyTraceRef.current
    if (latencyTrace && !latencyTraceByAnswerIdRef.current.has(action.answerId)) {
      latencyTrace.mark('questionSettled')
      latencyTraceByAnswerIdRef.current.set(action.answerId, latencyTrace)
      pendingLatencyTraceRef.current = null
    }
    lastSettledQuestionRef.current = effectiveQuestion
    lastAnsweredQuestionRef.current = roundCoordinatorRef.current.getSnapshot().turns.slice(-1)[0] as InterviewTurn
      ?? lastAnsweredQuestionRef.current
    setConfirmedQuestion(effectiveQuestion)
    void answerPrewarmRef.current.prewarm(job.analysisQuestion, conversationContext, job.answerLevel, job.englishMode, job.customInstructions, job.profile, job.currentProjects).catch(() => {})
    if (action.reason === 'provisional') {
      enqueueAnswer(action.answerId, effectiveQuestion, job)
      return
    }
    // Restart: replace the queued attempt for this round, or take the slot the
    // superseded attempt just released. Unrelated jobs keep their FIFO order.
    const queue = answerQueueRef.current
    const queuedIndex = queue.findIndex((entry) => entry.id === action.answerId)
    if (queuedIndex >= 0) queue.splice(queuedIndex, 1, job)
    else queue.unshift(job)
    setError('')
    setStatus('transcribing')
    void pumpAnswerQueue()
  }

  function applyRoundActions(actions: RoundAction[]): void {
    for (const action of actions) {
      if (action.type === 'reviseHistory') {
        const question = toSimplifiedChinese(action.question)
        dispatchAnswer({ type: 'revise', id: action.id, question })
        setConfirmedQuestion(question)
        recordRoundEvent({ type: 'answer-lifecycle', stage: 'revise', answerId: action.id, textLength: question.length })
        continue
      }
      if (action.type === 'cancel') {
        cancelSupersededAttempt(action)
        continue
      }
      void startRoundGeneration(action)
    }
  }

  function claimActiveStream(streamId?: number): ActiveAnswer | null {
    const active = activeAnswerRef.current
    if (!active || !isCurrentAnswer(active)) return null
    if (typeof streamId === 'number') {
      // Stream ids are monotonic in the Electron process. A lower id is a
      // delayed event from a completed/superseded answer.
      if (streamId <= lastSeenStreamIdRef.current) return null
      if (active.streamId === undefined) {
        // First tagged event for this attempt: bind the externally assigned id
        // so the coordinator can reject every later stale tuple.
        active.streamId = streamId
        roundCoordinatorRef.current.bindStream({ answerId: active.id, attemptId: active.attemptId, streamId })
      }
      if (active.streamId !== streamId) return null
    } else if (active.streamId !== undefined) {
      // Once a provider has identified the active stream, id-less events are
      // unsafe because they could belong to an older stream.
      return null
    }
    return active
  }

  function claimCandidateStream(streamId?: number): CandidateStream | null {
    const candidate = candidateStreamRef.current
    if (!candidate || !sessionActiveRef.current) return null
    if (typeof streamId === 'number') {
      if (streamId <= lastSeenStreamIdRef.current) return null
      if (candidate.streamId === undefined) candidate.streamId = streamId
      if (candidate.streamId !== streamId) return null
    } else if (candidate.streamId !== undefined) {
      return null
    }
    return candidate
  }

  function getConversationContext(): string {
    try {
      return buildRecentInterviewContext(conversationTurnsRef.current, {
        includeCandidateSpeech: candidateContextEnabledRef.current,
      })
    } catch {
      return ''
    }
  }

  function handleCandidateContextChange(enabled: boolean): void {
    candidateContextEnabledRef.current = enabled
    if (audioCaptureRef.current) recorderRef.current?.setCapture(enabled)
    setCandidateContextEnabled(enabled)
    saveCandidateContextEnabled(enabled)
    void window.electronAPI?.setCandidateCaptureEnabled(enabled).catch(() => setError('麦克风开关更新失败，请停止采集后重试'))
    if (enabled) candidateCleanupRef.current?.observe(conversationTurnsRef.current, true)
    else candidateCleanupRef.current?.cancel()
  }

  function handleAnswerLevelChange(level: InterviewAnswerLevel): void {
    answerLevelRef.current = level
    setAnswerLevel(level)
    saveInterviewAnswerLevel(level)
    answerPrewarmRef.current.clear()
    partialPrewarmRef.current.clear()
    cancelCandidateStream()
  }

  async function startCandidateStream(question: string, prewarmed: { retrieval: { success: boolean; context?: string; matches?: unknown[] }; context: string; prompt?: string; scope?: InterviewRetrievalScope }, segmentId?: number): Promise<void> {
    if (classifyInterviewQuestion(question).intent === 'project' && !prewarmed.scope?.projectIds?.length) return
    if (prewarmed.scope?.projectIds?.length && (!prewarmed.retrieval.success || !prewarmed.retrieval.matches?.length)) return
    const api = window.electronAPI
    if (!api?.streamGeminiChat || !prewarmed.retrieval.success || !prewarmed.prompt || !sessionActiveRef.current) return
    const answeredBoundary = lastAnsweredQuestionRef.current
    if (typeof segmentId === 'number' && typeof answeredBoundary?.segmentId === 'number' && segmentId <= answeredBoundary.segmentId) return
    const previous = candidateStreamRef.current
    if (previous) {
      if (!previous.settled) candidateControllerRef.current.cancel(previous.generationId)
      clearCandidateExtractor(previous.generationId)
      candidateStreamRef.current = null
    }
    const generationId = ++candidateGenerationRef.current
    candidateControllerRef.current.start({ generationId, question })
    candidateStreamRef.current = { generationId, question, settled: false }
    setCandidateText('')
    try {
      const completion = await api.streamGeminiChat(prewarmed.prompt, undefined, prewarmed.context, {
        skipSystemPrompt: true,
        ignoreKnowledgeMode: true,
        interviewQuestion: question,
        interviewProjectIds: prewarmed.scope?.projectIds,
        // Resume facts support introductions, not inferred feelings or habits.
        hasRelevantPersonalEvidence: hasIntroductionEvidence(question, prewarmed.retrieval),
      })
      const candidate = candidateStreamRef.current
      if (candidate?.generationId === generationId && !candidate.settled) {
        if (completion && claimCandidateStream(completion.streamId) !== candidate) return
        const extractor = questionCorrectionExtractorsRef.current.get(`candidate:${generationId}`)
        const stripped = stripCorrectionSection(completion?.finalText ?? '', question)
        if (!completion) flushResolvedCorrectionExtractor(extractor, (leftover) => {
          candidateControllerRef.current.acceptCandidateToken({ generationId, token: leftover })
        })
        if (stripped.corrected) applyExternalCorrection(question, stripped.corrected)
        if (completion) lastSeenStreamIdRef.current = Math.max(lastSeenStreamIdRef.current, completion.streamId)
        candidate.settled = true
        clearCandidateExtractor(generationId)
        candidateControllerRef.current.complete(generationId, stripped.text)
        setCandidateText(candidateControllerRef.current.snapshot().candidateText)
      }
    } catch {
      const candidate = candidateStreamRef.current
      if (candidate?.generationId === generationId && !candidate.settled) {
        if (typeof candidate.streamId === 'number') {
          lastSeenStreamIdRef.current = Math.max(lastSeenStreamIdRef.current, candidate.streamId)
        }
        clearCandidateExtractor(generationId)
        candidateControllerRef.current.cancel(generationId)
        candidateStreamRef.current = null
        setCandidateText('')
      }
    }
  }

  function cancelCandidateStream(): void {
    const candidate = candidateStreamRef.current
    if (candidate && !candidate.settled) {
      if (typeof candidate.streamId === 'number') {
        lastSeenStreamIdRef.current = Math.max(lastSeenStreamIdRef.current, candidate.streamId)
      }
      candidateControllerRef.current.cancel(candidate.generationId)
    }
    if (candidate) clearCandidateExtractor(candidate.generationId)
    candidateStreamRef.current = null
    setCandidateText('')
  }

  /**
   * A tagged Provider callback may only mutate history/queue/status after the
   * coordinator confirms the full (sessionGeneration, answerId, attemptId,
   * streamId) tuple. Untagged providers never bind a stream id, so for them the
   * renderer-side active identity above remains the only available guard.
   */
  function hasBoundProviderStream(active: ActiveAnswer): boolean {
    return typeof active.streamId === 'number'
  }

  function enqueueAnswer(id: number, question: string, job: AnswerJob, select = true): number {
    dispatchAnswer({ type: 'enqueue', id, question, select, answerLevel: job.answerLevel, englishMode: job.englishMode }, { model: modelSnapshotRef.current, profile: job.profile, scope: job.scope })
    answerQueueRef.current.push(job)
    recordRoundEvent({ type: 'answer-lifecycle', stage: 'enqueue', answerId: id, textLength: question.length })
    setError('')
    setStatus('transcribing')
    void pumpAnswerQueue()
    return id
  }

  async function pumpAnswerQueue(): Promise<void> {
    if (activeAnswerRef.current || !sessionActiveRef.current) return
    const job = answerQueueRef.current.shift()
    if (!job) return
    if (job.generation !== sessionGenerationRef.current) return
    if (job.roundSessionGeneration !== roundCoordinatorRef.current.getSnapshot().sessionGeneration) {
      dispatchAnswer({ type: 'interrupted', id: job.id })
      void pumpAnswerQueue()
      return
    }
    const active: ActiveAnswer = { ...job, settled: false, stale: false }
    activeAnswerRef.current = active
    const latencyTrace = traceForAnswer(job.id)
    dispatchAnswer({ type: 'start', id: job.id }, { model: modelSnapshotRef.current, profile: job.profile, scope: job.scope, answerLevel: job.answerLevel, englishMode: job.englishMode })
    recordRoundEvent({ type: 'answer-lifecycle', stage: 'start', answerId: job.id })
    setStatus('transcribing')
    const api = window.electronAPI
    if (!api?.streamGeminiChat) {
      active.settled = true
      clearAnswerExtractor(active)
      dispatchAnswer({ type: 'error', id: job.id, error: '回答服务不可用' })
      activeAnswerRef.current = null
      return
    }
    try {
      let prewarmed = null
      try {
        prewarmed = await answerPrewarmRef.current.consume(job.analysisQuestion, job.conversationContext, job.answerLevel, job.englishMode, job.customInstructions, job.profile, job.currentProjects)
      } catch {
        // Question text or conversation context changed after prewarm.
      }
      const retrieval = prewarmed?.retrieval || await answerPrewarmRef.current.retrieve(job.analysisQuestion, job.scope)
      if (!isCurrentAnswer(active)) return
      latencyTrace?.mark('retrievalReady')
      if (retrieval && !retrieval.success) {
        // Retrieval is optional: never turn a missing private KB into a provider failure.
        setError('题库暂不可用，AI 将按通用知识回答；个人经历和数据需补充。')
      }
      const needsProject = classifyInterviewQuestion(job.analysisQuestion).intent === 'project' && !job.scope.projectIds?.length
      if (needsProject || (job.scope.projectIds?.length && (!retrieval?.success || !retrieval.matches?.length))) {
        const notice = needsProject ? (job.englishMode ? 'Which project does this question refer to? Select a main project in interview settings or name it in the question.' : '这道题还没有明确对应项目，请在面试设置选择主讲项目，或在问题中点明项目。') : job.englishMode
          ? 'There is not enough evidence for the selected project to describe this experience. Please add the relevant project details.'
          : `当前${interviewScopeLabel(job.scope)}资料不足以回答这道题，请补充该项目的相关事实；不会引用其他项目的经历。`
        active.settled = true
        clearAnswerExtractor(active)
        dispatchAnswer({ type: 'done', id: job.id, finalText: notice, source: 'guidance' })
        completeLatencyTrace(job.id, 'success')
        setStatus('answered')
        return
      }
      const context = (retrieval?.success ? retrieval.context : undefined) || '暂无题库命中。请只使用已确认的个人经历，未知数据标记为待补充。'
      if (retrieval?.success && retrieval.matches) dispatchAnswer({ type: 'hits', id: job.id, hits: retrieval.matches as Hit[] })
      const prompt = prewarmed?.prompt || buildInterviewConsolePrompt(job.analysisQuestion, context, job.conversationContext, job.answerLevel, job.englishMode, job.customInstructions, job.profile, job.scope)
      const providerDeadlineMs = interviewProviderDeadlineMs(modelSnapshotRef.current)
      latencyTrace?.setProvider({ deadlineMs: providerDeadlineMs })
      providerDeadlineControllerRef.current.start(active.id, providerDeadlineMs)
      if ((window as InterviewLatencyWindow).__nativelyInjectInterviewProviderTimeout) {
        latencyTrace?.mark('providerDeadline')
        latencyTrace?.setProvider({ outcome: 'timeout', timeout: true })
        throw new Error('Injected Provider timeout')
      }
      const completion = await api.streamGeminiChat(prompt, undefined, context, {
        skipSystemPrompt: true,
        ignoreKnowledgeMode: true,
        interviewQuestion: job.analysisQuestion,
        interviewTest: job.manual,
        interviewProjectIds: job.scope.projectIds,
        hasRelevantPersonalEvidence: hasIntroductionEvidence(job.analysisQuestion, retrieval),
      })
      // IPC resolution can arrive before done. Commit its complete snapshot;
      // event-only legacy providers retain the existing streamed-tail fallback.
      if (isCurrentAnswer(active) && !active.settled) {
        if (completion && claimActiveStream(completion.streamId) !== active) return
        if (hasBoundProviderStream(active) && !roundCoordinatorRef.current.acceptProviderEvent({
          type: 'done', sessionGeneration: active.roundSessionGeneration,
          answerId: active.id, attemptId: active.attemptId, streamId: active.streamId,
        }).accepted) return
        providerDeadlineControllerRef.current.complete(job.id, 'done')
        const extractor = questionCorrectionExtractorsRef.current.get(answerExtractorKey(active.id, active.attemptId))
        const stripped = stripCorrectionSection(completion?.finalText ?? '', active.question)
        if (!completion) flushResolvedCorrectionExtractor(extractor, (leftover) => {
          dispatchAnswer({ type: 'token', id: active.id, token: leftover })
        })
        if (stripped.corrected) applyExternalCorrection(active.question, stripped.corrected)
        if (typeof active.streamId === 'number') lastSeenStreamIdRef.current = Math.max(lastSeenStreamIdRef.current, active.streamId)
        active.settled = true
        clearAnswerExtractor(active)
        dispatchAnswer({ type: 'done', id: job.id, finalText: stripped.text })
        recordRoundEvent({ type: 'answer-lifecycle', stage: 'done', answerId: active.id, streamId: active.streamId, textLength: stripped.text.length })
        completeLatencyTrace(job.id, 'success')
        setStatus('answered')
      }
    } catch (caught: any) {
      if (!isCurrentAnswer(active)) return
      if (typeof active.streamId === 'number') {
        lastSeenStreamIdRef.current = Math.max(lastSeenStreamIdRef.current, active.streamId)
        roundCoordinatorRef.current.acceptProviderEvent({
          type: 'error', sessionGeneration: active.roundSessionGeneration,
          answerId: active.id, attemptId: active.attemptId, streamId: active.streamId,
        })
      }
      providerDeadlineControllerRef.current.complete(job.id, 'error')
      active.settled = true
      clearAnswerExtractor(active)
      const message = caught?.message || '回答生成失败'
      dispatchAnswer({ type: 'error', id: job.id, error: message })
      completeLatencyTrace(job.id, message === 'Injected Provider timeout' ? 'timeout' : 'error', message)
      setError(message)
      setStatus('ready')
    } finally {
      if (activeAnswerRef.current !== active) return
      clearAnswerExtractor(active)
      activeAnswerRef.current = null
      if (!active.settled && active.generation === sessionGenerationRef.current && sessionActiveRef.current) {
        dispatchAnswer({ type: 'interrupted', id: job.id })
      }
      void pumpAnswerQueue()
    }
  }

  useEffect(() => {
    const api = window.electronAPI
    if (!api?.onNativeAudioTranscript) return undefined
    const removeTranscript = api.onNativeAudioTranscript((event) => {
      // Only real audio capture may feed the transcript pipeline; this keeps
      // background STT events out of an idle text-only context.
      if (!audioCaptureRef.current) return
      const target = window as InterviewLatencyWindow
      const probeEvent: TranscriptProbeEvent = {
        kind: event.kind,
        sequence: event.sequence,
        sessionId: event.sessionId,
        speaker: event.speaker,
        ...(typeof event.segmentId === 'number' ? { segmentId: event.segmentId } : {}),
      }
      target.__nativelyInterviewTranscriptEvents = [...(target.__nativelyInterviewTranscriptEvents || []), probeEvent].slice(-500)
      // Phase 18 Step 2: materialize all carried diagnostics (worker-result,
      // stt-host-roundtrip, main-emit, renderer-receive) through the production
      // helper. This is the single transformation point.
      const rendererReceiveMonotonicMs = performance.now()
      if (event.kind === 'reset') {
        recordTranscriptResetDiagnostics(event, rendererReceiveMonotonicMs)
        pendingLatencyTraceRef.current = null
        // A transcript reset invalidates the round: cancel only the identities
        // that must no longer produce output, then drop the pending tick.
        if (roundTickRef.current !== null) window.clearTimeout(roundTickRef.current)
        roundTickRef.current = null
        applyRoundActions(roundCoordinatorRef.current.resetTranscript().actions)
        interviewerDisplayCorrectionRef.current?.clear()
        lastSettledQuestionRef.current = ''
        return
      }
      recordTranscriptDiagnostics(event, rendererReceiveMonotonicMs)
      if (!sessionActiveRef.current) return
      const rawText = event.text?.trim()
      if (!rawText) return
      if (event.speaker === 'user') {
        if (!candidateContextEnabledRef.current) return;
        const text = rawText
        if (event.final) {
          const incoming: Partial<InterviewTurn> = {
            speaker: event.speaker,
            text,
            final: true,
            ...(typeof event.segmentId === 'number' ? { segmentId: event.segmentId } : {}),
            ...(typeof event.audioStartMs === 'number' ? { audioStartMs: event.audioStartMs } : {}),
            ...(typeof event.audioEndMs === 'number' ? { audioEndMs: event.audioEndMs } : {}),
          }
          const previousConversation = conversationTurnsRef.current
          const nextConversation = appendFinalTurn(previousConversation, incoming)
          // A stale final can arrive after a newer segment. Do not let it
          // update either the visible transcript or answer context.
          if (nextConversation === previousConversation) return
          conversationTurnsRef.current = nextConversation
          candidateCleanupRef.current?.observe(nextConversation, candidateContextEnabledRef.current)
          recorderRef.current?.candidate({
            id: `${event.sessionId}:${event.segmentId ?? event.sequence}`,
            text, at: Date.now(), audioStartMs: event.audioStartMs, audioEndMs: event.audioEndMs,
          })
          committedCandidateRef.current = appendFinalTurn(committedCandidateRef.current, incoming)
          setCandidateTranscriptWindow(buildTranscriptDisplayWindow(committedCandidateRef.current))
          // Raw candidate state is preserved first; only then may the accepted
          // candidate final close the open question round.
          applyRoundActions(roundCoordinatorRef.current.acceptCandidateFinal({
            speaker: event.speaker,
            final: true,
            sessionId: event.sessionId,
            sequence: event.sequence,
            arrivalMs: rendererReceiveMonotonicMs,
            ...(typeof event.segmentId === 'number' ? { segmentId: event.segmentId } : {}),
            ...(typeof event.audioStartMs === 'number' ? { audioStartMs: event.audioStartMs } : {}),
            ...(typeof event.audioEndMs === 'number' ? { audioEndMs: event.audioEndMs } : {}),
          }).actions)
        } else {
          setCandidateTranscriptWindow(buildTranscriptDisplayWindow(committedCandidateRef.current, text))
        }
        setStatus('transcribing')
        return
      }
      if (event.speaker !== 'interviewer') return
      const text = toSimplifiedChinese(rawText)
      if (event.final) {
        if (typeof event.segmentId === 'number') partialPrewarmRef.current.cancelSegment(event.segmentId)
        const incoming: InterviewTurn = {
          speaker: event.speaker,
          text,
          final: true,
          ...(typeof event.segmentId === 'number' ? { segmentId: event.segmentId } : {}),
          ...(typeof event.audioStartMs === 'number' ? { audioStartMs: event.audioStartMs } : {}),
          ...(typeof event.audioEndMs === 'number' ? { audioEndMs: event.audioEndMs } : {}),
        }
        const previousConversation = conversationTurnsRef.current
        const nextConversation = appendFinalTurn(previousConversation, incoming)
        if (nextConversation === previousConversation) return
        conversationTurnsRef.current = nextConversation
        committedInterviewerRef.current = appendFinalTurn(committedInterviewerRef.current, incoming)

        // Phase 18 Step 5: an already-answered older segment is rejected on
        // transcript provenance, then low-information tails are gated against the
        // immutable current-round turns. Neither may mutate coordinator state.
        const answeredBoundary = lastAnsweredQuestionRef.current
        const withinAnsweredBoundary = !!answeredBoundary && isTranscriptAtOrBefore(incoming, answeredBoundary)
        const shouldAccept = shouldTriggerInterviewAnswer(event.speaker, event.final)
          && !withinAnsweredBoundary
          && shouldAcceptQuestionFinal(
            roundCoordinatorRef.current.getSnapshot().turns as Partial<InterviewTurn>[] as InterviewTurn[],
            incoming,
            lastSettledQuestionRef.current,
          )
        const gaps = shouldAccept && event.speaker === 'interviewer'
          ? computeAcceptedFinalGaps(event, rendererReceiveMonotonicMs)
          : {}
        recordRoundEvent({
          type: 'settler-decision',
          decision: shouldAccept ? 'pending-accepted' : 'ignored-stale',
          sessionId: event.sessionId,
          sequence: event.sequence,
          ...(typeof event.segmentId === 'number' ? { segmentId: event.segmentId } : {}),
          ...(shouldAccept ? {} : { reason: withinAnsweredBoundary ? 'superseded-by-final' as const : 'low-information-tail' as const }),
          ...gaps,
        })

        if (shouldAccept) {
          if (!pendingLatencyTraceRef.current) {
            const roundSnapshot = roundCoordinatorRef.current.getSnapshot()
            const trace = createLatencyTrace(`${sessionGenerationRef.current}:round-${roundSnapshot.roundId ?? 0}`, () => Date.now())
            const audioEndAt = meetingStartedAtRef.current > 0 && typeof event.audioEndMs === 'number'
              ? meetingStartedAtRef.current + event.audioEndMs
              : Date.now()
            trace.mark('audioEnd', audioEndAt)
            trace.mark('firstInterviewerFinal')
            pendingLatencyTraceRef.current = trace
          }
          const actions = roundCoordinatorRef.current.acceptInterviewerFinal({
            speaker: event.speaker,
            text,
            final: true,
            sessionId: event.sessionId,
            sequence: event.sequence,
            arrivalMs: rendererReceiveMonotonicMs,
            segmentId: event.segmentId,
            audioStartMs: event.audioStartMs,
            audioEndMs: event.audioEndMs,
          }).actions
          applyRoundActions(actions)
          const snapshot = roundCoordinatorRef.current.getSnapshot()
          if (snapshot.roundOpen && snapshot.pendingQuestion.trim()) {
            void answerPrewarmRef.current.prewarm(normalizeInterviewQuestion(snapshot.pendingQuestion), getConversationContext(), answerLevelRef.current, englishModeRef.current, loadInterviewPrompt(), interviewProfileRef.current, currentProjectsRef.current).catch(() => {})
          }
          if (roundTickRef.current !== null) window.clearTimeout(roundTickRef.current)
          if (snapshot.roundOpen && snapshot.status === 'idle' && snapshot.pendingQuestion.trim()) {
            scheduleRoundTick(2500)
          }
        }

        setInterviewerTranscriptWindow(buildTranscriptDisplayWindow(
          interviewerDisplayCorrectionRef.current?.apply(committedInterviewerRef.current)
            ?? committedInterviewerRef.current,
        ))
        void interviewerDisplayCorrectionRef.current?.request(incoming)
        setStatus('transcribing')
      } else {
        partialPrewarmRef.current.observe({
          speaker: event.speaker,
          segmentId: event.segmentId,
          text,
        })
        setInterviewerTranscriptWindow(buildTranscriptDisplayWindow(
          interviewerDisplayCorrectionRef.current?.apply(committedInterviewerRef.current)
            ?? committedInterviewerRef.current,
          text,
        ))
        setStatus('transcribing')
      }
    })
    const removeStatus = api.onSttStatusChanged?.((event) => {
      if (!sessionActiveRef.current) return
      if (!audioCaptureRef.current) return
      if (event.state === 'failed') { setError(event.error || '语音识别连接失败'); setStatus('ready') }
      else if (event.state === 'connected' || event.state === 'awaiting-audio') setStatus('recording')
      else if (event.state === 'reconnecting') setStatus('transcribing')
    })
    const removeToken = api.onGeminiStreamToken?.((token, meta) => {
      const active = claimActiveStream(meta?.streamId)
      if (!active) {
        const candidate = claimCandidateStream(meta?.streamId)
        if (!candidate) return
        const extractor = extractorForStream(`candidate:${candidate.generationId}`, candidate.question)
        const extraction = extractor.feed(token)
        if (extraction.corrected) applyExternalCorrection(candidate.question, extraction.corrected)
        if (extraction.display && candidateControllerRef.current.acceptCandidateToken({ generationId: candidate.generationId, token: extraction.display })) {
          setCandidateText(candidateControllerRef.current.snapshot().candidateText)
        }
        return
      }
      // Validate the full coordinator identity before any mutation: a rejected
      // event must not touch the deadline controller, history, status or queue.
      if (hasBoundProviderStream(active) && !roundCoordinatorRef.current.acceptProviderEvent({
        type: 'token',
        sessionGeneration: active.roundSessionGeneration,
        answerId: active.id,
        attemptId: active.attemptId,
        streamId: active.streamId,
      }).accepted) return
      if (!providerDeadlineControllerRef.current.observeToken(active.id, token)) return
      const latencyTrace = traceForAnswer(active.id)
      if (latencyTrace && latencyTrace.snapshot().events.firstAnswerToken === undefined) {
        const firstTokenAt = latencyTrace.mark('firstAnswerToken')
        const retrievalReadyAt = latencyTrace.snapshot().events.retrievalReady
        latencyTrace.setProvider({ ttftMs: typeof retrievalReadyAt === 'number' ? firstTokenAt - retrievalReadyAt : undefined })
      }
      latencyTokenCountByAnswerIdRef.current.set(active.id, (latencyTokenCountByAnswerIdRef.current.get(active.id) || 0) + 1)
      const streamKey = `answer:${active.id}:${active.attemptId}`
      const extraction = extractorForStream(streamKey, active.question).feed(token)
      if (extraction.corrected) applyExternalCorrection(active.question, extraction.corrected)
      if (extraction.display) dispatchAnswer({ type: 'token', id: active.id, token: extraction.display })
      recordRoundEvent({ type: 'answer-lifecycle', stage: 'token', answerId: active.id, streamId: active.streamId, textLength: extraction.display.length })
      setStatus('transcribing')
    })
    const removeDone = api.onGeminiStreamDone?.((data) => {
      const active = claimActiveStream(data?.streamId)
      if (!active) {
        const candidate = claimCandidateStream(data?.streamId)
        if (!candidate) return
        if (typeof data?.streamId === 'number') lastSeenStreamIdRef.current = Math.max(lastSeenStreamIdRef.current, data.streamId)
        const streamKey = `candidate:${candidate.generationId}`
        const extractor = questionCorrectionExtractorsRef.current.get(streamKey)
        let finalText = data?.finalText ?? ''
        if (!finalText) flushResolvedCorrectionExtractor(extractor, (token) => {
          candidateControllerRef.current.acceptCandidateToken({ generationId: candidate.generationId, token })
        })
        clearCandidateExtractor(candidate.generationId)
        const stripped = stripCorrectionSection(finalText, candidate.question)
        if (stripped.corrected) applyExternalCorrection(candidate.question, stripped.corrected)
        finalText = stripped.text
        candidate.settled = true
        candidateControllerRef.current.complete(candidate.generationId, finalText)
        setCandidateText(candidateControllerRef.current.snapshot().candidateText)
        return
      }
      if (hasBoundProviderStream(active) && !roundCoordinatorRef.current.acceptProviderEvent({
        type: 'done',
        sessionGeneration: active.roundSessionGeneration,
        answerId: active.id,
        attemptId: active.attemptId,
        streamId: active.streamId,
      }).accepted) return
      const finalTrace = traceForAnswer(active.id)
      if (finalTrace && finalTrace.snapshot().events.firstAnswerToken === undefined && data?.finalText?.trim()) {
        const firstTokenAt = finalTrace.mark('firstAnswerToken')
        const retrievalReadyAt = finalTrace.snapshot().events.retrievalReady
        finalTrace.setProvider({ ttftMs: typeof retrievalReadyAt === 'number' ? firstTokenAt - retrievalReadyAt : undefined })
      }
      if (providerDeadlineControllerRef.current.snapshot().state === 'pending' && !data?.finalText?.trim()) {
        const trace = traceForAnswer(active.id)
        const retrievalReadyAt = trace?.snapshot().events.retrievalReady
        const deadlineMs = providerDeadlineControllerRef.current.snapshot().deadlineMs
        const elapsedMs = typeof retrievalReadyAt === 'number' ? Math.max(0, Date.now() - retrievalReadyAt) : deadlineMs
        const outcome = elapsedMs >= deadlineMs - 250 ? 'timeout' : 'error'
        const message = outcome === 'timeout' ? '模型响应超时，本次未能生成完整回答' : '模型未返回有效答案'
        active.settled = true
        if (outcome === 'timeout' && trace && trace.snapshot().events.providerDeadline === undefined) trace.mark('providerDeadline')
        providerDeadlineControllerRef.current.clear()
        if (typeof active.streamId === 'number') {
          lastSeenStreamIdRef.current = Math.max(lastSeenStreamIdRef.current, active.streamId)
        }
        window.electronAPI?.cancelChatStream?.()
        if (outcome === 'timeout') completeLatencyTrace(active.id, 'timeout', message)
        else completeLatencyTrace(active.id, 'error', message)
        dispatchAnswer({ type: 'error', id: active.id, error: message })
        recordRoundEvent({ type: 'answer-lifecycle', stage: 'error', answerId: active.id, streamId: active.streamId, reason: outcome === 'timeout' ? 'provider-timeout' : 'provider-error' })
        setError(message)
        setStatus('ready')
        activeAnswerRef.current = null
        clearAnswerExtractor(active)
        void pumpAnswerQueue()
        return
      }
      providerDeadlineControllerRef.current.complete(active.id, 'done')
      if (typeof data?.streamId === 'number') lastSeenStreamIdRef.current = Math.max(lastSeenStreamIdRef.current, data.streamId)
      const streamKey = answerExtractorKey(active.id, active.attemptId)
      const extractor = questionCorrectionExtractorsRef.current.get(streamKey)
      let finalText = data?.finalText ?? ''
      // A held parser tail is a delta, not a replacement for the whole answer.
      if (!finalText) flushResolvedCorrectionExtractor(extractor, (token) => {
        dispatchAnswer({ type: 'token', id: active.id, token })
      })
      clearAnswerExtractor(active)
      const stripped = stripCorrectionSection(finalText, active.question)
      if (stripped.corrected) applyExternalCorrection(active.question, stripped.corrected)
      finalText = stripped.text
      active.settled = true
      dispatchAnswer({ type: 'done', id: active.id, finalText })
      recordRoundEvent({ type: 'answer-lifecycle', stage: 'done', answerId: active.id, streamId: active.streamId, textLength: data?.finalText?.length })
      completeLatencyTrace(active.id, 'success')
      setStatus('answered')
      activeAnswerRef.current = null
      void pumpAnswerQueue()
    })
    const removeAnswerError = api.onGeminiStreamError?.((message, meta) => {
      const streamId = typeof meta?.streamId === 'number' ? meta.streamId : undefined
      const active = claimActiveStream(streamId)
      if (!active) {
        const candidate = claimCandidateStream(streamId)
        if (!candidate) return
        if (streamId !== undefined) lastSeenStreamIdRef.current = Math.max(lastSeenStreamIdRef.current, streamId)
        clearCandidateExtractor(candidate.generationId)
        candidateControllerRef.current.cancel(candidate.generationId)
        candidateStreamRef.current = null
        setCandidateText('')
        return
      }
      if (hasBoundProviderStream(active) && !roundCoordinatorRef.current.acceptProviderEvent({
        type: 'error',
        sessionGeneration: active.roundSessionGeneration,
        answerId: active.id,
        attemptId: active.attemptId,
        streamId: active.streamId,
      }).accepted) return
      providerDeadlineControllerRef.current.complete(active.id, 'error')
      if (streamId !== undefined) lastSeenStreamIdRef.current = Math.max(lastSeenStreamIdRef.current, streamId)
      active.settled = true
      clearAnswerExtractor(active)
      dispatchAnswer({ type: 'error', id: active.id, error: message })
      recordRoundEvent({ type: 'answer-lifecycle', stage: 'error', answerId: active.id, streamId: active.streamId, reason: /timeout/i.test(message) ? 'provider-timeout' : 'provider-error' })
      completeLatencyTrace(active.id, /timeout/i.test(message) ? 'timeout' : 'error', message)
      setError(message)
      setStatus('ready')
      activeAnswerRef.current = null
      void pumpAnswerQueue()
    })
    return () => {
      removeTranscript?.(); removeStatus?.(); removeToken?.(); removeDone?.(); removeAnswerError?.()
      if (roundTickRef.current !== null) window.clearTimeout(roundTickRef.current)
    }
  }, [])

  useEffect(() => {
    const refresh = () => {
      const next = loadInterviewProfile()
      if (JSON.stringify(next) === JSON.stringify(interviewProfileRef.current)) return
      interviewProfileRef.current = next
      setInterviewProfile(next)
      currentProjectsRef.current = []
      setActiveScope({})
      cancelPendingQuestion()
      cancelCandidateStream()
      invalidateAnswerJobs()
      applyRoundActions(roundCoordinatorRef.current.resetTranscript().actions)
      conversationTurnsRef.current = []
      lastSettledQuestionRef.current = ''
      lastAnsweredQuestionRef.current = null
    }
    const onStorage = (event: StorageEvent) => { if (event.key === INTERVIEW_PROFILE_STORAGE_KEY) refresh() }
    window.addEventListener(INTERVIEW_PROFILE_EVENT, refresh)
    window.addEventListener('storage', onStorage)
    return () => { window.removeEventListener(INTERVIEW_PROFILE_EVENT, refresh); window.removeEventListener('storage', onStorage) }
  }, [])

  function invalidateAnswerJobs() {
    answerPreparationVersionRef.current += 1
    providerDeadlineControllerRef.current.clear()
    questionCorrectionExtractorsRef.current.clear()
    sessionGenerationRef.current += 1
    answerPrewarmRef.current.clear()
    const queuedJobs = answerQueueRef.current
    answerQueueRef.current = []
    for (const job of queuedJobs) dispatchAnswer({ type: 'interrupted', id: job.id })
    const active = activeAnswerRef.current
    if (active) {
      active.settled = true
      active.stale = true
      dispatchAnswer({ type: 'interrupted', id: active.id })
      recordRoundEvent({ type: 'answer-lifecycle', stage: 'cancel', answerId: active.id, streamId: active.streamId, reason: 'user-stop' })
      if (typeof active.streamId === 'number') {
        lastSeenStreamIdRef.current = Math.max(lastSeenStreamIdRef.current, active.streamId)
      }
    }
    activeAnswerRef.current = null
    void window.electronAPI?.cancelChatStream?.()
  }

  function cancelPendingQuestion() {
    if (roundTickRef.current !== null) window.clearTimeout(roundTickRef.current)
    roundTickRef.current = null
    partialPrewarmRef.current.clear()
  }
  function clearConsoleState() {
    currentProjectsRef.current = []
    setActiveScope({})
    cancelPendingQuestion()
    invalidateAnswerJobs()
    applyRoundActions(roundCoordinatorRef.current.resetTranscript().actions)
    committedInterviewerRef.current = []
    committedCandidateRef.current = []
    conversationTurnsRef.current = []
    interviewerDisplayCorrectionRef.current?.clear()
    candidateCleanupRef.current?.clear()
    lastAnsweredQuestionRef.current = null
    lastSettledQuestionRef.current = ''
    pendingLatencyTraceRef.current = null
    latencyTraceByAnswerIdRef.current.clear()
    completedLatencyAnswerIdsRef.current.clear()
    latencyTokenCountByAnswerIdRef.current.clear()
    cancelCandidateStream()
    ;(window as InterviewLatencyWindow).__nativelyInterviewTranscriptEvents = []
    resetRoundEvents()
    dispatchAnswer({ type: 'reset' })
    setStatus('ready'); setElapsed(0); setInterviewerTranscriptWindow({ text: '', folded: false }); setCandidateTranscriptWindow({ text: '', folded: false }); setConfirmedQuestion(''); setError(''); setShowDemo(false); setCandidateText(''); setFollowLatestTranscript(true)
  }
  async function resetSession() {
    if (sessionBusyRef.current) return
    await stopSession()
    clearConsoleState()
  }
  // `manual` starts an internal record/answer context without touching native
  // audio capture or recognition permissions. Audio capture stays OUT of this
  // context until the user presses the main Start interview button.
  async function startSession(options?: { manual?: boolean }): Promise<boolean> {
    const manual = options?.manual === true
    if (sessionActiveRef.current || sessionBusyRef.current) return false
    sessionBusyRef.current = true; setSessionBusy(true)
    try {
      if (!manual && recognitionLanguageSyncRef.current) {
        const language = await window.electronAPI?.setRecognitionLanguage?.(englishModeRef.current ? 'english-us' : 'chinese')
        if (language && !language.success) throw new Error(language.error || '识别语言切换失败')
        recognitionLanguageSyncRef.current = false
      }
      modelSnapshotRef.current = (await window.electronAPI?.getDefaultModel?.().catch(() => ({ model: '' })))?.model || ''
      const profile = { ...interviewProfileRef.current }
      const title = ([profile.company, profile.position].filter(Boolean).join(' · ') || '面试练习') + (manual ? ' · 文字提问' : '')
      await recorderRef.current?.begin({ title, profile, source: manual ? 'manual' : source, captureCandidate: !manual && candidateContextEnabledRef.current })
      clearConsoleState()
      meetingStartedAtRef.current = Date.now()
      sessionActiveRef.current = true
      if (manual) { setStatus('ready'); return true }
      setAudioCaptureActive(true)
      audioCaptureRef.current = true
      if (window.electronAPI?.startMeeting) {
        const result = await window.electronAPI.startMeeting({ title, source, audio: source === 'microphone' ? { inputDeviceId: inputDevice } : { outputDeviceId: outputDevice }, stayOnLauncher: true, captureCandidate: candidateContextEnabledRef.current })
        if (!result.success) throw new Error(result.error || '无法启动音频会话')
      }
      setStatus(nextStatusAfterStart())
      return true
    } catch (e) {
      audioCaptureRef.current = false
      sessionActiveRef.current = false; setAudioCaptureActive(false)
      setError(e instanceof Error ? e.message : '无法启动面试')
      await recorderRef.current?.end('interrupted')
      return false
    } finally { sessionBusyRef.current = false; setSessionBusy(false) }
  }
  async function stopSession() {
    if (sessionBusyRef.current) return
    sessionBusyRef.current = true; setSessionBusy(true)
    const wasAudioCapture = audioCaptureRef.current
    sessionActiveRef.current = false
    audioCaptureRef.current = false
    cancelPendingQuestion(); cancelCandidateStream(); interviewerDisplayCorrectionRef.current?.cancel(); candidateCleanupRef.current?.cancel(); invalidateAnswerJobs()
    setAudioCaptureActive(false); setStatus('ready')
    try {
      await Promise.all([
        recorderRef.current?.end('completed'),
        wasAudioCapture ? window.electronAPI?.endMeeting?.() : undefined,
      ])
    } catch (e) { setError(e instanceof Error ? e.message : '结束会话失败') }
    finally { sessionBusyRef.current = false; setSessionBusy(false) }
  }
  // Main button: an idle manual context is closed/saved first, then a fresh
  // audio session starts through the existing flow.
  async function handleStartInterview(): Promise<void> {
    if (audioCaptureRef.current || sessionBusyRef.current || manualSubmitRef.current || manualGenerationPending) return
    if (sessionActiveRef.current) await stopSession()
    await startSession()
  }
  async function submitManualQuestion(value: string): Promise<boolean> {
    const question = value.trim()
    if (!question || question.length > 2000) return false
    if (manualSubmitRef.current || sessionBusyRef.current || activeAnswerRef.current || answerQueueRef.current.length) return false
    if (!window.electronAPI?.streamGeminiChat) { setError('请在桌面 App 中测试真实模型回答'); return false }
    manualSubmitRef.current = true
    try {
      if (!sessionActiveRef.current && !await startSession({ manual: true })) return false
      cancelPendingQuestion()
      const turn: InterviewTurn = { speaker: 'interviewer', text: question, final: true, timestamp: Date.now() }
      // An explicit repeat is a distinct test; do not use ASR overlap deduplication.
      conversationTurnsRef.current = [...conversationTurnsRef.current, turn]
      committedInterviewerRef.current = [...committedInterviewerRef.current, turn]
      setInterviewerTranscriptWindow(buildTranscriptDisplayWindow(committedInterviewerRef.current))
      setError(''); setShowDemo(false); setStatus('transcribing')
      const actions = roundCoordinatorRef.current.acceptManualQuestion(question).actions
      for (const action of actions) {
        if (action.type === 'generate') await startRoundGeneration(action, true)
        else applyRoundActions([action])
      }
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : '提交问题失败')
      return false
    } finally { manualSubmitRef.current = false }
  }

  function loadDemo() { setShowDemo(true); setStatus('transcribing'); setInterviewerTranscriptWindow(buildTranscriptDisplayWindow([{ text: DEMO_TRANSCRIPT[0].text }])); window.setTimeout(() => { setInterviewerTranscriptWindow(buildTranscriptDisplayWindow([{ text: DEMO_TRANSCRIPT[1].text }])); setConfirmedQuestion(DEMO_QUESTION); setStatus('answered') }, 650) }

  function changeInterviewFontSize(channel: keyof InterviewFontSizes, direction: -1 | 1) {
    setFontSizes((current) => ({ ...current, [channel]: adjustInterviewFontSize(current[channel], direction) }))
  }

  function resetInterviewFontSize(channel: keyof InterviewFontSizes) {
    setFontSizes((current) => ({ ...current, [channel]: INTERVIEW_FONT_DEFAULTS[channel] }))
  }

  function handleFontResetKeyDown(event: ReactKeyboardEvent<HTMLElement>, channel: keyof InterviewFontSizes) {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    resetInterviewFontSize(channel)
  }

  function scrollTranscriptToLatest() {
    setFollowLatestTranscript(true)
    window.requestAnimationFrame(() => {
      const region = transcriptScrollRef.current
      if (region) region.scrollTop = region.scrollHeight
    })
  }

  function handleTranscriptScroll(event: ReactUIEvent<HTMLDivElement>) {
    setFollowLatestTranscript(isNearTranscriptBottom(event.currentTarget))
  }

  useEffect(() => { saveInterviewFontSizes(fontSizes) }, [fontSizes])

  useEffect(() => {
    if (!isLive) return
    const publishHealthSnapshot = () => {
      const target = window as InterviewLatencyWindow
      const performanceMemory = performance as PerformanceWithMemory
      const display = transcriptDisplayRef.current
      const snapshot = buildLongSessionHealthSnapshot({
        sessionDurationSec: meetingStartedAtRef.current > 0 ? (Date.now() - meetingStartedAtRef.current) / 1000 : 0,
        interviewerTurnCount: committedInterviewerRef.current.length,
        candidateTurnCount: committedCandidateRef.current.length,
        visibleChars: display.interviewer.text.length + display.candidate.text.length,
        folded: display.interviewer.folded || display.candidate.folded,
        rendererHeapBytes: performanceMemory.memory?.usedJSHeapSize,
        latencyRecords: target.__nativelyInterviewLatencyRecords,
      })
      target.__nativelyInterviewHealthSnapshots = [
        ...(target.__nativelyInterviewHealthSnapshots || []),
        snapshot,
      ].slice(-240)
    }
    publishHealthSnapshot()
    const timer = window.setInterval(publishHealthSnapshot, LONG_SESSION_HEALTH_INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [isLive])

  useEffect(() => {
    const handle = consoleDragHandleRef.current
    if (!handle || !window.electronAPI?.sendLauncherWindowDrag) return

    let dragging = false
    let startX = 0
    let startY = 0
    let pending: { dx: number; dy: number } | null = null
    let frame = 0

    const flush = () => {
      frame = 0
      const next = pending
      pending = null
      if (!next) return
      window.electronAPI?.sendLauncherWindowDrag?.({ ...next, phase: 'move' }).catch(() => {})
    }
    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return
      dragging = true
      startX = event.screenX
      startY = event.screenY
      try { handle.setPointerCapture(event.pointerId) } catch { /* capture is optional */ }
      window.electronAPI?.sendLauncherWindowDrag?.({ phase: 'start' }).catch(() => {})
    }
    const onPointerMove = (event: PointerEvent) => {
      if (!dragging) return
      pending = { dx: event.screenX - startX, dy: event.screenY - startY }
      if (!frame) frame = requestAnimationFrame(flush)
    }
    const onPointerEnd = (event: PointerEvent) => {
      if (!dragging) return
      dragging = false
      try { handle.releasePointerCapture(event.pointerId) } catch { /* already released */ }
      if (frame) {
        cancelAnimationFrame(frame)
        frame = 0
      }
      flush()
      window.electronAPI?.sendLauncherWindowDrag?.({ phase: 'end' }).catch(() => {})
    }

    handle.addEventListener('pointerdown', onPointerDown)
    handle.addEventListener('pointermove', onPointerMove)
    handle.addEventListener('pointerup', onPointerEnd)
    handle.addEventListener('pointercancel', onPointerEnd)
    return () => {
      handle.removeEventListener('pointerdown', onPointerDown)
      handle.removeEventListener('pointermove', onPointerMove)
      handle.removeEventListener('pointerup', onPointerEnd)
      handle.removeEventListener('pointercancel', onPointerEnd)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [])

  useEffect(() => {
    if (!followLatestTranscript) return
    const frame = window.requestAnimationFrame(() => {
      const region = transcriptScrollRef.current
      if (region) region.scrollTop = region.scrollHeight
    })
    return () => window.cancelAnimationFrame(frame)
  }, [interviewerTranscriptWindow.text, candidateTranscriptWindow.text, confirmedQuestion, fontSizes, followLatestTranscript])

  const consoleStyle = {
    '--interview-question-font-size': `${fontSizes.question}px`,
    '--interview-answer-font-size': `${fontSizes.answer}px`,
  } as CSSProperties

  return <main className="interview-console" style={consoleStyle}>
    {recordsOpen && <InterviewRecordsPanel onClose={() => setRecordsOpen(false)} />}
    <header className="console-topbar drag-region select-none"><div className="brand-lockup"><div className="brand-orbit"><Sparkles size={16} /></div><div><p className="eyebrow">NATIVELY / INTERVIEW LAB</p><h1>面试控制台</h1></div></div><div ref={consoleDragHandleRef} className="console-drag-handle" aria-hidden="true" /><div className="session-meta"><span className={`status-dot status-${status}`} /><span>{!isLive && status === 'transcribing' ? '生成中' : STATUS_COPY[status]}</span><span className="meta-divider" /><Timer size={15} /><strong>{formatTime(elapsed)}</strong></div><div className="topbar-actions no-drag"><button type="button" className="english-mode-button record-history-button" onClick={() => { void recorderRef.current?.flush().then(() => setRecordsOpen(true)) }}><HistoryIcon size={15} /> 面试记录</button><button type="button" className="english-mode-button" aria-pressed={englishMode} disabled={languageBusy} title="切换识别与回答语言；下一道问题生效" onClick={() => { void toggleEnglishMode() }}>{languageBusy ? "切换中…" : englishMode ? "英文模式 · 已开启" : "英文模式"}</button><div className="font-size-controls no-drag"><div className="font-size-control"><button type="button" aria-label="缩小问题字体" title="缩小问题字体" disabled={fontSizes.question <= INTERVIEW_FONT_MIN} onClick={() => changeInterviewFontSize('question', -1)}>−</button><span role="button" tabIndex={0} title="双击恢复问题默认字号" onDoubleClick={() => resetInterviewFontSize('question')} onKeyDown={(event) => handleFontResetKeyDown(event, 'question')}>问题 {fontSizes.question}px</span><button type="button" aria-label="放大问题字体" title="放大问题字体" disabled={fontSizes.question >= INTERVIEW_FONT_MAX} onClick={() => changeInterviewFontSize('question', 1)}>+</button></div><div className="font-size-control"><button type="button" aria-label="缩小答案字体" title="缩小答案字体" disabled={fontSizes.answer <= INTERVIEW_FONT_MIN} onClick={() => changeInterviewFontSize('answer', -1)}>−</button><span role="button" tabIndex={0} title="双击恢复答案默认字号" onDoubleClick={() => resetInterviewFontSize('answer')} onKeyDown={(event) => handleFontResetKeyDown(event, 'answer')}>答案 {fontSizes.answer}px</span><button type="button" aria-label="放大答案字体" title="放大答案字体" disabled={fontSizes.answer >= INTERVIEW_FONT_MAX} onClick={() => changeInterviewFontSize('answer', 1)}>+</button></div></div><button className="icon-button" aria-label="打开设置" title="打开设置" onClick={() => onOpenSettings('audio')}><Settings size={17} /></button><button className="icon-button" aria-label="重置会话" disabled={sessionBusy} onClick={() => { void resetSession() }}><RotateCcw size={17} /></button><WindowControls /></div></header>
    <section className="console-grid"><aside className="control-rail"><div className="panel-heading"><span>01</span><h2>会话控制</h2></div><div className="rail-scroll-region" tabIndex={0} role="region" aria-label="会话设置"><div className="control-stack"><button type="button" className="scope-settings-button" onClick={() => onOpenSettings('interview-answer')} title="修改公司、岗位方向与主讲项目"><strong>{interviewProfile.company || '面试范围'}</strong><span>{interviewProfile.position || '点击设置岗位与项目'}</span><small>当前范围：{interviewScopeLabel(activeScope.projectIds?.length || activeScope.role ? activeScope : { role: interviewProfile.role, projectIds: interviewProfile.defaultProjectId ? [interviewProfile.defaultProjectId] : [] })}</small></button><label className="field-label">输入方式</label><div className="segmented-control input-mode-control"><button className={source === 'microphone' ? 'selected' : ''} disabled={isLive || sessionBusy} onClick={() => setSource('microphone')}><Mic size={15} /> 麦克风 / USB</button><button className={source === 'system' ? 'selected' : ''} disabled={isLive || sessionBusy} onClick={() => setSource('system')}><Headphones size={15} /> 系统回采</button></div><label className="field-label" htmlFor="device">设备</label><div className="select-wrap"><select id="device" value={device} disabled={isLive} onChange={(event) => source === 'microphone' ? setInputDevice(event.target.value) : setOutputDevice(event.target.value)}><option value="default">跟随系统默认{source === 'microphone' ? '输入' : '输出'}</option>{audioDevices.filter(item => item.id !== 'default').map(item => <option key={item.id} value={item.id}>{item.name}</option>)}{device !== 'default' && !audioDevices.some(item => item.id === device) && <option value={device}>{device}（未连接）</option>}</select><ChevronDown size={15} /></div>{deviceError && <p className="rail-error">{deviceError}</p>}{source === 'microphone' && <p className="answer-level-help">选择 iPhone 可读取 USB 音频；微信通话是否输出需实测。选电脑麦克风时，你和对方的声音可能混在一起。</p>}<label className="field-label" htmlFor="chunk">音频块</label><div className="select-wrap"><select id="chunk" value={chunkDuration} onChange={(event) => setChunkDuration(event.target.value)}><option>0.5 秒</option><option>1 秒</option><option>2 秒</option></select><ChevronDown size={15} /></div><label className="field-label" htmlFor="answer-level">回答级别</label><div className="select-wrap answer-level-select"><select id="answer-level" value={answerLevel} onChange={(event) => handleAnswerLevelChange(event.target.value as InterviewAnswerLevel)}>{INTERVIEW_ANSWER_LEVEL_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><ChevronDown size={15} /></div><p className="answer-level-help">{selectedAnswerLevel?.description} · 切换后下一题生效</p><label className="candidate-context-toggle"><input type="checkbox" checked={source === 'system' && candidateContextEnabled} disabled={source !== 'system'} onChange={(event) => handleCandidateContextChange(event.target.checked)} /><span className="candidate-context-switch" aria-hidden="true" /><span><strong>采集我的回答并供 AI 参考</strong><small>{source === 'microphone' ? '当前输入用于听题，不另采集本人回答' : '关闭停止采集我的回答'}</small>{candidateContextEnabled && candidateCleanupStatus !== 'idle' && <em className={`candidate-cleanup-status status-${candidateCleanupStatus}`}>{candidateCleanupStatus === 'cleaning' ? 'AI 整理中' : candidateCleanupStatus === 'cleaned' ? 'AI 已整理' : 'AI 使用原文'}</em>}</span></label></div><div className="rail-divider" /><div className="signal-card"><div className="signal-header"><span>输入信号</span><span className={isLive ? 'signal-live' : ''}>{isLive ? 'LIVE' : 'IDLE'}</span></div><div className="mini-wave">{waveform.slice(0, 18).map((height, index) => <i key={index} style={{ height: `${isLive ? height : 8}px` }} />)}</div><p>{isLive ? '正在监听音频并转写' : '开始后显示实时音频活动'}</p></div></div><div className="rail-bottom"><p className={recordStatus.kind === 'error' ? 'rail-error' : 'rail-note'} role="status" data-testid="record-save-status">{recordStatus.kind === 'idle' ? '开始后自动保存面试记录' : recordStatus.kind === 'saved' ? '面试记录已保存到本机' : recordStatus.kind === 'saving' ? '正在保存面试记录…' : recordStatus.kind === 'error' ? `记录保存失败：${recordStatus.message}` : recordStatus.message}{recordStatus.kind === 'error' && <button type="button" onClick={() => { void recorderRef.current?.retry() }}>重试保存</button>}</p><div className="rail-actions">{isLive ? <button className="stop-button" disabled={sessionBusy} onClick={() => { void stopSession() }}><CircleStop size={17} /> 停止采集</button> : <button className="primary-button" disabled={sessionBusy || manualGenerationPending} onClick={() => { void handleStartInterview() }}><Play size={17} fill="currentColor" /> 开始面试</button>}{demoEnabled && <button className="demo-button" onClick={loadDemo}>加载演示问题</button>}</div>{error && <p className="rail-error">{error}</p>}<p className="rail-note" title="Electron 使用原生音频会话；浏览器模式只用于界面预览。">{isLive ? '正在采集音频并转写' : window.electronAPI ? '可在中间直接输入问题生成回答；音频采集未启动' : '浏览器界面预览'}</p></div></aside>
      <section className="transcript-panel"><div className="panel-heading"><span>02</span><h2>实时转写</h2><span className="panel-kicker">{isLive ? 'LISTENING' : 'LOCAL BUFFER'}</span></div><ManualQuestionInput busy={sessionBusy || answerState.items.some(item => item.status === 'generating' || item.status === 'queued')} disabled={languageBusy} onSubmit={submitManualQuestion} /><div className="waveform large-wave">{waveform.map((height, index) => <i key={index} style={{ height: `${isLive ? height : (index % 4 === 0 ? 22 : 8)}px` }} />)}</div><div className="transcript-scroll-shell"><div ref={transcriptScrollRef} className="transcript-scroll-region" onScroll={handleTranscriptScroll}><div className="transcript-stage">{(interviewerTranscriptWindow.folded || candidateTranscriptWindow.folded) && <div className="transcript-folded-notice">已折叠更早转写，完整内容仍用于上下文和会议记录</div>}<section className="interviewer-transcript" aria-live="polite"><div className="transcript-channel-label"><Radio size={13} />面试官问题</div><div className="live-caption"><span className="caption-marker" />{interviewerTranscriptWindow.text || '等待面试官提问或直接输入问题…'}</div>{!interviewerTranscriptWindow.text && <div className="transcript-empty"><Activity size={20} /><p>识别到的问题会显示在这里，也可在上方直接输入。</p><span>检测到停顿后自动确认问题并生成回答。{source === 'system' && '请暂停其他音乐或视频，避免持续声音影响断句。'}</span></div>}</section><section className="candidate-transcript" aria-live="polite"><div className="transcript-channel-label"><Mic size={13} />我的回答</div><p>{candidateTranscriptWindow.text || '等待你的回答…'}</p></section></div></div>{!followLatestTranscript && <button type="button" className="transcript-return-latest no-drag" aria-label="回到最新转写" onClick={scrollTranscriptToLatest}>回到最新</button>}</div>{confirmedQuestion && <div className="confirmed-question" aria-label="当前已确认问题"><div className="confirmed-label"><Radio size={13} /> 已确认问题</div><p>{confirmedQuestion}</p></div>}<div className="transcript-footer"><span><span className="tiny-led" />{englishMode ? 'English' : '中文'} / {isLive ? sttEngineLabel : '文字提问'}</span><span>{showDemo ? '演示数据已加载' : isLive ? '原生音频通道' : '使用当前模型、岗位和提示词'}</span></div></section>
      <aside className="answer-panel"><div className="panel-heading"><span>03</span><h2>回答建议</h2><span className="answer-badge">AI READY</span></div><AnswerPanel demo={showDemo} question={selectedAnswer?.question || ''} answer={selectedAnswer?.answer || ''} candidateText={candidateText} hits={selectedAnswer?.hits || []} history={answerState.items} selectedId={answerState.selectedId} answerStatus={selectedAnswer?.status || null} answerSource={selectedAnswer?.answerSource} answerError={selectedAnswer?.error} onSelectAnswer={(id) => dispatchAnswer({ type: 'select', id })} onLoadDemo={loadDemo} /></aside>
    </section><footer className="console-footer"><span>LOCAL SESSION / NO CREDENTIALS STORED</span><span>Interview Assistant · v0.1</span></footer>
  </main>
}
