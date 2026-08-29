import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  buildKbContext,
  buildKbFileCandidates,
  createKbRetriever,
  NO_MATCH_CONTEXT,
  resolveKbFilePath,
  scoreEntries,
} from '../kbRetriever.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.resolve(__dirname, '../../../scripts/__tests__/fixtures');

// ── pure scoring ────────────────────────────────────────────────────────────

const embeddedFixtures = [
  { id: 'a.001', title: 'SPI 帧同步', content: '状态机与 CRC32', keywords: ['SPI', 'CRC32'], fact_status: 'prepared_answer' },
  { id: 'b.002', title: '个人定位', content: 'RK3568 平台', keywords: ['嵌入式'], fact_status: 'resume_fact' },
  { id: 'c.003', title: 'Qt 显示', content: '信号槽与线程', keywords: ['Qt'], fact_status: 'prepared_answer' },
];

test('scores keywords above title above content with fact_status bonus', () => {
  const results = scoreEntries('SPI CRC32 怎么处理', embeddedFixtures, 3);
  assert.equal(results[0].entry.id, 'a.001');
  assert.ok(results[0].score > 5, `keyword hit should dominate, got ${results[0].score}`);
});

test('keeps separate Latin keywords instead of fusing them during normalization', () => {
  const entries = [
    { id: 'spi', title: 'Linux SPI', content: '用户态接口', keywords: ['spidev', 'SPI_IOC_MESSAGE'], fact_status: 'reference' },
    { id: 'other', title: '其他接口', content: '普通内容', keywords: ['ioctl'], fact_status: 'reference' },
  ];
  assert.equal(scoreEntries('spidev 和 SPI_IOC_MESSAGE 有什么区别', entries, 2)[0].entry.id, 'spi');
});

test('recognizes TofFrame as the TOF project even without a word boundary after TOF', () => {
  const entries = [
    { id: 'generic', title: 'CRC 错误', content: '通用 CRC 说明', keywords: ['CRC'], fact_status: 'prepared_answer' },
    { id: 'tof', title: 'TofFrame 边界', content: 'CRC 不能恢复已丢失数据', keywords: ['TofFrame', 'CRC'], project_ids: ['tof'], fact_status: 'prepared_answer' },
  ];
  assert.equal(scoreEntries('TofFrame CRC 能恢复丢失数据吗', entries, 2)[0].entry.id, 'tof');
});

test('stable tie-break: score desc then id asc', () => {
  const tied = [
    { id: 'z.9', title: 'X', content: 'SPI', keywords: ['X'], fact_status: 'reference' },
    { id: 'a.1', title: 'X', content: 'SPI', keywords: ['X'], fact_status: 'reference' },
  ];
  const results = scoreEntries('SPI', tied, 5);
  assert.deepEqual(results.map((r) => r.entry.id), ['a.1', 'z.9']);
});

test('returns no matches for empty or unrelated questions', () => {
  assert.deepEqual(scoreEntries('   ', embeddedFixtures), []);
  // Entries WITHOUT fact_status get no bonus, so a term-less query scores 0 —
  // same shape as the CLI retriever's own test.
  const plain = [{ id: 'x', title: 'SPI', content: 'CRC32', keywords: ['SPI'] }];
  assert.deepEqual(scoreEntries('量子火箭推进', plain), []);
});

test('bonus-only entries rank below term hits (known reference behavior)', () => {
  // Mirrors scripts/interview-retriever.mjs: the fact_status bonus is applied
  // before the score > 0 filter, so with more topK slots than genuine hits,
  // bonus-only entries can appear — always ranked below real term matches.
  const results = scoreEntries('SPI', embeddedFixtures, 5);
  assert.equal(results[0].entry.id, 'a.001');
  assert.ok(results.slice(1).every((r) => r.score < results[0].score));
  assert.deepEqual(results.map((r) => r.score), [5.15, 0.25, 0.15]);
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
  const results = scoreEntries(
    '机翼结冰的单向 RS485 在丢字节、CRC 失败后如何重新同步并判断失联？',
    entries,
    2,
  );
  assert.equal(results[0].entry.id, 'wing.boundary');
});

