/**
 * Deterministic "current question intent" classification for the interview
 * console. This module is intentionally rule-based (no ML, no external deps)
 * so retrieval routing stays predictable and unit-testable.
 *
 * It answers one question only: what is the interviewer asking *right now*,
 * and which evidence sources may answer it? It never decides what to say.
 */

export type InterviewQuestionIntent =
  | 'technical'
  | 'project'
  | 'behavioral'
  | 'personal'
  | 'mixed'
  | 'follow_up'
  | 'unknown'

export interface InterviewQuestionRoute {
  intent: InterviewQuestionIntent
  /** True when the question depends on the previous topic and has no topic of its own. */
  carryPreviousTopic: boolean
  /** Whether technical retrieval/evidence may be used for this question. */
  allowTechnicalEvidence: boolean
  /** Whether personal/resume/HR evidence may be used for this question. */
  allowPersonalEvidence: boolean
}

export function isSelfIntroductionQuestion(value: string): boolean {
  // References to a previous introduction do not request another introduction.
  return /自我介绍(?!\s*(?:里|中|时|的|提到|提及|提过|说到|说过|讲到|讲过))|介绍(?:一下)?(?:你自己|您自己|自己|你本人|您本人)|introduce yourself|tell me about yourself|self[- ]introduction/i.test(value)
}

// "先不聊技术 / 咱们不谈技术 / 别说技术细节" explicitly revokes technical routing.
const NEGATED_TECHNICAL =
  /(?:先|暂时|咱们|我们)?不(?:聊|谈|说|讲|讨论)(?:技术|代码|算法|这些)|别(?:聊|谈|说|讲)(?:技术|代码|算法)|不提技术|技术先(?:放一放|不谈)/

// Strong technical signals: named terms, algorithms, system design, troubleshooting.
const TECHNICAL_SIGNALS =
  /字节序|帧头|帧尾|CRC(?:16|32)?|半包|粘包|校验|算法|数据结构|复杂度|数据库|索引|事务|死锁|多线程|并发|线程|进程|内存泄漏|内存|缓存|击穿|穿透|雪崩|分布式|一致性|微服务|负载均衡|消息队列|高可用|高并发|秒杀|分库分表|限流|熔断|网关|容器|虚拟机|操作系统|编译|源码|底层|重构|性能优化|优化|排查|定位|调试|日志|监控|压测|线上问题|故障|接口|协议|框架|部署|上线|灰度|QPS|TPS|吞吐|延迟|二分查找|动态规划|哈希|链表|二叉树|红黑树|排序算法|机器学习|深度学习|神经网络|模型训练|特征工程|大模型|幻觉|技术方案|技术选型|技术难点|系统设计|架构设计|设计模式|RAG|HashMap|Redis|MySQL|Kafka|Docker|Kubernetes|K8s|HTTP|HTTPS|TCP|UDP|REST|RPC|Java|Python|React|Vue|Node|Linux|SQL|C\+\+|信噪比|信纳比|噪声|噪音|频谱|傅里叶|滤波器|滤波|带宽|增益|分辨率|采样率|数据链路|垃圾回收|garbage collection|signal[- ]to[- ]noise|SNR/i

// Named hardware and optical simulation topics anchor a new question, even after "那/这个".
// ASCII boundaries allow "ADC采样" without matching SPI inside "inspires".
const EMBEDDED_TECHNICAL_SIGNALS =
  /(?<![a-z0-9])(?:ADC|DAC|UART|USART|SPI|I[2²]C|I2S|GPIO|DMA|PWM|MCU|FPGA|DSP|RTOS|FreeRTOS|STM32[a-z0-9]*|TOF(?:Frame)?|Mie|TCSPC|SPAD|PF32|IRF|DSD|PDE|LWC|MIT[ _-]?2018|EMPEA(?:[ _-]?2025)?|Poisson|Bonferroni|delta[ _-]tracking|3\s*[x×乘]\s*3|fog[ _-]?lidar(?:[ _-]?sim)?)(?![a-z0-9])|嵌入式|单片机|模数转换|数模转换|采样|量化误差|参考电压|阻抗|电路|寄存器|中断|轮询|串口|定时器|看门狗|上拉电阻|下拉电阻|CAN总线|单光子|透雾|水雾|煤烟|粒径谱|粒径分布|消光系数|相函数|首光子|多次散射|单次散射|蒙特卡罗|独立帧确证|有限参考确证|光子|测距|点云|有限孔径|共孔径|泛光|直方图|邻域拟合|超几何|背景失配|收敛标准|仿真|损失函数|首事件似然|泊松|深度网络|训练(?:和|与)?验证|训练集|验证集|数据泄漏|真值泄漏/i

