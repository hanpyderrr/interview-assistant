import test from 'node:test'
import assert from 'node:assert/strict'

import {
  TRANSCRIPT_DISPLAY_MAX_CHARS,
  buildTranscriptDisplayWindow,
  isNearTranscriptBottom,
} from '../transcriptDisplayWindow.ts'

test('short transcripts render in full without a folded marker', () => {
  const turns = [{ text: '第一句' }, { text: '第二句' }]
  assert.deepEqual(buildTranscriptDisplayWindow(turns), {
    text: '第一句 第二句',
    folded: false,
  })
})

test('long transcripts keep only the newest display window without mutating full turns', () => {
  const turns = Array.from({ length: 60 }, (_, index) => ({ text: `${index}`.padStart(2, '0') + 'x'.repeat(98) }))
  const original = structuredClone(turns)
  const result = buildTranscriptDisplayWindow(turns)

  assert.equal(result.folded, true)
  assert.ok(result.text.length <= TRANSCRIPT_DISPLAY_MAX_CHARS)
  assert.match(result.text, /59x+$/)
  assert.deepEqual(turns, original)
})

test('folding starts at a complete committed turn boundary', () => {
  const turns = [
    { text: 'old-' + 'a'.repeat(30) },
    { text: 'middle-complete-segment' },
    { text: 'newest-complete-segment' },
  ]
  const result = buildTranscriptDisplayWindow(turns, '', 52)

  assert.equal(result.folded, true)
  assert.equal(result.text, 'middle-complete-segment newest-complete-segment')
  assert.doesNotMatch(result.text, /^a+/)
})

test('one committed turn longer than the whole window keeps its newest tail', () => {
  const result = buildTranscriptDisplayWindow([{ text: `prefix-${'x'.repeat(80)}-tail` }], '', 24)

  assert.equal(result.folded, true)
  assert.equal(result.text.length, 24)
  assert.match(result.text, /-tail$/)
})

test('a live partial is included at the end of the recent window', () => {
  const result = buildTranscriptDisplayWindow(
    [{ text: '旧内容'.repeat(2000) }],
    '正在识别的最新一句',
  )

  assert.equal(result.folded, true)
  assert.match(result.text, /正在识别的最新一句$/)
})

test('scroll-follow threshold distinguishes bottom from deliberate upward review', () => {
  assert.equal(isNearTranscriptBottom({ scrollHeight: 1000, clientHeight: 300, scrollTop: 680 }), true)
  assert.equal(isNearTranscriptBottom({ scrollHeight: 1000, clientHeight: 300, scrollTop: 500 }), false)
})
