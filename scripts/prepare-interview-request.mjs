#!/usr/bin/env node

import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { loadKnowledgeBase, searchKnowledgeBase, buildAnswerContext } from './interview-retriever.mjs';
import { buildInterviewPrompt } from './build-interview-prompt.mjs';

const DEFAULT_KB = path.resolve('knowledge_source/interview_kb.jsonl');

export async function prepareInterviewRequest(question, { kbPath = DEFAULT_KB, topK = 5, maxChars = 6000 } = {}) {
  const entries = await loadKnowledgeBase(kbPath);
  const matches = searchKnowledgeBase(question, entries, topK);
  const context = buildAnswerContext(question, entries, { topK, maxChars });
  return { ...buildInterviewPrompt({ question, context }), matches };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const question = process.argv.slice(2).join(' ').trim();
  if (!question) {
    console.error('Usage: node scripts/prepare-interview-request.mjs "面试问题"');
    process.exitCode = 1;
  } else {
    console.log(JSON.stringify(await prepareInterviewRequest(question), null, 2));
  }
}
