import { resolveInterviewScope, type InterviewProfile, type InterviewRetrievalScope } from './interviewScope.ts'
import { normalizeInterviewQuestion } from './questionNormalization.ts'
import { buildInterviewConsolePrompt } from './interviewPrompt.ts'
import { INTERVIEW_ANSWER_LEVEL_DEFAULT, type InterviewAnswerLevel } from './interviewAnswerLevel.ts'
import { classifyInterviewQuestion, isSelfIntroductionQuestion } from './questionIntent.ts'

export type AnswerPrewarmRetrieval = {
  success: boolean
  context?: string
  matches?: Array<{ id: string; title: string; excerpt: string; score: number; source?: string }>
  error?: string
}

export type PrewarmedAnswer = {
  retrieval: AnswerPrewarmRetrieval
  context: string
  prompt?: string
  scope?: InterviewRetrievalScope
}

export function hasIntroductionEvidence(question: string, retrieval?: { success: boolean; matches?: unknown[] }): boolean {
  return isSelfIntroductionQuestion(question) && retrieval?.success === true
    && !!retrieval.matches?.some((match) => !!match && typeof match === 'object' && 'source' in match && match.source === 'resume_fact')
}

type Retrieve = (question: string, scope?: InterviewRetrievalScope) => Promise<AnswerPrewarmRetrieval>

function createKey(question: string, conversationContext: unknown, answerLevel: InterviewAnswerLevel, englishMode: boolean, customInstructions: string, profile?: InterviewProfile, currentProjects: string[] = []): string {
  return `${normalizeInterviewQuestion(question)}\u0000${typeof conversationContext === 'string' ? conversationContext.trim() : ''}\u0000${answerLevel}\u0000${englishMode}\u0000${customInstructions}\u0000${JSON.stringify(profile ?? {})}\u0000${JSON.stringify(currentProjects)}`
}

export function createAnswerPrewarmCache(retrieve: Retrieve) {
  const entries = new Map<string, Promise<PrewarmedAnswer>>()
  let generation = 0

  async function retrieveEvidence(question: string, scope: InterviewRetrievalScope = {}): Promise<AnswerPrewarmRetrieval> {
    const normalized = normalizeInterviewQuestion(question)
    const route = classifyInterviewQuestion(normalized)
    const isIntroduction = isSelfIntroductionQuestion(normalized)
    if (isIntroduction) return retrieve(`自我介绍 个人背景 项目经历 ${normalized}`, scope)
    if ((!route.allowTechnicalEvidence || route.intent === 'follow_up') && !((route.intent === 'follow_up' || route.intent === 'unknown') && scope.projectIds?.length)) {
      const context = route.intent === 'unknown'
        ? '题型尚不确定，不默认视为个人经历题。仅解释能够确认的通用知识；含义不清时请求澄清，不猜测术语或经历。'
        : route.intent === 'follow_up'
        ? '追问仅依据已有对话，不使用缺少明确主题的题库匹配；缺少上文时请先澄清指代。'
        : '当前为 HR、行为或生活类问题；没有经过题型标注的个人事实可用。请直接回答问题，不要引用无关技术题库或推断个人经历。'
      return { success: true, context, matches: [] }
    }
    // The structured scope already restricts projects. A synthetic project label
    // in the lexical query would drown out the actual follow-up subjects.
    return retrieve(normalized, scope)
  }

  function prewarm(
    question: string,
    conversationContext?: unknown,
    answerLevel: InterviewAnswerLevel = INTERVIEW_ANSWER_LEVEL_DEFAULT,
    englishMode = false,
    customInstructions = '',
    profile?: InterviewProfile,
    currentProjects: string[] = [],
  ): Promise<PrewarmedAnswer> {
    const normalizedQuestion = normalizeInterviewQuestion(question)
    const key = createKey(normalizedQuestion, conversationContext, answerLevel, englishMode, customInstructions, profile, currentProjects)
    const existing = entries.get(key)
    if (existing) return existing

    // A newer revision supersedes in-flight work for older question text.
    entries.clear()
    const requestGeneration = ++generation
    const scope = profile ? resolveInterviewScope(normalizedQuestion, profile, currentProjects) : {}
    const promise = retrieveEvidence(normalizedQuestion, scope).then((retrieval) => {
      if (requestGeneration !== generation) throw new Error('prewarm superseded')
      const context = retrieval.context || ''
      return {
        retrieval,
        scope,
        context,
        prompt: retrieval.success ? buildInterviewConsolePrompt(normalizedQuestion, context, conversationContext, answerLevel, englishMode, customInstructions, profile, scope) : undefined,
      }
    })
    entries.set(key, promise)
    return promise
  }

  async function consume(
    question: string,
    conversationContext?: unknown,
    answerLevel: InterviewAnswerLevel = INTERVIEW_ANSWER_LEVEL_DEFAULT,
    englishMode = false,
    customInstructions = '',
    profile?: InterviewProfile,
    currentProjects: string[] = [],
  ): Promise<PrewarmedAnswer> {
    const key = createKey(question, conversationContext, answerLevel, englishMode, customInstructions, profile, currentProjects)
    const promise = entries.get(key)
    if (!promise) throw new Error('no prewarm available')
    entries.delete(key)
    return promise
  }

  function clear(): void {
    entries.clear()
    generation += 1
  }

  return { prewarm, consume, clear, retrieve: retrieveEvidence }
}