// Behavioral / past-experience signals (conflict, failure, collaboration, pressure).
const BEHAVIORAL_SIGNALS =
  /分歧|冲突|矛盾|争执|意见不一致|失败|挫折|犯错|失误|被拒绝|压力|最难|挑战|委屈|协作|合作|沟通|配合|带领|领导|说服|协调|推动|跨部门|人际|同事关系|stress|pressure|conflict|disagree|fail(?:ed|ure)?|mistake|reject|teamwork|collaborat|communicat|persuad|challeng|frustrat|criticis|deadline/i

// Team-communication signals used to detect a mixed technical + collaboration ask.
const TEAM_COMMUNICATION =
  /团队|沟通|协作|合作|协调|推动|对接|跨部门|配合|同事|同学|带领|领导/

// Explicit project-experience anchors ("项目" plus ownership phrasing).
const PROJECT_SIGNALS =
  /项目|实习经历|工作经历|负责(?:过|的)?[^。？?]*(?:模块|系统|业务)/

// Explicit personal / HR / reflection signals. Unlike an implicit "personal"
// default, these are strong enough to keep a named device or language from
// promoting a reflection question ("学习Java有什么心得") to technical.
const PERSONAL_SIGNALS =
  /心得|感受|体会|收获|累不累|这么累|很累|难不难|辛不辛苦|压力|兴趣|爱好|喜欢|性格|(?:你|您|自己|个人|我)[^。？?]{0,12}(?:优点|缺点|优势|劣势|特长)|职业规划|职业发展|薪资|待遇|加班|出差|家庭|父母|业余|周末|放松|个人情况|价值观|为什么选择|怎么看待|hobb(?:y|ies)|interests?|career|salary|motivat|strengths?|weakness(?:es)?|advantage|overtime|personality|what did you learn|learn(?:ed|t)? from|how (?:do|did|does) you feel|feel(?:ing|t)? about|takeaway|why (?:do|did) you (?:want|choose)|work[- ]life balance/i

// A genuine mechanism / implementation ask. A device that is merely reflected on
// ("学 STM32 有什么心得") has no such ask, so its name cannot promote the
// question to technical. The English "how do/does ..." form only counts when a
// mechanism verb follows, so "How do you feel about learning Java?" stays
// personal.
const MECHANISM_VERB =
  'work|implement|optimi[sz]|differ|handl|manag|design|debug|troubleshoot|perform|behav|calculat|comput|measur|configur|deploy|scal|allocat|schedul|resolv|function|operat|process|tun(?:e|ing)'
const TECHNICAL_INQUIRY =
  new RegExp(
    '原理|区别|差别|精度|误差|时序|配置|实现|调试|排查|因素|机制|结构|流程|步骤|参数|性能|优化|原因|(?:为什么|为何)[^。？?]{0,12}(?:失败|故障|报错|失效)|底层|如何用|怎么用|怎么算|如何算|如何计算|怎么计算|运行机制|工作流程|怎么保证|如何保证|怎么解决|如何解决|怎么定位|如何定位'
    + `|how (?:does|do|did|would|can|is|are)\\b(?!\\s+(?:you|we|they|i)\\s+feel\\b)[^?？。！!]{0,60}?\\b(?:${MECHANISM_VERB})`
    + '|difference|implement|algorithm|optimi[sz]e|debug|troubleshoot',
    'i',
  )

// Filler-only / punctuation-only input carries no intent at all.
const INCOHERENT = /^[嗯啊哦呃额唔诶哎唉哈嘿呦呀吧呢了嘛么、，。,.!?！？~～…·\s]*$/

