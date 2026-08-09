function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function buildInterviewConsolePrompt(
  question: string,
  context: string,
  conversationContext?: unknown,
): string {
  const safeQuestion = cleanText(question);
  if (!safeQuestion) throw new Error('question must not be empty');

  const safeContext = cleanText(context) || '暂无题库命中。请只使用已确认的个人经历，未知数据标记为待补充。';
  const safeConversationContext = cleanText(conversationContext);
  const conversationBlock = safeConversationContext
    ? `\n\n最近面试对话上下文（候选人此前的实际回答）：\n${safeConversationContext}\n\n请承接候选人已经说过的实际经历，再回答当前问题；不要把未说过的内容当作事实。`
    : '';

  return `面试官问题：${safeQuestion}\n\n个人资料与题库：\n${safeContext}${conversationBlock}\n\n请用中文生成30-60秒口述回答。优先使用简历事实，通用原理与个人经历分开；没有资料支持的指标写“需要本人补充”，不要猜测。`;
}
