import { INTERVIEW_ANSWER_LEVEL_DEFAULT, type InterviewAnswerLevel } from './interviewAnswerLevel.ts';
import { classifyInterviewQuestion } from './questionIntent.ts';
import { normalizeInterviewQuestion } from './questionNormalization.ts';

export type InterviewAnswerSource = 'model' | 'reference' | 'guidance' | 'unavailable';

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
  englishMode: boolean;
  answerSource: InterviewAnswerSource;
}

export interface AnswerHistoryState {
  items: InterviewAnswerItem[];
  selectedId: number | null;
  maxItems: number;
}

export type AnswerHistoryAction =
  | { type: 'enqueue'; id: number; question: string; select?: boolean; answerLevel?: InterviewAnswerLevel; englishMode?: boolean }
  | { type: 'start'; id: number }
  | { type: 'revise'; id: number; question: string }
  | { type: 'token'; id: number; token: string }
  | { type: 'hits'; id: number; hits: InterviewAnswerHit[] }
  | { type: 'done'; id: number; finalText?: string; source?: InterviewAnswerSource }
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
  // Match provider failure messages, not technical answers discussing timeouts.
  return /^(?:the )?model did not produce an answer in time\b/i.test(text)
    || /^(?:the )?model failed before generating an answer\b/i.test(text)
    || /^(?:request )?(?:timed?\s*out|timeout)(?: before (?:a useful |an? )?answer was generated)?[.!]?$/i.test(text)
    || /^service temporarily unavailable[.!]?$/i.test(text)
    || /^provider_error_no_answer[.!]?$/i.test(text);
}

function hasUsefulProviderAnswer(value: string | undefined): boolean {
  const text = compactWhitespace(value || '');
  return text.length > 0 && !isProviderNoAnswerPlaceholder(text);
}

// Matching a retrieval score is not enough to publish a prepared answer as fact.
// Until the KB has verified relevance metadata, only exact question/title matches
// can become references. This deliberately prefers omissions over false answers.
function referenceTitle(value: string): string {
  return normalizeInterviewQuestion(value).toLowerCase().replace(/[\s？?。.!！：:，,]/g, '');
}

const REFERENCE_STOPWORDS =
  /^(?:what|which|when|where|why|how|does|did|the|and|are|can|could|would|you|your|explain|describe|about|with|from|for|have|that|this)$/;

// Chinese question framing carries no subject of its own, so removing it leaves
// the noun anchors an excerpt must actually repeat.
const CHINESE_REFERENCE_FRAMING =
  /怎么|如何|为什么|为何|是什么|什么|哪些|哪种|多少|是否|因素|影响|设计|原理|区别|请解释|介绍一下|介绍|讲讲|说说|谈谈|解释|分钟|一下|这个|那个|你们|我们|的|了|吗|呢|请|用/g;

function sharesReferenceSubject(question: string, excerpt: string): boolean {
  const text = normalizeInterviewQuestion(question).toLowerCase();
  const body = normalizeInterviewQuestion(excerpt).toLowerCase();
  const words = (text.match(/[a-z][a-z0-9+]{2,}/g) || [])
    .filter((word) => !REFERENCE_STOPWORDS.test(word));
  if (words.length && words.some((word) => body.includes(word))) return true;
  // The TOF oral draft names its hardware instead of repeating the title.
  // Require both an acquisition-specific anchor and a host, not a generic SPI/Linux mention.
  if (/(?<![a-z0-9])tof(?:frame)?(?![a-z0-9])|单光子/i.test(text)
    && /(?<![a-z0-9])(?:pf32|tcspc)(?![a-z0-9])/i.test(body)
    && /(?<![a-z0-9])(?:n97|rk3568)(?![a-z0-9])/i.test(body)) return true;
  // A Chinese-only excerpt may legitimately repeat the topic without the English
  // abbreviation ("单光子" without "TOF"), so Chinese subject overlap is an
  // alternative to the English check rather than a reason to reject it outright.
  const subject = text.replace(CHINESE_REFERENCE_FRAMING, ' ');
  return (subject.match(/[\u4e00-\u9fff]{3,}/g) || []).some((run) => {
    // Require a shared four-character subject for longer runs, not a retrieval
    // score or a generic question verb. Short three-character subject nouns
    // ("单光子") are matched whole so a valid excerpt is not silently dropped.
    if (run.length < 4) return body.includes(run);
    for (let i = 0; i <= run.length - 4; i++) if (body.includes(run.slice(i, i + 4))) return true;
    return false;
  });
}

