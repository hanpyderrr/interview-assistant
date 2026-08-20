import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildCandidateSpeechCleanupPrompt,
  normalizeCandidateSpeech,
  shouldCleanupCandidateSpeech,
  validateCandidateSpeechCleanup,
} from '../candidateSpeechCleanup.ts'

test('short or empty speech bypasses paid cleanup', () => {
  assert.equal(shouldCleanupCandidateSpeech(''), false)
  assert.equal(shouldCleanupCandidateSpeech('好的，我明白了'), false)
  assert.equal(shouldCleanupCandidateSpeech('我负责了订单服务的缓存和稳定性改造，并把接口延迟降低了一半。'), true)
})

test('input normalization is whitespace-safe and bounded', () => {
  assert.equal(normalizeCandidateSpeech('  我负责  API\n\n改造  '), '我负责 API 改造')
  assert.equal(normalizeCandidateSpeech('x'.repeat(4000)).length, 3200)
})

test('cleanup prompt forbids invented facts and isolates untrusted transcript', () => {
  const prompt = buildCandidateSpeechCleanupPrompt('我使用 Redis，将 P99 从 800ms 降到 200ms。')
  assert.match(prompt, /不得补充|不得编造/)
  assert.match(prompt, /Redis/)
  assert.match(prompt, /800ms/)
  assert.match(prompt, /<candidate_transcript>/)
})

test('validation preserves numbers and technical tokens', () => {
  const original = '我使用 Redis 和 Node.js，把 P99 从 800ms 降到 200ms。'
  assert.equal(validateCandidateSpeechCleanup(original, '我使用 Redis 和 Node.js，将 P99 从 800ms 降到 200ms。').valid, true)
  assert.equal(validateCandidateSpeechCleanup(original, '我使用 Redis，把延迟降到 200ms。').valid, false)
  assert.equal(validateCandidateSpeechCleanup(original, '我使用 Redis 和 Node.js，把 P99 从 800ms 降到 50ms。').valid, false)
})

test('validation rejects empty, oversized, and substantially invented output', () => {
  const original = '我负责订单服务，解决了缓存击穿和重复请求问题。'
  assert.equal(validateCandidateSpeechCleanup(original, '').valid, false)
  assert.equal(validateCandidateSpeechCleanup(original, `${original}${'新增事实'.repeat(30)}`).valid, false)
  assert.equal(validateCandidateSpeechCleanup(original, '我负责订单服务，并领导二十人团队获得公司年度金奖。').valid, false)
})
