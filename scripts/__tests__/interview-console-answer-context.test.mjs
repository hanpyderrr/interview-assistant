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
  assert.match(consoleSource, /const \[interviewerTranscriptWindow, setInterviewerTranscriptWindow\] = useState<TranscriptDisplayWindow>/);
  assert.match(consoleSource, /const \[candidateTranscriptWindow, setCandidateTranscriptWindow\] = useState<TranscriptDisplayWindow>/);
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

test('candidate context preference only gates AI context and is available in the main controls', () => {
  assert.match(consoleSource, /loadCandidateContextEnabled/);
  assert.match(consoleSource, /saveCandidateContextEnabled/);
  assert.match(consoleSource, /includeCandidateSpeech:\s*candidateContextEnabledRef\.current/);
  assert.match(consoleSource, /type="checkbox"[\s\S]{0,300}checked=\{candidateContextEnabled\}/);
  assert.match(consoleSource, /我的发言供 AI 参考/);
  assert.match(consoleSource, /关闭后仍会转写和记录/);
  assert.match(consoleSource, /committedCandidateRef\.current = appendFinalTurn/);
  assert.match(consoleSource, /acceptCandidateFinal/);
});

test('candidate cleanup is isolated from raw transcript state and bounded before answer context', () => {
  assert.match(consoleSource, /createCandidateSpeechCleanupCoordinator/);
  assert.match(consoleSource, /cleanupCandidateSpeech/);
  assert.match(consoleSource, /cancelCandidateSpeechCleanup/);
  assert.match(consoleSource, /candidateCleanupRef\.current\??\.observe\(nextConversation, candidateContextEnabledRef\.current\)/);
  assert.match(consoleSource, /buildContextTurns\(\s*conversationTurnsRef\.current,\s*candidateContextEnabledRef\.current,\s*300,?\s*\)/);
  assert.match(consoleSource, /answerPreparationVersionRef/);
  assert.match(consoleSource, /AI 整理中|AI 已整理|AI 使用原文/);
  assert.match(consoleSource, /发言片段会调用当前 AI 服务整理/);
  assert.match(consoleSource, /candidateCleanupRef\.current\??\.cancel\(\)/);
  assert.match(consoleSource, /committedCandidateRef\.current = appendFinalTurn/);
  assert.match(consoleSource, /acceptCandidateFinal/);
});

test('interviewer correction is asynchronous and display-only', () => {
  assert.match(consoleSource, /createInterviewerDisplayCorrectionCoordinator/);
  assert.match(consoleSource, /correctTranscriptText/);
  assert.match(consoleSource, /cancelTranscriptTextCorrection/);
  assert.match(consoleSource, /interviewerDisplayCorrectionRef\.current\??\.apply\(committedInterviewerRef\.current\)/);
  assert.match(consoleSource, /void interviewerDisplayCorrectionRef\.current\??\.request\(incoming\)/);

  const rawCommit = consoleSource.indexOf('conversationTurnsRef.current = nextConversation', consoleSource.indexOf("event.speaker !== 'interviewer'"));
  const roundAccept = consoleSource.indexOf('roundCoordinatorRef.current.acceptInterviewerFinal', rawCommit);
  const correctionRequest = consoleSource.indexOf('void interviewerDisplayCorrectionRef.current?.request(incoming)', rawCommit);
  assert.ok(rawCommit >= 0 && roundAccept > rawCommit && correctionRequest > roundAccept,
    'raw conversation and round answer path must run before the non-awaited display correction');
  assert.doesNotMatch(consoleSource, /acceptInterviewerFinal\([\s\S]{0,500}(?:corrected|correction)Text/);
});

test('answer requests include bounded conversation context while retrieval and prompt use the normalized question', () => {
  assert.match(consoleSource, /buildRecentInterviewContext\(conversationTurnsRef\.current,[\s\S]{0,180}includeCandidateSpeech/);
  assert.match(consoleSource, /import \{ normalizeInterviewQuestion \} from '\.\/questionNormalization'/);
  assert.match(consoleSource, /analysisQuestion: normalizeInterviewQuestion\(question\)/);
  assert.match(consoleSource, /buildInterviewConsolePrompt\(job\.analysisQuestion, context, job\.conversationContext, job\.answerLevel\)/);
  assert.match(consoleSource, /retrieveInterviewKnowledge\?\.\(job\.analysisQuestion\)/);
});

test('prewarms the latest normalized question and consumes matching retrieval work', () => {
  assert.match(consoleSource, /createAnswerPrewarmCache/);
  assert.match(consoleSource, /answerPrewarmRef\.current\.prewarm/);
  assert.match(consoleSource, /answerPrewarmRef\.current\.consume\(job\.analysisQuestion, job\.conversationContext, job\.answerLevel\)/);
});

test('simplified display question is stored for answer history and UI selection', () => {
  assert.match(consoleSource, /const question = toSimplifiedChinese\(action\.question\)/);
  assert.match(consoleSource, /dispatchAnswer\(\{ type: 'enqueue', id, question/);
  assert.match(consoleSource, /dispatchAnswer\(\{ type: 'enqueue', id, question, select, answerLevel: job\.answerLevel \}\)/);
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
