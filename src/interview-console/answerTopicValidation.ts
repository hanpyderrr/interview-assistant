/**
 * Deterministic topic-boundary validation for a generated interview answer.
 *
 * It answers one question only: does this draft answer stay inside the current
 * question's topic boundary, or does it need a single rewrite? It never rewrites
 * anything itself.
 *
 * Design constraints:
 * - Pure and rule-based: no model calls, no external dependencies, no mutation.
 * - Conservative: prefer missing a weak violation over flagging a legitimate
 *   answer (e.g. "你为什么选择技术这一行" may naturally contain technical words).
 */

import { classifyInterviewQuestion, isSelfIntroductionQuestion } from './questionIntent.ts'
import type { InterviewQuestionRoute } from './questionIntent.ts'

export type AnswerTopicViolationCode =
  | 'technical_topic_leak'
  | 'unsupported_personal_claim'
  | 'missing_draft_label'
  | 'incomplete_answer'
  | 'project_scope_leak'

export interface AnswerTopicViolation {
  /** Stable machine-readable reason. */
  code: AnswerTopicViolationCode
  /** Human-readable Chinese explanation for logs and the rewrite prompt. */
  message: string
}

export interface ValidateInterviewAnswerTopicInput {
  question: unknown
  answer: unknown
  route?: InterviewQuestionRoute
  /** True only when the current question is backed by labeled personal evidence. */
  hasRelevantPersonalEvidence?: boolean
  allowedProjectIds?: string[]
}

export interface AnswerTopicValidationResult {
  ok: boolean
  violations: AnswerTopicViolation[]
}

// "先不聊技术 / 咱们不谈技术 / 别说技术细节" explicitly revokes technical content.
// Kept in sync with questionIntent.ts (which is intentionally not re-exported).
const NEGATED_TECHNICAL =
  /(?:先|暂时|咱们|我们)?不(?:聊|谈|说|讲|讨论)(?:技术|代码|算法|这些)|别(?:聊|谈|说|讲)(?:技术|代码|算法)|不提技术|技术先(?:放一放|不谈)/

// Questions that are *about* technology as a life/career topic. They may
// naturally contain technical words and must never be reported as leaks.
const TECH_MOTIVATION_QUESTION =
  /为什么[^。？！]{0,8}(?:选择|选|做|从事|进入)[^。？！]{0,8}技术|技术[^。？！]{0,4}(?:这一行|这行|行业|方向|岗位)|最大的技术优势|技术(?:上|方面)的?优势|对技术的(?:看法|理解)|怎么(?:看|理解)技术/

// Interest/hobby questions must not turn resume technical work into a hobby.
const HOBBY_QUESTION =
  /兴趣|爱好|业余|闲暇|空闲|平时[^。？！]{0,6}(?:喜欢|爱)(?:做|玩)?什么/

// Technical/project vocabulary the topic boundary forbids outside technical routes.
// "先不聊技术" answers must avoid all of these.
const TECHNICAL_TERMS: ReadonlyArray<{ label: string; pattern: RegExp }> = [
  { label: 'RAG', pattern: /\bRAG\b/i },
  { label: 'TOF', pattern: /\bTOF\b/i },
  { label: '单光子', pattern: /单光子/ },
  { label: '嵌入式', pattern: /嵌入式/ },
  { label: '数据库', pattern: /数据库/ },
  { label: '数据结构', pattern: /数据结构/ },
  { label: '算法', pattern: /算法/ },
  { label: '代码', pattern: /代码/ },
  { label: '设备/协议', pattern: /\b(?:SPI|PF32|FPGA|DMA|Si5351A|AD5940|STM32|MQTT)\b/i },
  { label: '接口', pattern: /接口/ },
  { label: '架构', pattern: /架构/ },
  { label: '索引', pattern: /索引/ },
  { label: '缓存', pattern: /缓存/ },
  { label: '并发', pattern: /并发/ },
  { label: '多线程', pattern: /多线程/ },
  { label: '分布式', pattern: /分布式/ },
  { label: '微服务', pattern: /微服务/ },
  { label: '后端', pattern: /后端/ },
  { label: '前端', pattern: /前端/ },
  { label: '服务器', pattern: /服务器/ },
  { label: '系统设计', pattern: /系统设计/ },
  { label: '部署', pattern: /部署/ },
  { label: '上线', pattern: /上线/ },
  { label: 'API', pattern: /\bAPI\b/i },
  { label: '框架', pattern: /框架/ },
  { label: '编译', pattern: /编译/ },
  { label: '源码', pattern: /源码/ },
  { label: '操作系统', pattern: /操作系统/ },
  { label: '机器学习', pattern: /机器学习/ },
  { label: '深度学习', pattern: /深度学习/ },
  { label: '神经网络', pattern: /神经网络/ },
]

