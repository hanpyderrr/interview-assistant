import { answerHistoryReducer, type AnswerHistoryAction, type InterviewAnswerItem } from './answerHistory.ts';
import type { InterviewRecordsAPI, RecordCandidateTurn, RecordProfile, RecordRound, RecordSessionInput } from '../../shared/interviewRecords.ts';

export type RecorderStatus = { kind: 'idle' | 'saving' | 'saved' | 'disabled' | 'error'; message?: string };
type RoundContext = { model?: string; profile?: RecordProfile; scope?: RecordRound['scope']; answerLevel?: string; englishMode?: boolean };
type WriteAPI = Pick<InterviewRecordsAPI, 'beginInterviewRecord' | 'saveInterviewRecord' | 'endInterviewRecord' | 'setInterviewRecordCapture'>;

export function createInterviewRecorder(options: { api?: Partial<WriteAPI>; onStatus: (status: RecorderStatus) => void; flushDelayMs?: number }) {
  const api = options.api;
  let id: string | null = null;
  let input: RecordSessionInput;
  let accepting = false;
  let candidateEnabled = false;
  let everEnabled = false;
  let captureDirty = false;
  let endRequested: 'completed' | 'interrupted' | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let inFlight: Promise<boolean> | null = null;
  const items = new Map<number, InterviewAnswerItem>();
  const records = new Map<number, RecordRound>();
  const dirty = new Map<number, RecordRound>();
  const turns = new Map<string, RecordCandidateTurn>();
  const notify = options.onStatus;

  function schedule() {
    if (timer !== undefined || !id) return;
    timer = setTimeout(() => { timer = undefined; void flush(); }, options.flushDelayMs ?? 800);
  }
  function failure(e: unknown) {
    notify({ kind: 'error', message: e instanceof Error ? e.message : String(e) });
  }
  async function flush(): Promise<boolean> {
    if (timer !== undefined) { clearTimeout(timer); timer = undefined; }
    if (inFlight) return inFlight;
    if (!id) return true;
    const sessionId = id;
    inFlight = (async () => {
      try {
        notify({ kind: 'saving' });
        while (dirty.size || turns.size || captureDirty) {
          if (captureDirty) {
            const result = await api!.setInterviewRecordCapture!(sessionId, everEnabled);
            if (!result.success) throw new Error(result.error || '保存采集设置失败');
            captureDirty = false;
          }
          const batch = [...dirty.values()].slice(0, 100);
          const speech = [...turns.values()].slice(0, 200);
          if (!batch.length && !speech.length) continue;
          const result = await api!.saveInterviewRecord!(sessionId, batch, speech);
          if (!result.success) throw new Error(result.error || '保存面试记录失败');
          if (result.disabled) {
            id = null; accepting = false; dirty.clear(); turns.clear();
            notify({ kind: 'disabled', message: '隐私设置为不保留，本场不存档' });
            return true;
          }
          for (const r of batch) if (dirty.get(r.id)?.revision === r.revision) dirty.delete(r.id);
          for (const t of speech) if (turns.get(t.id) === t) turns.delete(t.id);
        }
        notify({ kind: 'saved' });
        return true;
      } catch (e) { failure(e); return false; }
    })();
    try { return await inFlight; } finally { inFlight = null; }
  }

  function action(action: AnswerHistoryAction, context: RoundContext = {}) {
    if (!accepting || !id || action.type === 'select' || action.type === 'reset') return;
    const previousItem = items.get(action.id);
    const state = answerHistoryReducer({ items: previousItem ? [previousItem] : [], selectedId: action.id, maxItems: 1 }, action);
    const item = state.items[0];
    if (!item || item === previousItem) return;
    items.set(item.id, item);
    const previous = records.get(item.id);
    const now = Date.now();
    const record: RecordRound = {
      id: item.id, revision: (previous?.revision ?? 0) + 1, question: item.question,
      originalQuestion: previous?.originalQuestion ?? item.question, answer: item.answer, status: item.status,
      answerSource: item.answerSource, error: item.error, answerLevel: context.answerLevel ?? previous?.answerLevel ?? item.answerLevel, englishMode: context.englishMode ?? previous?.englishMode ?? item.englishMode,
      model: context.model ?? previous?.model ?? '', profile: { ...(context.profile ?? previous?.profile ?? input.profile) },
      scope: structuredClone(context.scope ?? previous?.scope ?? {}), askedAt: previous?.askedAt ?? now, updatedAt: now,
      firstAnswerAt: previous?.firstAnswerAt ?? (item.answerSource === 'model' && item.answer.trim() ? now : undefined),
      finishedAt: ['answered', 'error', 'interrupted'].includes(item.status) ? now : undefined,
      hits: item.hits.map(h => ({ id: h.id, title: h.title, source: h.source })),
    };
    records.set(item.id, record); dirty.set(item.id, record);
    if (['enqueue', 'done', 'error', 'interrupted'].includes(action.type)) void flush();
    else schedule();
  }

  async function end(status: 'completed' | 'interrupted'): Promise<boolean> {
    if (!id) return true;
    endRequested = status;
    for (const item of items.values()) if (['queued', 'generating'].includes(item.status)) action({ type: 'interrupted', id: item.id });
    accepting = false;
    if (!await flush()) return false;
    if (!id) return true;
    try {
      const result = await api!.endInterviewRecord!(id, status);
      if (!result.success) throw new Error(result.error || '结束记录失败');
      id = null; endRequested = null;
      notify(result.disabled ? { kind: 'disabled', message: '隐私设置为不保留，本场不存档' } : { kind: 'saved' });
      return true;
    } catch (e) { failure(e); return false; }
  }

  return {
    async begin(next: RecordSessionInput) {
      if (id && !await end('interrupted')) throw new Error('上一场记录尚未保存，请先重试保存');
      if (!api?.beginInterviewRecord || !api.saveInterviewRecord || !api.endInterviewRecord) {
        notify({ kind: 'disabled', message: '当前运行版本未提供面试存档，请重启新版应用' }); return;
      }
      const result = await api.beginInterviewRecord(next);
      if (!result.success || (!result.disabled && !result.id)) { const e = new Error(result.error || '无法创建面试记录'); failure(e); throw e; }
      items.clear(); records.clear(); dirty.clear(); turns.clear(); endRequested = null; captureDirty = false;
      input = structuredClone(next); candidateEnabled = next.captureCandidate; everEnabled = candidateEnabled;
      id = result.id ?? null; accepting = !!id;
      notify(result.disabled ? { kind: 'disabled', message: '隐私设置为不保留，本场不存档' } : { kind: 'saved' });
    },
    action, flush, end,
    candidate(turn: RecordCandidateTurn) {
      if (!accepting || !id || !candidateEnabled) return;
      turns.set(turn.id, { ...turn }); schedule();
    },
    setCapture(enabled: boolean) {
      candidateEnabled = enabled;
      if (id && enabled && !everEnabled) { everEnabled = true; captureDirty = true; schedule(); }
    },
    retry: () => endRequested ? end(endRequested) : flush(),
    dispose() { if (timer !== undefined) clearTimeout(timer); timer = undefined; },
  };
}
