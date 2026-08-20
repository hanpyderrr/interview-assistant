import test from 'node:test'
import assert from 'node:assert/strict'

import { filterHallucination, inspectHallucination } from '../whisper/hallucinationFilter.ts'

test('drops the observed silent Chinese welcome-and-repeat hallucination', () => {
  const observed = [
    '那些东西会优先善掉 我看你 你在RK3568上做BSP bring-up时一般会先保留哪些组件',
    '那些东西会优先善掉 你在RK3568上做BSP bring-up时一般会先保留哪些组件',
    '我看你 欢迎来到大陆的小朋友 我们来看 我看你 欢迎来到大陆的朋友们',
    '我们来看 我们来讲 我看你 请请请请请请请请请请请请请请请请',
  ].join(' ')
  assert.equal(filterHallucination(observed), '')
})

test('drops dominant single-character and repeated short-unit hallucinations', () => {
  assert.equal(filterHallucination('请请请请请请请请请请请请'), '')
  assert.equal(filterHallucination('谢谢大家谢谢大家谢谢大家谢谢大家'), '')
})

test('drops repeated silence-decoder templates but not an ordinary welcome question', () => {
  assert.equal(filterHallucination('欢迎来到大陆的朋友们 我们来看 欢迎来到大陆的小朋友们 我们来看'), '')
  assert.equal(filterHallucination('欢迎来到北京后，你负责的第一个项目是什么？'), '欢迎来到北京后，你负责的第一个项目是什么？')
})

test('preserves real short and technical interview questions', () => {
  assert.equal(filterHallucination('为什么？'), '为什么？')
  assert.equal(
    filterHallucination('你在 RK3568 上做 BSP bring-up 时，一般会先保留哪些组件？'),
    '你在 RK3568 上做 BSP bring-up 时，一般会先保留哪些组件？',
  )
  assert.equal(filterHallucination('P99 从 800ms 降到 200ms 是怎么测的？'), 'P99 从 800ms 降到 200ms 是怎么测的？')
})

test('reports privacy-safe keep/drop reasons without returning extra transcript content', () => {
  assert.deepEqual(inspectHallucination('补充是三十二位'), {
    text: '补充是三十二位',
    decision: 'kept',
    reason: 'kept',
  })
  assert.deepEqual(inspectHallucination('[Noise]'), {
    text: '',
    decision: 'dropped',
    reason: 'bracket-token',
  })
})
