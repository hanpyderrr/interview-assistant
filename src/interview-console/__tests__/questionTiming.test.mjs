import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createQuestionSettler,
  DEFAULT_QUESTION_SETTLE_MS,
  EXTENDED_QUESTION_SETTLE_MS,
  splitSettledInterviewQuestion,
} from '../questionTiming.ts';

test('settled single questions are not split', () => {
  const question = 'How would you debug Buildroot Linux boot issues on RK3568?';

  assert.deepEqual(splitSettledInterviewQuestion(question), {
    firstQuestion: question,
    remainingQuestions: [],
  });
});

test('settled questions split at an obvious two-question marker', () => {
  assert.deepEqual(
    splitSettledInterviewQuestion('How would you debug Buildroot Linux boot issues on RK3568, and also how would you measure the improvement?'),
    {
      firstQuestion: 'How would you debug Buildroot Linux boot issues on RK3568',
      remainingQuestions: ['how would you measure the improvement?'],
    },
  );
});

test('settled descriptive first clauses can still split before the follow-up question', () => {
  assert.deepEqual(
    splitSettledInterviewQuestion('Describe your architecture, and also how would you test it?'),
    {
      firstQuestion: 'Describe your architecture',
      remainingQuestions: ['how would you test it?'],
    },
  );
});

test('settled questions do not split on incidental also inside a single clause', () => {
  const question = 'Could you also share how you would test it?';

  assert.deepEqual(splitSettledInterviewQuestion(question), {
    firstQuestion: question,
    remainingQuestions: [],
  });
});

test('settled questions do not split on ordinary second usage inside a single clause', () => {
  const question = 'What is the second approach?';

  assert.deepEqual(splitSettledInterviewQuestion(question), {
    firstQuestion: question,
    remainingQuestions: [],
  });
});

test('settled questions split three obvious numbered clauses', () => {
  assert.deepEqual(
    splitSettledInterviewQuestion('How would you design the service? Second, how would you test it? Third, how would you monitor it?'),
    {
      firstQuestion: 'How would you design the service?',
      remainingQuestions: ['how would you test it?', 'how would you monitor it?'],
    },
  );
});

test('settled Chinese questions split at an obvious marker', () => {
  assert.deepEqual(
    splitSettledInterviewQuestion('\u4f60\u5982\u4f55\u8bbe\u8ba1\u8fd9\u4e2a\u670d\u52a1\uff1f\u53e6\u5916\uff0c\u5982\u4f55\u6d4b\u8bd5\u5b83\uff1f'),
    {
      firstQuestion: '\u4f60\u5982\u4f55\u8bbe\u8ba1\u8fd9\u4e2a\u670d\u52a1\uff1f',
      remainingQuestions: ['\u5982\u4f55\u6d4b\u8bd5\u5b83\uff1f'],
    },
  );
});

test('low-information tails after a split marker stay with the original question', () => {
  const question = 'How would you debug Buildroot Linux boot issues on RK3568, and also thanks';

  assert.deepEqual(splitSettledInterviewQuestion(question), {
    firstQuestion: question,
    remainingQuestions: [],
  });
});

test('ordinary interview questions settle after the shorter default silence window', () => {
  assert.equal(DEFAULT_QUESTION_SETTLE_MS, 2500);
  assert.equal(EXTENDED_QUESTION_SETTLE_MS, 5000);

  const settler = createQuestionSettler();
  assert.equal(settler.pushFinalTurn({
    speaker: 'interviewer',
    text: 'How would you debug Buildroot Linux boot issues on RK3568?',
    final: true,
  }, 0), true);

  assert.equal(settler.peek().deadlineMs, 2500);
  assert.equal(settler.drain(2499), null);
  assert.equal(settler.drain(2500)?.question, 'How would you debug Buildroot Linux boot issues on RK3568?');
});

test('multi-part interview questions keep the extended silence window', () => {
  const settler = createQuestionSettler();

  assert.equal(settler.pushFinalTurn({
    speaker: 'interviewer',
    text: '你先说一下 RK3568 上 Buildroot 裁剪怎么做，另外再说一下哪些驱动会保留？',
    final: true,
  }, 0), true);

  assert.equal(settler.peek().deadlineMs, 5000);
  assert.equal(settler.drain(2500), null);
  assert.equal(settler.drain(5000)?.question, '你先说一下 RK3568 上 Buildroot 裁剪怎么做，另外再说一下哪些驱动会保留？');
});

test('traditional multi-part wording still gets the extended silence window after normalization', () => {
  const settler = createQuestionSettler();

  assert.equal(settler.pushFinalTurn({
    speaker: 'interviewer',
    text: '你會怎麼設計 Buildroot 裁剪方案，另外說一下哪些驅動會保留？',
    final: true,
  }, 0), true);

  assert.equal(settler.peek().deadlineMs, 5000);
  assert.equal(settler.drain(5000)?.question, '你會怎麼設計 Buildroot 裁剪方案，另外說一下哪些驅動會保留？');
});

