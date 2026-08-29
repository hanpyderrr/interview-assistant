import assert from 'node:assert/strict';
import test from 'node:test';

import {
  INTERVIEW_ANSWER_LEVEL_DEFAULT,
  INTERVIEW_ANSWER_LEVEL_OPTIONS,
  INTERVIEW_ANSWER_LEVEL_STORAGE_KEY,
  getInterviewAnswerDirective,
  loadInterviewAnswerLevel,
  saveInterviewAnswerLevel,
} from '../interviewAnswerLevel.ts';

function readable(value) {
  return { getItem: key => key === INTERVIEW_ANSWER_LEVEL_STORAGE_KEY ? value : null };
}

test('defaults missing, unknown, and unavailable storage to student', () => {
  assert.equal(INTERVIEW_ANSWER_LEVEL_DEFAULT, 'student');
  assert.equal(loadInterviewAnswerLevel(readable(null)), 'student');
  assert.equal(loadInterviewAnswerLevel(readable('staff')), 'student');
  assert.equal(loadInterviewAnswerLevel({ getItem: () => { throw new Error('blocked'); } }), 'student');
});

test('loads and saves all three supported answer levels', () => {
  const writes = [];
  const storage = { setItem: (key, value) => writes.push([key, value]) };
  for (const level of ['student', 'mid', 'senior']) {
    assert.equal(loadInterviewAnswerLevel(readable(level)), level);
    saveInterviewAnswerLevel(level, storage);
  }
  assert.deepEqual(writes, [
    [INTERVIEW_ANSWER_LEVEL_STORAGE_KEY, 'student'],
    [INTERVIEW_ANSWER_LEVEL_STORAGE_KEY, 'mid'],
    [INTERVIEW_ANSWER_LEVEL_STORAGE_KEY, 'senior'],
  ]);
  assert.doesNotThrow(() => saveInterviewAnswerLevel('student', { setItem: () => { throw new Error('blocked'); } }));
});

test('exports the exact UI choices with student first', () => {
  assert.deepEqual(
    INTERVIEW_ANSWER_LEVEL_OPTIONS.map(({ value, label }) => [value, label]),
    [
      ['student', '学生/应届'],
      ['mid', '中级工程师'],
      ['senior', '高级工程师'],
    ],
  );
  assert.ok(INTERVIEW_ANSWER_LEVEL_OPTIONS.every(option => option.description.trim().length > 0));
});

test('directives differ in depth while preserving factual boundaries', () => {
  const student = getInterviewAnswerDirective('student');
  const mid = getInterviewAnswerDirective('mid');
  const senior = getInterviewAnswerDirective('senior');

  assert.match(student, /学生|应届/);
  assert.match(student, /主导生产架构|生产负责人/);
  assert.match(mid, /实现|故障|取舍/);
  assert.match(senior, /SLO|容量|降级|架构/);
  for (const directive of [student, mid, senior]) {
    assert.match(directive, /不得虚构|不能虚构|不要虚构/);
  }
  assert.equal(new Set([student, mid, senior]).size, 3);
});