// Job titles are not topic leaks ("想成为后端架构师" is a career statement).
const TECHNICAL_TITLE_EXEMPTION = /[\u4e00-\u9fa5]{0,4}(?:工程师|架构师)/g

// Concrete personal-life facts that must not be invented. Kept narrow on
// purpose: abstract self-evaluation ("我觉得沟通很重要") must not match.
const PERSONAL_CLAIM_PATTERNS: readonly RegExp[] = [
  // Hobby / interest asserted as the candidate's own.
  /(?:我的)?(?:爱好|兴趣)[^。？！]{0,6}(?:跑步|运动|健身|打球|游泳|读书|看书|听音乐|唱歌|旅游|摄影|打游戏|做饭|徒步|爬山|刷剧|游戏)/,
  /我(?:平时|平常|业余|闲暇时|周末|下班后)?(?:喜欢|爱好|爱|热衷于)(?:跑步|运动|健身|打球|游泳|读书|看书|听音乐|唱歌|旅游|摄影|打游戏|做饭|徒步|爬山|刷剧)/,
  // Habit asserted as the candidate's own.
  /我(?:经常|常常|总是|每天都|通常|一般会)(?:熬夜|加班|跑步|健身|打游戏|看书|读书|运动)/,
  // Team conflict asserted as the candidate's own experience.
  /我(?:和|跟|与)(?:队友|同事|同学|朋友|室友|家人|组员)[^。？！]{0,10}(?:发生|有过|产生|起了|吵架|闹过)[^。？！]{0,8}(?:冲突|矛盾|争执|分歧|不愉快)/,
  // Past setback asserted as the candidate's own experience.
  /我(?:曾经|之前|以前|大学时|小时候|高中时|有一次)[^。？！]{0,12}(?:遇到|经历|发生|有过|碰到|碰上)[^。？！]{0,10}(?:冲突|矛盾|挫折|失败|被拒绝|困难|事儿|事情)/,
  // Past role / honor asserted as the candidate's own experience.
  /我(?:曾经|之前|以前|大学时|高中时|小时候)[^。？！]{0,12}(?:是|担任|参加过|组织过|获得过|拿过|做过)/,
]

// Any first-person personal narrative that must be marked as a reference draft.
const PERSONAL_NARRATIVE_PATTERNS: readonly RegExp[] = [
  ...PERSONAL_CLAIM_PATTERNS,
  /我(?:是|属于)(?:一个|一名|一位|个)[^。？！]{0,12}(?:人|性格|类型)/,
  /我(?:的)?(?:性格|家乡|家庭|成长经历|父母|特长)/,
  /我(?:大学|高中|本科|研究生)(?:学的是|读的是|专业是)/,
]

// "参考表达（请按真实情况调整）" and equivalent follow-up hints.
const DRAFT_LABEL =
  /参考表达|参考回答|参考说法|参考示例|示例表达|示例回答|供参考|仅供参考|待调整|待你调整|可调整|请按(?:真实|实际)|按(?:真实|实际)情况调整|请根据(?:你的|自己的)?(?:实际|真实)|结合(?:你的|自己的)?(?:实际|真实)|以(?:你|本人)的(?:真实|实际)[^。？！]{0,8}为准|需要你(?:自己)?(?:替换|补充|确认)/

// Narrow streaming-truncation guard: only flag unmistakably unfinished
// connective/auxiliary endings, not every answer that omits final punctuation.
const DANGLING_ANSWER_END = /(?:，|、|；|\s)(?:又不|并且|而且|所以|因为|从而|但是|但|需要|可以|能够|算(?:是|作)?)$/

function normalize(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value.replace(/\s+/g, ' ').trim()
}

function findTechnicalTerms(text: string): string[] {
  const stripped = text.replace(TECHNICAL_TITLE_EXEMPTION, '')
  const hits: string[] = []
  for (const term of TECHNICAL_TERMS) {
    if (term.pattern.test(stripped)) hits.push(term.label)
  }
  return hits
}

