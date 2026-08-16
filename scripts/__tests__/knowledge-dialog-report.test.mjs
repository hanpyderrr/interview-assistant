import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { writeKnowledgeDialogReport } from '../knowledge-dialog/report.mjs';
import { buildQualityGate, parseCliArgs, runValidation } from '../knowledge-dialog/run.mjs';

test('writes deterministic redacted JSON and Markdown reports', async () => {
  const outputDir = await mkdtemp(path.join(tmpdir(), 'knowledge-dialog-report-'));
  const report = {
    sessionId: 'fixture-session',
    qualityGate: { passed: false, blockingIssueIds: ['issue-high'] },
    provider: { apiKey: 'must-not-leak', nested: { Authorization: 'Bearer must-not-leak' } },
    rounds: [
      { round: 2, questionId: 'q2', question: '第二问', answer: { answer: '答二', evidenceIds: [] }, rawScore: 40, evaluation: { score: 40 } },
      { round: 1, questionId: 'q1', question: '第一问', answer: { answer: '答一', evidenceIds: ['fact.x'] }, rawScore: 80, evaluation: { score: 80 } },
    ],
    issues: [
      { id: 'issue-low', round: 1, type: 'needs-model-review', severity: 'low', explanation: '低' },
      { id: 'issue-high', round: 2, type: 'knowledge-gap', severity: 'high', explanation: '高' },
    ],
    suggestions: [
      { id: 'suggestion-2', action: 'adjust-prompt', status: 'proposed', requiresUserConfirmation: false, sourceIssueIds: ['issue-low'] },
      { id: 'suggestion-1', action: 'add-confirmed-fact', status: 'proposed', requiresUserConfirmation: true, sourceIssueIds: ['issue-high'] },
    ],
  };

  const paths = await writeKnowledgeDialogReport(report, outputDir);
  const jsonText = await readFile(paths.jsonPath, 'utf8');
  const markdown = await readFile(paths.markdownPath, 'utf8');
  const json = JSON.parse(jsonText);

  assert.deepEqual(json.rounds.map((round) => round.round), [1, 2]);
  assert.deepEqual(json.issues.map((issue) => issue.id), ['issue-high', 'issue-low']);
  assert.deepEqual(json.suggestions.map((item) => item.id), ['suggestion-1', 'suggestion-2']);
  assert.equal(json.provider.apiKey, '[REDACTED]');
  assert.equal(json.provider.nested.Authorization, '[REDACTED]');
  assert.equal(jsonText.includes('must-not-leak'), false);
  assert.equal(markdown.includes('must-not-leak'), false);
  assert.ok(markdown.includes('issue-high'));
  assert.ok(markdown.includes('suggestion-1'));
  assert.match(markdown, /原始评分[^\n]*80/);
  assert.match(markdown, /确定性质量门禁[^\n]*(?:未通过|阻断)/);
  assert.ok(markdown.includes('issue-high'));
  assert.ok(markdown.indexOf('第一问') < markdown.indexOf('第二问'));
});

test('parses safe CLI bounds and rejects unsupported arguments', () => {
  assert.deepEqual(parseCliArgs([
    '--kb', 'kb.jsonl', '--fixtures', 'cases.jsonl', '--output', 'out',
    '--max-questions', '7', '--max-followups', '1', '--live',
  ]), {
    kb: 'kb.jsonl', fixtures: 'cases.jsonl', output: 'out', maxQuestions: 7, maxFollowups: 1, live: true,
  });
  assert.throws(() => parseCliArgs(['--max-questions', '21']), /max-questions/);
  assert.throws(() => parseCliArgs(['--max-followups', '3']), /max-followups/);
  assert.throws(() => parseCliArgs(['--api-key', 'secret']), /unknown argument/);
});

test('blocks only high and critical deterministic issues', () => {
  assert.deepEqual(buildQualityGate([{ id: 'medium-1', severity: 'medium' }]), { passed: true, blockingIssueIds: [] });
  assert.deepEqual(buildQualityGate([
    { id: 'medium-1', severity: 'medium' },
    { id: 'high-1', severity: 'high' },
    { id: 'critical-1', severity: 'critical' },
  ]), { passed: false, blockingIssueIds: ['high-1', 'critical-1'] });
});

test('assigns unique issue and suggestion ids across all fixture rounds', async () => {
  const options = parseCliArgs([
    '--kb', 'knowledge_source/embedded_kb.example.jsonl',
    '--fixtures', 'validation/knowledge-dialog/fixtures/dialog-cases.jsonl',
    '--max-questions', '10',
  ]);
  const result = await runValidation(options, {});
  const repeated = await runValidation(options, {});
  assert.equal(new Set(result.issues.map((item) => item.id)).size, result.issues.length);
  assert.equal(new Set(result.suggestions.map((item) => item.id)).size, result.suggestions.length);
  assert.ok(result.suggestions.every((item) => item.sourceIssueIds.length === 1));
  assert.equal(result.sessionId, repeated.sessionId);
  assert.deepEqual(result, repeated);
});

test('live validation wires model evaluation and respects the follow-up cap', async () => {
  let evaluatorCalls = 0;
  const options = parseCliArgs([
    '--live',
    '--kb', 'knowledge_source/embedded_kb.example.jsonl',
    '--fixtures', 'validation/knowledge-dialog/fixtures/dialog-cases.jsonl',
    '--max-questions', '1',
    '--max-followups', '1',
  ]);
  const result = await runValidation(options, {
    INTERVIEW_LLM_API_KEY: 'fixture-secret',
    INTERVIEW_LLM_MODEL: 'fixture-model',
  }, {
    prepareRequest: async (question) => ({ system: 'candidate', user: question, matches: [] }),
    generateAnswer: async (request) => {
      if (request.system.includes('严格的技术面试官')) {
        evaluatorCalls += 1;
        return { answer: JSON.stringify({
          score: 70,
          needFollowup: true,
          followupQuestion: '请补充一个具体细节。',
        }) };
      }
      return { answer: `候选回答：${request.user}` };
    },
    now: () => 100,
  });

  assert.equal(evaluatorCalls, 2);
  assert.equal(result.rounds.length, 2);
  assert.deepEqual(result.rounds.map((round) => round.followupDepth), [0, 1]);
  assert.equal(JSON.stringify(result).includes('fixture-secret'), false);
  assert.equal(result.mode, 'live');
  assert.deepEqual(result.rounds.map((round) => round.rawScore), [70, 70]);
  assert.ok(result.rounds.every((round) => round.evaluation.score === 70));
  assert.equal(typeof result.qualityGate.passed, 'boolean');
  assert.deepEqual(
    result.qualityGate.blockingIssueIds,
    result.issues.filter((item) => ['high', 'critical'].includes(item.severity)).map((item) => item.id),
  );
});
