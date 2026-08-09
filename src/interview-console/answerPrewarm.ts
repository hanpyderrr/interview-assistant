import { normalizeInterviewQuestion } from './questionNormalization.ts'
import { buildInterviewConsolePrompt } from './interviewPrompt.ts'

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

function createKey(question: string, conversationContext: unknown): string {
  return `${normalizeInterviewQuestion(question)}\u0000${typeof conversationContext === 'string' ? conversationContext.trim() : ''}`
}

export function createAnswerPrewarmCache(retrieve: Retrieve) {
  const entries = new Map<string, Promise<PrewarmedAnswer>>()

  function prewarm(question: string, conversationContext?: unknown): Promise<PrewarmedAnswer> {
    const normalizedQuestion = normalizeInterviewQuestion(question)
    const key = createKey(normalizedQuestion, conversationContext)
    const existing = entries.get(key)
    if (existing) return existing

    // A newer revision supersedes in-flight work for older question text.
    entries.clear()
    const promise = retrieve(normalizedQuestion).then((retrieval) => {
      const context = retrieval.context || ''
      return {
        retrieval,
        context,
        prompt: retrieval.success ? buildInterviewConsolePrompt(normalizedQuestion, context, conversationContext) : undefined,
      }
    })
    entries.set(key, promise)
    return promise
  }

  async function consume(question: string, conversationContext?: unknown): Promise<PrewarmedAnswer> {
    const key = createKey(question, conversationContext)
    const promise = entries.get(key)
    if (!promise) throw new Error('no prewarm available')
    entries.delete(key)
    return promise
  }

  function clear(): void {
    entries.clear()
  }

  return { prewarm, consume, clear }
}