// Clause boundaries that can separate two independent asks in one question.
const ASK_BOUNDARY = /[？?。；;，,]+|另外|还有一个问题|第二个问题|再者/
// Interrogative markers that make a clause an actual ask rather than a topic.
// English question words are included so multi-ask English questions split into
// clauses correctly ("How does ...? How do you ...?").
const INTERROGATIVE =
  /[?？]|怎么|如何|怎样|为什么|什么|哪些|哪种|多少|是否|吗|呢|谁|哪|how|what|why|when|which|where|who|whose/i

// Bare continuation / pronoun anchors that only make sense against the previous topic.
const FOLLOW_UP_LEAD =
  /^(?:那|那么|后来|之后|然后|接着|继续|还有|它|他|她|这个|那个|此|该|其|所以)/
const FOLLOW_UP_PHRASE =
  /继续(?:说|讲|聊|谈|展开)?|接着(?:说|讲|聊)|再(?:说|讲讲|说说|聊聊|展开)|展开(?:说说|讲讲|说)|详细(?:说说|讲讲)|多说(?:点|说)|往下说|还有呢|然后呢|具体呢/

// Context-dependent technical references point back at something already on the
// table ("两台机器", "一帧数据", "半帧", "重同步") instead of naming their own
// subject. They inherit the previous project even though they also carry
// technical wording, so they must not open a standalone technical question.
const CONTEXTUAL_TECHNICAL_REFERENCE =
  /(?:为什么|为何)[^。？?]{0,8}(?:拆成|分成)两台(?:机器|设备|板子|主机)|(?:那|那么|刚才|前面|你们|咱们|这个方案|这套方案)[^。？?]*(?:一帧|整帧|半帧|丢帧|重同步|半包|粘包|交换[^。？?]*数据)/

// An explicit reference to a prior statement can mention the same named device.
// The reference establishes continuity; hardware names alone never select a project.
const PREVIOUS_STATEMENT_REFERENCE =
  /(?:你|您)(?:刚才|之前|前面|一开始)?(?:说(?!明|说|一下|一说)|提到|提及|讲到)|(?:刚才|前面|之前)(?:的(?:表述|说法|方案|实现)|提到|说到)|这套(?:双平台|双机)?(?:设计|方案|架构)(?:如何|怎么|为什么|解决|增加|带来|有(?:什么|哪些)|的(?:限制|代价|优势|不足))/

// An independent topic anchor means the question stands on its own, so a leading
// pronoun/discourse marker must NOT be treated as a bare follow-up.
const EXPLICIT_TOPIC =
  /项目|实习|工作|公司|团队|学校|专业|岗位|业务|服务|系统|架构|算法|代码|数据库|网络|性能|并发|缓存|索引|分布式|微服务|接口|协议|框架|模型|数据|压力|兴趣|爱好|学业|学习|课程|论文|社团|家庭|朋友|同学|同事|经历/

const ROUTES: Record<InterviewQuestionIntent, InterviewQuestionRoute> = {
  technical: {
    intent: 'technical',
    carryPreviousTopic: false,
    allowTechnicalEvidence: true,
    allowPersonalEvidence: false,
  },
  project: {
    intent: 'project',
    carryPreviousTopic: false,
    allowTechnicalEvidence: true,
    allowPersonalEvidence: true,
  },
  behavioral: {
    intent: 'behavioral',
    carryPreviousTopic: false,
    allowTechnicalEvidence: false,
    allowPersonalEvidence: true,
  },
  personal: {
    intent: 'personal',
    carryPreviousTopic: false,
    allowTechnicalEvidence: false,
    allowPersonalEvidence: true,
  },
  mixed: {
    intent: 'mixed',
    carryPreviousTopic: false,
    allowTechnicalEvidence: true,
    allowPersonalEvidence: true,
  },
  follow_up: {
    intent: 'follow_up',
    carryPreviousTopic: true,
    allowTechnicalEvidence: true,
    allowPersonalEvidence: true,
  },
  unknown: {
    intent: 'unknown',
    carryPreviousTopic: false,
    allowTechnicalEvidence: false,
    allowPersonalEvidence: false,
  },
}

function route(intent: InterviewQuestionIntent): InterviewQuestionRoute {
  // Fresh object per call: callers can never mutate shared classifier state.
  return { ...ROUTES[intent] }
}

function normalize(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value.replace(/\s+/g, ' ').trim()
}

