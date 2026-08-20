import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createQuestionCorrectionExtractor,
  flushResolvedCorrectionExtractor,
  stripCorrectionSection,
  isValidQuestionCorrection,
} from '../questionCorrectionExtractor.ts';

const QUESTION = '请介绍SPI帧同步的设计';

test('extracts a correction closed within a single chunk', () => {
  const extractor = createQuestionCorrectionExtractor(QUESTION);
  const result = extractor.feed('【问题修正】请介绍 SPI 帧同步的设计【/问题修正】然后我开始回答');
  assert.equal(result.corrected, '请介绍 SPI 帧同步的设计');
  assert.equal(result.display, '然后我开始回答');
  assert.equal(extractor.done(), true);
});

test('extracts a correction split across chunks', () => {
  const extractor = createQuestionCorrectionExtractor(QUESTION);
  const first = extractor.feed('【问题修');
  assert.equal(first.corrected, null);
  assert.equal(first.display, '');
  const second = extractor.feed('正】请介绍 SPI 帧同步的设计【/问');
  assert.equal(second.corrected, null);
  assert.equal(second.display, '');
  const third = extractor.feed('题修正】接下来是正文');
  assert.equal(third.corrected, '请介绍 SPI 帧同步的设计');
  assert.equal(third.display, '接下来是正文');
});

test('passes chunks through untouched when no marker appears', () => {
  const extractor = createQuestionCorrectionExtractor(QUESTION);
  const result = extractor.feed('我是正常答案的开头，没有修正区。');
  assert.equal(result.corrected, null);
  // The last 5 chars are held back as a potential marker prefix and
  // returned by finish().
  assert.equal(result.display, '我是正常答案的开头，没');
  assert.equal(extractor.finish(), '有修正区。');
});

test('marker spanning a chunk boundary is found', () => {
  const extractor = createQuestionCorrectionExtractor(QUESTION);
  const first = extractor.feed('前置文本【问题');
  // '文本【问题' is held back as a potential marker prefix.
  assert.equal(first.display, '前置');
  const second = extractor.feed('修正】请介绍 SPI 帧同步的设计【/问题修正】正文');
  assert.equal(second.corrected, '请介绍 SPI 帧同步的设计');
  assert.equal(second.display, '文本正文');
});

test('unterminated section is returned verbatim by finish', () => {
  const extractor = createQuestionCorrectionExtractor(QUESTION);
  const first = extractor.feed('【问题修正】请介绍 SPI 帧同步的设计');
  assert.equal(first.display, '');
  assert.equal(extractor.finish(), '【问题修正】请介绍 SPI 帧同步的设计');
  assert.equal(extractor.done(), true);
});

test('successful answer resolve flushes a held ordinary-text tail without loss', () => {
  const extractor = createQuestionCorrectionExtractor(QUESTION);
  let visible = '';
  for (const chunk of ['这是普通', '正文结尾']) {
    visible += extractor.feed(chunk).display;
  }
  flushResolvedCorrectionExtractor(extractor, (leftover) => { visible += leftover; });
  assert.equal(visible, '这是普通正文结尾');
});

test('successful answer resolve preserves a cross-chunk unterminated correction block', () => {
  const extractor = createQuestionCorrectionExtractor(QUESTION);
  let visible = '';
  for (const chunk of ['【问题', '修正】未闭合正文']) {
    visible += extractor.feed(chunk).display;
  }
  flushResolvedCorrectionExtractor(extractor, (leftover) => { visible += leftover; });
  assert.equal(visible, '【问题修正】未闭合正文');
});

test('successful candidate resolve uses the same exact-tail flush contract', () => {
  const extractor = createQuestionCorrectionExtractor(QUESTION);
  const acceptedCandidateTokens = [];
  const first = extractor.feed('候选答案末尾');
  if (first.display) acceptedCandidateTokens.push(first.display);
  flushResolvedCorrectionExtractor(extractor, (leftover) => acceptedCandidateTokens.push(leftover));
  assert.equal(acceptedCandidateTokens.join(''), '候选答案末尾');
});

test('rejects a correction that changes the technical term', () => {
  const extractor = createQuestionCorrectionExtractor(QUESTION);
  const result = extractor.feed('【问题修正】请介绍 I2C 帧同步的设计【/问题修正】正文');
  assert.equal(result.corrected, null);
  assert.match(result.display, /^【问题修正】/);
  assert.match(result.display, /正文$/);
});

test('rejects a correction outside the length ratio', () => {
  const extractor = createQuestionCorrectionExtractor(QUESTION);
  const longRewritten = 'x'.repeat(200);
  const result = extractor.feed(`【问题修正】${longRewritten}【/问题修正】正文`);
  assert.equal(result.corrected, null);
  assert.match(result.display, /正文$/);
});

test('abandons an oversized buffer and returns it for display', () => {
  const extractor = createQuestionCorrectionExtractor(QUESTION, 10);
  const result = extractor.feed('【问题修正】非常非常非常长的未闭合内容');
  assert.equal(result.corrected, null);
  assert.match(result.display, /^【问题修正】/);
  assert.equal(extractor.done(), true);
});

test('isValidQuestionCorrection enforces ratio and technical terms', () => {
  assert.equal(isValidQuestionCorrection(QUESTION, '请介绍 SPI 帧同步的设计'), true);
  assert.equal(isValidQuestionCorrection(QUESTION, ''), false);
  assert.equal(isValidQuestionCorrection(QUESTION, '请介绍 I2C 的设计'), false);
});

test('stripCorrectionSection removes a well-formed section from final text', () => {
  const result = stripCorrectionSection(
    '【问题修正】请介绍 SPI 帧同步的设计【/问题修正】我的答案是……',
    QUESTION,
  );
  assert.equal(result.corrected, '请介绍 SPI 帧同步的设计');
  assert.equal(result.text, '我的答案是……');
});

test('stripCorrectionSection leaves malformed or absent sections untouched', () => {
  assert.equal(stripCorrectionSection('没有修正区的答案', QUESTION).text, '没有修正区的答案');
  const unterminated = stripCorrectionSection('【问题修正】没有闭合', QUESTION);
  assert.equal(unterminated.corrected, null);
  assert.equal(unterminated.text, '【问题修正】没有闭合');
  const invalid = stripCorrectionSection('【问题修正】请介绍 I2C 的设计【/问题修正】正文', QUESTION);
  assert.equal(invalid.corrected, null);
  assert.equal(invalid.text, '【问题修正】请介绍 I2C 的设计【/问题修正】正文');
});
