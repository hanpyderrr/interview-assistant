import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const consoleSource = fs.readFileSync(
  path.join(repoRoot, 'src', 'interview-console', 'InterviewConsole.tsx'),
  'utf8',
);
const stylesSource = fs.readFileSync(
  path.join(repoRoot, 'src', 'interview-console', 'InterviewConsole.css'),
  'utf8',
);

test('interview console routes microphone and interviewer transcripts separately', () => {
  assert.match(consoleSource, /from '\.\/interviewContext'/);
  assert.match(consoleSource, /const \[interviewerTranscript, setInterviewerTranscript\] = useState\(''\)/);
  assert.match(consoleSource, /const \[candidateTranscript, setCandidateTranscript\] = useState\(''\)/);
  assert.match(consoleSource, /if \(event\.speaker === 'user'\) \{[\s\S]*appendFinalTurn[\s\S]*return/);
  assert.match(consoleSource, /if \(event\.speaker !== 'interviewer'\) return/);
});

test('microphone finals enter context but cannot trigger answer generation', () => {
  assert.match(consoleSource, /const previousConversation = conversationTurnsRef\.current[\s\S]*appendFinalTurn\(previousConversation, incoming\)/);
  assert.match(consoleSource, /segmentId/);
  assert.match(consoleSource, /audioStartMs/);
  assert.match(consoleSource, /audioEndMs/);
  assert.match(consoleSource, /isTranscriptAtOrBefore/);
  assert.match(consoleSource, /shouldTriggerInterviewAnswer\(event\.speaker, event\.final\)/);
  assert.doesNotMatch(consoleSource, /event\.speaker === 'user'[\s\S]{0,500}requestCloudAnswer/);
});

test('answer requests include bounded conversation context while retrieval and prompt use the normalized question', () => {
  assert.match(consoleSource, /buildRecentInterviewContext\(conversationTurnsRef\.current\)/);
  assert.match(consoleSource, /import \{ normalizeInterviewQuestion \} from '\.\/questionNormalization'/);
  assert.match(consoleSource, /analysisQuestion: normalizeInterviewQuestion\(question\)/);
  assert.match(consoleSource, /buildInterviewConsolePrompt\(job\.analysisQuestion, context, job\.conversationContext\)/);
  assert.match(consoleSource, /retrieveInterviewKnowledge\?\.\(job\.analysisQuestion\)/);
});

test('prewarms the latest normalized question and consumes matching retrieval work', () => {
  assert.match(consoleSource, /createAnswerPrewarmCache/);
  assert.match(consoleSource, /answerPrewarmRef\.current\.prewarm/);
  assert.match(consoleSource, /answerPrewarmRef\.current\.consume\(job\.analysisQuestion, job\.conversationContext\)/);
});

test('simplified display question is stored for answer history and UI selection', () => {
  assert.match(consoleSource, /const question = toSimplifiedChinese\(action\.question\)/);
  assert.match(consoleSource, /dispatchAnswer\(\{ type: 'enqueue', id, question/);
  assert.match(consoleSource, /dispatchAnswer\(\{ type: 'enqueue', id, question, select \}\)/);
});

// Phase 18 Step 5: the renderer now uses one answer/history row per coordinator
// round. splitSettledInterviewQuestion remains a tested pure legacy utility, but
// it is intentionally no longer part of the renderer's answer trigger — that is
// required by the "one round, one stable answer ID, many attempts" invariant.
test('coordinator rounds produce one answer per round instead of split clauses', () => {
  assert.doesNotMatch(
    consoleSource,
    /splitSettledInterviewQuestion/,
    'the renderer must not split a settled round into multiple answers',
  );
  assert.match(
    consoleSource,
    /createQuestionRoundCoordinator/,
    'the renderer must derive question rounds from the round coordinator',
  );
});

test('the transcript panel visibly distinguishes interviewer and candidate speech', () => {
  assert.match(consoleSource, />面试官问题</);
  assert.match(consoleSource, />我的回答</);
  assert.match(consoleSource, /className="candidate-transcript/);
  assert.match(stylesSource, /\.candidate-transcript\{/);
});
