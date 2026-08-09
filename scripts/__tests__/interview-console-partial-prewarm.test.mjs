import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const sourcePath = path.resolve('src/interview-console/InterviewConsole.tsx');
const source = fs.readFileSync(sourcePath, 'utf8');

test('interviewer partials use the stable prewarm gate and finals/reset cancel pending work', () => {
  assert.match(source, /import \{ createPartialPrewarmGate \} from '\.\/partialPrewarm'/);
  assert.match(source, /partialPrewarmRef\.current\.observe\(\{[\s\S]*speaker: event\.speaker[\s\S]*segmentId: event\.segmentId/);
  assert.match(source, /partialPrewarmRef\.current\.cancelSegment\(event\.segmentId\)/);
  assert.match(source, /partialPrewarmRef\.current\.clear\(\)/);
});