// ── context building ────────────────────────────────────────────────────────

test('builds rich context with source_paths and prepared_answer warning', () => {
  const matches = scoreEntries('SPI CRC32', embeddedFixtures, 2);
  const context = buildKbContext(matches);
  assert.ok(context.includes('score='));
  assert.ok(context.includes('source=prepared_answer'));
  assert.ok(context.includes('口述草稿'));
  assert.ok(context.includes('来源：'));
});

test('no-match context is pinned verbatim', () => {
  assert.equal(buildKbContext([]), NO_MATCH_CONTEXT);
  assert.ok(NO_MATCH_CONTEXT.includes('Do not invent personal metrics'));
});

test('caps context at maxChars', () => {
  const long = [{ id: 'x', title: 'X', content: '长'.repeat(5000), keywords: ['X'], fact_status: 'reference' }];
  const context = buildKbContext(scoreEntries('X', long, 1), 200);
  assert.ok(context.length <= 200);
});

test('tolerates missing source_paths', () => {
  const entry = [{ id: 'x', title: 'X', content: 'SPI 内容', keywords: ['SPI'], fact_status: 'prepared_answer' }];
  const context = buildKbContext(scoreEntries('SPI', entry, 1));
  assert.ok(context.includes('未记录来源'));
});

test('warns when a matched project capability is only planned', () => {
  const entry = [{
    id: 'career.plan',
    title: 'Career Evidence Lab 十题面试',
    content: '设计十题动态面试与有界追问。',
    keywords: ['十题面试'],
    fact_status: 'prepared_answer',
    evidence_status: 'planned',
  }];
  const context = buildKbContext(scoreEntries('十题面试', entry, 1));
  assert.ok(context.includes('规划能力'));
  assert.ok(context.includes('不得表述为已实现'));
});

test('uses explicit metadata to keep all six projects separated', () => {
  const projectIds = ['tof', 'ice_temperature', 'wing_icing', 'plankiller', 'career_evidence_lab', 'genealogy_agent'];
  for (const projectId of projectIds) {
    const entries = projectIds.map((id) => ({
      id,
      title: '项目边界',
      content: '说明项目的真实完成范围。',
      keywords: ['项目边界'],
      project_ids: [id],
      fact_status: 'resume_fact',
    }));
    const results = scoreEntries(`请说明 ${projectId} 的项目边界`, entries, 6);
    assert.equal(results[0].entry.id, projectId);
  }
});

// ── pure path resolution ────────────────────────────────────────────────────

test('maps every candidate root to the unified interview_kb.jsonl', () => {
  const candidates = buildKbFileCandidates(['/a', '/b']);
  assert.deepEqual(candidates, { filePaths: ['/a/interview_kb.jsonl', '/b/interview_kb.jsonl'] });
  const normalized = buildKbFileCandidates(['/a/', '/b\\']);
  assert.deepEqual(normalized, { filePaths: ['/a/interview_kb.jsonl', '/b/interview_kb.jsonl'] });
});

test('picks the first existing root, then the next', () => {
  const second = resolveKbFilePath(['/a', '/b'], (p) => p === '/b/interview_kb.jsonl');
  assert.deepEqual(second, { kbPath: '/b/interview_kb.jsonl' });
  const first = resolveKbFilePath(['/a', '/b'], (p) => p === '/a/interview_kb.jsonl');
  assert.deepEqual(first, { kbPath: '/a/interview_kb.jsonl' });
});

test('fail-closed when the unified knowledge base is missing', () => {
  const result = resolveKbFilePath(['/a'], () => false);
  assert.ok('error' in result);
  assert.equal(result.error, 'Unified interview knowledge base is unavailable');
});

// ── stateful service ────────────────────────────────────────────────────────

function memoryDeps(files, { asar = false } = {}) {
  return {
    readFile: (p) => {
      if (!(p in files)) throw new Error(`ENOENT: ${p}`);
      return files[p].content;
    },
    stat: (p) => (p in files ? { mtimeMs: files[p].mtimeMs, size: files[p].content.length } : null),
    isAsarPath: () => asar,
  };
}

