import test from 'node:test'
import assert from 'node:assert/strict'

import { filterHallucination } from '../whisper/hallucinationFilter.ts'

test('system-channel gate preserves short declarative fragments for round-level aggregation', () => {
  const system = { rejectShortNonQuestion: true }
  assert.equal(filterHallucination('\u6211\u770b\u4f60\u8fd9\u513f', system), '\u6211\u770b\u4f60\u8fd9\u513f')
  assert.equal(filterHallucination('\u8865\u5145\u662f\u4e09\u5341\u4e8c\u4f4d', system), '\u8865\u5145\u662f\u4e09\u5341\u4e8c\u4f4d')
})

test('system-channel gate keeps concise interview prompts', () => {
  const system = { rejectShortNonQuestion: true }
  for (const prompt of [
    '\u4e3a\u4ec0\u4e48\uff1f',
    '\u8bf4\u8bf4\u4f60\u7684\u9879\u76ee',
    '\u7ebf\u7a0b\u548c\u8fdb\u7a0b\u7684\u533a\u522b',
    'TCP \u4e09\u6b21\u63e1\u624b',
  ]) assert.equal(filterHallucination(prompt, system), prompt)
})
