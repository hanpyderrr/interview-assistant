import assert from 'node:assert/strict';
import test from 'node:test';

import { buildDetailedKbCandidate } from '../append-ai-detailed-kb.mjs';

const existing = `# AI 知识库

## 目录

- [岗位理解](#岗位理解) （1 条）

## 岗位理解

#### 旧问题？

> ID: \`ai.old.001\`

旧答案。
`;

const detailed = `# 新增详解

共 2 题。

## Agent

#### 新问题一？

> ID: \`ai.gap.001\`

新答案一。

---

## RAG

#### 新问题二？

> ID: \`ai.gap.002\`

新答案二。
`;

test('adds one TOC entry and one marked chapter without moving old content', () => {
  const result = buildDetailedKbCandidate(existing, detailed, { expectedIds: ['ai.gap.001', 'ai.gap.002'] });
  assert.equal(result.changed, true);
  assert.equal((result.text.match(/AI-GAP-20260829-BEGIN/g) ?? []).length, 1);
  assert.equal((result.text.match(/ai\.gap\.00[12]/g) ?? []).length, 2);
  assert.match(result.text, /- \[AI Agent 工程化进阶（新增 50 题详解）\]/);
  assert.ok(result.text.indexOf('#### 旧问题？') < result.text.indexOf('AI-GAP-20260829-BEGIN'));
  assert.match(result.text, /### Agent/);
});

test('is byte-idempotent after the marked chapter exists', () => {
  const first = buildDetailedKbCandidate(existing, detailed, { expectedIds: ['ai.gap.001', 'ai.gap.002'] });
  const second = buildDetailedKbCandidate(first.text, detailed, { expectedIds: ['ai.gap.001', 'ai.gap.002'] });
  assert.equal(second.changed, false);
  assert.equal(second.text, first.text);
});

test('refuses partial or conflicting IDs', () => {
  assert.throws(
    () => buildDetailedKbCandidate(`${existing}\n> ID: \`ai.gap.001\`\n`, detailed, { expectedIds: ['ai.gap.001', 'ai.gap.002'] }),
    /already contains AI gap IDs/,
  );
  assert.throws(
    () => buildDetailedKbCandidate(existing, detailed, { expectedIds: ['ai.gap.001', 'ai.gap.003'] }),
    /detailed source ID set mismatch/,
  );
});