test('ignored low-information tails report false and keep the original settle deadline', () => {
  const settler = createQuestionSettler();

  assert.equal(settler.pushFinalTurn({
    speaker: 'interviewer',
    text: 'How would you debug Buildroot Linux boot issues on RK3568?',
    final: true,
  }, 0), true);
  assert.equal(settler.peek().deadlineMs, 2500);

  assert.equal(settler.pushFinalTurn({
    speaker: 'interviewer',
    text: '嗯嗯',
    final: true,
  }, 4900), false);
  assert.equal(settler.peek().deadlineMs, 2500);
  assert.equal(settler.drain(5000)?.question, 'How would you debug Buildroot Linux boot issues on RK3568?');
});

test('low-information tail finals do not replace a richer pending question', () => {
  const settler = createQuestionSettler(5000);
  settler.pushFinalTurn({
    speaker: 'interviewer',
    text: '你在 RK3568 上做 Buildroot Linux 裁剪时，一般会先保留哪些组件，哪些东西会优先删掉？',
    final: true,
  }, 0);
  settler.pushFinalTurn({
    speaker: 'interviewer',
    text: '我看你 我们来看',
    final: true,
  }, 1000);

  const settled = settler.drain(5000);

  assert.equal(settled?.question, '你在 RK3568 上做 Buildroot Linux 裁剪时，一般会先保留哪些组件，哪些东西会优先删掉？');
});

test('short follow-up questions are kept with the pending question', () => {
  const settler = createQuestionSettler();
  settler.pushFinalTurn({
    speaker: 'interviewer',
    text: '你会怎么设计 Buildroot 裁剪方案？',
    final: true,
  }, 0);
  settler.pushFinalTurn({
    speaker: 'interviewer',
    text: '为什么？',
    final: true,
  }, 1000);

  assert.equal(settler.drain(2499), null);
  const settled = settler.drain(3500);

  assert.equal(settled?.question, '你会怎么设计 Buildroot 裁剪方案？ 为什么？');
});

test('short technical follow-up questions are kept with the pending question', () => {
  const settler = createQuestionSettler();
  settler.pushFinalTurn({
    speaker: 'interviewer',
    text: '如果系统启动时间比较长，你会怎么排查？',
    final: true,
  }, 0);
  settler.pushFinalTurn({
    speaker: 'interviewer',
    text: '怎么优化？',
    final: true,
  }, 1000);

  const settled = settler.drain(3500);

  assert.equal(settled?.question, '如果系统启动时间比较长，你会怎么排查？ 怎么优化？');
});

test('low-information tail after a settled question does not start a new question', () => {
  const settler = createQuestionSettler(5000);
  settler.pushFinalTurn({
    speaker: 'interviewer',
    text: '你在 RK3568 上做 Buildroot Linux 裁剪时，一般会先保留哪些组件？',
    final: true,
  }, 0);

  assert.equal(settler.drain(5000)?.question, '你在 RK3568 上做 Buildroot Linux 裁剪时，一般会先保留哪些组件？');

  settler.pushFinalTurn({
    speaker: 'interviewer',
    text: '我看你 我们来看',
    final: true,
  }, 6100);

  assert.equal(settler.drain(11100), null);
});

test('valid short follow-up after a settled question can start a new question', () => {
  const settler = createQuestionSettler(5000);
  settler.pushFinalTurn({
    speaker: 'interviewer',
    text: '你在 RK3568 上做 Buildroot Linux 裁剪时，一般会先保留哪些组件？',
    final: true,
  }, 0);
  assert.equal(settler.drain(5000)?.question, '你在 RK3568 上做 Buildroot Linux 裁剪时，一般会先保留哪些组件？');

  settler.pushFinalTurn({
    speaker: 'interviewer',
    text: '为什么？',
    final: true,
  }, 6100);

  assert.equal(settler.drain(11100)?.question, '为什么？');
});

test('repetitive hallucination tails after a settled question do not start a new question', () => {
  const settler = createQuestionSettler(5000);
  settler.pushFinalTurn({
    speaker: 'interviewer',
    text: '你在 RK3568 上做 Buildroot Linux 裁剪时，一般会先保留哪些组件？',
    final: true,
  }, 0);
  assert.equal(settler.drain(5000)?.question, '你在 RK3568 上做 Buildroot Linux 裁剪时，一般会先保留哪些组件？');

  settler.pushFinalTurn({
    speaker: 'interviewer',
    text: '我没想到我没想到我没想到我没想到我没想到我没想到我没想到我没想到',
    final: true,
  }, 6100);

  assert.equal(settler.drain(11100), null);
});

test('valid long follow-up after a settled question can start a new question', () => {
  const settler = createQuestionSettler(5000);
  settler.pushFinalTurn({
    speaker: 'interviewer',
    text: '你在 RK3568 上做 Buildroot Linux 裁剪时，一般会先保留哪些组件？',
    final: true,
  }, 0);
  assert.equal(settler.drain(5000)?.question, '你在 RK3568 上做 Buildroot Linux 裁剪时，一般会先保留哪些组件？');

  settler.pushFinalTurn({
    speaker: 'interviewer',
    text: '如果空间不够，你会怎么判断一个驱动应该编进内核、做成模块，还是直接去掉？',
    final: true,
  }, 6100);

  assert.equal(settler.drain(11100)?.question, '如果空间不够，你会怎么判断一个驱动应该编进内核、做成模块，还是直接去掉？');
});
