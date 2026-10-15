// src/interview-console/InterviewRecordsPanel.tsx
//
// Read/review panel for durable interview records ("面试记录").
//
// Scope notes:
//   - Records are written by the interview session pipeline (shared/interviewRecords.ts).
//   - This panel only READS records, saves a human review per round, and exports.
//   - There is intentionally no AI auto-analysis, no delete and no auto-learning.
//   - The AI suggested answer is NEVER presented as something the candidate said;
//     captured candidate speech lives in a separate section (candidateTurns).
//
// Accessibility:
//   - Fixed overlay, role="dialog", aria-modal, aria-label="面试记录".
//   - Escape closes, focus moves to the close button on open, and the previously
//     focused element is restored on unmount.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  InterviewRecord,
  InterviewRecordsAPI,
  RecordCandidateTurn,
  RecordRound,
  RecordSessionSummary,
  RecordStatus,
  ReviewRating,
  SavedRecordRound,
} from '../../shared/interviewRecords'
import './InterviewRecordsPanel.css'

export interface InterviewRecordsPanelProps {
  onClose: () => void
}

type StatusKind = 'info' | 'success' | 'error'

interface ReviewDraft {
  rating: ReviewRating
  note: string
}

/**
 * window.electronAPI is augmented by the IPC integration layer with the methods
 * declared in shared/interviewRecords.ts. It is read through a structural cast so
 * this panel degrades gracefully (visible status, never a fake success) if a build
 * ships before/without the bridge, and so it stays decoupled from the large
 * generated ElectronAPI declaration.
 */
type RecordsBridge = Partial<InterviewRecordsAPI>

function getRecordsBridge(): RecordsBridge | null {
  if (typeof window === 'undefined') return null
  const api = (window as unknown as { electronAPI?: unknown }).electronAPI
  if (!api || typeof api !== 'object') return null
  return api as RecordsBridge
}

const RATING_OPTIONS: Array<{ value: ReviewRating; label: string }> = [
  { value: 'unreviewed', label: '未复盘' },
  { value: 'good', label: '可用' },
  { value: 'needs_work', label: '待改进' },
]

function ratingLabel(rating: ReviewRating): string {
  const found = RATING_OPTIONS.find((option) => option.value === rating)
  return found ? found.label : '未复盘'
}

function sessionStatusLabel(status: RecordStatus): string {
  if (status === 'completed') return '已完成'
  if (status === 'active') return '进行中'
  if (status === 'interrupted') return '已中断（可能不完整）'
  return String(status)
}

function sessionStatusClass(status: RecordStatus): string {
  if (status === 'completed') return 'irp-status-completed'
  if (status === 'active') return 'irp-status-active'
  return 'irp-status-interrupted'
}

function roundStatusLabel(status: RecordRound['status']): string {
  switch (status) {
    case 'queued':
      return '排队中'
    case 'generating':
      return '生成中'
    case 'answered':
      return '已回答'
    case 'error':
      return '失败'
    case 'interrupted':
      return '中断'
    default:
      return String(status)
  }
}

function roundStatusClass(status: RecordRound['status']): string {
  if (status === 'answered') return 'irp-round-answered'
  if (status === 'error') return 'irp-round-error'
  if (status === 'interrupted') return 'irp-round-interrupted'
  return 'irp-round-pending'
}

function answerSourceLabel(source: RecordRound['answerSource']): string {
  switch (source) {
    case 'model':
      return '模型生成'
    case 'reference':
      return '参考资料'
    case 'guidance':
      return '引导提示'
    case 'unavailable':
      return '不可用'
    default:
      return String(source)
  }
}

function pad(value: number): string {
  return value < 10 ? `0${value}` : String(value)
}

function isValidTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

