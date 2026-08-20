import test from 'node:test';
import assert from 'node:assert/strict';
import {
  loadKnowledgeBase,
  searchKnowledgeBase,
  buildAnswerContext,
} from '../interview-retriever.mjs';

// Fixture-based contract: the personal knowledge base is user-local and
// gitignored, so tests must not read knowledge_source/*.jsonl. These small
// committed fixtures pin the loader, scoring, and context contracts; the
// 309/66-record acceptance of the real exported KBs belongs to the export
// pipeline (04_documents/企业求职准备/tools/export_kb.py), not to CI.
const AI_KB = new URL('./fixtures/kb-ai.fixture.jsonl', import.meta.url);
const EMBEDDED_KB = new URL('./fixtures/kb-embedded.fixture.jsonl', import.meta.url);

test('loads a fixture knowledge base with unique entries and extension fields', async () => {
  const entries = await loadKnowledgeBase(EMBEDDED_KB);
  assert.equal(entries.length, 6);
  assert.equal(new Set(entries.map((entry) => entry.id)).size, 6);
  assert.ok(entries.every((entry) => entry.source_paths.every((source) => !/^[A-Za-z]:[\\/]/.test(source))));
  assert.ok(entries.every((entry) => typeof entry.review_status === 'string'));
  assert.ok(entries.some((entry) => entry.fact_status === 'resume_fact'));
});

test('loads the ai fixture independently of the embedded one', async () => {
  const entries = await loadKnowledgeBase(AI_KB);
  assert.equal(entries.length, 6);
  assert.ok(entries.every((entry) => entry.id.startsWith('ai.fix.')));
});

test('retrieves SPI and CRC facts for a protocol question', async () => {
  const entries = await loadKnowledgeBase(EMBEDDED_KB);
  const results = searchKnowledgeBase('SPI 字节流如何完成帧同步和 CRC32 错误恢复', entries, 3);
  assert.ok(results.length > 0);
  assert.ok(results[0].entry.keywords.some((keyword) => /SPI|CRC32/i.test(keyword)));
  assert.ok(results[0].score > 0);
});

test('builds bounded answer context with fact boundaries', async () => {
  const entries = await loadKnowledgeBase(EMBEDDED_KB);
  const context = buildAnswerContext('为什么使用多进程', entries, { topK: 3, maxChars: 1800 });
  assert.ok(context.includes('来源等级'));
  assert.ok(context.includes('不能虚构'));
  assert.ok(context.length <= 1800);
});

test('marks prepared answers with personal claims for resume validation', async () => {
  const entries = await loadKnowledgeBase(EMBEDDED_KB);
  const context = buildAnswerContext('SPI 帧同步怎么处理', entries, { topK: 5 });
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

test('prefers a project-specific boundary answer over a cross-project protocol template', () => {
  const entries = [
    {
      id: 'generic.protocol',
      title: '丢字节和 CRC 失败后如何重新同步并判断失联',
      content: '长度字段损坏、丢字节、CRC 失败后继续搜索帧头，并按超时判断失联。',
      keywords: ['丢字节', 'CRC失败', '重新同步', '失联', '长度字段'],
      fact_status: 'prepared_answer',
    },
    {
      id: 'wing.boundary',
      title: '机翼结冰单向 RS485 的真实边界',
      content: '机翼结冰项目只确认 A 端发送、B 端只接收；协议参数需本人补充。',
      keywords: ['机翼结冰', 'AD5940', '单向RS485'],
      fact_status: 'prepared_answer',
    },
  ];
  const results = searchKnowledgeBase(
    '机翼结冰的单向 RS485 在丢字节、CRC 失败后如何重新同步并判断失联？',
    entries,
    2,
  );
  assert.equal(results[0].entry.id, 'wing.boundary');
});
