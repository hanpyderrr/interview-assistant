import test from 'node:test'
import assert from 'node:assert/strict'

import {
  INTERVIEW_FONT_DEFAULTS,
  INTERVIEW_FONT_MAX,
  INTERVIEW_FONT_MIN,
  INTERVIEW_FONT_STORAGE_KEY,
  adjustInterviewFontSize,
  loadInterviewFontSizes,
  saveInterviewFontSizes,
} from '../interviewFontSettings.ts'

function createStorage(initialValue = null) {
  let value = initialValue
  return {
    getItem(key) {
      assert.equal(key, INTERVIEW_FONT_STORAGE_KEY)
      return value
    },
    setItem(key, nextValue) {
      assert.equal(key, INTERVIEW_FONT_STORAGE_KEY)
      value = nextValue
    },
  }
}

test('missing or malformed font settings use defaults', () => {
  assert.deepEqual(loadInterviewFontSizes(createStorage()), INTERVIEW_FONT_DEFAULTS)
  assert.deepEqual(loadInterviewFontSizes(createStorage('{bad json')), INTERVIEW_FONT_DEFAULTS)
})

test('loaded font sizes clamp each channel independently', () => {
  const storage = createStorage(JSON.stringify({ question: 8, answer: 99 }))
  assert.deepEqual(loadInterviewFontSizes(storage), {
    question: INTERVIEW_FONT_MIN,
    answer: INTERVIEW_FONT_MAX,
  })
})

test('invalid channels fall back without discarding a valid sibling', () => {
  const storage = createStorage(JSON.stringify({ question: 'large', answer: 24 }))
  assert.deepEqual(loadInterviewFontSizes(storage), { question: 20, answer: 24 })
})

test('font adjustment uses a bounded two-pixel step', () => {
  assert.equal(adjustInterviewFontSize(20, 1), 22)
  assert.equal(adjustInterviewFontSize(20, -1), 18)
  assert.equal(adjustInterviewFontSize(INTERVIEW_FONT_MAX, 1), INTERVIEW_FONT_MAX)
  assert.equal(adjustInterviewFontSize(INTERVIEW_FONT_MIN, -1), INTERVIEW_FONT_MIN)
})

test('saved settings round-trip and storage failures stay non-fatal', () => {
  const storage = createStorage()
  saveInterviewFontSizes({ question: 24, answer: 28 }, storage)
  assert.deepEqual(loadInterviewFontSizes(storage), { question: 24, answer: 28 })

  assert.doesNotThrow(() => saveInterviewFontSizes({ question: 20, answer: 20 }, {
    setItem() { throw new Error('blocked') },
  }))
  assert.deepEqual(loadInterviewFontSizes({
    getItem() { throw new Error('blocked') },
  }), INTERVIEW_FONT_DEFAULTS)
})
