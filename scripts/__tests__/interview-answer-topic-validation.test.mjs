import test from 'node:test';
import assert from 'node:assert/strict';

import {
  validateInterviewAnswerTopic,
} from '../../src/interview-console/answerTopicValidation.ts';

// Table-driven cases. Each case documents the exact, stable violation codes a
// caller can rely on. Codes:
//   technical_topic_leak        -> off-topic technical/project content
//   unsupported_personal_claim  -> invented personal-life fact without evidence
//   missing_draft_label         -> personal content not marked as a reference draft
const CASES = [
  // --- technical_topic_leak: explicit "先不聊技术" revokes technical content.
  {
    name: 'negated technical + database term leaks',
    question: '先不聊技术，说说你最近在读什么书。',
    answer: '我最近在读一本关于数据库原理的书。',
    codes: ['technical_topic_leak'],
  },
  {
    name: 'negated technical + algorithm term leaks',
    question: '先不聊技术，聊聊你的周末。',
    answer: '周末我会花时间刷几道算法题。',
    codes: ['technical_topic_leak'],
  },
  {
    name: '咱们不谈技术 + embedded term leaks',
    question: '咱们不谈技术，说说你最近的状态。',
    answer: '最近在嵌入式方向做了一些尝试。',
    codes: ['technical_topic_leak'],
  },
  {
    name: 'negated technical + TOF/single-photon terms leak',
    question: '先不聊技术，说说你在学什么。',
    answer: '最近在看单光子探测和 TOF 相关资料。',
    codes: ['technical_topic_leak'],
  },

  // --- technical_topic_leak: interest questions must not promote tech projects to hobbies.
  {
    name: 'hobby question answered with a technical project leaks',
    question: '你有什么兴趣爱好？',
    answer: '我业余时间都在做数据库项目。',
    codes: ['technical_topic_leak'],
  },

  // --- technical_topic_leak: personal/HR questions with no technical evidence.
  {
    name: 'personal strength question answered with code leaks',
    question: '你最大的优点是什么？',
    answer: '学习能力强，能快速读懂代码并复用。',
    codes: ['technical_topic_leak'],
  },
  {
    name: 'overtime question answered with project/deploy leaks',
    question: '你怎么看待加班？',
    answer: '如果是为了赶项目上线，我可以配合。',
    codes: ['technical_topic_leak'],
  },
  {
    name: 'behavioral question answered with an unrelated technical detour leaks',
    question: '和同学发生分歧时你会怎么办？',
    answer: '我会重点讲数据库项目的索引和缓存设计。',
    codes: ['technical_topic_leak'],
  },

  // --- combined: leak plus invented hobby asserted as fact.
  {
    name: 'negated technical hobby answer leaks and invents a personal fact',
    question: '先不聊技术，聊聊你的爱好。',
    answer: '我喜欢跑步，也喜欢研究算法。',
    codes: ['missing_draft_label', 'technical_topic_leak', 'unsupported_personal_claim'],
  },

  // --- unsupported_personal_claim + missing_draft_label (no personal evidence).
  {
    name: 'hobby stated as fact without evidence',
    question: '你平时有什么兴趣爱好？',
    answer: '我平时喜欢跑步，也喜欢打游戏。',
    codes: ['missing_draft_label', 'unsupported_personal_claim'],
  },
  {
    name: 'habit stated as fact without evidence',
    question: '工作压力大的时候你怎么调节？',
    answer: '我经常熬夜打游戏来解压。',
    codes: ['missing_draft_label', 'unsupported_personal_claim'],
  },
  {
    name: 'team conflict stated as fact without evidence',
    question: '当你和同事有冲突时怎么处理？',
    answer: '我和同事曾经发生过冲突，后来主动沟通解决了。',
    codes: ['missing_draft_label', 'unsupported_personal_claim'],
  },
  {
    name: 'past failure stated as fact without evidence',
    question: '说一次你的失败经历。',
    answer: '我大学时经历过一次比赛失败。',
    codes: ['missing_draft_label', 'unsupported_personal_claim'],
  },

  // --- missing_draft_label only: self-description that still needs a draft label.
  {
    name: 'self-description needs a draft label',
    question: '你最大的优点是什么？',
    answer: '我是一个做事细心、抗压能力强的人。',
    codes: ['missing_draft_label'],
  },

  // --- negatives: no violations.
  {
    name: 'plain collaboration style is fine',
    question: '你平时如何协作？',
    answer: '我一般会先对齐目标，再同步进度。',
    codes: [],
  },
  {
    name: 'labeled reference draft is accepted',
    question: '你和同事有过冲突吗？',
    answer: '参考表达：可以说一次和同事意见不一致的小事，再讲你的处理方式。',
    codes: [],
  },
  {
    name: 'behavioral claim backed by personal evidence is accepted',
    question: '说一次你的失败经历。',
    answer: '我大学时经历过一次比赛失败，之后复盘了原因。',
    hasRelevantPersonalEvidence: true,
    codes: [],
  },
  {
    name: 'hobby claim backed by personal evidence is accepted',
    question: '你平时有什么兴趣爱好？',
    answer: '我平时喜欢跑步，每周三次。',
    hasRelevantPersonalEvidence: true,
    codes: [],
  },

  // --- technical / project / mixed / follow_up answers may contain technical content.
  {
    name: 'ADC explanation must not be rejected by the HR topic guard',
    question: 'ADC采样精度受哪些因素影响',
    answer: '参考电压、输入噪声和采样时间都会影响精度。嵌入式系统里还要注意信号源阻抗与采样电容的充电时间。',
    codes: [],
  },
  {
    name: 'technical question with technical answer is fine',
    question: '讲讲数据库索引的底层原理。',
    answer: '索引本质是 B+ 树，能减少随机 IO。',
    codes: [],
  },
  {
    name: 'project question with project detail is fine',
    question: '介绍一下你负责的订单项目。',
    answer: '我在项目里负责订单模块，用 Redis 缓存把接口 QPS 提升了三倍。',
    codes: [],
  },
  {
    name: 'mixed question with technical and team content is fine',
    question: '这个技术方案的架构原理是什么？另外团队是怎么沟通推进的？',
    answer: '我们先对齐架构，再按模块推进，每天同步风险。',
    codes: [],
  },
  {
    name: 'follow-up may carry the previous technical topic',
    question: '那为什么？',
    answer: '因为数据库索引能明显降低查询延迟。',
    codes: [],
  },
  {
    name: 'a draft ending on a dangling connective is incomplete',
    question: '为什么族谱项目要拆分多个 Agent？',
    answer: '这样可以重新运行模型，又不',
    codes: ['incomplete_answer'],
  },

  // --- tech motivation/advantage questions must not be false positives.
  {
    name: 'why choose a technical career may contain technical words',
    question: '你为什么选择技术这一行？',
    answer: '因为喜欢用技术解决实际问题，也享受持续学习。',
    codes: [],
  },
  {
    name: 'greatest technical strength may contain technical words',
    question: '你最大的技术优势是什么？',
    answer: '我最大的技术优势是数据库调优和系统设计。',
    codes: [],
  },
  {
    name: 'view on the tech industry may contain technical words',
    question: '你怎么看技术行业的发展？',
    answer: '技术会持续渗透各行各业，架构也会不断演进。',
    codes: [],
  },

  // --- route override and defensive input handling.
  {
    name: 'explicit route allowing technical evidence suppresses the leak',
    question: '你怎么看待加班？',
    answer: '必要时可以为项目上线多投入一些时间。',
    route: {
      intent: 'personal',
      carryPreviousTopic: false,
      allowTechnicalEvidence: true,
      allowPersonalEvidence: true,
    },
    codes: [],
  },
  {
    name: 'empty answer is trivially valid',
    question: '你最大的优点是什么？',
    answer: '',
    codes: [],
  },
  {
    name: 'non-string answer is trivially valid',
    question: '你最大的优点是什么？',
    answer: null,
    codes: [],
  },
  {
    name: 'unknown is not evidence of a personal topic or technical leak',
    question: 'zorbax的含义是什么？',
    answer: '如果你指的是数据库工具，请补充具体名称。',
    codes: [],
  },
];

