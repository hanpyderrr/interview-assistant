import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeInterviewQuestion } from '../questionNormalization.ts';

test('normalizes common traditional Chinese interview wording without changing meaning', () => {
  assert.equal(
    normalizeInterviewQuestion('你會怎麼設計 Buildroot 裁剪方案，另外說一下哪些驅動會保留？'),
    '你会怎么设计 Buildroot 裁剪方案，另外说一下哪些驱动会保留？',
  );
});

test('normalizes technical transcription variants for retrieval', () => {
  assert.equal(
    normalizeInterviewQuestion('RK 3568 上的 build root 啟動時間怎麼優化？'),
    'RK3568 上的 Buildroot 启动时间怎么优化？',
  );
  assert.equal(normalizeInterviewQuestion('c ++ 多线程问题怎么排查？'), 'C++ 多线程问题怎么排查？');
});

test('keeps empty and already normalized questions stable', () => {
  assert.equal(normalizeInterviewQuestion('  '), '');
  assert.equal(normalizeInterviewQuestion('How would you debug Linux boot issues?'), 'How would you debug Linux boot issues?');
});

test('converts traditional Chinese without rewriting Latin technical terms', () => {
  // SBI is intentionally rewritten to SPI now; use an uncorrected term here.
  assert.equal(normalizeInterviewQuestion('我們聊一下 OpenGL 驅動怎麼設計'), '我们聊一下 OpenGL 驱动怎么设计');
});

test('converts Taiwan and Hong Kong traditional forms without localizing vocabulary', () => {
  assert.equal(
    normalizeInterviewQuestion('請介紹臺灣軟體團隊如何設計 RK3568 網路連線與 Buildroot 驅動'),
    '请介绍台湾软体团队如何设计 RK3568 网路连线与 Buildroot 驱动',
  );
});


test('corrects observed converter homophones only with electrical sampling context', () => {
  assert.equal(normalizeInterviewQuestion('学习魔术转换压力大吗？另外采样精度受哪些因素影响？'), '学习模数转换压力大吗？另外采样精度受哪些因素影响？');
  assert.equal(normalizeInterviewQuestion('魔术转换时怎样让观众看不出破绽？'), '魔术转换时怎样让观众看不出破绽？');
});

test('corrects DNA to DMA only in peripheral troubleshooting without biology context', () => {
  assert.equal(normalizeInterviewQuestion('外设丢数据要检查中断dna时序还是电源？'), '外设丢数据要检查中断DMA时序还是电源？');
  for (const q of ['DNA复制原理是什么？', 'DNA序列采样如何保证精度？', 'DNA测序设备外设丢数据如何排查中断？', '解释cDNA与DNA的区别']) {
    assert.equal(normalizeInterviewQuestion(q), q);
  }
});