test('retrieves from a real fixture file', () => {
  const kbPath = path.join(FIXTURES, 'kb-ai.fixture.jsonl');
  const retriever = createKbRetriever(memoryDeps({
    [kbPath]: { content: readFileSync(kbPath, 'utf8'), mtimeMs: 1 },
  }));
  const { context, matches } = retriever.retrieve('RAG 混合检索', kbPath);
  assert.ok(matches.length > 0);
  assert.ok(matches[0].entry.id.startsWith('ai.fix.'));
  assert.ok(context.includes('RAG'));
});

test('caches external files by mtime+size fingerprint and reloads on change', () => {
  const kbPath = '/kb/interview_kb.jsonl';
  const files = {
    [kbPath]: {
      content: JSON.stringify({ id: 'v1', title: 'V1', content: 'SPI 内容', keywords: ['SPI'] }) + '\n',
      mtimeMs: 1000,
    },
  };
  const retriever = createKbRetriever(memoryDeps(files));
  assert.equal(retriever.retrieve('SPI', kbPath).matches[0].entry.id, 'v1');
  files[kbPath].content = JSON.stringify({ id: 'v2', title: 'V2', content: 'SPI 内容', keywords: ['SPI'] }) + '\n';
  files[kbPath].mtimeMs = 2000;
  assert.equal(retriever.retrieve('SPI', kbPath).matches[0].entry.id, 'v2');
});

test('caches asar files for process lifetime regardless of stat', () => {
  const kbPath = '/pkg/resources/app.asar/knowledge_source/interview_kb.jsonl';
  const files = {
    [kbPath]: {
      content: JSON.stringify({ id: 'v1', title: 'V1', content: 'RAG 内容', keywords: ['RAG'] }) + '\n',
      mtimeMs: 1,
    },
  };
  const deps = memoryDeps(files, { asar: true });
  let reads = 0;
  const readFile = deps.readFile;
  deps.readFile = (p) => { reads += 1; return readFile(p); };
  const retriever = createKbRetriever(deps);
  retriever.retrieve('RAG', kbPath);
  retriever.retrieve('RAG', kbPath);
  files[kbPath].mtimeMs = 999;
  retriever.retrieve('RAG', kbPath);
  assert.equal(reads, 1, 'asar-resolved KB must be read exactly once');
});

test('invalidate drops the cache', () => {
  const kbPath = '/kb/x.jsonl';
  const files = {
    [kbPath]: {
      content: JSON.stringify({ id: 'v1', title: 'V1', content: 'SPI 内容', keywords: ['SPI'] }) + '\n',
      mtimeMs: 1,
    },
  };
  const retriever = createKbRetriever(memoryDeps(files));
  retriever.retrieve('SPI', kbPath);
  retriever.invalidate(kbPath);
  files[kbPath].content = JSON.stringify({ id: 'v3', title: 'V3', content: 'SPI 内容', keywords: ['SPI'] }) + '\n';
  assert.equal(retriever.retrieve('SPI', kbPath).matches[0].entry.id, 'v3');
});

test('reports line numbers for malformed JSON and missing fields, and rejects duplicate ids', () => {
  const broken = path.join(FIXTURES, 'kb-broken-json.fixture.jsonl');
  const missing = path.join(FIXTURES, 'kb-missing-fields.fixture.jsonl');
  const dup = path.join(FIXTURES, 'kb-duplicate-id.fixture.jsonl');
  const deps = {
    readFile: (p) => readFileSync(p, 'utf8'),
    stat: (p) => ({ mtimeMs: 1, size: readFileSync(p, 'utf8').length }),
  };
  const retriever = createKbRetriever(deps);
  assert.throws(() => retriever.retrieve('x', broken), /Invalid knowledge JSON on line 2/);
  assert.throws(() => retriever.retrieve('x', missing), /line 1 is missing id, content, or keywords/);
  assert.throws(() => retriever.retrieve('x', dup), /duplicate IDs/);
});
