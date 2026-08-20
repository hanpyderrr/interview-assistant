import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const source = fs.readFileSync(path.resolve('src/interview-console/InterviewConsole.tsx'), 'utf8');

test('candidate streams are generation-scoped and final settle can reuse only a completed compatible candidate', () => {
  assert.match(source, /createCandidateGenerationController/);
  assert.match(source, /candidateStreamRef/);
  assert.match(source, /candidateGenerationRef/);
  assert.match(source, /claimCandidateStream/);
  assert.match(source, /candidateControllerRef\.current\.acceptCandidateToken/);
  assert.match(source, /cancelChatStream/);
  assert.match(source, /finalText/);
});

test('candidate extractor cleanup covers every generation terminal path', () => {
  assert.match(source, /function clearCandidateExtractor\(generationId: number\)[\s\S]{0,160}?delete\(`candidate:\$\{generationId\}`\)/);
  const start = source.slice(source.indexOf('async function startCandidateStream'), source.indexOf('function cancelCandidateStream'));
  assert.match(start, /previous[\s\S]{0,180}?clearCandidateExtractor\(previous\.generationId\)/, 'replacement must clear the old generation');
  assert.match(start, /candidate\?\.generationId === generationId[\s\S]{0,220}?clearCandidateExtractor\(generationId\)/, 'resolve terminal must clear its generation');
  assert.match(start, /flushResolvedCorrectionExtractor\(extractor,[\s\S]{0,260}?acceptCandidateToken\(\{ generationId, token: leftover \}\)/, 'candidate resolve must flush held visible text into the accepted generation');
  const caught = start.slice(start.indexOf('} catch'));
  assert.match(caught, /candidate\?\.generationId === generationId[\s\S]{0,180}?clearCandidateExtractor\(generationId\)/, 'catch must clear the accepted generation');
  assert.doesNotMatch(caught, /flushResolvedCorrectionExtractor/, 'failed candidate generations must discard buffered tails');
  const cancel = source.slice(source.indexOf('function cancelCandidateStream'), source.indexOf('/**\n   * A tagged Provider callback'));
  assert.match(cancel, /clearCandidateExtractor\(candidate\.generationId\)/);
  assert.doesNotMatch(cancel, /flushResolvedCorrectionExtractor/, 'cancelled candidate generations must discard buffered tails');
  const done = source.slice(source.indexOf('const removeDone'), source.indexOf('const removeAnswerError'));
  assert.match(done, /if \(extractor\) \{[\s\S]{0,180}?\}[\s\S]{0,120}?clearCandidateExtractor\(candidate\.generationId\)[\s\S]{0,120}?stripCorrectionSection\([^\n]+candidate\.question\)/, 'done-only final must strip outside the extractor branch');
  const errorStart = source.indexOf('const removeAnswerError');
  const error = source.slice(errorStart, source.indexOf('return () =>', errorStart));
  assert.match(error, /clearCandidateExtractor\(candidate\.generationId\)/);
});
