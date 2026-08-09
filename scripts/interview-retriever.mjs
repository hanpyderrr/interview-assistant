#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

function normalize(value) {
  return String(value ?? '').toLowerCase().replace(/\s+/g, '');
}

function terms(value) {
  const normalized = normalize(value);
  const latin = normalized.match(/[a-z0-9_+#.-]{2,}/g) ?? [];
  const chinese = [...normalized.matchAll(/[\u4e00-\u9fff]{2,}/g)].flatMap((match) => {
    const text = match[0];
    return Array.from({ length: Math.max(0, text.length - 1) }, (_, index) => text.slice(index, index + 2));
  });
  return new Set([...latin, ...chinese]);
}

export async function loadKnowledgeBase(fileUrlOrPath) {
  const filePath = fileUrlOrPath instanceof URL ? fileUrlOrPath : path.resolve(fileUrlOrPath);
  const content = await fs.readFile(filePath, 'utf8');
  const entries = content.split(/\r?\n/).map((line, index) => ({ line, lineNumber: index + 1 }))
    .filter(({ line }) => line.trim())
    .map(({ line, lineNumber }) => {
    let entry;
    try {
      entry = JSON.parse(line);
    } catch (error) {
      throw new Error(`Invalid knowledge JSON on line ${lineNumber}: ${error.message}`, { cause: error });
    }
    if (!entry.id || !entry.content || !Array.isArray(entry.keywords)) {
      throw new Error(`Knowledge entry on line ${lineNumber} is missing id, content, or keywords`);
    }
    return entry;
  });
  const ids = new Set(entries.map((entry) => entry.id));
  if (ids.size !== entries.length) throw new Error('Knowledge base contains duplicate IDs');
  return entries;
}

export function searchKnowledgeBase(question, entries, topK = 5) {
  const queryTerms = terms(question);
  if (queryTerms.size === 0) return [];
  return entries.map((entry) => {
    const keywordTerms = terms(entry.keywords.join(' '));
    const titleTerms = terms(entry.title);
    const contentTerms = terms(entry.content);
    let score = 0;
    for (const term of queryTerms) {
      if (keywordTerms.has(term)) score += 5;
      else if (titleTerms.has(term)) score += 3;
      else if (contentTerms.has(term)) score += 1;
    }
    if (entry.fact_status === 'resume_fact') score += 0.25;
    else if (entry.fact_status === 'prepared_answer') score += 0.15;
    return { entry, score };
  }).filter((result) => result.score > 0)
    .sort((left, right) => right.score - left.score || left.entry.id.localeCompare(right.entry.id))
    .slice(0, Math.max(1, topK));
}

export function buildAnswerContext(question, entries, { topK = 5, maxChars = 6000 } = {}) {
  const results = searchKnowledgeBase(question, entries, topK);
  const sections = [
    `面试问题：${question}`,
    '回答要求：优先使用简历事实；通用原理不得改写成“本人做过”；没有记录的指标、参数和结果写“【需本人补充】”。',
    '不能虚构：团队人数、代码量、吞吐量、延迟、量化收益、未确认的故障根因。',
    '检索资料：',
    ...results.map(({ entry, score }) => [
      `- [${entry.id}] 来源等级=${entry.fact_status}，相关度=${score.toFixed(2)}，主题=${entry.title}`,
      `  内容：${entry.content}${entry.fact_status === 'prepared_answer' && entry.personal_claim ? '（此内容含个人主张，必须与简历事实核验）' : ''}`,
      `  来源：${entry.source_paths.join('；')}`,
    ].join('\n')),
  ];
  const context = sections.join('\n');
  return context.length <= maxChars ? context : `${context.slice(0, Math.max(0, maxChars - 1))}…`;
}

async function main(argv) {
  const question = argv[0];
  if (!question || question === '--help') {
    console.log('Usage: node scripts/interview-retriever.mjs "面试问题" [knowledge.jsonl]');
    return;
  }
  const kbPath = argv[1] ?? path.resolve('knowledge_source/embedded_kb.jsonl');
  const entries = await loadKnowledgeBase(kbPath);
  console.log(buildAnswerContext(question, entries));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main(process.argv.slice(2));
}
