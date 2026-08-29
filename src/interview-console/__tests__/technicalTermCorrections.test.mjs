import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { normalizeInterviewQuestion } from '../questionNormalization.ts';

const fixtures = JSON.parse(fs.readFileSync('scripts/__tests__/fixtures/spi-correction-fixtures.json', 'utf8'));

test('corrects the observed standalone SBI alias to the KB term SPI', () => {
  for (const fixture of fixtures.filter((item) => item.positive)) {
    const normalized = normalizeInterviewQuestion(fixture.rawTranscript);
    assert.match(normalized, /SPI/, fixture.id);
    assert.doesNotMatch(normalized, /\bSBI\b/, fixture.id);
  }
});

test('corrects only bounded uppercase acronym variants', () => {
  assert.equal(normalizeInterviewQuestion('S B I 驱动'), 'SPI 驱动');
  assert.equal(normalizeInterviewQuestion('S.P.I. 驱动'), 'SPI 驱动');
  assert.equal(normalizeInterviewQuestion('S-P-I 驱动'), 'SPI 驱动');
  assert.equal(normalizeInterviewQuestion('s b i 驱动'), 's b i 驱动');
});

test('does not rewrite observed or synthetic larger identifiers', () => {
  assert.match(normalizeInterviewQuestion(fixtures.find((item) => item.id === 'humanized-08').rawTranscript), /PUSBI/);
  assert.equal(normalizeInterviewQuestion('SPIBus 和 SBIO'), 'SPIBus 和 SBIO');
});

test('keeps canonical terms stable and normalizes every alias idempotently', () => {
  for (const value of ['SPI', 'UART', 'RK3568', 'Buildroot', 'C++', 'SBI 驱动', 'S B I 驱动', 'S.P.I. 驱动']) {
    const once = normalizeInterviewQuestion(value);
    assert.equal(normalizeInterviewQuestion(once), once, value);
  }
});

test('every correction fixture names a report, audio, and KB canonical term', () => {
  const kbText = fs.readFileSync('knowledge_source/interview_kb.jsonl', 'utf8');
  const entries = kbText.trim().split(/\r?\n/).map(JSON.parse);
  for (const fixture of fixtures) {
    assert.ok(fixture.report && fixture.audio && fixture.alias && fixture.canonical, fixture.id);
    assert.ok(entries.some((entry) => {
      const tokens = [...(entry.keywords || []), entry.title || ''];
      return tokens.some((token) => new RegExp(`(^|[^A-Za-z0-9])${fixture.canonical.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^A-Za-z0-9])`, 'i').test(token));
    }), `${fixture.canonical} must be a token in KB keywords/title`);
  }
});

test('reassembles uppercase POSIX/DMA/I2C spoken variants', () => {
  assert.equal(normalizeInterviewQuestion('P O S I X 共享内存'), 'POSIX 共享内存');
  assert.equal(normalizeInterviewQuestion('P.O.S.I.X. 共享内存'), 'POSIX 共享内存');
  assert.equal(normalizeInterviewQuestion('P-O-S-I-X 共享内存'), 'POSIX 共享内存');
  assert.equal(normalizeInterviewQuestion('D M A 通道'), 'DMA 通道');
  assert.equal(normalizeInterviewQuestion('D.M.A 通道'), 'DMA 通道');
  assert.equal(normalizeInterviewQuestion('I two C 总线'), 'I2C 总线');
  assert.equal(normalizeInterviewQuestion('I 2 C 总线'), 'I2C 总线');
});

test('leaves lowercase spaced acronyms untouched', () => {
  assert.equal(normalizeInterviewQuestion('s b i 驱动'), 's b i 驱动');
  assert.equal(normalizeInterviewQuestion('p o s i x 共享内存'), 'p o s i x 共享内存');
  assert.equal(normalizeInterviewQuestion('d m a 通道'), 'd m a 通道');
});
