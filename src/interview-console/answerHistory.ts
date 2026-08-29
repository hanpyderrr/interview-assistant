import { INTERVIEW_ANSWER_LEVEL_DEFAULT, type InterviewAnswerLevel } from './interviewAnswerLevel.ts';

export type InterviewAnswerStatus = 'queued' | 'generating' | 'answered' | 'error' | 'interrupted';

export interface InterviewAnswerHit {
  id: string;
  title: string;
  excerpt: string;
  score: number;
  source?: string;
}

export interface InterviewAnswerItem {
  id: number;
  question: string;
  answer: string;
  hits: InterviewAnswerHit[];
  status: InterviewAnswerStatus;
  error?: string;
  replacePending?: boolean;
  answerLevel: InterviewAnswerLevel;
}

export interface AnswerHistoryState {
  items: InterviewAnswerItem[];
  selectedId: number | null;
  maxItems: number;
}

export type AnswerHistoryAction =
  | { type: 'enqueue'; id: number; question: string; select?: boolean; answerLevel?: InterviewAnswerLevel }
  | { type: 'start'; id: number }
  | { type: 'revise'; id: number; question: string }
  | { type: 'token'; id: number; token: string }
  | { type: 'hits'; id: number; hits: InterviewAnswerHit[] }
  | { type: 'done'; id: number; finalText?: string }
  | { type: 'error'; id: number; error: string }
  | { type: 'interrupted'; id: number }
  | { type: 'select'; id: number }
  | { type: 'reset' };

const DEFAULT_MAX_ITEMS = 10;
const MAX_FALLBACK_HITS = 3;

function normalizeMaxItems(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_MAX_ITEMS;
  return Math.max(1, Math.min(50, Math.floor(value)));
}

function updateItem(
  state: AnswerHistoryState,
  id: number,
  update: (item: InterviewAnswerItem) => InterviewAnswerItem,
): AnswerHistoryState {
  let changed = false;
  const items = state.items.map((item) => {
    if (item.id !== id) return item;
    const next = update(item);
    changed ||= next !== item;
    return next;
  });
  return changed ? { ...state, items } : state;
}

function compactWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function isProviderNoAnswerPlaceholder(value: string | undefined): boolean {
  const text = compactWhitespace(value || '');
  return /model did not produce an answer in time/i.test(text)
    || /model failed before generating an answer/i.test(text)
    || /timed?\s*out|timeout/i.test(text)
    || /service temporarily unavailable/i.test(text)
    || /won't guess from your profile/i.test(text)
    || /provider_error_no_answer/i.test(text);
}

function hasUsefulProviderAnswer(value: string | undefined): boolean {
  const text = compactWhitespace(value || '');
  return text.length > 0 && !isProviderNoAnswerPlaceholder(text);
}

export function buildLocalFallbackAnswer(
  question: string,
  hits: InterviewAnswerHit[],
  error?: string,
  answerLevel: InterviewAnswerLevel = INTERVIEW_ANSWER_LEVEL_DEFAULT,
): string {
  const safeQuestion = compactWhitespace(question);
  const safeError = compactWhitespace(error || '');
  const usefulHits = hits
    .filter((hit) => compactWhitespace(hit.title) || compactWhitespace(hit.excerpt))
    .slice(0, MAX_FALLBACK_HITS);

  const intro = safeError
    ? `模型服务暂时不可用（${safeError}），先用题库命中给一个本地兜底口述稿：`
    : '模型服务暂时不可用，先用题库命中给一个本地兜底口述稿：';

  const levelLead: Record<InterviewAnswerLevel, string> = {
    student: '按学生/应届口吻，我会先说“我的理解是”，再结合学习或个人项目范围回答，不把通用方案说成生产经历。',
    mid: '按中级工程师口吻，我会先说明实现路径，再补充常见排查顺序和主要取舍。',
    senior: '按高级工程师口吻，我会先界定架构约束，再说明可靠性、容量和关键取舍，但不虚构个人经历。',
  };

  if (usefulHits.length === 0) {
    return `${intro}${levelLead[answerLevel]}这个问题是“${safeQuestion || '当前问题'}”。没有记录的数据我不会编造，会标记为待补充。`;
  }

  const evidence = usefulHits
    .map((hit, index) => {
      const title = compactWhitespace(hit.title);
      const excerpt = compactWhitespace(hit.excerpt);
      return `${index + 1}. ${title ? `${title}：` : ''}${excerpt}`;
    })
    .join(' ');

  return `${intro}${levelLead[answerLevel]}可以这样答：${evidence} 所以我的回答重点是：先说明为什么这样拆分或设计，再补充它带来的稳定性、解耦或性能收益；如果面试官继续追问具体参数，我会明确哪些是项目中记录过的，哪些需要现场确认。`;
}