/**
 * Validate a draft answer against the current question's topic boundary.
 *
 * Pure: same input always yields the same result, and the input is never mutated.
 */
export function validateInterviewAnswerTopic(
  input: ValidateInterviewAnswerTopicInput,
): AnswerTopicValidationResult {
  const violations: AnswerTopicViolation[] = []
  const question = normalize(input.question)
  const answer = normalize(input.answer)

  const projectTerms: Record<string, RegExp> = {
    tof: /单光子|\bTOF\b|TofFrame|PF32|Si5351A|TCSPC|RK3568|\bN97\b/i,
    ice_temperature: /冰体|109\s*(?:路|个|点)|STM32F767|OneNET/i,
    wing_icing: /机翼结冰|AD5940|FL-?61|运-?12/i,
    plankiller: /PlanKiller|执行力管理/i,
    career_evidence_lab: /Career\s*Evidence\s*Lab|面试验证台|求证面试/i,
    genealogy_agent: /族谱|世系|PP-OCR|PaddleOCR/i,
    interview_assistant: /interview[ _-]?assistant|面试助手|FunASR|Paraformer/i,
  }
  if (input.allowedProjectIds?.length) {
    const foreign = Object.entries(projectTerms).filter(([id, pattern]) => !input.allowedProjectIds!.includes(id) && pattern.test(answer))
    if (foreign.length) violations.push({ code: 'project_scope_leak', message: `回答混入其他项目的专属事实：${foreign.map(([id]) => id).join('、')}。只使用当前项目证据；缺少证据时说明资料不足，不得移植经历。` })
  }

  // Nothing to validate.
  if (!answer) return { ok: true, violations }

  if (DANGLING_ANSWER_END.test(answer)) {
    violations.push({
      code: 'incomplete_answer',
      message: '回答停在未完成的连接词或助动词上，请补成语义完整的句子。',
    })
  }

  // Fresh copy when supplied so callers cannot observe mutation.
  const route = input.route ? { ...input.route } : classifyInterviewQuestion(question)
  const explicitNegated = NEGATED_TECHNICAL.test(question)
  const hobbyQuestion = HOBBY_QUESTION.test(question)
  // An explicit "先不聊技术" always wins over the motivation exemption.
  const allowsTechnicalWords = (TECH_MOTIVATION_QUESTION.test(question) || isSelfIntroductionQuestion(question)) && !explicitNegated

  // Behavioral questions also forbid technical/project content unless the route
  // explicitly allows technical evidence ("先不聊技术" style personal answers).
  const technicalDisallowed = !allowsTechnicalWords && (
    explicitNegated ||
    hobbyQuestion ||
    (route.intent !== 'unknown' && route.allowTechnicalEvidence === false)
  )

  if (technicalDisallowed) {
    // Naming the subject of a reflection is not an unrelated technical detour.
    // Explicit "no tech" requests remain strict; added implementation terms
    // are still rejected even when the answer also repeats the question topic.
    const questionTerms = explicitNegated ? [] : findTechnicalTerms(question)
    const terms = findTechnicalTerms(answer).filter((term) => !questionTerms.includes(term))
    if (terms.length > 0) {
      violations.push({
        code: 'technical_topic_leak',
        message: `回答超出了当前问题的话题边界，出现了技术/项目表述：${terms.join('、')}。当前问题不要求技术内容，请改写为与问题直接相关的回答。`,
      })
    }
  }

  const personalContext = route.intent === 'personal' || route.intent === 'behavioral'
  const hasPersonalEvidence = input.hasRelevantPersonalEvidence === true

  if (personalContext && !hasPersonalEvidence && !DRAFT_LABEL.test(answer)) {
    const hasClaim = PERSONAL_CLAIM_PATTERNS.some((pattern) => pattern.test(answer))
    const hasNarrative = hasClaim || PERSONAL_NARRATIVE_PATTERNS.some((pattern) => pattern.test(answer))

    if (hasClaim) {
      violations.push({
        code: 'unsupported_personal_claim',
        message: '回答把未经标注的个人事实（爱好、习惯、冲突或经历）写成了本人真实经历，缺少个人证据支持，请改为待确认的表达。',
      })
    }

    if (hasNarrative) {
      violations.push({
        code: 'missing_draft_label',
        message: '回答包含个人叙述，但没有标注“参考表达（请按真实情况调整）”或同义的待调整提示，请补上草稿标记。',
      })
    }
  }

  return { ok: violations.length === 0, violations }
}
