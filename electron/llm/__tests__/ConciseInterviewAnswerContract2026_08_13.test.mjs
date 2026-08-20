import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (rel) => fs.readFileSync(path.resolve(__dirname, rel), 'utf8');

const v2Source = read('../promptSystemV2.ts');
const sharedSource = read('../prompts.ts');
const tinySource = read('../tinyPrompts.ts');

const extract = (source, start, end) => {
  const from = source.indexOf(start);
  assert.notEqual(from, -1, `missing active contract start: ${start}`);
  const to = source.indexOf(end, from + start.length);
  assert.notEqual(to, -1, `missing active contract end: ${end}`);
  return source.slice(from, to);
};

const v2Length = extract(v2Source, '<length>', '</length>');
const sharedLength = extract(sharedSource, '<spoken_answer_length>', '</spoken_answer_length>');
const tinyLength = extract(tinySource, 'export const TINY_CORE', 'const TINY_HUMAN_VOICE');
const activeLengthContracts = [v2Length, sharedLength, tinyLength];

const speakability = await import('../../../dist-electron/electron/llm/speakability.js');
const publicLlmApi = await import('../../../dist-electron/electron/llm/index.js');
const compiledPrompts = await import('../../../dist-electron/electron/llm/prompts.js');
const compiledV2 = await import('../../../dist-electron/electron/llm/promptSystemV2.js');
const compiledTiny = await import('../../../dist-electron/electron/llm/tinyPrompts.js');

const assertNoLegacyTimingFallback = (prompt, name) => {
  assert.doesNotMatch(prompt, /\b(?:usually\s+)?2(?:\s+to\s+|-)4 sentences\b/i, `${name} retains a conflicting 2-4 sentence fallback`);
  assert.doesNotMatch(prompt, /\b3(?:\s+to\s+|-)4 sentences\b/i, `${name} retains a conflicting behavioral fallback`);
  assert.doesNotMatch(prompt, /(?:≤\s*30|under\s+30|15\s+to\s+30)\s+seconds\b/i, `${name} retains an equivalent 30-second fallback`);
  assert.doesNotMatch(prompt, /(?:~\s*45|about\s+45)\s+seconds\b/i, `${name} retains a conflicting 45-second fallback`);
};

const assertCorrectnessContract = (prompt, name) => {
  assert.match(prompt, /preserve (?:the )?evidence strength/i, `${name} may overstate evidence`);
  assert.match(prompt, /recommendation[\s\S]{0,120}\bshould\b[\s\S]{0,120}\bcould include\b/i, `${name} lost recommendation markers`);
  assert.match(prompt, /(?:not|never)[\s\S]{0,80}(?:implemented project fact|fact that the project implemented)/i, `${name} may turn recommendations into implementation claims`);
  assert.match(prompt, /explicit uncertainty[\s\S]{0,80}(?:stays|remains) uncertain/i, `${name} may erase explicit uncertainty`);
  assert.match(prompt, /derived (?:number|numeric value)[\s\S]{0,100}(?:silently )?(?:recheck|verify)[\s\S]{0,100}(?:arithmetic|calculation)[\s\S]{0,40}units?/i, `${name} lost the derived-number check`);
};

const protectedTaskIsComplete = (contract, task) => {
  const escaped = task.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const complete = '(?:complete|full|uncapped|any length)';
  return new RegExp(`(?:${escaped}[\\s\\S]{0,100}${complete}|${complete}[\\s\\S]{0,100}${escaped})`, 'i').test(contract);
};

