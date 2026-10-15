import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('interview console passes question metadata through the streaming IPC contract', () => {
  const source = fs.readFileSync(path.join(repoRoot, 'src/interview-console/InterviewConsole.tsx'), 'utf8');
  assert.match(source, /interviewQuestion:\s*(?:job\.)?question/);
  assert.match(source, /hasRelevantPersonalEvidence:/);
});

test('main process validates caller-composed interview answers and allows one repair', () => {
  const source = fs.readFileSync(path.join(repoRoot, 'electron/ipcHandlers.ts'), 'utf8');
  assert.match(source, /validateInterviewAnswerTopic/);
  assert.match(source, /interviewQuestion/);
  assert.match(source, /hasRelevantPersonalEvidence/);
  assert.match(source, /interview_topic_repair/);
});


test('caller-owned interview system instruction enforces the spoken budget without confusing prompt examples for user requests', () => {
 const source = fs.readFileSync(path.join(repoRoot, 'electron/ipcHandlers.ts'), 'utf8');
 const match = source.match(/let systemPromptOverride: string \| undefined = callerComposedInterview[\s\S]*?: options\?\.skipSystemPrompt/);
 assert.ok(match);
 assert.match(match[0], /length limits.*mandatory/);
 assert.match(match[0], /interviewer question.*supplementary prompt/);
 assert.match(match[0], /not.*instruction.*examples/);
});
