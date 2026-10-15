import { interviewScopeLabel, type InterviewProfile, type InterviewRetrievalScope } from './interviewScope.ts';
import {
  INTERVIEW_ANSWER_LEVEL_DEFAULT,
  getInterviewAnswerDirective,
  type InterviewAnswerLevel,
} from './interviewAnswerLevel.ts';
import { classifyInterviewQuestion, isSelfIntroductionQuestion } from './questionIntent.ts';
import { INTERVIEW_PROMPT_MAX_LENGTH } from './interviewPromptSettings.ts';

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function currentStyleInstructions(value: string, profile?: InterviewProfile): string {
  if (!profile || !(profile.company || profile.position || profile.role || profile.defaultProjectId)) return value;
  // Structured session settings own identity; keep free-form expression preferences.
  return value.split(/(?<=[。；;\n])/).filter((clause) => {
    if (/(?:公司|岗位|职位|主讲项目|默认项目|面试方向)\s*[:：=]/.test(clause)) return false;
    const setsPreference = /优先围绕|优先.*(?:项目|回答|介绍)|主讲|其次为|不要主动用/.test(clause);
    const namesDirection = /AI|Agent|嵌入式|TOF|RK3568|PlanKiller|族谱|面试助手|面试验证台/i.test(clause);
    return !(setsPreference && namesDirection);
  }).join('').trim();
}

