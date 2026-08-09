import test from 'node:test';
import assert from 'node:assert/strict';
import {
  loadKnowledgeBase,
  searchKnowledgeBase,
  buildAnswerContext,
} from '../interview-retriever.mjs';

const KB = new URL('../../knowledge_source/embedded_kb.jsonl', import.meta.url);

test('loads the embedded knowledge base with unique entries', async () => {
  const entries = await loadKnowledgeBase(KB);
  assert.equal(entries.length, 97);
  assert.equal(new Set(entries.map((entry) => entry.id)).size, 97);
  assert.ok(entries.every((entry) => entry.source_paths.every((source) => !/^[A-Za-z]:[\\/]/.test(source))));
  const interviewQa = entries.filter((entry) => entry.id.startsWith('qa.embedded.'));
  assert.equal(interviewQa.length, 67);
  assert.ok(interviewQa.every((entry) => entry.fact_status === 'prepared_answer'));
  assert.ok(interviewQa.every((entry) => Array.isArray(entry.needs_confirmation_phrases)));
  assert.ok(interviewQa.every((entry) => entry.question && entry.title.includes(entry.question)));
});

test('retrieves SPI and CRC facts for a protocol question', async () => {
  const entries = await loadKnowledgeBase(KB);
  const results = searchKnowledgeBase('SPI 字节流如何完成帧同步和 CRC32 错误恢复', entries, 3);
  assert.ok(results.length > 0);
  assert.ok(results[0].entry.keywords.some((keyword) => /SPI|CRC32/i.test(keyword)));
  assert.ok(results[0].score > 0);
});

test('builds bounded answer context with fact boundaries', async () => {
  const entries = await loadKnowledgeBase(KB);
  const context = buildAnswerContext('为什么使用多进程', entries, { topK: 3, maxChars: 1800 });
  assert.ok(context.includes('来源等级'));
  assert.ok(context.includes('不能虚构'));
  assert.ok(context.length <= 1800);
});

test('marks prepared answers with personal claims for resume validation', async () => {
  const entries = await loadKnowledgeBase(KB);
  const context = buildAnswerContext('为什么把接收处理显示和通信拆成独立进程', entries, { topK: 5 });
  assert.match(context, /个人主张，必须与简历事实核验/);
});

test('reports the JSONL line number when a knowledge entry is malformed', async () => {
  await assert.rejects(
    () => loadKnowledgeBase(new URL('./malformed-kb.jsonl', import.meta.url)),
    /line 2/i,
  );
});

test('returns no matches for empty or unrelated questions', () => {
  assert.deepEqual(searchKnowledgeBase('   ', [{ id: 'x', title: 'x', content: 'x', keywords: [] }]), []);
  assert.deepEqual(searchKnowledgeBase('量子火箭推进', [{ id: 'x', title: 'SPI', content: 'CRC32', keywords: ['SPI'] }]), []);
});
