// electron/llm/__tests__/InterviewHumanFeel2026_06_15.test.mjs
//
// Property tests for the SPOKEN_ANSWER_CONTRACT length/human-feel block and its composition
// into the spoken modes (spoken-answer-quality sprint). Structural assertions on the prompt
// strings — no fixed answers, no profile facts.

import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import * as prompts from '../../../dist-electron/electron/llm/prompts.js';

describe('SPOKEN_ANSWER_CONTRACT — content (3-tier model)', () => {
  test('states the concise simple and normal live budgets', () => {
    const c = prompts.SPOKEN_ANSWER_CONTRACT;
    assert.ok(typeof c === 'string' && c.length > 200);
    assert.match(c, /15 to 35 words/);
    assert.match(c, /25 to 55 words/);
    assert.match(c, /shortest complete answer|pick the shortest/i);
  });

  test('teaches the three tiers (SPOKEN_SHORT / SPOKEN_FULL / STRUCTURED_FULL)', () => {
    const c = prompts.SPOKEN_ANSWER_CONTRACT;
    assert.match(c, /SPOKEN_SHORT/);
    assert.match(c, /SPOKEN_FULL/);
    assert.match(c, /STRUCTURED_FULL/);
  });

  test('states the PRINCIPLE (not a fixed exception list)', () => {
    // Longer is allowed whenever brevity would make the answer incomplete/misleading/unsafe/unusable.
    assert.match(prompts.SPOKEN_ANSWER_CONTRACT, /incomplete,?\s+misleading,?\s+unsafe,?\s+or\s+unusable/i);
  });

  test('SPOKEN_FULL names the cases that need more room (negotiation / tradeoff / ethical / behavioral)', () => {
    const c = prompts.SPOKEN_ANSWER_CONTRACT.toLowerCase();
    assert.match(c, /60 to 110 words/);
    assert.match(c, /one grounded example with implicit STAR/i);
    // at least the safety + negotiation + tradeoff signals are named
    assert.ok(/negotiation|salary/.test(c));
    assert.ok(/ethical|safety|caveat/.test(c));
    assert.ok(/tradeoff|trade-off|comparison/.test(c));
  });

  test('STRUCTURED_FULL names the structured shapes (code / system design / step-by-step / notes)', () => {
    const c = prompts.SPOKEN_ANSWER_CONTRACT.toLowerCase().replace(/\s+/g, ' ');
    for (const ex of ['code', 'system design', 'step-by-step']) {
      assert.ok(c.includes(ex), `STRUCTURED_FULL must name "${ex}"`);
    }
    assert.ok(/notes/.test(c));
  });

  test('gives a decision order, default-short, when-unsure-shorter', () => {
    const c = prompts.SPOKEN_ANSWER_CONTRACT.toLowerCase();
    assert.match(c, /decision order/);
    assert.match(c, /default to spoken_short|default to .*short/);
    assert.match(c, /unsure.*shorter|choose the shorter/);
  });

  test('handles "one sentence" and "shorter" requests', () => {
    const c = prompts.SPOKEN_ANSWER_CONTRACT;
    assert.match(c, /one sentence|one line/i);
    assert.match(c, /shorter/i);
    assert.match(c, /40 percent/);
  });

  test('tells the model to give the spoken words, not an explanation about them', () => {
    assert.match(prompts.SPOKEN_ANSWER_CONTRACT, /EXACT words the user will read aloud|never a description of what they could say/i);
  });

  test('suggests natural openers without forcing them', () => {
    const c = prompts.SPOKEN_ANSWER_CONTRACT;
    assert.match(c, /useful part|honest gap|I'd be upfront|What I can bring/i);
    assert.match(c, /do NOT force them|Vary the opening/i);
  });

  test('generic tech question rule: short interview answer, not a tutorial', () => {
    assert.match(prompts.SPOKEN_ANSWER_CONTRACT, /generic technical (?:question|definition|explanation).*tutorial|not a tutorial/is);
  });

  test('carries no profile facts (style-only)', () => {
    assert.doesNotMatch(prompts.SPOKEN_ANSWER_CONTRACT, /\bEvin\b|\bNatively\b|PriceX|resume says/i);
  });
});

describe('SPOKEN_ANSWER_CONTRACT composes into the spoken modes', () => {
  const SPOKEN = [
    'MODE_LOOKING_FOR_WORK_PROMPT', 'WHAT_TO_ANSWER_PROMPT', 'ANSWER_MODE_PROMPT',
    'MODE_SALES_PROMPT', 'MODE_TECHNICAL_INTERVIEW_PROMPT',
    'GROQ_SYSTEM_PROMPT', 'GROQ_WHAT_TO_ANSWER_PROMPT',
    'CUSTOM_SYSTEM_PROMPT', 'CUSTOM_WHAT_TO_ANSWER_PROMPT',
  ];
  for (const name of SPOKEN) {
    test(`${name} carries the length block`, () => {
      assert.ok(prompts[name].includes('<spoken_answer_length>'), `${name} missing the length contract`);
    });
  }

  const NON_SPOKEN = ['MODE_LECTURE_PROMPT', 'GROQ_RECAP_PROMPT', 'GROQ_SUMMARY_JSON_PROMPT'];
  for (const name of NON_SPOKEN) {
    test(`${name} does NOT carry the length block`, () => {
      assert.ok(!prompts[name].includes('<spoken_answer_length>'), `${name} must not carry the spoken length contract`);
    });
  }

  test('dedup invariant still holds (length block sits after the shared prefix)', () => {
    assert.ok(prompts.MODE_LOOKING_FOR_WORK_PROMPT.startsWith(prompts.SHARED_MODE_PREFIX));
    assert.equal((prompts.MODE_LOOKING_FOR_WORK_PROMPT.match(/<spoken_answer_length>/g) || []).length, 1);
  });
});