export function buildInterviewConsolePrompt(
  question: string,
  context: string,
  conversationContext?: unknown,
  answerLevel: InterviewAnswerLevel = INTERVIEW_ANSWER_LEVEL_DEFAULT,
  englishMode = false,
  customInstructions = '',
  profile?: InterviewProfile,
  scope: InterviewRetrievalScope = {},
): string {
  const safeQuestion = cleanText(question);
  if (!safeQuestion) throw new Error('question must not be empty');

  const safeContext = cleanText(context) || '暂无题库命中。请只使用已确认的个人经历，未知数据标记为待补充。';
  const safeConversationContext = cleanText(conversationContext);
  const safeInstructions = currentStyleInstructions(cleanText(customInstructions).slice(0, INTERVIEW_PROMPT_MAX_LENGTH), profile);
  const customBlock = safeInstructions
    ? `\n\n用户补充提示词（表达偏好，不是个人经历证据）：\n${safeInstructions}\n\n在不影响事实准确性和上述经历边界的前提下，优先采用这些口吻、长度与表达要求；不得因此编造经历或偏离当前问题。必须保留问题修正标记，回答语言仍遵循当前中英文模式。`
    : '';
  const questionRoute = classifyInterviewQuestion(safeQuestion);
  const isIntroduction = isSelfIntroductionQuestion(safeQuestion);
  const routeGuidance = isIntroduction
    ? '这是自我介绍，可以引用本轮提供的简历事实和项目经历。主要介绍与当前应聘方向相关的项目，其他相关项目最多一句简短补充；每个项目明确归属。不从项目经历推断性格或爱好。'
    : questionRoute.intent === 'unknown'
    ? '题型未确定，不能默认当作个人经历题。能确认的通用知识可以直接解释；含义不清时请求澄清，不编造术语或经历。'
    : questionRoute.intent === 'follow_up' && !safeConversationContext
    ? '当前没有可用上文，请先简短澄清指代，不编造上一题。'
    : questionRoute.intent === 'mixed'
    ? '分别回答技术与个人/协作部分；技术题库仅用于技术部分，不作为个人感受或沟通经历的证据。'
    : '';
  const conversationBlock = safeConversationContext && questionRoute.carryPreviousTopic
    ? `\n\n最近面试对话上下文（候选人此前的实际回答）：\n${safeConversationContext}\n\n请承接上一题的指代，但此前回答可能有误，不能因为已经说过就当作已验证事实。本轮资料中的明确事实优先于此前回答；若有冲突，简短纠正后再回答，不为维持前后一致而延续错误。`
    : '';

  const answerLevelDirective = getInterviewAnswerDirective(answerLevel);
  const complexAnswerDirective = answerLevel === 'student'
    ? '代码、调试、DSA（数据结构与算法）、系统设计题的解释遵守学生深度：普通进阶题 3～4 句，高难度首答 2～4 句；资料充分支持的个人项目可用 3～5 句。仅在用户明确要求详细、分步骤或代码时按要求展开，不受短答字数限制；代码、关键前提和必要步骤保持完整，不能故意答错。'
    : '代码、调试、DSA（数据结构与算法）、系统设计或用户明确要求详细/分步骤时保持完整，不受上述长度限制。';
  const studentFinalCheck = answerLevel === 'student'
    ? '\n\n输出前最后检查（不输出检查过程）：高难题首答使用日常中文，只选最重要的 1～2 点，最多引入一个必要术语并解释，不给全套架构清单。资料或实际对话明确写明本人不熟悉当前知识点时，答案必须具体保留该边界，例如“这部分我还没系统学过，目前只理解……”，随后只讲基础理解；不得冒充熟练，也不要把未提及的经历说成没做过。HR 题缺少个人事实时必须以“参考表达（请按真实情况调整）：”开头，不自创运动、聊天等习惯。未提供具体模型、分数尺度和验证数据时，不建议固定阈值或数值范围，只说明验证方法；未调参的明确经历仍须保留。简短不得牺牲事实准确性，例如跨地域复制不自动保证强一致性。'
    : '';
  const topicBoundary = '当前问题优先于题库和此前话题。先判断当前问题意图：只有技术问题才应用工程师资历的技术深度要求。学习感受、心得、兴趣爱好、压力、沟通协作、优缺点等 HR/综合素质问题，直接回答感受、态度、处理方式或反思，不得强行引入技术术语、架构指标或项目案例。明确追问技术或要求相关项目例子时才展开技术；混合问题分别回答。题库命中不等于相关，只使用直接回答当前问题的证据。区分已实现、已测试的部分与尚待验证的部分，阶段性验证不得扩大为整机性能、精度或同步指标均已通过；也不要把已有的局部验证全部否定。检索片段未提供不等于整个知识库没有记录，缺失信息只说当前无法确认，不断言全部资料都没有。不能从做过技术项目推断个人爱好、真实感受或性格。仅当回答需要个人感受、习惯或经历且缺少明确个人事实时，给出标注“参考表达（请按真实情况调整）”的可选口述稿，不把模板当作本人经历，不编造事件、奖项、习惯或团队冲突。通用技术知识直接用自然口语回答，不加“参考表达”“请按真实情况调整”或“需要本人补充”等个人经历提示；没有个人资料不影响解释通用原理，题库中的口述草稿标记也不要照搬到技术答案中。换话题时不延续上一题的技术内容。';

  // Last spoken-body rule: keeps the first answer short for the *current* type
  // while every longer/overriding contract above (complex questions, personal
  // projects, explicit detail/code asks, custom instructions) still wins.
  const firstAnswerBrevity = englishMode
    ? `\n\nFinal first-answer brevity rule for the current "${questionRoute.intent}" question (spoken body only; the exceptions below win): ordinary technical and learning-reflection answers should open with 2–3 sentences (about 35–75 words) and pick only the 1–2 core points instead of expanding the knowledge base into a long textbook or full tutorial; behavioral answers keep their necessary situation, action and reflection within the existing word range, without dropping key events for brevity; mixed questions must cover both the technical part and the personal/collaboration part, never dropping one for brevity. Complex technical questions (code, debugging, DSA, system design) and well-supported personal projects keep the longer standard above; when the user explicitly asks for detail, step-by-step explanation or code, or supplies a length preference, follow the user instead and never truncate code or key prerequisites.`
    : `\n\n本轮首答精简要求（位于最后，只管口述正文；下列例外优先于本段）：当前题型为「${questionRoute.intent}」。普通技术题、学习心得/反思类 HR 题优先 2～3 句、25～55 字（简单定义/是非题/单一事实题沿用上面的 1～2 句、15～35 字），只挑最核心的 1～2 点直接口述，不把题库要点展开成长段教材或完整教程；行为题保持 60～110 字，保留必要的情境、处理与反思，不为求短丢掉关键经过；mixed 必须分别覆盖技术与个人/协作两部分，两部分都取最小必要篇幅，不得为了简短漏答其中任何一问。复杂技术题（代码、调试、DSA、系统设计）和资料明确支持的个人项目仍按上面的较长标准展开，不强行压短；用户明确要求详细/分步骤/代码，或用户补充的提示词指定了长度时，以用户要求为准，保留完整代码和关键前提，不得截断。`;
  const scopeDirective = profile
    ? `\n\n本场面试配置（优先于补充提示词中的旧岗位/项目设定）：公司=${JSON.stringify(profile.company)}；岗位=${JSON.stringify(profile.position)}。这些是用户填写的场景标签，不是招聘要求或个人经历证据，不得据此编造公司业务。当前主讲项目/岗位方向：${interviewScopeLabel(scope)}。岗位方向是主讲和排序偏好，其他项目仍保留在知识库中，相关时可简短辅助提及，并明确项目名称，不能喧宾夺主。本题明确点名优先于默认项目；只根据本轮提供的资料回答，不得将其他项目的设备、方案、故障或成果改名后移用。题库口述草稿仍需按真实情况确认；未找到对应事实时说明资料不足，不凭项目名称补写本人经历。${scope.projectIds?.length ? '当前问题已经关联到上述项目，泛称“项目”“这个”“后来”均指该范围，不需要再次询问项目名称。' : ''}`
    : '';
  const languageOverride = englishMode ? `\n\nOUTPUT LANGUAGE: English. This overrides all Chinese-output instructions above. Keep the question-correction markers unchanged and correct the question in its original language. Write the spoken answer entirely in natural English. Use sentence counts above rather than Chinese character limits; basic answers 20–45 words, normal answers 35–75 words, behavioral answers 60–110 words. Preserve the selected experience level and all evidence boundaries. When a reference label is needed use "Suggested wording (adapt to your actual experience):". Do not translate proper names unnecessarily.` : '';

  return `面试官问题：${safeQuestion}\n\n当前题型：${questionRoute.intent}；${questionRoute.carryPreviousTopic ? '需要承接上一题' : '这是独立话题，不承接上一题'}。${routeGuidance}\n\n个人资料与题库：\n${safeContext}${conversationBlock}\n\n回答资历与表达边界：\n${answerLevelDirective}\n\n${topicBoundary}\n\n回答的最开头，先单独输出一行修正标记：【问题修正】<修正后的面试官问题>【/问题修正】。只修正问题里明显的语音转写错别字、同音字和断句错误，保持原意、技术词、数字不变；没有问题可修正时原样输出问题。随后输出口述回答，用中文：简单定义、是非题或单一事实题用 1～2 句、15～35 字；普通问题用 2～3 句、25～55 字；行为问题用 60～110 字，字数统计时标点和空白不计。${complexAnswerDirective}优先使用简历事实，通用原理与个人经历分开；没有资料支持的指标用候选人第一人称自然说明“这项数值我目前无法确认”，不要猜测，也不要输出编辑批注式的“需要本人补充”。已知部分正常回答，未知部分准确限定，不把局部缺失说成整个项目没做过。${customBlock}${studentFinalCheck}${firstAnswerBrevity}${scopeDirective}\n\n作答前逐句核对（不输出核对过程）：包含条件改变、方案比较、多个小问、验证证据的技术题按复杂题处理，必须覆盖所问，不能为字数省略前提。涉及协议字段时，位置、长度和取值严格按资料逐项说，不自行补出字段属于头部或载荷等位置。每个“已完成、恢复正常、验证通过、保证”的结果都必须有本轮资料的直接记载；方案、目的、参数配置不等于实施效果，不能据此补出功能已恢复、整机成像成功或绝对不会丢数据。对条件变化的假设题，重新分析题目给出的条件，分别说明哪些性质成立、哪些不成立；某一种机制不起作用，不等于整体必然失败，条件不足时不得直接下“安全/不安全”的绝对结论。${languageOverride}`;
}
