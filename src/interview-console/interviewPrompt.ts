import {
  INTERVIEW_ANSWER_LEVEL_DEFAULT,
  getInterviewAnswerDirective,
  type InterviewAnswerLevel,
} from './interviewAnswerLevel.ts';

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function buildInterviewConsolePrompt(
  question: string,
  context: string,
  conversationContext?: unknown,
  answerLevel: InterviewAnswerLevel = INTERVIEW_ANSWER_LEVEL_DEFAULT,
): string {
  const safeQuestion = cleanText(question);
  if (!safeQuestion) throw new Error('question must not be empty');

  const safeContext = cleanText(context) || '暂无题库命中。请只使用已确认的个人经历，未知数据标记为待补充。';
  const safeConversationContext = cleanText(conversationContext);
  const conversationBlock = safeConversationContext
    ? `\n\n最近面试对话上下文（候选人此前的实际回答）：\n${safeConversationContext}\n\n请承接候选人已经说过的实际经历，再回答当前问题；不要把未说过的内容当作事实。`
    : '';

  const answerLevelDirective = getInterviewAnswerDirective(answerLevel);

  return `面试官问题：${safeQuestion}\n\n个人资料与题库：\n${safeContext}${conversationBlock}\n\n回答资历与表达边界：\n${answerLevelDirective}\n\n回答的最开头，先单独输出一行修正标记：【问题修正】<修正后的面试官问题>【/问题修正】。只修正问题里明显的语音转写错别字、同音字和断句错误，保持原意、技术词、数字不变；没有问题可修正时原样输出问题。随后输出口述回答，用中文：简单定义、是非题或单一事实题用 1～2 句、15～35 字；普通问题用 2～3 句、25～55 字；行为问题用 60～110 字，字数统计时标点和空白不计。代码、调试、DSA（数据结构与算法）、系统设计或用户明确要求详细/分步骤时保持完整，不受上述长度限制。优先使用简历事实，通用原理与个人经历分开；没有资料支持的指标写“需要本人补充”，不要猜测。`;
}
