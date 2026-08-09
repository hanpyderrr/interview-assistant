import { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { Activity, ChevronDown, CircleStop, Headphones, History as HistoryIcon, Mic, Play, Radio, RotateCcw, Settings, Sparkles, Timer } from 'lucide-react'
import { splitGistLineStreaming } from '../lib/displayMarkup'
import { DEMO_ANSWER, DEMO_HITS, DEMO_QUESTION, DEMO_TRANSCRIPT, type SessionStatus, nextStatusAfterStart } from './demoSession'
import { appendFinalTurn, buildRecentInterviewContext, isTranscriptAtOrBefore, joinTranscriptTurns, shouldTriggerInterviewAnswer, type InterviewTurn } from './interviewContext'
import { shouldAcceptQuestionFinal } from './questionTiming'
import { normalizeInterviewQuestion } from './questionNormalization'
import { toSimplifiedChinese } from './simplifiedChinese'
import { buildInterviewConsolePrompt } from './interviewPrompt'
import { createAnswerPrewarmCache } from './answerPrewarm'
import { createPartialPrewarmGate } from './partialPrewarm'
import { createCandidateGenerationController } from './candidateGeneration'
import { createProviderDeadlineController } from './providerDeadlineController'
import { answerHistoryReducer, createAnswerHistoryState, getSelectedAnswer, type InterviewAnswerHit, type InterviewAnswerItem } from './answerHistory'
import { createLatencyTrace, DEFAULT_PROVIDER_DEADLINE_MS, type LatencyRecord } from './latencyTelemetry'
import { recordRoundEvent, resetRoundEvents, recordTranscriptDiagnostics, recordTranscriptResetDiagnostics, computeAcceptedFinalGaps } from './roundEventsWindow'
import { createQuestionRoundCoordinator, type RoundAction } from './questionRoundCoordinator'
import WindowControls from '../components/WindowControls'
import './InterviewConsole.css'

const STATUS_COPY: Record<SessionStatus, string> = { ready: '准备就绪', recording: '正在采集', transcribing: '识别中', answered: '回答已生成' }
const formatTime = (seconds: number) => `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`
const appendTranscriptSegment = (current: string, segment: string) => current.endsWith(segment) ? current : `${current} ${segment}`.trim()

type Hit = InterviewAnswerHit
type InterviewConsoleProps = { onOpenSettings: (tab: string) => void }
type AnswerJob = { id: number; question: string; analysisQuestion: string; conversationContext: string; generation: number; roundId: number; attemptId: number; roundSessionGeneration: number }
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
}

const ANSWER_STATUS_COPY: Record<InterviewAnswerItem['status'], string> = {
  queued: '排队中',
  generating: '生成中',
  answered: '已完成',
  error: '生成失败',
  interrupted: '已中断',
}

function AnswerPanel({ demo, question, answer, candidateText, hits, history, selectedId, answerStatus, onSelectAnswer, onLoadDemo }: {
  demo: boolean;
  question: string;
  answer: string;
  candidateText: string;
  hits: Hit[];
  history: InterviewAnswerItem[];
  selectedId: number | null;
  answerStatus: InterviewAnswerItem['status'] | null;
  onSelectAnswer: (id: number) => void;
  onLoadDemo: () => void;
}) {
  if (!demo && !question && !answer && history.length === 0) return <div className="answer-empty"><div className="empty-orb"><Sparkles size={22} /></div><h3>回答区已就绪</h3><p>确认问题后，这里会显示题库命中、流式回答和追问提示。</p><button onClick={onLoadDemo}>加载演示内容</button></div>
  const shownHits = demo ? DEMO_HITS : hits
  const spokenAnswer = demo ? DEMO_ANSWER.spoken : splitGistLineStreaming(answer).body
  const answerOutputLabel = answerStatus === 'error' ? '本地兜底稿' : '流式输出'
  const historyItems = history.slice().reverse()
  return <div className="answer-content">
    {!demo && history.length > 0 && <div className="answer-history" aria-label="历史问题"><div className="section-label"><span className="history-heading"><HistoryIcon size={13} />历史问题</span><span>{history.length}/10</span></div>{historyItems.map((item) => <button type="button" key={item.id} className={`history-item${item.id === selectedId ? ' selected' : ''}`} aria-pressed={item.id === selectedId} onClick={() => onSelectAnswer(item.id)}><span className="history-question">{item.question}</span><span className={`history-status status-${item.status}`}>{ANSWER_STATUS_COPY[item.status]}</span></button>)}</div>}
    {candidateText && <div className="spoken-answer candidate-answer"><div className="section-label">候选回答 <span className="accent-label">实时生成</span></div><p>{splitGistLineStreaming(candidateText).body}</p></div>}
    <div className="spoken-answer"><div className="section-label">口述版回答 <span className="accent-label">{answerOutputLabel}</span></div><p>{spokenAnswer || '正在生成回答…'}</p></div>
    <div className="answer-divider" />
    <div className="hit-section"><div className="section-label">题库命中 <span>TOP {shownHits.length}</span></div>{shownHits.map((hit) => <div className="hit-row" key={hit.id}><div className="hit-index">{hit.id.split('.')[1] || '·'}</div><div className="hit-main"><strong>{hit.title}</strong><p>{hit.excerpt}</p><small>{hit.source === 'resume_fact' ? '简历事实' : '准备答案'} · {hit.score.toFixed(2)}</small></div></div>)}</div>
    {demo && <><div className="project-line"><span>结合我的项目</span><p>{DEMO_ANSWER.project}</p></div><div className="followup-line"><span>可能追问</span><ul>{DEMO_ANSWER.followUps.map((item) => <li key={item}>{item}</li>)}</ul></div><div className="boundary-line"><span>边界提醒</span><ul>{DEMO_ANSWER.boundaries.map((item) => <li key={item}>{item}</li>)}</ul></div></>}
  </div>
}

