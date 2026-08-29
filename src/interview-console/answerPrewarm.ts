import { normalizeInterviewQuestion } from './questionNormalization.ts'
import { buildInterviewConsolePrompt } from './interviewPrompt.ts'
import { INTERVIEW_ANSWER_LEVEL_DEFAULT, type InterviewAnswerLevel } from './interviewAnswerLevel.ts'

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
}

type Retrieve = (question: string) => Promise<AnswerPrewarmRetrieval>

function createKey(question: string, conversationContext: unknown, answerLevel: InterviewAnswerLevel): string {
  return `${normalizeInterviewQuestion(question)}\u0000${typeof conversationContext === 'string' ? conversationContext.trim() : ''}\u0000${answerLevel}`
}

export function createAnswerPrewarmCache(retrieve: Retrieve) {
  const entries = new Map<string, Promise<PrewarmedAnswer>>()
  let generation = 0

  function prewarm(
    question: string,
    conversationContext?: unknown,
    answerLevel: InterviewAnswerLevel = INTERVIEW_ANSWER_LEVEL_DEFAULT,
  ): Promise<PrewarmedAnswer> {
    const normalizedQuestion = normalizeInterviewQuestion(question)
    const key = createKey(normalizedQuestion, conversationContext, answerLevel)
    const existing = entries.get(key)
    if (existing) return existing

    // A newer revision supersedes in-flight work for older question text.
    entries.clear()
    const requestGeneration = ++generation
    const promise = retrieve(normalizedQuestion).then((retrieval) => {
      if (requestGeneration !== generation) throw new Error('prewarm superseded')
      const context = retrieval.context || ''
      return {
        retrieval,
        context,
        prompt: retrieval.success ? buildInterviewConsolePrompt(normalizedQuestion, context, conversationContext, answerLevel) : undefined,
      }
    })
    entries.set(key, promise)
    return promise
  }

  async function consume(
    question: string,
    conversationContext?: unknown,
    answerLevel: InterviewAnswerLevel = INTERVIEW_ANSWER_LEVEL_DEFAULT,
  ): Promise<PrewarmedAnswer> {
    const key = createKey(question, conversationContext, answerLevel)
    const promise = entries.get(key)
    if (!promise) throw new Error('no prewarm available')
    entries.delete(key)
    return promise
  }

  function clear(): void {
    entries.clear()
    generation += 1
  }

  return { prewarm, consume, clear }
}
