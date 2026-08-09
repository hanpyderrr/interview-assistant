import test from 'node:test';
import assert from 'node:assert/strict';
import { createCandidateGenerationController } from '../candidateGeneration.ts';

test('candidate tokens are bound to their generation and stale tokens are ignored', () => {
  const controller = createCandidateGenerationController();
  controller.start({ generationId: 1, question: '如何排查 Linux 启动问题？' });
  assert.equal(controller.acceptCandidateToken({ generationId: 1, token: '先确认日志。' }), true);
  assert.equal(controller.acceptCandidateToken({ generationId: 0, token: '旧问题内容。' }), false);
  assert.equal(controller.snapshot().candidateText, '先确认日志。');
});

test('a matching final moves the active candidate into final correction', () => {
  const controller = createCandidateGenerationController();
  controller.start({ generationId: 2, question: '你会怎么优化 RK3568 启动时间？' });
  controller.acceptCandidateToken({ generationId: 2, token: '我会先定位启动阶段。' });

  const result = controller.acceptFinal({
    generationId: 2,
    question: '你会怎么优化 RK3568 的启动时间？',
  });
  assert.deepEqual(result, { accepted: true, action: 'correct' });
  assert.equal(controller.snapshot().phase, 'final-correction');
  assert.equal(controller.acceptCorrectionToken({ generationId: 2, token: '，再结合日志确认瓶颈。' }), true);
});

test('technical or structural final changes cancel the candidate and require a new generation', () => {
  const cancelled = [];
  const controller = createCandidateGenerationController({ onCancel: (generationId) => cancelled.push(generationId) });
  controller.start({ generationId: 3, question: '你会怎么优化 RK3568 启动时间？' });
  controller.acceptCandidateToken({ generationId: 3, token: '候选回答。' });

  assert.deepEqual(controller.acceptFinal({
    generationId: 3,
    question: '你会怎么裁剪 Buildroot 并保留哪些驱动？',
  }), { accepted: true, action: 'restart' });
  assert.deepEqual(cancelled, [3]);
  assert.equal(controller.snapshot().phase, 'cancelled');
});

test('stale finals cannot cancel or overwrite a newer generation', () => {
  const cancelled = [];
  const controller = createCandidateGenerationController({ onCancel: (generationId) => cancelled.push(generationId) });
  controller.start({ generationId: 4, question: '第一个问题是什么？' });
  controller.start({ generationId: 5, question: '第二个问题是什么？' });

  assert.deepEqual(controller.acceptFinal({ generationId: 4, question: '旧问题改写？' }), { accepted: false, action: 'stale' });
  assert.equal(controller.snapshot().generationId, 5);
  assert.deepEqual(cancelled, []);
});

test('low-information hallucination tails do not replace a useful candidate', () => {
  const cancelled = [];
  const controller = createCandidateGenerationController({ onCancel: (generationId) => cancelled.push(generationId) });
  controller.start({ generationId: 6, question: '你会怎么设计 Buildroot 裁剪方案并说明驱动保留策略？' });
  controller.acceptCandidateToken({ generationId: 6, token: '我会先确认裁剪边界。' });

  assert.deepEqual(controller.acceptFinal({ generationId: 6, question: '我看你 我们来看' }), { accepted: false, action: 'stale' });
  assert.equal(controller.snapshot().phase, 'candidate-stream');
  assert.deepEqual(cancelled, []);
});
