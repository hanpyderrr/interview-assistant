import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateTechnicalTermFixtures } from '../evaluate-technical-term-corrections.mjs';

test('corrects four SPI aliases and preserves an embedded negative case deterministically', () => {
  const fixtures = [
    { id: 'spi-1', positive: true, rawTranscript: 'SBI 帧同步', alias: 'SBI', canonical: 'SPI', baselineTop1: 'fixture.spi' },
    { id: 'spi-2', positive: true, rawTranscript: 'SBI 传输方式', alias: 'SBI', canonical: 'SPI', baselineTop1: 'fixture.spi' },
    { id: 'spi-3', positive: true, rawTranscript: 'SBI 校验机制', alias: 'SBI', canonical: 'SPI', baselineTop1: 'fixture.spi' },
    { id: 'spi-4', positive: true, rawTranscript: 'SBI 总线驱动', alias: 'SBI', canonical: 'SPI', baselineTop1: 'fixture.spi' },
    { id: 'pusbi', positive: false, rawTranscript: 'PUSBI 接口', alias: 'PUSBI', canonical: 'SPI', baselineTop1: 'fixture.pusbi' },
  ];
  const entries = [
    { id: 'fixture.spi', title: '串行外设接口', content: '同步串行总线的通用说明。', keywords: ['SPI'] },
    { id: 'fixture.pusbi', title: '负例占位接口', content: '用于确认嵌入 token 不被改写。', keywords: ['PUSBI'] },
  ];
  const result = evaluateTechnicalTermFixtures(fixtures, entries);

  assert.equal(result.fixtureCount, 5);
  assert.equal(result.summary.positiveCorrectedCount, 4);
  assert.equal(result.summary.remainingPositiveAliasCount, 0);
  assert.equal(result.summary.negativeAliasesPreserved, 1);
  assert.equal(result.summary.top1MatchesFixtureBaseline, 5);
  assert.deepEqual(result, evaluateTechnicalTermFixtures(fixtures, entries));
});
