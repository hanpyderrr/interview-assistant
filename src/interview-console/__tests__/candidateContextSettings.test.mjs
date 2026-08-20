import test from 'node:test'
import assert from 'node:assert/strict'

import {
  CANDIDATE_CONTEXT_DEFAULT,
  CANDIDATE_CONTEXT_STORAGE_KEY,
  loadCandidateContextEnabled,
  saveCandidateContextEnabled,
} from '../candidateContextSettings.ts'

function createStorage(initialValue = null) {
  let value = initialValue
  return {
    getItem(key) {
      assert.equal(key, CANDIDATE_CONTEXT_STORAGE_KEY)
      return value
    },
    setItem(key, nextValue) {
      assert.equal(key, CANDIDATE_CONTEXT_STORAGE_KEY)
      value = nextValue
    },
  }
}

test('candidate speech context defaults to enabled', () => {
  assert.equal(loadCandidateContextEnabled(createStorage()), CANDIDATE_CONTEXT_DEFAULT)
  assert.equal(loadCandidateContextEnabled(createStorage('invalid')), CANDIDATE_CONTEXT_DEFAULT)
})

test('candidate speech context preference round-trips both boolean values', () => {
  const storage = createStorage()
  saveCandidateContextEnabled(false, storage)
  assert.equal(loadCandidateContextEnabled(storage), false)
  saveCandidateContextEnabled(true, storage)
  assert.equal(loadCandidateContextEnabled(storage), true)
})

test('storage failures remain non-fatal', () => {
  assert.doesNotThrow(() => saveCandidateContextEnabled(true, {
    setItem() { throw new Error('blocked') },
  }))
  assert.equal(loadCandidateContextEnabled({
    getItem() { throw new Error('blocked') },
  }), CANDIDATE_CONTEXT_DEFAULT)
})
