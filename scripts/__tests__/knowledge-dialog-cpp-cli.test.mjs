import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCppEvaluation, parseCliArgs, runValidation } from '../knowledge-dialog/run.mjs';
import { ISSUE_TYPES } from '../knowledge-dialog/contracts.mjs';

test('requires explicit live mode and executable for the C++ interviewer', () => {
  assert.throws(() => parseCliArgs(['--interviewer', 'cpp', '--cpp-executable', 'x.exe']), /--live/);
  assert.throws(() => parseCliArgs(['--live', '--interviewer', 'cpp']), /cpp-executable/);
});

test('normalizes C++ evaluation fields and isolates unknown metadata', () => {
  assert.deepEqual(normalizeCppEvaluation({
    score: 73,
    feedback: '需要补充细节',
    need_followup: true,
    followup_question: '具体上限是多少？',
    strengths: ['结构清晰'],
    weaknesses: ['缺少指标'],
    provider_trace: 'trace-1',
  }, 'question-1'), {
    questionId: 'question-1',
    score: 73,
    feedback: '需要补充细节',
    needFollowup: true,
    followupQuestion: '具体上限是多少？',
    strengths: ['结构清晰'],
    weaknesses: ['缺少指标'],
    providerMetadata: { provider_trace: 'trace-1' },
  });
});

test('uses C++ questions/evaluations and closes the child after a bounded live run', async () => {
  let evaluations = 0;
  let closes = 0;
  const cpp = {
    async generateQuestions() { return [{ question: 'C++ 生成的主问题' }]; },
    async evaluateAnswer() {
      evaluations += 1;
      return {
        score: 72,
        feedback: 'fixture',
        need_followup: true,
        followup_question: 'C++ 生成的追问',
        strengths: [],
        weaknesses: ['细节'],
      };
    },
    async close() { closes += 1; },
  };
  const options = parseCliArgs([
    '--live', '--interviewer', 'cpp',
    '--cpp-executable', 'C:\\fixture\\CppInterviewText.exe',
    '--cpp-config', 'C:\\fixture\\config.json',
    '--kb', 'knowledge_source/interview_kb.example.jsonl',
    '--fixtures', 'validation/knowledge-dialog/fixtures/dialog-cases.jsonl',
    '--max-questions', '1', '--max-followups', '1',
  ]);
  const result = await runValidation(options, {
    INTERVIEW_LLM_API_KEY: 'fixture-secret', INTERVIEW_LLM_MODEL: 'fixture-model',
  }, {
    fileExists: async () => true,
    createCppAdapter: () => cpp,
    prepareRequest: async (question) => ({ system: 'candidate', user: question, matches: [] }),
    generateAnswer: async (request) => ({ answer: `候选回答：${request.user}` }),
    now: () => 100,
  });
  assert.equal(evaluations, 2);
  assert.equal(closes, 1);
  assert.deepEqual(result.rounds.map((round) => round.question), ['C++ 生成的主问题', 'C++ 生成的追问']);
  assert.equal(result.rounds[0].evaluation.feedback, 'fixture');
  assert.equal(result.interviewer, 'cpp');
  assert.ok(result.rounds.every((round) => ['questionId', 'score', 'needFollowup']
    .every((field) => field in round.evaluation)));
  assert.ok(result.issues.every((issue) => ISSUE_TYPES.includes(issue.type)));
});
