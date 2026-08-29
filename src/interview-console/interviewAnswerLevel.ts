export type InterviewAnswerLevel = 'student' | 'mid' | 'senior'

export const INTERVIEW_ANSWER_LEVEL_DEFAULT: InterviewAnswerLevel = 'student'
export const INTERVIEW_ANSWER_LEVEL_STORAGE_KEY = 'natively.interviewConsole.answerLevel.v1'

export const INTERVIEW_ANSWER_LEVEL_OPTIONS: ReadonlyArray<{
  value: InterviewAnswerLevel
  label: string
  description: string
}> = [
  { value: 'student', label: '学生/应届', description: '核心原理 + 学习或个人项目视角' },
  { value: 'mid', label: '中级工程师', description: '实现步骤 + 常见故障与主要取舍' },
  { value: 'senior', label: '高级工程师', description: '架构边界 + 可靠性、容量与复杂权衡' },
]

function isInterviewAnswerLevel(value: unknown): value is InterviewAnswerLevel {
  return value === 'student' || value === 'mid' || value === 'senior'
}

export function loadInterviewAnswerLevel(
  storage?: Pick<Storage, 'getItem'>,
): InterviewAnswerLevel {
  try {
    const target = storage ?? (typeof window === 'undefined' ? undefined : window.localStorage)
    const value = target?.getItem(INTERVIEW_ANSWER_LEVEL_STORAGE_KEY)
    return isInterviewAnswerLevel(value) ? value : INTERVIEW_ANSWER_LEVEL_DEFAULT
  } catch {
    return INTERVIEW_ANSWER_LEVEL_DEFAULT
  }
}

export function saveInterviewAnswerLevel(
  level: InterviewAnswerLevel,
  storage?: Pick<Storage, 'setItem'>,
): void {
  try {
    const target = storage ?? (typeof window === 'undefined' ? undefined : window.localStorage)
    target?.setItem(INTERVIEW_ANSWER_LEVEL_STORAGE_KEY, level)
  } catch {
    // Storage failure must not interrupt the live interview session.
  }
}

const DIRECTIVES: Record<InterviewAnswerLevel, string> = {
  student: '回答定位：学生/应届。先讲清核心理解，再结合课程、练习或资料明确支持的个人项目；对尚未亲自做过的生产实践，用“我的理解是”或“如果落地我会”表达。不得虚构经历、职责或指标，不要声称“我主导生产架构”或“我是生产负责人”。',
  mid: '回答定位：中级工程师。在核心原理后补充关键实现步骤、一个常见故障及主要取舍；只有资料明确支持时才说“我负责”或“我落地”。不得虚构经历、职责或指标。',
  senior: '回答定位：高级工程师。可进一步说明架构边界、容量、SLO、可靠性、降级、成本和协作权衡；通用方案必须表述为设计判断，个人经历仍以资料为准。不得虚构经历、职责或指标。',
}

export function getInterviewAnswerDirective(level: InterviewAnswerLevel): string {
  return DIRECTIVES[level]
}