export default function InterviewConsole({ onOpenSettings }: InterviewConsoleProps) {
  const [status, setStatus] = useState<SessionStatus>('ready')
  const [sessionActive, setSessionActive] = useState(false)
  const [source, setSource] = useState<'microphone' | 'system'>('system')
  const [device, setDevice] = useState('扬声器 (Realtek High Definition Audio)')
  const [chunkDuration, setChunkDuration] = useState('1 秒')
  const [elapsed, setElapsed] = useState(0)
  const [interviewerTranscript, setInterviewerTranscript] = useState('')
  const [candidateTranscript, setCandidateTranscript] = useState('')
  const [confirmedQuestion, setConfirmedQuestion] = useState('')
  const [answerState, dispatchAnswer] = useReducer(answerHistoryReducer, createAnswerHistoryState(10))
  const [error, setError] = useState('')
  const [showDemo, setShowDemo] = useState(false)
  const [candidateText, setCandidateText] = useState('')
  const sessionActiveRef = useRef(false)
  const committedInterviewerRef = useRef<InterviewTurn[]>([])
  const committedCandidateRef = useRef<InterviewTurn[]>([])
  const conversationTurnsRef = useRef<InterviewTurn[]>([])
  const answerSequenceRef = useRef(0)
  // Phase 18 Step 5: the pure coordinator owns round/attempt identity. Answer ids
  // still come from answerSequenceRef so history/telemetry numbering is unchanged.
  const roundCoordinatorRef = useRef(createQuestionRoundCoordinator({
    allocateAnswerId: () => ++answerSequenceRef.current,
  }))
  const lastSettledQuestionRef = useRef('')
  const lastAnsweredQuestionRef = useRef<InterviewTurn | null>(null)
  const roundTickRef = useRef<number | null>(null)
  const answerQueueRef = useRef<AnswerJob[]>([])
  const answerPrewarmRef = useRef(createAnswerPrewarmCache(async (question) => {
    const retrieval = await window.electronAPI?.retrieveInterviewKnowledge?.(question)
    return retrieval || { success: true }
  }))
  const partialPrewarmRef = useRef(createPartialPrewarmGate({
    onStable: ({ question, segmentId }) => {
      if (!sessionActiveRef.current) return
      void answerPrewarmRef.current.prewarm(question, getConversationContext())
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
  const isLive = sessionActive
  const waveform = useMemo(() => Array.from({ length: 32 }, (_, index) => 18 + ((index * 17) % 43)), [])
  const selectedAnswer = getSelectedAnswer(answerState)

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
    active.settled = true
    const timeoutMessage = '模型响应超时，已使用本地兜底稿'
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
    recordRoundEvent({ type: 'answer-lifecycle', stage: 'cancel', answerId: active.id, streamId: active.streamId, reason: 'round-restart' })
    activeAnswerRef.current = null
  }

  function startRoundGeneration(action: { type: 'generate'; roundId: number; answerId: number; attemptId: number; question: string; reason: 'provisional' | 'restart' }): void {
    cancelCandidateStream()
    const question = toSimplifiedChinese(action.question)
    const conversationContext = getConversationContext()
    const job: AnswerJob = {
      id: action.answerId,
      question,
      analysisQuestion: normalizeInterviewQuestion(question),
      conversationContext,
      generation: sessionGenerationRef.current,
      roundId: action.roundId,
      attemptId: action.attemptId,
      roundSessionGeneration: roundCoordinatorRef.current.getSnapshot().sessionGeneration,
    }
    const latencyTrace = pendingLatencyTraceRef.current
    if (latencyTrace && !latencyTraceByAnswerIdRef.current.has(action.answerId)) {
      latencyTrace.mark('questionSettled')
      latencyTraceByAnswerIdRef.current.set(action.answerId, latencyTrace)
      pendingLatencyTraceRef.current = null
    }
    lastSettledQuestionRef.current = question
    lastAnsweredQuestionRef.current = roundCoordinatorRef.current.getSnapshot().turns.slice(-1)[0] as InterviewTurn
      ?? lastAnsweredQuestionRef.current
    setConfirmedQuestion(question)
    void answerPrewarmRef.current.prewarm(job.analysisQuestion, conversationContext).catch(() => {})
    if (action.reason === 'provisional') {
      enqueueAnswer(action.answerId, question, job)
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
      startRoundGeneration(action)
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
      return buildRecentInterviewContext(conversationTurnsRef.current)
    } catch {
      return ''
    }
  }

  async function startCandidateStream(question: string, prewarmed: { retrieval: { success: boolean; context?: string }; context: string; prompt?: string }, segmentId?: number): Promise<void> {
    const api = window.electronAPI
    if (!api?.streamGeminiChat || !prewarmed.retrieval.success || !prewarmed.prompt || !sessionActiveRef.current) return
    const answeredBoundary = lastAnsweredQuestionRef.current
    if (typeof segmentId === 'number' && typeof answeredBoundary?.segmentId === 'number' && segmentId <= answeredBoundary.segmentId) return
    const previous = candidateStreamRef.current
    if (previous && !previous.settled) {
      candidateControllerRef.current.cancel(previous.generationId)
      candidateStreamRef.current = null
    }
    const generationId = ++candidateGenerationRef.current
    candidateControllerRef.current.start({ generationId, question })
    candidateStreamRef.current = { generationId, question, settled: false }
    setCandidateText('')
    try {
      await api.streamGeminiChat(prewarmed.prompt, undefined, prewarmed.context, { skipSystemPrompt: true, ignoreKnowledgeMode: true })
      const candidate = candidateStreamRef.current
      if (candidate?.generationId === generationId && !candidate.settled) {
        candidate.settled = true
        candidateControllerRef.current.complete(generationId)
        setCandidateText(candidateControllerRef.current.snapshot().candidateText)
      }
    } catch {
      const candidate = candidateStreamRef.current
      if (candidate?.generationId === generationId) {
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
    dispatchAnswer({ type: 'enqueue', id, question, select })
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
    dispatchAnswer({ type: 'start', id: job.id })
    recordRoundEvent({ type: 'answer-lifecycle', stage: 'start', answerId: job.id })
    setStatus('transcribing')
    const api = window.electronAPI
    if (!api?.streamGeminiChat) {
      active.settled = true
      dispatchAnswer({ type: 'error', id: job.id, error: '回答服务不可用' })
      activeAnswerRef.current = null
      return
    }
    try {
      let prewarmed = null
      try {
        prewarmed = await answerPrewarmRef.current.consume(job.analysisQuestion, job.conversationContext)
      } catch {
        // Question text or conversation context changed after prewarm.
      }
      const retrieval = prewarmed?.retrieval || await api.retrieveInterviewKnowledge?.(job.analysisQuestion)
      if (!isCurrentAnswer(active)) return
      latencyTrace?.mark('retrievalReady')
      if (retrieval && !retrieval.success) {
        active.settled = true
        const message = retrieval.error || '题库检索失败'
        dispatchAnswer({ type: 'error', id: job.id, error: message })
        completeLatencyTrace(job.id, 'error', message)
        setError(message)
        setStatus('ready')
        return
      }
      const context = retrieval?.context || '暂无题库命中。请只使用已确认的个人经历，未知数据标记为待补充。'
      if (retrieval?.matches) dispatchAnswer({ type: 'hits', id: job.id, hits: retrieval.matches as Hit[] })
      const prompt = prewarmed?.prompt || buildInterviewConsolePrompt(job.analysisQuestion, context, job.conversationContext)
      providerDeadlineControllerRef.current.start(active.id)
      if ((window as InterviewLatencyWindow).__nativelyInjectInterviewProviderTimeout) {
        latencyTrace?.mark('providerDeadline')
        latencyTrace?.setProvider({ outcome: 'timeout', timeout: true })
        throw new Error('Injected Provider timeout')
      }
      await api.streamGeminiChat(prompt, undefined, context, { skipSystemPrompt: true, ignoreKnowledgeMode: true })
      // Providers normally emit `done`; this fallback keeps the queue moving
      // if a compatible provider resolves without sending a terminal event.
      if (isCurrentAnswer(active) && !active.settled) {
        providerDeadlineControllerRef.current.complete(job.id, 'done')
        active.settled = true
        dispatchAnswer({ type: 'done', id: job.id })
        completeLatencyTrace(job.id, 'success')
        setStatus('answered')
      }
    } catch (caught: any) {
      if (!isCurrentAnswer(active)) return
      providerDeadlineControllerRef.current.complete(job.id, 'error')
      active.settled = true
      const message = caught?.message || '回答生成失败'
      dispatchAnswer({ type: 'error', id: job.id, error: message })
      completeLatencyTrace(job.id, message === 'Injected Provider timeout' ? 'timeout' : 'error', message)
      setError(message)
      setStatus('ready')
    } finally {
      if (activeAnswerRef.current !== active) return
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
        lastSettledQuestionRef.current = ''
        return
      }
      recordTranscriptDiagnostics(event, rendererReceiveMonotonicMs)
      if (!sessionActiveRef.current) return
      const rawText = event.text?.trim()
      if (!rawText) return
      if (event.speaker === 'user') {
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
          committedCandidateRef.current = appendFinalTurn(committedCandidateRef.current, incoming)
          setCandidateTranscript(joinTranscriptTurns(committedCandidateRef.current))
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
          setCandidateTranscript(appendTranscriptSegment(joinTranscriptTurns(committedCandidateRef.current), text))
        }
        setStatus('transcribing')
        return
      }
      if (event.speaker !== 'interviewer') return
      const text = toSimplifiedChinese(rawText)
      if (event.final) {
        if (typeof event.segmentId === 'number') partialPrewarmRef.current.cancelSegment(event.segmentId)
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
            void answerPrewarmRef.current.prewarm(normalizeInterviewQuestion(snapshot.pendingQuestion), getConversationContext()).catch(() => {})
          }
          if (roundTickRef.current !== null) window.clearTimeout(roundTickRef.current)
          if (snapshot.roundOpen && snapshot.status === 'idle' && snapshot.pendingQuestion.trim()) {
            scheduleRoundTick(2500)
          }
        }

        setInterviewerTranscript(joinTranscriptTurns(committedInterviewerRef.current))
        setStatus('transcribing')
      } else {
        partialPrewarmRef.current.observe({
          speaker: event.speaker,
          segmentId: event.segmentId,
          text,
        })
        setInterviewerTranscript(appendTranscriptSegment(joinTranscriptTurns(committedInterviewerRef.current), text))
        setStatus('transcribing')
      }
    })
    const removeStatus = api.onSttStatusChanged?.((event) => {
      if (!sessionActiveRef.current) return
      if (event.state === 'failed') { setError(event.error || '语音识别连接失败'); setStatus('ready') }
      else if (event.state === 'connected' || event.state === 'awaiting-audio') setStatus('recording')
      else if (event.state === 'reconnecting') setStatus('transcribing')
    })
    const removeToken = api.onGeminiStreamToken?.((token, meta) => {
      const active = claimActiveStream(meta?.streamId)
      if (!active) {
        const candidate = claimCandidateStream(meta?.streamId)
        if (!candidate) return
        if (candidateControllerRef.current.acceptCandidateToken({ generationId: candidate.generationId, token })) {
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
      dispatchAnswer({ type: 'token', id: active.id, token })
      recordRoundEvent({ type: 'answer-lifecycle', stage: 'token', answerId: active.id, streamId: active.streamId, textLength: token.length })
      setStatus('transcribing')
    })
    const removeDone = api.onGeminiStreamDone?.((data) => {
      const active = claimActiveStream(data?.streamId)
      if (!active) {
        const candidate = claimCandidateStream(data?.streamId)
        if (!candidate) return
        if (typeof data?.streamId === 'number') lastSeenStreamIdRef.current = Math.max(lastSeenStreamIdRef.current, data.streamId)
        candidate.settled = true
        candidateControllerRef.current.complete(candidate.generationId, data?.finalText)
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
        const elapsedMs = typeof retrievalReadyAt === 'number' ? Math.max(0, Date.now() - retrievalReadyAt) : DEFAULT_PROVIDER_DEADLINE_MS
        const outcome = elapsedMs >= DEFAULT_PROVIDER_DEADLINE_MS - 250 ? 'timeout' : 'error'
        const message = outcome === 'timeout' ? '模型响应超时，已使用本地兜底稿' : '模型未返回有效答案，已使用本地兜底稿'
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
        void pumpAnswerQueue()
        return
      }
      providerDeadlineControllerRef.current.complete(active.id, 'done')
      if (typeof data?.streamId === 'number') lastSeenStreamIdRef.current = Math.max(lastSeenStreamIdRef.current, data.streamId)
      active.settled = true
      dispatchAnswer({ type: 'done', id: active.id, finalText: data?.finalText })
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

  function invalidateAnswerJobs() {
    providerDeadlineControllerRef.current.clear()
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
    cancelPendingQuestion()
    invalidateAnswerJobs()
    applyRoundActions(roundCoordinatorRef.current.resetTranscript().actions)
    committedInterviewerRef.current = []
    committedCandidateRef.current = []
    conversationTurnsRef.current = []
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
    setStatus('ready'); setElapsed(0); setInterviewerTranscript(''); setCandidateTranscript(''); setConfirmedQuestion(''); setError(''); setShowDemo(false); setCandidateText('')
  }
  async function resetSession() {
    const wasActive = sessionActiveRef.current
    sessionActiveRef.current = false
    setSessionActive(false)
    clearConsoleState()
    if (wasActive && window.electronAPI?.endMeeting) await window.electronAPI.endMeeting()
  }
  async function startSession() {
    if (sessionActiveRef.current) return
    clearConsoleState()
    meetingStartedAtRef.current = Date.now()
    sessionActiveRef.current = true
    setSessionActive(true)
    // Phase 18 Step 2: session-correlation is now recorded in
    // materializeTranscriptDiagnostics when the first event carrying a genuine
    // canonical sessionId arrives, not here.
    if (window.electronAPI?.startMeeting) { const result = await window.electronAPI.startMeeting({ title: 'AI应用系统工程师面试练习', source, stayOnLauncher: true }); if (!result.success) { sessionActiveRef.current = false; setSessionActive(false); setError(result.error || '无法启动音频会话'); return } }
    setStatus(nextStatusAfterStart())
  }
  async function stopSession() { sessionActiveRef.current = false; cancelPendingQuestion(); cancelCandidateStream(); invalidateAnswerJobs(); setSessionActive(false); setStatus('ready'); if (window.electronAPI?.endMeeting) await window.electronAPI.endMeeting() }
  function loadDemo() { setShowDemo(true); setStatus('transcribing'); setInterviewerTranscript(DEMO_TRANSCRIPT[0].text); window.setTimeout(() => { setInterviewerTranscript(DEMO_TRANSCRIPT[1].text); setConfirmedQuestion(DEMO_QUESTION); setStatus('answered') }, 650) }

  return <main className="interview-console">
    <header className="console-topbar drag-region select-none"><div className="brand-lockup"><div className="brand-orbit"><Sparkles size={16} /></div><div><p className="eyebrow">NATIVELY / INTERVIEW LAB</p><h1>面试控制台</h1></div></div><div className="session-meta"><span className={`status-dot status-${status}`} /><span>{STATUS_COPY[status]}</span><span className="meta-divider" /><Timer size={15} /><strong>{formatTime(elapsed)}</strong></div><div className="topbar-actions no-drag"><button className="icon-button" aria-label="打开设置" title="打开设置" onClick={() => onOpenSettings('audio')}><Settings size={17} /></button><button className="icon-button" aria-label="重置会话" onClick={() => { void resetSession() }}><RotateCcw size={17} /></button><WindowControls /></div></header>
    <section className="console-grid"><aside className="control-rail"><div className="panel-heading"><span>01</span><h2>会话控制</h2></div><div className="control-stack"><label className="field-label">音频源</label><div className="segmented-control"><button className={source === 'microphone' ? 'selected' : ''} onClick={() => setSource('microphone')}><Mic size={15} /> 麦克风</button><button className={source === 'system' ? 'selected' : ''} onClick={() => setSource('system')}><Headphones size={15} /> 系统回采</button></div><label className="field-label" htmlFor="device">设备</label><div className="select-wrap"><select id="device" value={device} onChange={(event) => setDevice(event.target.value)}><option>扬声器 (Realtek High Definition Audio)</option><option>耳机 (AirPods Max)</option></select><ChevronDown size={15} /></div><label className="field-label" htmlFor="chunk">音频块</label><div className="select-wrap"><select id="chunk" value={chunkDuration} onChange={(event) => setChunkDuration(event.target.value)}><option>0.5 秒</option><option>1 秒</option><option>2 秒</option></select><ChevronDown size={15} /></div></div><div className="rail-divider" /><div className="signal-card"><div className="signal-header"><span>输入信号</span><span className={isLive ? 'signal-live' : ''}>{isLive ? 'LIVE' : 'IDLE'}</span></div><div className="mini-wave">{waveform.slice(0, 18).map((height, index) => <i key={index} style={{ height: `${isLive ? height : 8}px` }} />)}</div><p>{isLive ? '正在监听音频并转写' : '开始后显示实时音频活动'}</p></div><div className="rail-actions">{isLive ? <button className="stop-button" onClick={stopSession}><CircleStop size={17} /> 停止采集</button> : <button className="primary-button" onClick={startSession}><Play size={17} fill="currentColor" /> 开始面试</button>}{demoEnabled && <button className="demo-button" onClick={loadDemo}>加载演示问题</button>}</div>{error && <p className="rail-error">{error}</p>}<p className="rail-note">Electron 使用原生音频会话；浏览器模式只用于界面预览。</p></aside>
      <section className="transcript-panel"><div className="panel-heading"><span>02</span><h2>实时转写</h2><span className="panel-kicker">{isLive ? 'LISTENING' : 'LOCAL BUFFER'}</span></div><div className="waveform large-wave">{waveform.map((height, index) => <i key={index} style={{ height: `${isLive ? height : (index % 4 === 0 ? 22 : 8)}px` }} />)}</div><div className="transcript-stage"><section className="interviewer-transcript" aria-live="polite"><div className="transcript-channel-label"><Radio size={13} />面试官问题</div><div className="live-caption"><span className="caption-marker" />{interviewerTranscript || '等待面试官提问…'}</div>{confirmedQuestion ? <div className="confirmed-question"><div className="confirmed-label"><Radio size={13} /> 已确认问题</div><p>{confirmedQuestion}</p></div> : !interviewerTranscript && <div className="transcript-empty"><Activity size={20} /><p>音频进入后，问题会在这里逐字出现。</p><span>检测到停顿后自动确认问题并生成回答。</span></div>}</section><section className="candidate-transcript" aria-live="polite"><div className="transcript-channel-label"><Mic size={13} />我的回答</div><p>{candidateTranscript || '等待你的回答…'}</p></section></div><div className="transcript-footer"><span><span className="tiny-led" />中文 / Whisper</span><span>{showDemo ? '演示数据已加载' : '原生音频通道'}</span></div></section>
      <aside className="answer-panel"><div className="panel-heading"><span>03</span><h2>回答建议</h2><span className="answer-badge">AI READY</span></div><AnswerPanel demo={showDemo} question={selectedAnswer?.question || ''} answer={selectedAnswer?.answer || ''} candidateText={candidateText} hits={selectedAnswer?.hits || []} history={answerState.items} selectedId={answerState.selectedId} answerStatus={selectedAnswer?.status || null} onSelectAnswer={(id) => dispatchAnswer({ type: 'select', id })} onLoadDemo={loadDemo} /></aside>
    </section><footer className="console-footer"><span>LOCAL SESSION / NO CREDENTIALS STORED</span><span>Interview Assistant · v0.1</span></footer>
  </main>
}
