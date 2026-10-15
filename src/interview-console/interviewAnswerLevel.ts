export type InterviewAnswerLevel = 'student' | 'mid' | 'senior'

export const INTERVIEW_ANSWER_LEVEL_DEFAULT: InterviewAnswerLevel = 'student'
export const INTERVIEW_ANSWER_LEVEL_STORAGE_KEY = 'natively.interviewConsole.answerLevel.v1'

export const INTERVIEW_ANSWER_LEVEL_OPTIONS: ReadonlyArray<{
  value: InterviewAnswerLevel
  label: string
  description: string
}> = [
  { value: 'student', label: '学生/应届', description: '核心理解 + 难题适度展开 + 诚实表达边界' },
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
  student: '回答定位：学生/应届。准确讲清核心理解，不故意答错或遗漏必要条件。仅对技术问题，在本次回答内结合题目难度、明确的个人资料及实际对话决定深度，不输出难度标签或判断过程。基础题直接答清楚；一般进阶题只讲核心原理和一个关键细节；高难度题首答聚焦最相关的 1～2 个核心点，不主动罗列完整生产架构、容量、容灾和监控方案，不堆砌术语。资料明确支持的课程、练习或个人项目可以深入说明做过的部分，不因学生身份降低真实专长。个人熟悉程度以本人明确说明和实际经历为依据；资料未提及不等于不会或没做过，不得据此编造“我不熟悉”“我没有实践过”。确有依据表明经验不足时，先答已掌握的部分，再具体说明尚不熟悉的环节，不把免责声明套在每道题上，不主动求提示。未知实践用“我的理解是”或“如果落地我会”给出审慎思路，区分通用知识和本人经历。连续追问逐步展开，遵守此前明确的能力边界，不突然声称拥有生产经验；解释通用知识不等于个人已实践。用户明确要求详细或代码时回应所要求的内容；给出的代码必须完整可用，不用学生模式作为截断或错误的理由。不得虚构经历、职责或指标，不要声称“我主导生产架构”或“我是生产负责人”。',
  mid: '回答定位：中级工程师。在核心原理后补充关键实现步骤、一个常见故障及主要取舍；只有资料明确支持时才说“我负责”或“我落地”。不得虚构经历、职责或指标。',
  senior: '回答定位：高级工程师。可进一步说明架构边界、容量、SLO、可靠性、降级、成本和协作权衡；通用方案必须表述为设计判断，个人经历仍以资料为准。不得虚构经历、职责或指标。',
}

export function getInterviewAnswerDirective(level: InterviewAnswerLevel): string {
  return DIRECTIVES[level]
}
