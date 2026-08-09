import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const consolePath = path.join(repoRoot, 'src', 'interview-console', 'InterviewConsole.tsx');

test('converts only interviewer transcript text before it enters the visible question flow', async () => {
  const source = await readFile(consolePath, 'utf8');
  const rawTextDeclaration = source.indexOf('const rawText = event.text?.trim()');
  const candidateBranch = source.indexOf("if (event.speaker === 'user')", rawTextDeclaration);
  const interviewerGuard = source.indexOf("if (event.speaker !== 'interviewer') return", candidateBranch);
  const conversion = source.indexOf('const text = toSimplifiedChinese(rawText)', interviewerGuard);

  assert.match(source, /import \{ toSimplifiedChinese \} from '\.\/simplifiedChinese'/);
  assert.ok(rawTextDeclaration >= 0, 'transcript events should retain raw text at entry');
  assert.ok(candidateBranch > rawTextDeclaration, 'candidate handling should use raw text first');
  assert.ok(interviewerGuard > candidateBranch, 'interviewer conversion should follow the candidate branch');
  assert.ok(conversion > interviewerGuard, 'interviewer text should be converted after the speaker guard');
  assert.doesNotMatch(
    source.slice(candidateBranch, interviewerGuard),
    /toSimplifiedChinese/,
    'candidate transcript text must remain unchanged',
  );
});

test('defensively converts generated and revised question text', async () => {
  const source = await readFile(consolePath, 'utf8');

  assert.match(source, /const question = toSimplifiedChinese\(action\.question\)/);
  assert.match(
    source,
    /if \(action\.type === 'reviseHistory'\) \{\s+const question = toSimplifiedChinese\(action\.question\)\s+dispatchAnswer\(\{ type: 'revise', id: action\.id, question \}\)\s+setConfirmedQuestion\(question\)/,
  );
});
