import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildTranscriptTextCorrectionPrompt,
  normalizeTranscriptText,
  shouldCorrectTranscriptText,
  validateTranscriptTextCorrection,
} from '../transcriptTextCorrection.ts'

test('normalizes and bounds transcript input', () => {
  assert.equal(normalizeTranscriptText('  你在\n RK3568  上做什么？ '), '你在 RK3568 上做什么？')
  assert.equal(normalizeTranscriptText('x'.repeat(1600)).length, 1200)
  assert.equal(shouldCorrectTranscriptText('为什么'), false)
  assert.equal(shouldCorrectTranscriptText('你负责的模块是什么？'), true)
})

test('prompt allows typo correction but forbids rewriting facts', () => {
  const prompt = buildTranscriptTextCorrectionPrompt('你在 RK356E 上做 Budrude Linux 才简时？')
  assert.match(prompt, /同音字|错别字/)
  assert.match(prompt, /不得补充|不得改写事实/)
  assert.match(prompt, /<interviewer_transcript>/)
  assert.match(prompt, /RK356E/)
})

test('accepts bounded homophone and technical-token correction', () => {
  const original = '你在 RK356E 上做 Budrude Linux 才简时，一般保留哪些组件？'
  const corrected = '你在 RK3568 上做 Buildroot Linux 裁剪时，一般保留哪些组件？'
  const result = validateTranscriptTextCorrection(original, corrected)
  assert.equal(result.valid, true)
  assert.equal(result.text, corrected)
})

test('rejects changed standalone metrics, expansion, and factual rewriting', () => {
  const metric = 'P99 从 800ms 降到 200ms 是怎么测的？'
  assert.equal(validateTranscriptTextCorrection(metric, 'P99 从 800ms 降到 50ms 是怎么测的？').valid, false)

  const original = '你在项目里主要负责哪些模块？'
  assert.equal(validateTranscriptTextCorrection(original, '').valid, false)
  assert.equal(validateTranscriptTextCorrection(original, `${original} 请结合二十人团队和年度金奖详细说明`).valid, false)
  assert.equal(validateTranscriptTextCorrection(original, '你领导团队完成云平台迁移并获得年度金奖，对吗？').valid, false)
})
