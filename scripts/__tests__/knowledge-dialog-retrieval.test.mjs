import test from 'node:test';
import assert from 'node:assert/strict';
import { diagnoseRetrieval } from '../knowledge-dialog/retrieval-diagnostics.mjs';

// Fictional entries only — never read knowledge_source/*.jsonl. These entries
// follow the retriever schema (id/title/content/keywords/fact_status) so the
// diagnostics stay compatible with scripts/interview-retriever.mjs output.
const entries = [
  {
    id: 'fact.spi',
    title: 'SPI 帧同步与 CRC32',
    content: '状态机按字节推进，匹配帧头后按长度字段收完整帧并校验 CRC32。',
    keywords: ['SPI', 'CRC32', '帧同步'],
    fact_status: 'resume_fact',
  },
  {
    id: 'fact.uart',
    title: 'UART 波特率自适应',
    content: '实现波特率自适应探测。',
    keywords: ['UART', '波特率'],
    fact_status: 'resume_fact',
  },
];

const question = '请介绍 SPI 帧同步设计。';

test('flags an empty corpus as a knowledge gap', () => {
  assert.deepEqual(
    diagnoseRetrieval({ question, entries: [], matches: [] }).map((issue) => issue.type),
    ['knowledge-gap'],
  );
});

test('flags a missing expected id as a retrieval miss', () => {
  const issues = diagnoseRetrieval({ question, entries, matches: [], expectedEvidenceIds: ['fact.spi'] });
  assert.equal(issues[0].type, 'retrieval-miss');
  assert.deepEqual(issues[0].evidenceIds, ['fact.spi']);
  assert.equal(issues[0].severity, 'high');
  assert.equal(issues[0].question, question);
  assert.ok(issues[0].explanation.length > 0);
  assert.ok(issues[0].suggestedAction.length > 0);
  assert.ok(issues[0].id);
});

test('flags an expected id absent from the corpus as a knowledge gap', () => {
  const issues = diagnoseRetrieval({ question, entries, matches: [], expectedEvidenceIds: ['fact.bluetooth'] });
  assert.equal(issues[0].type, 'knowledge-gap');
  assert.equal(issues[0].severity, 'high');
});

test('flags a weak top match below the minimum score', () => {
  const issues = diagnoseRetrieval({ question, entries, matches: [{ entry: entries[0], score: 0.25 }] });
  assert.equal(issues[0].type, 'weak-retrieval');
  assert.equal(issues[0].severity, 'medium');
  assert.deepEqual(issues[0].evidenceIds, ['fact.spi']);
});

test('flags a no-match non-empty corpus without expectations as a knowledge gap', () => {
  const issues = diagnoseRetrieval({ question, entries, matches: [] });
  assert.equal(issues[0].type, 'knowledge-gap');
});

test('reports multiple expected misses in stable order', () => {
  const issues = diagnoseRetrieval({
    question,
    entries,
    matches: [{ entry: entries[1], score: 3 }],
    expectedEvidenceIds: ['fact.spi', 'fact.uart', 'fact.missing'],
  });
  assert.deepEqual(issues.map((issue) => issue.type), ['retrieval-miss', 'knowledge-gap']);
  assert.deepEqual(issues.map((issue) => issue.evidenceIds), [['fact.spi'], ['fact.missing']]);
});

test('returns no issues when the expected evidence is matched with a strong score', () => {
  const issues = diagnoseRetrieval({
    question,
    entries,
    matches: [{ entry: entries[0], score: 5 }],
    expectedEvidenceIds: ['fact.spi'],
  });
  assert.deepEqual(issues, []);
});

test('assigns deterministic unique issue ids in output order', () => {
  const issues = diagnoseRetrieval({
    question,
    entries,
    matches: [],
    expectedEvidenceIds: ['fact.spi', 'fact.uart', 'fact.x', 'fact.y'],
  });
  assert.deepEqual(
    issues.map((issue) => issue.id),
    ['issue-1', 'issue-2', 'issue-3', 'issue-4'],
  );
});