export function createAnswerHistoryState(maxItems = DEFAULT_MAX_ITEMS): AnswerHistoryState {
  return { items: [], selectedId: null, maxItems: normalizeMaxItems(maxItems) };
}

export function answerHistoryReducer(
  state: AnswerHistoryState,
  action: AnswerHistoryAction,
): AnswerHistoryState {
  switch (action.type) {
    case 'enqueue': {
      const item: InterviewAnswerItem = {
        id: action.id,
        question: action.question.trim(),
        answer: '',
        hits: [],
        status: 'queued',
        replacePending: false,
        answerLevel: action.answerLevel ?? INTERVIEW_ANSWER_LEVEL_DEFAULT,
      };
      const items = [...state.items.filter((entry) => entry.id !== action.id), item]
        .slice(-state.maxItems);
      const selectedId = action.select === false
        ? (items.some((entry) => entry.id === state.selectedId) ? state.selectedId : (items[items.length - 1]?.id ?? action.id))
        : action.id;
      return {
        ...state,
        items,
        selectedId,
      };
    }
    case 'start':
      return updateItem(state, action.id, (item) => ({ ...item, status: 'generating', error: undefined }));
    case 'revise':
      // Same round, new combined question: keep the visible draft and hits on
      // screen until the fresh attempt streams or finishes.
      return updateItem(state, action.id, (item) => ({
        ...item,
        question: action.question.trim(),
        status: 'generating',
        error: undefined,
        replacePending: true,
      }));
    case 'token':
      if (!action.token) return state;
      return updateItem(state, action.id, (item) => ({
        ...item,
        answer: item.replacePending && action.token.trim()
          ? action.token
          : `${item.answer}${item.replacePending ? '' : action.token}`,
        replacePending: item.replacePending && !action.token.trim(),
        status: item.status === 'queued' ? 'generating' : item.status,
      }));
    case 'hits':
      return updateItem(state, action.id, (item) => ({ ...item, hits: action.hits.slice() }));
    case 'done':
      return updateItem(state, action.id, (item) => {
        const explicitFinalText = action.finalText;
        const finalText = hasUsefulProviderAnswer(explicitFinalText) ? explicitFinalText! : item.answer;
        if (isProviderNoAnswerPlaceholder(explicitFinalText)) {
          if (hasUsefulProviderAnswer(item.answer)) {
            return {
              ...item,
              answer: item.answer,
              status: 'answered' as const,
              error: undefined,
              replacePending: false,
            };
          }
          return {
            ...item,
            answer: buildLocalFallbackAnswer(item.question, item.hits, '模型超时未返回有效答案', item.answerLevel),
            status: 'error' as const,
            error: explicitFinalText ? `模型超时未返回有效答案：${explicitFinalText}` : '模型超时未返回有效答案',
            replacePending: false,
          };
        }
        return {
          ...item,
          answer: finalText,
          status: 'answered' as const,
          error: undefined,
          replacePending: false,
        };
      });
    case 'error':
      return updateItem(state, action.id, (item) => ({
        ...item,
        answer: item.answer || buildLocalFallbackAnswer(item.question, item.hits, action.error, item.answerLevel),
        status: 'error',
        error: action.error,
        replacePending: false,
      }));
    case 'interrupted':
      return updateItem(state, action.id, (item) => ({ ...item, status: 'interrupted', replacePending: false }));
    case 'select':
      return state.items.some((item) => item.id === action.id) ? { ...state, selectedId: action.id } : state;
    case 'reset':
      return createAnswerHistoryState(state.maxItems);
    default:
      return state;
  }
}

export function getSelectedAnswer(state: AnswerHistoryState): InterviewAnswerItem | null {
  return state.items.find((item) => item.id === state.selectedId) || null;
}