function buildLocalFallback(
  question: string,
  hits: InterviewAnswerHit[],
  englishMode = false,
): { answer: string; answerSource: InterviewAnswerSource } {
  const route = classifyInterviewQuestion(normalizeInterviewQuestion(question));
  if (route.intent === 'personal' || route.intent === 'behavioral') {
    return {
      answerSource: 'guidance',
      answer: englishMode
        ? 'Answer guidance: describe your actual feelings or a real experience relevant to this question, how you responded, and what you learned. No personal facts have been verified.'
        : '作答提示：围绕当前问题说清真实感受或经历、自己的应对和收获。缺少已确认的个人事实，请按真实情况组织回答。',
    };
  }
  const unavailable = {
    answerSource: 'unavailable' as const,
    answer: englishMode
      ? 'No reliable reference is available for this question. An answer could not be generated.'
      : '当前问题暂无可靠的题库参考，本次未能生成回答。',
  };
  if (!route.allowTechnicalEvidence || !['technical', 'project'].includes(route.intent)) return unavailable;
  const title = referenceTitle(question);
  const references = hits.filter((hit) => title.length >= 4
    && referenceTitle(hit.title) === title
    && compactWhitespace(hit.excerpt)
    && sharesReferenceSubject(question, hit.excerpt)
    && ['resume_fact', 'prepared_answer'].includes(hit.source || '')).slice(0, MAX_FALLBACK_HITS);
  if (!references.length) return unavailable;
  // The current KB is predominantly Chinese; do not pretend to translate a
  // source during an offline fallback in English mode.
  if (englishMode && references.some((hit) => /[\u4e00-\u9fff]/.test(hit.title + hit.excerpt))) return unavailable;
  const heading = englishMode ? 'Knowledge-base reference (not a generated answer):' : '题库参考（非模型生成答案）：';
  const excerpts = references.map((hit, index) => {
    const source = hit.source === 'prepared_answer'
      ? (englishMode ? 'Draft, not personally confirmed' : '准备稿，未经本人确认')
      : (englishMode ? 'Recorded resume material; confirm its applicability' : '简历记录，请确认适用范围');
    return `${index + 1}. ${hit.title} [${source}]\n${hit.excerpt}`;
  });
  return { answerSource: 'reference', answer: [heading, ...excerpts].join('\n\n') };
}

export function buildLocalFallbackAnswer(
  question: string,
  hits: InterviewAnswerHit[],
  _error?: string,
  _answerLevel: InterviewAnswerLevel = INTERVIEW_ANSWER_LEVEL_DEFAULT,
  englishMode = false,
): string {
  return buildLocalFallback(question, hits, englishMode).answer;
}

function failAnswer(item: InterviewAnswerItem, error: string): InterviewAnswerItem {
  const keepPartial = item.answerSource === 'model' && hasUsefulProviderAnswer(item.answer);
  return {
    ...item,
    ...(keepPartial ? {} : buildLocalFallback(item.question, item.hits, item.englishMode)),
    status: 'error',
    error,
    replacePending: false,
  };
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
        englishMode: action.englishMode ?? false,
        answerSource: 'model',
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
      return updateItem(state, action.id, (item) => ({ ...item, status: 'generating', error: undefined, answerSource: 'model' }));
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
        answerSource: 'model',
      }));
    case 'hits':
      return updateItem(state, action.id, (item) => ({ ...item, hits: action.hits.slice() }));
    case 'done':
      return updateItem(state, action.id, (item) => {
        const explicitFinalText = action.finalText;
        const finalText = hasUsefulProviderAnswer(explicitFinalText) ? explicitFinalText! : item.answer;
        if (isProviderNoAnswerPlaceholder(explicitFinalText)) {
          return failAnswer(item, explicitFinalText ? `模型超时未返回完整答案：${explicitFinalText}` : '模型超时未返回完整答案');
        }
        if (!hasUsefulProviderAnswer(finalText) || (item.replacePending && !hasUsefulProviderAnswer(explicitFinalText))) {
          return failAnswer(item, '模型未返回有效答案');
        }
        return {
          ...item,
          answer: finalText,
          answerSource: action.source ?? 'model',
          status: 'answered' as const,
          error: undefined,
          replacePending: false,
        };
      });
    case 'error':
      return updateItem(state, action.id, (item) => failAnswer(item, action.error));
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
