#!/usr/bin/env node

import process from 'node:process';

const SYSTEM_PROMPT = `你是面试准备助手，只能基于提供的个人事实和参考资料帮助候选人练习。
回答必须区分“本人做过”“项目采用”和“通用原理”。资料没有记录的指标、参数、团队分工、故障根因和量化收益，必须写“【需本人补充】”，不得猜测。
默认先给 30～60 秒、自然口语化的回答，再给可能追问和回答注意事项。不要输出与问题无关的长篇教程。`;

export function buildInterviewPrompt({ question, context, conversationContext }) {
  if (!question || !String(question).trim()) throw new Error('question must not be empty');
  const safeContext = String(context ?? '').trim() || '没有检索到相关资料，请明确说明资料不足。';
  const safeConversationContext = typeof conversationContext === 'string' ? conversationContext.trim() : '';
  const conversationBlock = safeConversationContext
    ? `\n\n最近面试对话上下文（候选人此前的实际回答）：\n${safeConversationContext}\n\n请承接候选人已经说过的实际经历，再回答当前问题；不要把未说过的内容当作事实。`
    : '';
  return {
    system: SYSTEM_PROMPT,
    user: `面试官问题：\n${String(question).trim()}\n\n检索到的资料：\n${safeContext}${conversationBlock}\n\n请按以下格式回答：\n【口述版回答】\n【结合我的项目】\n【可能追问】\n【不能虚构的内容】`,
  };
}

if (process.argv[1]?.endsWith('build-interview-prompt.mjs')) {
  const question = process.argv.slice(2).join(' ').trim();
  if (!question) {
    console.error('Usage: node scripts/build-interview-prompt.mjs "面试问题"');
    process.exitCode = 1;
  } else {
    console.log(JSON.stringify(buildInterviewPrompt({ question, context: '请通过调用检索器提供资料。' }), null, 2));
  }
}