function isFollowUp(text: string, allowContextualReference = true): boolean {
  if (allowContextualReference && !PROJECT_SIGNALS.test(text) && PREVIOUS_STATEMENT_REFERENCE.test(text)) return true
  // A named device opens its own technical topic, never a bare follow-up.
  if (EMBEDDED_TECHNICAL_SIGNALS.test(text)) return false
  // A context-dependent reference inherits the previous project even when it also
  // mentions generic words ("数据") that would otherwise look like a topic.
  if (allowContextualReference && CONTEXTUAL_TECHNICAL_REFERENCE.test(text)) return true
  if (EXPLICIT_TOPIC.test(text)) return false
  return FOLLOW_UP_LEAD.test(text) || FOLLOW_UP_PHRASE.test(text)
}

/**
 * True only when the question contains two independent asks. A single ask that
 * merely mentions a device, a classmate or a team is not mixed.
 */
function hasTwoAsks(text: string): boolean {
  if (/另外|还有一个问题|第二个问题|再者/.test(text)) return true
  const clauses = text.split(ASK_BOUNDARY).map((clause) => clause.trim()).filter(Boolean)
  if (clauses.length < 2) return false
  return clauses.filter((clause) => INTERROGATIVE.test(clause)).length >= 2
}

/**
 * Classify the interviewer's current question into a deterministic route.
 * Empty, filler-only, non-string and otherwise unrecognised input routes to
 * `unknown`, which withholds every evidence source and never inherits the
 * previous topic.
 */
export function classifyInterviewQuestion(question: unknown): InterviewQuestionRoute {
  const text = normalize(question)
  if (!text || INCOHERENT.test(text)) return route('unknown')
  if (isSelfIntroductionQuestion(text)) return route('personal')
  if (/^(?:为什么|为何|怎么呢|why|how so)[？?。.!！\s]*$/i.test(text)) return route('follow_up')

  const suppressTechnical = NEGATED_TECHNICAL.test(text)
  const hasPersonal = PERSONAL_SIGNALS.test(text)
  const technicalInquiry = TECHNICAL_INQUIRY.test(text)
  // A reflection / HR ask suppresses a device or language name unless the same
  // question also asks for a concrete mechanism ("学 ADC 压力大吗？另外采样精度…").
  const reflective = hasPersonal && !technicalInquiry
  const hasTechnical = !suppressTechnical && !reflective
    && (TECHNICAL_SIGNALS.test(text) || EMBEDDED_TECHNICAL_SIGNALS.test(text))
  const hasBehavioral = BEHAVIORAL_SIGNALS.test(text)

  // A behavioral / past-experience signal that is not itself a mechanism ask
  // frames the question: a named technology is only its object
  // ("What was challenging about learning Redis?"), so it is behavioral rather
  // than technical.
  const behavioralFramed = hasBehavioral && !technicalInquiry
  const effectiveTechnical = hasTechnical && !behavioralFramed

  // Mixed needs two independent asks (or both a solution ask and a personal /
  // team / collaboration ask). A named team member or a technical topic alone is
  // not enough: "和同学讨论的 Java 垃圾回收原理" stays technical.
  if (
    effectiveTechnical
    && hasTwoAsks(text)
    && (hasBehavioral || hasPersonal || TEAM_COMMUNICATION.test(text))
  ) {
    return route('mixed')
  }

  // Personal/behavioral topics override a continuation lead such as "那你".
  // Choosing "this solution" alone is contextual, not a personal motivation ask.
  const hasPersonalTopic = PERSONAL_SIGNALS.test(text.replace(/为什么选择(?:这个|那个|这套|该)(?:方案|设计|实现)/g, ''))
  if (!hasPersonalTopic && !suppressTechnical && !behavioralFramed && isFollowUp(text)) return route('follow_up')

  if (hasBehavioral && !effectiveTechnical) return route('behavioral')

  if (PROJECT_SIGNALS.test(text)) {
    // "先不聊技术" still suppresses technical evidence on project deep-dives.
    return suppressTechnical ? { ...route('project'), allowTechnicalEvidence: false } : route('project')
  }

  if (effectiveTechnical) return route('technical')

  if (hasPersonal) return route('personal')

  // An explicit "don't talk tech" request frames the question as HR/personal
  // even though it names no other personal signal.
  if (suppressTechnical) return route('personal')

  // Safe default: no recognised intent withholds every evidence source.
  return route('unknown')
}