function formatDateTime(value: unknown): string {
  if (!isValidTimestamp(value)) return '时间未知'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '时间未知'
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function formatClock(value: unknown): string {
  if (!isValidTimestamp(value)) return '--:--'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '--:--'
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

/**
 * (firstAnswerAt - askedAt) is the time from "the question was confirmed" to
 * "the first answer segment arrived". It is NOT audio latency and must not be
 * labelled as such.
 */
function formatFirstAnswerGap(round: RecordRound): string {
  const askedAt = round.askedAt
  const firstAnswerAt = round.firstAnswerAt
  if (!isValidTimestamp(askedAt) || !isValidTimestamp(firstAnswerAt)) return '未记录'
  const delta = firstAnswerAt - askedAt
  if (!Number.isFinite(delta) || delta < 0) return '未记录'
  if (delta < 1000) return `${Math.round(delta)} 毫秒`
  return `${(delta / 1000).toFixed(1)} 秒`
}

function errorText(error: unknown): string {
  if (typeof error === 'string' && error.trim()) return error
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string' && message.trim()) return message
  }
  return '未知错误'
}

const InterviewRecordsPanel = ({ onClose }: InterviewRecordsPanelProps) => {
  const panelRef = useRef<HTMLDivElement | null>(null)
  const closeButtonRef = useRef<HTMLButtonElement | null>(null)

  // List state.
  const [records, setRecords] = useState<RecordSessionSummary[]>([])
  const [listLoading, setListLoading] = useState(false)
  const [listLoadedOnce, setListLoadedOnce] = useState(false)
  const [hasMore, setHasMore] = useState(false)

  // Detail state.
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<InterviewRecord | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  // Unsaved review edits, keyed by `${recordId}:${roundId}` so that reselecting a
  // session never silently discards work in progress.
  const [drafts, setDrafts] = useState<Record<string, ReviewDraft>>({})
  const [savingRounds, setSavingRounds] = useState<Record<string, boolean>>({})
  const [exporting, setExporting] = useState<'json' | 'markdown' | null>(null)

  const [status, setStatus] = useState<{ kind: StatusKind; text: string } | null>(null)

  // Monotonic request tokens guard against late responses switching the UI.
  const listSeqRef = useRef(0)
  const detailSeqRef = useRef(0)
  const selectedIdRef = useRef<string | null>(null)
  selectedIdRef.current = selectedId

  const bridge = useMemo(() => getRecordsBridge(), [])

  const draftKey = useCallback(
    (recordId: string, roundId: number) => `${recordId}:${roundId}`,
    [],
  )

  const hasDraftsFor = useCallback(
    (recordId: string | null) => {
      if (!recordId) return false
      const prefix = `${recordId}:`
      return Object.keys(drafts).some((key) => key.startsWith(prefix))
    },
    [drafts],
  )

  // ── List loading ─────────────────────────────────────────────────────────

  const loadPage = useCallback(
    async (offset: number, mode: 'replace' | 'append') => {
      const api = getRecordsBridge()
      if (!api || typeof api.listInterviewRecords !== 'function') {
        setListLoadedOnce(true)
        setStatus({
          kind: 'error',
          text: '面试记录功能尚未接入：listInterviewRecords 不可用。',
        })
        return
      }

      const seq = ++listSeqRef.current
      setListLoading(true)
      try {
        const page = await api.listInterviewRecords(offset)
        if (seq !== listSeqRef.current) return // a newer list request won
        const incoming = Array.isArray(page?.records) ? page.records : []
        setRecords((previous) => {
          if (mode === 'replace') return incoming
          const seen = new Set(previous.map((item) => item.id))
          return previous.concat(incoming.filter((item) => !seen.has(item.id)))
        })
        setHasMore(Boolean(page?.hasMore))
        setListLoadedOnce(true)
      } catch (error) {
        if (seq !== listSeqRef.current) return
        setListLoadedOnce(true)
        setStatus({ kind: 'error', text: `加载面试记录失败：${errorText(error)}` })
      } finally {
        if (seq === listSeqRef.current) setListLoading(false)
      }
    },
    [],
  )

  // ── Detail loading ───────────────────────────────────────────────────────

  const loadDetail = useCallback(
    async (id: string, options?: { quiet?: boolean }) => {
      const api = getRecordsBridge()
      if (!api || typeof api.getInterviewRecord !== 'function') {
        if (!options?.quiet) {
          setStatus({ kind: 'error', text: '面试记录功能尚未接入：getInterviewRecord 不可用。' })
        }
        return
      }

      const seq = ++detailSeqRef.current
      if (!options?.quiet) setDetailLoading(true)
      try {
        const record = await api.getInterviewRecord(id)
        // Late response: the user has since selected something else (or the panel
        // was refreshed into another detail) — drop it rather than switching views.
        if (seq !== detailSeqRef.current || selectedIdRef.current !== id) return
        setDetail(record ?? null)
        if (!record) {
          setStatus({ kind: 'error', text: '未找到该记录，可能已被清理或不可读取。' })
        }
      } catch (error) {
        if (seq !== detailSeqRef.current || selectedIdRef.current !== id) return
        setDetail(null)
        setStatus({ kind: 'error', text: `加载记录详情失败：${errorText(error)}` })
      } finally {
        if (seq === detailSeqRef.current) setDetailLoading(false)
      }
    },
    [],
  )

  const selectRecord = useCallback(
    (id: string) => {
      const sameSelection = id === selectedIdRef.current
      setSelectedId(id)
      selectedIdRef.current = id
      // Keep the current detail on a re-select so it does not flash empty while
      // reloading; a different selection clears it immediately.
      if (!sameSelection) setDetail(null)
      setStatus(null)
      // Re-selecting the same record intentionally reloads it (used to pick up
      // changes that a refresh deliberately skipped while edits were pending).
      void loadDetail(id)
    },
    [loadDetail],
  )

  // ── Initial load + focus management ──────────────────────────────────────

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null
    closeButtonRef.current?.focus()
    return () => {
      // Restore focus to whatever opened the panel, when it is still in the DOM.
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
        previouslyFocused.focus()
      }
    }
  }, [])

  useEffect(() => {
    void loadPage(0, 'replace')
    // Intentionally runs once on mount; refreshes go through handleRefresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        onClose()
        return
      }
      if (event.key !== 'Tab') return
      const panel = panelRef.current
      if (!panel) return
      const focusable = panel.querySelectorAll<HTMLElement>(
        'button:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement
      if (event.shiftKey && active === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => document.removeEventListener('keydown', onKeyDown, true)
  }, [onClose])

  // ── Actions ──────────────────────────────────────────────────────────────

  const handleRefresh = useCallback(async () => {
    setStatus(null)
    await loadPage(0, 'replace')
    const id = selectedIdRef.current
    if (!id) return
    if (hasDraftsFor(id)) {
      setStatus({
        kind: 'info',
        text: '已刷新列表。当前详情存在未保存的复盘修改，已保留原详情以免丢失；点击左侧该记录可重新加载最新内容。',
      })
      return
    }
    await loadDetail(id, { quiet: true })
  }, [hasDraftsFor, loadDetail, loadPage])

  const handleLoadMore = useCallback(() => {
    if (listLoading) return
    void loadPage(records.length, 'append')
  }, [listLoading, loadPage, records.length])

  const updateDraft = useCallback(
    (recordId: string, round: SavedRecordRound, patch: Partial<ReviewDraft>) => {
      const key = draftKey(recordId, round.id)
      setDrafts((previous) => {
        const existing: ReviewDraft =
          previous[key] ?? { rating: round.review?.rating ?? 'unreviewed', note: round.review?.note ?? '' }
        return { ...previous, [key]: { ...existing, ...patch } }
      })
    },
    [draftKey],
  )

  const handleSaveReview = useCallback(
    async (recordId: string, round: SavedRecordRound) => {
      const key = draftKey(recordId, round.id)
      const draft = drafts[key]
      if (!draft) return
      const api = getRecordsBridge()
      if (!api || typeof api.reviewInterviewRound !== 'function') {
        setStatus({ kind: 'error', text: '复盘保存功能尚未接入：reviewInterviewRound 不可用。修改已保留。' })
        return
      }

      setSavingRounds((previous) => ({ ...previous, [key]: true }))
      setStatus(null)
      try {
        const result = await api.reviewInterviewRound(recordId, round.id, {
          rating: draft.rating,
          note: draft.note,
        })
        if (!result || result.success !== true) {
          // Keep the draft so nothing the user typed is lost.
          setStatus({
            kind: 'error',
            text: `复盘保存失败：${result?.error || (result?.disabled ? '该功能当前不可用' : '未知错误')}。修改已保留。`,
          })
          return
        }
        setDrafts((previous) => {
          const next = { ...previous }
          delete next[key]
          return next
        })
        setDetail((previous) => {
          if (!previous || previous.id !== recordId) return previous
          return {
            ...previous,
            needsWorkCount: previous.rounds.filter(item => (item.id === round.id ? draft.rating : item.review.rating) === 'needs_work').length,
            rounds: previous.rounds.map((item) =>
              item.id === round.id ? { ...item, review: { rating: draft.rating, note: draft.note } } : item,
            ),
          }
        })
        void loadPage(0, 'replace')
        setStatus({ kind: 'success', text: '复盘已保存。' })
      } catch (error) {
        setStatus({ kind: 'error', text: `复盘保存失败：${errorText(error)}。修改已保留。` })
      } finally {
        setSavingRounds((previous) => {
          const next = { ...previous }
          delete next[key]
          return next
        })
      }
    },
    [draftKey, drafts, loadPage],
  )

  const handleExport = useCallback(
    async (format: 'json' | 'markdown') => {
      const id = selectedIdRef.current
      if (!id) return
      const api = getRecordsBridge()
      if (!api || typeof api.exportInterviewRecord !== 'function') {
        setStatus({ kind: 'error', text: '导出功能尚未接入：exportInterviewRecord 不可用。' })
        return
      }
      setExporting(format)
      setStatus(null)
      try {
        const result = await api.exportInterviewRecord(id, format)
        if (result?.canceled) {
          setStatus({ kind: 'info', text: '已取消导出（未写入文件）。' })
        } else if (!result || result.success !== true) {
          setStatus({
            kind: 'error',
            text: `导出失败：${result?.error || (result?.disabled ? '该功能当前不可用' : '未知错误')}。`,
          })
        } else {
          setStatus({
            kind: 'success',
            text: result.path ? `已导出到：${result.path}` : '已导出。',
          })
        }
      } catch (error) {
        setStatus({ kind: 'error', text: `导出失败：${errorText(error)}` })
      } finally {
        setExporting(null)
      }
    },
    [],
  )

  // ── Render helpers ───────────────────────────────────────────────────────

  const renderCandidateTurns = (record: InterviewRecord) => {
    const turns: RecordCandidateTurn[] = Array.isArray(record.candidateTurns) ? record.candidateTurns : []
    return (
      <section className="irp-candidate-section" aria-label="实际本人回答">
        <h3 className="irp-section-title">实际本人回答</h3>
        <p className="irp-hint">
          仅展示本次会话采集到的候选人本人转写。AI 建议回答不算作本人实际回答；此处也不保证与分段问题一一对应。
        </p>
        {turns.length === 0 ? (
          <p className="irp-empty-inline">
            {record.captureCandidate
              ? '本次会话开启了本人语音采集，但没有保存到可用的本人回答转写。'
              : '本次会话未采集本人回答（未开启候选人语音采集）。'}
          </p>
        ) : (
          <ol className="irp-turn-list">
            {turns.map((turn) => (
              <li key={turn.id} className="irp-turn">
                <span className="irp-turn-time">{formatClock(turn.at)}</span>
                <span className="irp-turn-text">{turn.text}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    )
  }

  const renderRound = (record: InterviewRecord, round: SavedRecordRound, index: number) => {
    const key = draftKey(record.id, round.id)
    const draft = drafts[key]
    const effective: ReviewDraft =
      draft ?? { rating: round.review?.rating ?? 'unreviewed', note: round.review?.note ?? '' }
    const saving = Boolean(savingRounds[key])
    const dirty = Boolean(draft)
    const projectIds = round.scope?.projectIds ?? []

    return (
      <article key={round.id} className="irp-round">
        <header className="irp-round-head">
          <span className="irp-round-index">第 {index + 1} 题</span>
          <span className={`irp-pill ${roundStatusClass(round.status)}`}>
            {roundStatusLabel(round.status)}
          </span>
          <span className="irp-round-time">{formatClock(round.askedAt)}</span>
        </header>

        <div className="irp-block">
          <span className="irp-block-label">问题</span>
          <p className="irp-question">{round.question || '（未记录到问题文本）'}</p>
          {round.originalQuestion !== round.question && <details className="irp-hint"><summary>查看最初确认的问题</summary><p>{round.originalQuestion}</p></details>}
        </div>

        <div className="irp-block irp-answer-block">
          <span className="irp-block-label">AI 建议回答（非本人实际发言）</span>
          {round.answer ? (
            <p className="irp-answer">{round.answer}</p>
          ) : (
            <p className="irp-empty-inline">
              {round.status === 'error'
                ? '该段回答生成失败，无内容。'
                : round.status === 'interrupted'
                  ? '会话中断，该段未生成回答。'
                  : '该段暂无回答内容。'}
            </p>
          )}
        </div>

        {round.error ? (
          <p className="irp-round-error-text">错误：{round.error}</p>
        ) : null}

        <dl className="irp-meta-grid">
          <div>
            <dt>配置模型</dt>
            <dd>{round.model || '未记录'}</dd>
          </div>
          <div>
            <dt>答案档位</dt>
            <dd>{round.answerLevel || '未记录'}</dd>
          </div>
          <div>
            <dt>回答来源</dt>
            <dd>{answerSourceLabel(round.answerSource)}</dd>
          </div>
          <div>
            <dt>英文模式</dt>
            <dd>{round.englishMode ? '是' : '否'}</dd>
          </div>
          <div>
            <dt>确认问题至首段回答</dt>
            <dd>{formatFirstAnswerGap(round)}</dd>
          </div>
          <div>
            <dt>最后更新</dt>
            <dd>{formatDateTime(round.updatedAt)}</dd>
          </div>
          <div>
            <dt>公司 / 职位</dt>
            <dd>
              {[round.profile?.company, round.profile?.position].filter(Boolean).join(' · ') || '未记录'}
            </dd>
          </div>
          <div>
            <dt>角色</dt>
            <dd>{round.profile?.role || round.scope?.role || '未记录'}</dd>
          </div>
          <div>
            <dt>默认项目</dt>
            <dd>{round.profile?.defaultProjectId || '未记录'}</dd>
          </div>
          <div>
            <dt>范围项目</dt>
            <dd>{projectIds.length > 0 ? projectIds.join('、') : '未记录'}</dd>
          </div>
        </dl>

        {round.hits && round.hits.length > 0 ? (
          <div className="irp-block">
            <span className="irp-block-label">命中的参考资料（{round.hits.length}）</span>
            <ul className="irp-hit-list">
              {round.hits.map((hit, hitIndex) => (
                <li key={`${hit.id}-${hitIndex}`}>
                  {hit.title || hit.id}
                  {hit.source ? <span className="irp-hit-source">{hit.source}</span> : null}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="irp-hint">该段未记录命中的参考资料。</p>
        )}

        <div className="irp-review">
          <div className="irp-review-row">
            <label className="irp-review-label" htmlFor={`irp-rating-${record.id}-${round.id}`}>
              复盘结论
            </label>
            <select
              id={`irp-rating-${record.id}-${round.id}`}
              className="irp-select"
              disabled={saving}
              value={effective.rating}
              onChange={(event) =>
                updateDraft(record.id, round, { rating: event.target.value as ReviewRating })
              }
            >
              {RATING_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <span className="irp-review-current">当前：{ratingLabel(round.review?.rating ?? 'unreviewed')}</span>
          </div>
          <label className="irp-review-label" htmlFor={`irp-note-${record.id}-${round.id}`}>
            复盘备注
          </label>
          <textarea
            id={`irp-note-${record.id}-${round.id}`}
            className="irp-textarea"
            disabled={saving}
            maxLength={8000}
            rows={3}
            value={effective.note}
            placeholder="记录这段回答为什么可用或需要改进（仅本地保存）"
            onChange={(event) => updateDraft(record.id, round, { note: event.target.value })}
          />
          <div className="irp-review-actions">
            <button
              type="button"
              className="irp-button irp-button-primary"
              disabled={!dirty || saving}
              onClick={() => void handleSaveReview(record.id, round)}
            >
              {saving ? '保存中…' : '保存复盘'}
            </button>
            {dirty ? <span className="irp-dirty-hint">有未保存的修改</span> : null}
          </div>
        </div>
      </article>
    )
  }

  const renderDetail = () => {
    if (detailLoading && !detail) {
      return <p className="irp-empty">正在加载记录详情…</p>
    }
    if (!detail) {
      return (
        <p className="irp-empty">
          {selectedId ? '未能加载该记录的详情。' : '从左侧选择一条面试记录以查看详情。'}
        </p>
      )
    }

    const failed = Array.isArray(detail.rounds)
      ? detail.rounds.filter((round) => ['error', 'interrupted'].includes(round.status)).length
      : 0
    const partial = detail.status === 'interrupted' || failed > 0

    return (
      <div className="irp-detail">
        <header className="irp-detail-head">
          <h2 className="irp-detail-title">{detail.title || '未命名面试记录'}</h2>
          <div className="irp-detail-badges">
            <span className={`irp-pill ${sessionStatusClass(detail.status)}`}>
              {sessionStatusLabel(detail.status)}
            </span>
            {failed > 0 ? <span className="irp-pill irp-round-error">{failed} 题未完成</span> : null}
            {detail.needsWorkCount > 0 ? (
              <span className="irp-pill irp-round-needs-work">{detail.needsWorkCount} 题待改进</span>
            ) : null}
            {partial ? <span className="irp-pill irp-pill-partial">内容可能不完整</span> : null}
          </div>
          <p className="irp-detail-meta">
            {formatDateTime(detail.startedAt)}
            {detail.endedAt ? ` – ${formatDateTime(detail.endedAt)}` : ' – 进行中'}
            {` · ${detail.questionCount} 道问题`}
            {` · ${detail.source === 'manual' ? '手动测试' : detail.source === 'microphone' ? '麦克风' : '系统声音'}`}
          </p>
          <p className="irp-detail-meta">
            {[detail.profile?.company, detail.profile?.position, detail.profile?.role]
              .filter(Boolean)
              .join(' · ') || '未记录公司与职位'}
            {` · 默认项目：${detail.profile?.defaultProjectId || '未记录'}`}
          </p>
          <div className="irp-export-row">
            <button
              type="button"
              className="irp-button"
              disabled={exporting !== null || hasDraftsFor(detail.id)}
              onClick={() => void handleExport('json')}
            >
              {exporting === 'json' ? '导出中…' : '导出 JSON'}
            </button>
            <button
              type="button"
              className="irp-button"
              disabled={exporting !== null || hasDraftsFor(detail.id)}
              onClick={() => void handleExport('markdown')}
            >
              {exporting === 'markdown' ? '导出中…' : '导出 Markdown'}
            </button>
            <span className="irp-hint">请先保存复盘备注，再导出整场记录。</span>
          </div>
        </header>

        {Array.isArray(detail.rounds) && detail.rounds.length > 0 ? (
          detail.rounds.map((round, index) => renderRound(detail, round, index))
        ) : (
          <p className="irp-empty">该会话没有保存到任何问题分段。</p>
        )}

        {renderCandidateTurns(detail)}
      </div>
    )
  }

  return (
    <div className="irp-overlay">
      <div
        className="irp-panel"
        role="dialog"
        aria-modal="true"
        aria-label="面试记录"
        ref={panelRef}
      >
        <header className="irp-header">
          <div>
            <p className="irp-kicker">Interview Records</p>
            <h1 className="irp-title">面试记录</h1>
          </div>
          <div className="irp-header-actions">
            <button
              type="button"
              className="irp-button"
              onClick={() => void handleRefresh()}
              disabled={listLoading}
            >
              {listLoading ? '刷新中…' : '刷新列表'}
            </button>
            <button
              type="button"
              className="irp-button irp-button-close"
              onClick={onClose}
              ref={closeButtonRef}
              aria-label="关闭面试记录"
            >
              关闭
            </button>
          </div>
        </header>

        <div className="irp-body">
          <aside className="irp-list" aria-label="面试会话列表">
            {!listLoadedOnce && listLoading ? (
              <p className="irp-empty">正在加载…</p>
            ) : records.length === 0 ? (
              <div className="irp-empty">
                <p>暂无面试记录。</p>
                <p className="irp-hint">
                  只记录从现在开始的新面试会话；此前的普通会议不会被转换或补录。
                </p>
              </div>
            ) : (
              <ul className="irp-list-items">
                {records.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      className={`irp-list-item${item.id === selectedId ? ' is-selected' : ''}`}
                      onClick={() => selectRecord(item.id)}
                      aria-current={item.id === selectedId}
                    >
                      <span className="irp-list-date">{formatDateTime(item.startedAt)}</span>
                      <span className="irp-list-title">{item.title || '未命名面试记录'}</span>
                      <span className="irp-list-sub">
                        <span className={`irp-pill ${sessionStatusClass(item.status)}`}>
                          {sessionStatusLabel(item.status)}
                        </span>
                        <span className="irp-list-count">{item.questionCount} 题</span>
                        {item.failedCount > 0 ? (
                          <span className="irp-list-failed">{item.failedCount} 失败</span>
                        ) : null}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {hasMore ? (
              <div className="irp-load-more">
                <button
                  type="button"
                  className="irp-button"
                  onClick={handleLoadMore}
                  disabled={listLoading}
                >
                  {listLoading ? '加载中…' : '加载更多'}
                </button>
              </div>
            ) : null}
          </aside>

          <section className="irp-detail-scroll" aria-label="记录详情">
            {renderDetail()}
          </section>
        </div>

        <footer className="irp-footer" role="status" aria-live="polite">
          {status ? (
            <span className={`irp-status-text irp-status-${status.kind}`}>{status.text}</span>
          ) : (
            <span className="irp-hint">记录与复盘均保存在本地；本面板不会自动分析、删除或学习任何内容。</span>
          )}
        </footer>
      </div>
    </div>
  )
}

export default InterviewRecordsPanel