describe('concise interview answer prompt contract', () => {
  for (const [name, contract] of [
    ['canonical v2', v2Length],
    ['shared prompts', sharedLength],
    ['tiny prompts', tinyLength],
  ]) {
    test(`${name} carries the three concise default budgets`, () => {
      assert.match(contract, /(?:simple|yes\/no|single fact|definition)[\s\S]{0,180}15(?:\s+to\s+|[-–])35 words/i);
      assert.match(contract, /normal (?:live |interview )[\s\S]{0,100}25(?:\s+to\s+|[-–])55 words/i);
      assert.match(contract, /behavioral[\s\S]{0,180}60(?:\s+to\s+|[-–])110 words/i);
      assert.match(contract, /implicit STAR/i);
      assert.match(contract, /one (?:grounded )?example/i);
      assert.match(contract, /(?:context|background)[\s\S]{0,40}(?:and |\/)?task[\s\S]{0,40}brief|brief[\s\S]{0,40}(?:context|background)[\s\S]{0,40}(?:and |\/)?task/i);
      assert.match(contract, /action[\s\S]{0,40}(?:majority|main|most)/i);
      assert.match(contract, /(?:one\s+result\s+sentence|result[\s\S]{0,30}one\s+sentence|one\s+sentence[\s\S]{0,30}result)/i);
      assertCorrectnessContract(contract, name);
    });

    test(`${name} preserves complete technical work and explicit user overrides`, () => {
      for (const protectedTask of ['code', 'algorithm', 'debugging', 'DSA', 'system design']) {
        assert.ok(protectedTaskIsComplete(contract, protectedTask), `${name}: ${protectedTask} is not adjacent to complete/full/uncapped semantics`);
      }
      assert.match(contract, /explicit/i);
      assert.match(contract, /length/i);
      assert.match(contract, /detail/i);
      assert.match(contract, /format/i);
      assert.match(contract, /override/i);
    });
  }

  test('active length contracts reject superseded default budgets', () => {
    for (const contract of activeLengthContracts) {
      assert.doesNotMatch(contract, /25(?:\s+to\s+|[-–])85 words/i);
      assert.doesNotMatch(contract, /25(?:\s+to\s+|[-–])40 words/i);
      assert.doesNotMatch(contract, /40(?:\s+to\s+|[-–])60 words/i);
      assert.doesNotMatch(contract, /100(?:\s+to\s+|[-–])180 words/i);
      assert.doesNotMatch(contract, /80(?:\s+to\s+|[-–])160 words/i);
    }
  });

  test('generic technical definitions are brief while explanations use the normal budget', () => {
    assert.match(sharedLength, /what is Redis\?[\s\S]{0,160}1 to 2 sentences[\s\S]{0,80}15 to 35 words/i);
    assert.match(sharedLength, /explain caching[\s\S]{0,160}2 to 3 sentences[\s\S]{0,80}25 to 55 words/i);
  });

  test('declared production and exported legacy spoken prompts carry the concise contract', () => {
    const productionAndExportedLegacyPrompts = [
      'GROQ_SYSTEM_PROMPT',
      'GROQ_WHAT_TO_ANSWER_PROMPT',
      'ANSWER_MODE_PROMPT',
      'WHAT_TO_ANSWER_PROMPT',
      'MODE_GENERAL_PROMPT',
      'MODE_LOOKING_FOR_WORK_PROMPT',
      'MODE_TECHNICAL_INTERVIEW_PROMPT',
      'HARD_SYSTEM_PROMPT',
      'OPENAI_SYSTEM_PROMPT',
      'OPENAI_WHAT_TO_ANSWER_PROMPT',
      'CLAUDE_SYSTEM_PROMPT',
      'CLAUDE_WHAT_TO_ANSWER_PROMPT',
      'CUSTOM_WHAT_TO_ANSWER_PROMPT',
      'CUSTOM_ANSWER_PROMPT',
      'CUSTOM_SYSTEM_PROMPT',
      'UNIVERSAL_SYSTEM_PROMPT',
      'UNIVERSAL_ANSWER_PROMPT',
      'UNIVERSAL_WHAT_TO_ANSWER_PROMPT',
    ];
    for (const name of productionAndExportedLegacyPrompts) {
      const prompt = compiledPrompts[name];
      assert.equal(typeof prompt, 'string', `${name} must be exported`);
      assert.match(prompt, /15 to 35 words/i, `${name} lost the simple budget`);
      assert.match(prompt, /25 to 55 words/i, `${name} lost the normal budget`);
      assert.match(prompt, /60 to 110 words/i, `${name} lost the behavioral budget`);
      assertNoLegacyTimingFallback(prompt, name);
    }
  });

  test('shared human contract and every spoken provider inherit the correctness guard', () => {
    assert.match(compiledPrompts.SPOKEN_ANSWER_CONTRACT, /<answer_correctness>/i);
    assertCorrectnessContract(compiledPrompts.SPOKEN_ANSWER_CONTRACT, 'SPOKEN_ANSWER_CONTRACT');
    assertCorrectnessContract(compiledPrompts.HUMAN_SPOKEN_ANSWER_CONTRACT, 'HUMAN_SPOKEN_ANSWER_CONTRACT');

    for (const name of [
      'GROQ_SYSTEM_PROMPT',
      'GROQ_WHAT_TO_ANSWER_PROMPT',
      'ANSWER_MODE_PROMPT',
      'WHAT_TO_ANSWER_PROMPT',
      'MODE_GENERAL_PROMPT',
      'MODE_LOOKING_FOR_WORK_PROMPT',
      'MODE_TECHNICAL_INTERVIEW_PROMPT',
      'HARD_SYSTEM_PROMPT',
      'OPENAI_SYSTEM_PROMPT',
      'OPENAI_WHAT_TO_ANSWER_PROMPT',
      'CLAUDE_SYSTEM_PROMPT',
      'CLAUDE_WHAT_TO_ANSWER_PROMPT',
      'CUSTOM_WHAT_TO_ANSWER_PROMPT',
      'CUSTOM_ANSWER_PROMPT',
      'UNIVERSAL_SYSTEM_PROMPT',
      'UNIVERSAL_ANSWER_PROMPT',
      'UNIVERSAL_WHAT_TO_ANSWER_PROMPT',
    ]) {
      assertCorrectnessContract(compiledPrompts[name], name);
    }
  });

  test('actual v2 composer emits concise spoken contracts and preserves coding structure', () => {
    const lookingForWork = compiledV2.buildSystemPromptV2({ mode: 'looking-for-work', action: 'answer', tier: 'cloud' });
    const technicalSpoken = compiledV2.buildSystemPromptV2({ mode: 'technical-interview', action: 'answer', tier: 'cloud' });
    const technicalCoding = compiledV2.buildSystemPromptV2({ mode: 'technical-interview', action: 'answer', tier: 'cloud', codingTask: true });

    for (const [name, prompt] of [['v2 looking-for-work answer', lookingForWork], ['v2 technical-interview answer', technicalSpoken]]) {
      assert.match(prompt, /15 to 35 words/i, `${name} lost the simple budget`);
      assert.match(prompt, /25 to 55 words/i, `${name} lost the normal budget`);
      assert.match(prompt, /60 to 110 words/i, `${name} lost the behavioral budget`);
      assertNoLegacyTimingFallback(prompt, name);
    }
    assert.match(technicalCoding, /## Approach[\s\S]*## Technique[\s\S]*## Code[\s\S]*## Dry Run[\s\S]*## Complexity/i);
    assert.match(technicalCoding, /complete|full|uncapped/i);
  });

  test('actual v2 cloud and local composers emit the correctness guard', () => {
    for (const tier of ['cloud', 'local']) {
      const prompt = compiledV2.buildSystemPromptV2({ mode: 'looking-for-work', action: 'answer', tier });
      assertCorrectnessContract(prompt, `v2 ${tier} composer`);
    }
  });

  test('reachable tiny spoken prompts inherit the tiny correctness guard', () => {
    for (const name of [
      'TINY_SYSTEM_PROMPT',
      'TINY_ANSWER_PROMPT',
      'TINY_WHAT_TO_ANSWER_PROMPT',
      'TINY_MODE_GENERAL_PROMPT',
      'TINY_MODE_LOOKING_FOR_WORK_PROMPT',
      'TINY_MODE_TECHNICAL_INTERVIEW_PROMPT',
      'TINY_MODE_SALES_PROMPT',
      'TINY_MODE_TEAM_MEET_PROMPT',
      'TINY_BRAINSTORM_PROMPT',
      'TINY_FOLLOWUP_PROMPT',
    ]) {
      assertCorrectnessContract(compiledTiny[name], name);
    }
  });

  test('explicit uncertainty overrides the legacy anti-hedging tone rule', () => {
    const execution = compiledPrompts.EXECUTION_CONTRACT;
    assert.doesNotMatch(execution, /No "maybe", "possibly", "it depends"[^\n]*take a position/i);
    assert.match(execution, /(?:ban|avoid|do not use)[^\n]{0,100}(?:unsupported|ungrounded|empty|vague)[^\n]{0,50}hedg/i);
    assert.match(execution, /(?:unconfirmed|uncertain)[^\n]{0,100}(?:preserve|state|say)[^\n]{0,80}(?:direct|plain|explicit)/i);
    assertCorrectnessContract(compiledPrompts.MODE_GENERAL_PROMPT, 'compiled legacy general prompt');
  });

  test('provider architecture guidance preserves full system-design tasks', () => {
    for (const name of [
      'OPENAI_WHAT_TO_ANSWER_PROMPT',
      'CLAUDE_WHAT_TO_ANSWER_PROMPT',
      'CUSTOM_WHAT_TO_ANSWER_PROMPT',
    ]) {
      const prompt = compiledPrompts[name];
      assert.doesNotMatch(prompt, /Architecture\s*\/\s*Design\s*(?:→|:)[^\n]{0,10}high-level approach/i, `${name} keeps the old unconditional architecture brevity override`);
      assert.doesNotMatch(prompt, /Architecture\s*:\s*High-level approach/i, `${name} keeps the old unconditional architecture concept rule`);
      assert.match(prompt, /system[- ]design task[^\n]{0,120}(?:complete|full)[^\n]{0,80}structured/i, `${name} does not protect full system-design work`);
      assert.match(prompt, /ordinary architecture concept[^\n]{0,100}high-level[^\n]{0,40}concise/i, `${name} lost the concise concept distinction`);
    }
  });

  test('tiny brevity rule cuts padding without sacrificing required completeness', () => {
    for (const name of ['TINY_SYSTEM_PROMPT', 'TINY_ANSWER_PROMPT', 'TINY_MODE_GENERAL_PROMPT']) {
      const prompt = compiledTiny[name];
      assert.doesNotMatch(prompt, /brevity beats completeness/i, `${name} still prefers brevity over correctness`);
      assert.match(prompt, /brevity beats padding[^\n]{0,50}not required completeness/i, `${name} lost the completeness-safe brevity rule`);
    }
  });

  test('grounded behavioral answers never add a coaching or quotation wrapper', () => {
    for (const [name, prompt] of [
      ['CORE_IDENTITY', compiledPrompts.CORE_IDENTITY],
      ['MODE_LOOKING_FOR_WORK_PROMPT', compiledPrompts.MODE_LOOKING_FOR_WORK_PROMPT],
    ]) {
      assert.doesNotMatch(prompt, /coaching opener first[^\n]*quoted first-person script/i, `${name} retains the contradictory wrapper rule`);
      assert.match(prompt, /grounded first-person answer only[^\n]{0,80}no coaching opener[^\n]{0,40}quotation wrapper/i, `${name} lost the wrapper-free grounded answer rule`);
    }
  });

  test('universal and tiny entry prompts reject unconditional 1-3 sentence defaults', () => {
    assert.doesNotMatch(compiledPrompts.UNIVERSAL_WHAT_TO_ANSWER_PROMPT, /simple questions?[^\n]{0,40}1-3 sentences/i);
    assert.match(compiledPrompts.UNIVERSAL_WHAT_TO_ANSWER_PROMPT, /simple questions?[^\n]{0,40}1-2 sentences/i);

    for (const name of ['TINY_SYSTEM_PROMPT', 'TINY_MODE_GENERAL_PROMPT']) {
      const prompt = compiledTiny[name];
      assert.doesNotMatch(prompt, /Non-code:\s*1-3 sentences/i, `${name} retains an unconditional non-code budget`);
      assert.doesNotMatch(prompt, /simple[^\n]{0,50}1-3 sentences/i, `${name} retains an unconditional simple-question budget`);
      assert.match(prompt, /simple yes\/no[^\n]{0,80}1-2 sentences/i, `${name} lost the simple budget`);
      assert.match(prompt, /normal live answer[^\n]{0,50}2-3 sentences/i, `${name} lost the normal budget`);
      assert.match(prompt, /code[^\n]{0,100}algorithms[^\n]{0,100}debugging[^\n]{0,100}DSA[^\n]{0,100}system design[^\n]{0,100}complete[^\n]{0,50}structured/i, `${name} lost complete structured technical work`);
    }
  });
});

describe('concise interview speakability contract', () => {
  test('answer types retain their intended shape', () => {
    assert.equal(speakability.classifyTargetSpeakability('behavioral_interview_answer', 'default', 'Tell me about a time you led a team'), 'SPOKEN_FULL');
    assert.equal(speakability.classifyTargetSpeakability('coding_question_answer', 'default', 'Implement an LRU cache'), 'STRUCTURED_FULL');
    assert.equal(speakability.classifyTargetSpeakability('debugging_question_answer', 'default', 'Debug this race condition'), 'STRUCTURED_FULL');
    assert.equal(speakability.classifyTargetSpeakability('dsa_question_answer', 'default', 'Solve two sum'), 'STRUCTURED_FULL');
    assert.equal(speakability.classifyTargetSpeakability('system_design_answer', 'default', 'Design a URL shortener'), 'STRUCTURED_FULL');
  });

  test('all spoken-short bands use the concise budgets', () => {
    const brief = speakability.shortBandTargetWords('BRIEF');
    const standard = speakability.shortBandTargetWords('STANDARD');
    const fuller = speakability.shortBandTargetWords('FULLER');
    assert.deepEqual({ min: brief.min, max: brief.max, seconds: brief.seconds }, { min: 15, max: 35, seconds: 15 });
    assert.deepEqual({ min: standard.min, max: standard.max, seconds: standard.seconds }, { min: 25, max: 55, seconds: 22 });
    assert.deepEqual({ min: fuller.min, max: fuller.max, seconds: fuller.seconds }, { min: 40, max: 55, seconds: 25 });
    assert.equal(typeof brief.guidance, 'string');
    assert.equal(typeof standard.guidance, 'string');
    assert.equal(typeof fuller.guidance, 'string');
  });

  test('legacy soft telemetry thresholds remain compatible with historical dashboards', () => {
    assert.equal(speakability.SOFT_MIN_WORDS, 45);
    assert.equal(speakability.SOFT_MAX_WORDS, 85);
    const answer = Array.from({ length: 56 }, (_, i) => `word${i}`).join(' ');
    const decision = speakability.decideSpeakability(answer, 'experience_answer', 'default', 'Tell me about your background', false);
    assert.equal(decision.target, 'SPOKEN_SHORT');
    assert.equal(decision.overSoftTarget, false);
    assert.equal(speakability.classifySpeakability(decision), 'standard');
  });

  test('behavioral answers have a 110-word soft ceiling and are never truncated', () => {
    assert.equal(speakability.BEHAVIORAL_SOFT_MAX_WORDS, 110);
    assert.equal(speakability.SPOKEN_FULL_MAX_WORDS, speakability.BEHAVIORAL_SOFT_MAX_WORDS);
    const longBehavioral = Array.from({ length: 150 }, (_, i) => `word${i}`).join(' ');
    const decision = speakability.decideSpeakability(
      longBehavioral,
      'behavioral_interview_answer',
      'default',
      'Tell me about a time you resolved a conflict',
      false,
    );
    assert.equal(decision.target, 'SPOKEN_FULL');
    assert.deepEqual(speakability.trimToSpeakable(longBehavioral, decision), {
      text: longBehavioral,
      changed: false,
    });
  });

  test('public LLM barrel exports the behavioral ceiling and deprecated alias', () => {
    assert.equal(publicLlmApi.BEHAVIORAL_SOFT_MAX_WORDS, 110);
    assert.equal(publicLlmApi.SPOKEN_FULL_MAX_WORDS, publicLlmApi.BEHAVIORAL_SOFT_MAX_WORDS);
  });
});

describe('Chinese concise band routing', () => {
  test('Chinese simple definitions and yes-no questions use the brief band', () => {
    assert.equal(speakability.classifyShortBand('experience_answer', 'default', '什么是 POSIX？'), 'BRIEF');
    assert.equal(speakability.classifyShortBand('experience_answer', 'default', '你会使用 SPI 吗？'), 'BRIEF');
    assert.equal(speakability.classifyShortBand('experience_answer', 'default', '你了解 POSIX 吗？'), 'BRIEF');
    assert.equal(speakability.classifyShortBand('experience_answer', 'default', '你用过 SPI 吗？'), 'BRIEF');
    assert.equal(speakability.classifyShortBand('experience_answer', 'default', '有没有使用过共享内存？'), 'BRIEF');
  });

  test('Chinese ordinary interview questions keep the standard band', () => {
    assert.equal(speakability.classifyShortBand('experience_answer', 'default', '请介绍一下你在项目中负责的工作。'), 'STANDARD');
    assert.equal(speakability.classifyShortBand('experience_answer', 'default', '什么是对你来说最大的挑战？'), 'STANDARD');
  });

  test('Chinese design and tradeoff questions use the fuller band', () => {
    assert.equal(speakability.classifyShortBand('experience_answer', 'default', '你会如何权衡共享内存和消息队列？'), 'FULLER');
    assert.equal(speakability.classifyShortBand('experience_answer', 'default', '这个系统你会怎么设计？'), 'FULLER');
    assert.equal(speakability.classifyShortBand('experience_answer', 'default', '这个系统你会怎样设计？'), 'FULLER');
    assert.equal(speakability.classifyShortBand('experience_answer', 'default', '谈谈你的设计思路。'), 'FULLER');
    assert.equal(speakability.classifyShortBand('experience_answer', 'default', '请说说方案取舍。'), 'FULLER');
  });

  test('Chinese explicit detail and structure requests stay full', () => {
    assert.equal(speakability.classifyTargetSpeakability('experience_answer', 'default', '请详细说明你的实现方案。'), 'STRUCTURED_FULL');
    assert.equal(speakability.classifyTargetSpeakability('experience_answer', 'default', '请分步骤解释这个算法。'), 'STRUCTURED_FULL');
    assert.equal(speakability.classifyTargetSpeakability('experience_answer', 'default', '请完整介绍一下系统设计。'), 'STRUCTURED_FULL');
  });

  test('provider-specific guidance does not force simple technical questions into the normal band', () => {
    assert.doesNotMatch(sharedSource, /simple conceptual question[^\n]*2-3 sentences/i);
    assert.doesNotMatch(tinySource, /technical question[^\n]*2-3 sentences/i);
    assert.doesNotMatch(tinySource, /concept question[^\n]*2-3 spoken sentences/i);
    assert.doesNotMatch(tinySource, /non-coding answers[^\n]*under\s+~?70 words/i);
  });
});
