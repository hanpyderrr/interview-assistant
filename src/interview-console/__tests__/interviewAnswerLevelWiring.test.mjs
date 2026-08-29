import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync('src/interview-console/InterviewConsole.tsx', 'utf8');
const css = fs.readFileSync('src/interview-console/InterviewConsole.css', 'utf8');

test('InterviewConsole persists the three-level selector with student as the default source', () => {
  assert.match(source, /loadInterviewAnswerLevel/);
  assert.match(source, /saveInterviewAnswerLevel/);
  assert.match(source, /INTERVIEW_ANSWER_LEVEL_OPTIONS/);
  assert.match(source, /useState<InterviewAnswerLevel>\(\(\) => loadInterviewAnswerLevel\(\)\)/);
  assert.match(source, /id="answer-level"/);
  assert.match(source, /回答级别/);
  assert.match(source, /下一题生效/);
});

test('each answer job snapshots one level and uses it for prompt, prewarm, and fallback history', () => {
  assert.match(source, /type AnswerJob = \{[^}]*answerLevel: InterviewAnswerLevel/s);
  assert.match(source, /answerLevel:\s*answerLevelRef\.current/);
  assert.match(source, /consume\(job\.analysisQuestion, job\.conversationContext, job\.answerLevel\)/);
  assert.match(source, /buildInterviewConsolePrompt\(job\.analysisQuestion, context, job\.conversationContext, job\.answerLevel\)/);
  assert.match(source, /type: 'enqueue'[^}]*answerLevel: job\.answerLevel/s);
  assert.match(source, /\.prewarm\([^;]*answerLevelRef\.current\)/s);
});

test('changing the level clears speculative work without resetting active answer state', () => {
  const handler = source.match(/function handleAnswerLevelChange[\s\S]*?\n  \}/u)?.[0] || '';
  assert.match(handler, /answerLevelRef\.current = level/);
  assert.match(handler, /saveInterviewAnswerLevel\(level\)/);
  assert.match(handler, /answerPrewarmRef\.current\.clear\(\)/);
  assert.match(handler, /partialPrewarmRef\.current\.clear\(\)/);
  assert.match(handler, /cancelCandidateStream\(\)/);
  assert.doesNotMatch(handler, /activeAnswerRef\.current|invalidateAnswerJobs|cancelChatStream/);
});

test('the answer-level control has dedicated narrow-rail styling', () => {
  assert.match(css, /\.answer-level-select/);
  assert.match(css, /\.answer-level-help/);
});
