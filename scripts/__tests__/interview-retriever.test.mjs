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

test('keeps spidev and SPI_IOC_MESSAGE as separate searchable Latin terms', () => {
  const entries = [
    { id: 'spi', title: 'Linux SPI', content: '用户态接口', keywords: ['spidev', 'SPI_IOC_MESSAGE'], fact_status: 'reference' },
    { id: 'other', title: '其他接口', content: '普通内容', keywords: ['ioctl'], fact_status: 'reference' },
  ];
  assert.equal(searchKnowledgeBase('spidev 和 SPI_IOC_MESSAGE 有什么区别', entries, 2)[0].entry.id, 'spi');
});

test('recognizes TofFrame as a TOF project query', () => {
  const entries = [
    { id: 'generic', title: 'CRC 错误', content: '通用 CRC 说明', keywords: ['CRC'], fact_status: 'prepared_answer' },
    { id: 'tof', title: 'TofFrame 边界', content: 'CRC 不能恢复已丢失数据', keywords: ['TofFrame', 'CRC'], project_ids: ['tof'], fact_status: 'prepared_answer' },
  ];
  assert.equal(searchKnowledgeBase('TofFrame CRC 能恢复丢失数据吗', entries, 2)[0].entry.id, 'tof');
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

test('returns no matches for an unrelated personal question against a resume fact', () => {
  // A fact_status bonus must never manufacture a match: "你上学累不累" shares no
  // keyword/title/content term with this SPI entry, so the result must be empty
  // even though the entry is a resume_fact with a 0.25 bonus.
  const entries = [
    {
      id: 'embedded.spi',
      title: 'SPI 帧同步',
      content: '状态机与 CRC32 错误恢复',
      keywords: ['SPI', 'CRC32'],
      fact_status: 'resume_fact',
    },
  ];
  assert.deepEqual(searchKnowledgeBase('你上学累不累', entries), []);
});

test('generic question wording does not match technical entries through common Chinese phrases', () => {
  // "有什/什么" appear inside technical titles ("有什么区别") and would otherwise
  // make every interests question match unrelated technical entries.
  const entries = [
    { id: 'tech-1', title: 'MCP 和 Skills 有什么区别', content: 'Agent 系统设计', keywords: ['MCP', 'Skills'], fact_status: 'prepared_answer' },
    { id: 'tech-2', title: '线程优先级什么时候有用', content: '实时调度策略', keywords: ['线程', '优先级'], fact_status: 'prepared_answer' },
  ];
  assert.deepEqual(searchKnowledgeBase('你平时有什么兴趣爱好', entries), []);
});

test('still retrieves a normal SPI question after stop-term filtering', () => {
  const entries = [
    { id: 'embedded.spi', title: 'SPI 帧同步', content: '状态机与 CRC32 错误恢复', keywords: ['SPI', 'CRC32'], fact_status: 'resume_fact' },
    { id: 'embedded.qt', title: 'Qt 显示', content: '信号槽与线程', keywords: ['Qt'], fact_status: 'prepared_answer' },
  ];
  const results = searchKnowledgeBase('SPI 字节流如何完成帧同步和 CRC32 错误恢复', entries, 3);
  assert.ok(results.length > 0);
  assert.equal(results[0].entry.id, 'embedded.spi');
  assert.ok(results[0].score > 0);
});

test('maps 面试验证台 to Career Evidence Lab instead of a physical test bench', () => {
  const entries = [
    { id: 'career', title: 'Career Evidence Lab', content: '十题动态面试与证据验证。', keywords: ['动态面试'], project_ids: ['career_evidence_lab'], fact_status: 'resume_fact' },
    { id: 'wing', title: '机翼结冰试验验证', content: '风洞验证台与采集链路。', keywords: ['验证台'], project_ids: ['wing_icing'], fact_status: 'resume_fact' },
  ];
  const results = searchKnowledgeBase('为什么会想到做面试验证台这个项目？', entries, 2);
  assert.equal(results[0].entry.id, 'career');
});

test('prefers a single-project entry over a broad portfolio entry', () => {
  const entries = [
    { id: 'portfolio', title: '为什么族谱数字化项目要拆分多个 Agent', content: '族谱数字化与其他项目形成证据管理主线。', keywords: ['族谱数字化', '拆分多个 Agent'], project_ids: ['tof', 'career_evidence_lab', 'genealogy_agent'], fact_status: 'prepared_answer' },
    { id: 'genealogy', title: '族谱处理状态', content: 'OCR 候选、关系建议和确认事实分层。', keywords: ['族谱'], project_ids: ['genealogy_agent'], fact_status: 'resume_fact' },
  ];
  const results = searchKnowledgeBase('为什么族谱项目要拆分多个 Agent？', entries, 2);
  assert.equal(results[0].entry.id, 'genealogy');
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

test('uses explicit metadata to separate every resume project', () => {
  const ids = ['tof', 'ice_temperature', 'wing_icing', 'plankiller', 'career_evidence_lab', 'genealogy_agent'];
  for (const id of ids) {
    const entries = ids.map((projectId) => ({
      id: projectId,
      title: '项目边界',
      content: '说明真实完成范围。',
      keywords: ['项目边界'],
      project_ids: [projectId],
      fact_status: 'resume_fact',
    }));
    assert.equal(searchKnowledgeBase(`请说明 ${id} 的项目边界`, entries, 6)[0].entry.id, id);
  }
});

test('marks planned and in-progress capabilities in CLI context', () => {
  const entries = [
    {
      id: 'career.plan',
      title: '十题面试',
      content: '设计十题动态面试。',
      keywords: ['十题面试'],
      fact_status: 'prepared_answer',
      evidence_status: 'planned',
    },
    {
      id: 'career.progress',
      title: '当前进度',
      content: '项目处于开发阶段。',
      keywords: ['当前进度'],
      fact_status: 'resume_fact',
      evidence_status: 'in_progress',
    },
  ];
  assert.match(buildAnswerContext('十题面试', entries), /规划能力，不得表述为已实现/);
  assert.match(buildAnswerContext('当前进度', entries), /开发在研，需说明当前完成阶段/);
});
