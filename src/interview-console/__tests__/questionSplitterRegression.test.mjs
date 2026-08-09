// Phase 18 Step 3 regression guard.
//
// This file is intentionally independent from questionTiming.test.mjs and from
// the future questionRoundCoordinator module, so it keeps executing (and
// passing) while the coordinator suite is still RED.
import test from 'node:test';
import assert from 'node:assert/strict';
import { splitSettledInterviewQuestion } from '../questionTiming.ts';

const SPI_CRC32_HALF_PACKET_QUESTION =
  '我们聊一下 SPI 驱动。你当时是怎么设计字节序、帧头、长度，还有 CRC32 校验的？如果出现半包或者粘包，你会怎么处理？';

test('the SPI/CRC32/half-packet interviewer turn stays one exact question', () => {
  assert.deepEqual(splitSettledInterviewQuestion(SPI_CRC32_HALF_PACKET_QUESTION), {
    firstQuestion: SPI_CRC32_HALF_PACKET_QUESTION,
    remainingQuestions: [],
  });
});

test('the SPI/CRC32/half-packet turn is returned verbatim, with no trailing marker loss', () => {
  const result = splitSettledInterviewQuestion(SPI_CRC32_HALF_PACKET_QUESTION);

  assert.equal(result.firstQuestion, SPI_CRC32_HALF_PACKET_QUESTION);
  assert.ok(result.firstQuestion.includes('CRC32'));
  assert.ok(result.firstQuestion.includes('半包'));
  assert.ok(result.firstQuestion.endsWith('你会怎么处理？'));
  assert.equal(result.remainingQuestions.length, 0);
});