test('table-driven topic validation covers at least 25 positive and negative cases', () => {
  assert.ok(CASES.length >= 25, `expected >= 25 cases, got ${CASES.length}`);

  for (const testCase of CASES) {
    const input = {
      question: testCase.question,
      answer: testCase.answer,
    };
    if (testCase.route) input.route = testCase.route;
    if (testCase.hasRelevantPersonalEvidence !== undefined) {
      input.hasRelevantPersonalEvidence = testCase.hasRelevantPersonalEvidence;
    }

    const result = validateInterviewAnswerTopic(input);
    const codes = result.violations.map((violation) => violation.code).sort();

    assert.deepEqual(
      codes,
      [...testCase.codes].sort(),
      `${testCase.name}: unexpected violations for answer "${testCase.answer}"`,
    );
    assert.equal(
      result.ok,
      testCase.codes.length === 0,
      `${testCase.name}: ok must mirror the absence of violations`,
    );
    assert.equal(
      new Set(codes).size,
      codes.length,
      `${testCase.name}: codes must be deduplicated`,
    );

    for (const violation of result.violations) {
      assert.equal(typeof violation.code, 'string', testCase.name);
      assert.ok(violation.message.length > 0, `${testCase.name}: message must not be empty`);
    }
  }
});

test('exposed violation codes are stable', () => {
  const result = validateInterviewAnswerTopic({
    question: '先不聊技术，聊聊你的爱好。',
    answer: '我喜欢跑步，也喜欢研究算法。',
  });

  const codes = new Set(result.violations.map((violation) => violation.code));
  assert.ok(codes.has('technical_topic_leak'));
  assert.ok(codes.has('unsupported_personal_claim'));
  assert.ok(codes.has('missing_draft_label'));
});

test('validation is pure and does not mutate its input', () => {
  const route = {
    intent: 'personal',
    carryPreviousTopic: false,
    allowTechnicalEvidence: false,
    allowPersonalEvidence: true,
  };
  const input = {
    question: '你平时有什么兴趣爱好？',
    answer: '我平时喜欢跑步。',
    route,
    hasRelevantPersonalEvidence: false,
  };
  const snapshot = structuredClone(input);

  const first = validateInterviewAnswerTopic(input);
  const second = validateInterviewAnswerTopic(input);

  assert.deepEqual(first, second);
  assert.deepEqual(input, snapshot);
});


test('rejects a sentence cut off at a standalone classification verb', () => {
 const bad=validateInterviewAnswerTopic({question:'你平时有什么兴趣爱好？',answer:'参考表达：周末偶尔做饭，算'});
 assert.ok(bad.violations.some(v=>v.code==='incomplete_answer'));
 const complete=validateInterviewAnswerTopic({question:'费用怎么算？',answer:'费用按天算'});
 assert.ok(!complete.violations.some(v=>v.code==='incomplete_answer'));
});
