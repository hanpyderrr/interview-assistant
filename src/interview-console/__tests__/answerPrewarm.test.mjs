import test from 'node:test';
import assert from 'node:assert/strict';
import { createAnswerPrewarmCache } from '../answerPrewarm.ts';
import { normalizeInterviewQuestion } from '../questionNormalization.ts';

test('deduplicates prewarm work for the same normalized question and context', async () => {
  let calls = 0;
  const cache = createAnswerPrewarmCache(async (question) => {
    calls += 1;
    return { success: true, context: `context:${question}`, matches: [] };
  });

  const first = cache.prewarm('  How  do I debug Linux? ', 'prior answer');
  const second = cache.prewarm('How do I debug Linux?', 'prior answer');

  assert.strictEqual(first, second);
  const result = await first;
  assert.equal(calls, 1);
  assert.match(result.prompt, /How do I debug Linux\?/);
  assert.doesNotMatch(result.prompt, /prior answer/); // Independent questions do not inherit the prior topic.
});

test('does not consume prewarm work when question or context changes', async () => {
  const cache = createAnswerPrewarmCache(async (question) => ({
    success: true,
    context: `context:${question}`,
    matches: [],
  }));

  cache.prewarm('first question?', 'context A');
  await assert.rejects(cache.consume('second question?', 'context A'), /no prewarm/i);
  await assert.rejects(cache.consume('first question?', 'context B'), /no prewarm/i);
});

test('consuming a matching prewarm removes it from the cache', async () => {
  const cache = createAnswerPrewarmCache(async (question) => ({
    success: true,
    context: `context:${question}`,
    matches: [],
  }));

  const prewarmed = cache.prewarm('question?', 'context');
  const consumed = await cache.consume('question?', 'context');
  assert.strictEqual(await consumed, await prewarmed);
  await assert.rejects(cache.consume('question?', 'context'), /no prewarm/i);
});

test('raw SBI prewarm is consumed by its normalized SPI analysis question', async () => {
  const cache = createAnswerPrewarmCache(async (question) => ({
    success: true,
    context: `context:${question}`,
    matches: [],
  }));

  const rawQuestion = 'SBI 驱动怎么设计？';
  const prewarmed = cache.prewarm(rawQuestion, 'context');
  const consumed = await cache.consume(normalizeInterviewQuestion(rawQuestion), 'context');

  assert.strictEqual(await consumed, await prewarmed);
  assert.match((await consumed).context, /SPI/);
});

test('answer level is part of the prewarm cache identity and prompt', async () => {
  const cache = createAnswerPrewarmCache(async (question) => ({
    success: true,
    context: `context:${question}`,
    matches: [],
  }));

  const student = cache.prewarm('什么是 RAG？', 'context', 'student');
  const sameStudent = cache.prewarm('什么是 RAG？', 'context', 'student');
  assert.strictEqual(student, sameStudent);

  const senior = cache.prewarm('什么是 RAG？', 'context', 'senior');
  assert.notStrictEqual(student, senior);
  await assert.rejects(cache.consume('什么是 RAG？', 'context', 'student'), /no prewarm/i);
  const consumedSenior = await cache.consume('什么是 RAG？', 'context', 'senior');
  await assert.rejects(student, /prewarm superseded/i);
  assert.match(consumedSenior.prompt, /高级工程师/);
});

test('clear invalidates an in-flight prewarm before it can revive an old answer level', async () => {
  let releaseRetrieval;
  const cache = createAnswerPrewarmCache(() => new Promise((resolve) => {
    releaseRetrieval = resolve;
  }));

  const staleStudent = cache.prewarm('如何设计 RAG？', 'context', 'student');
  cache.clear();
  releaseRetrieval({ success: true, context: 'old student context', matches: [] });

  await assert.rejects(staleStudent, /prewarm superseded/i);
  await assert.rejects(cache.consume('如何设计 RAG？', 'context', 'student'), /no prewarm/i);
});

test('English prewarm cannot be consumed as a Chinese answer', async () => {
  const cache = createAnswerPrewarmCache(async () => ({ success: true, context: 'example' }));
  await cache.prewarm('What is RAG?', '', 'student', true);
  await assert.rejects(cache.consume('What is RAG?', '', 'student', false), /no prewarm/);
  const result = await cache.consume('What is RAG?', '', 'student', true);
  assert.match(result.prompt, /OUTPUT LANGUAGE: English/);
});

test('role and selected project isolate retrieval and cache identity', async () => {
  const calls=[];
  const cache=createAnswerPrewarmCache(async(q,scope)=>{calls.push({q,scope});return {success:true,context:'项目资料',matches:[]}});
  const ai={company:'示例',position:'AI',role:'ai_agent',defaultProjectId:'plankiller'};
  const embedded={...ai,role:'embedded_linux',defaultProjectId:'tof'};
  const first=await cache.prewarm('项目中有什么难题？','','student',false,'',ai);
  assert.deepEqual(first.scope,{projectIds:['plankiller']});
  await assert.rejects(cache.consume('项目中有什么难题？','','student',false,'',embedded),/no prewarm/);
  await cache.prewarm('项目中有什么难题？','','student',false,'',embedded);
  assert.deepEqual(calls.map(x=>x.scope.projectIds),[['plankiller'],['tof']]);
});

test('anchored follow-up retrieves only the carried project',async()=>{
 const calls=[];
 const cache=createAnswerPrewarmCache(async(q,scope)=>{calls.push({q,scope});return {success:true,context:'族谱资料',matches:[]}});
 const result=await cache.prewarm('后来怎么解决的？','','student',false,'',{company:'',position:'',role:'embedded_linux',defaultProjectId:'tof'},['genealogy_agent']);
 assert.deepEqual(result.scope,{projectIds:['genealogy_agent']});
 assert.equal(calls.length,1); assert.equal(calls[0].q,'后来怎么解决的？');
});

test('optical simulation questions reach knowledge retrieval instead of the unknown shortcut', async () => {
  const questions = [
    '什么是Mie散射', '什么是TCSPC', '蒙特卡罗路径数等于实际发射光子数吗',
    '独立帧确证是怎么避免选择偏差的', '水雾256批以后已经收敛了吗', '为什么点云不能补全背面',
  ];
  const calls = [];
  const cache = createAnswerPrewarmCache(async (question, scope) => {
    calls.push({ question, scope });
    return { success: true, context: '透雾仿真知识', matches: [] };
  });
  for (const question of questions) await cache.prewarm(question, '');
  assert.equal(calls.length, questions.length);
  assert.ok(calls.every(call => !call.scope?.projectIds));
  const profile = { company: '', position: '', role: '', defaultProjectId: '' };
  await cache.prewarm('透雾仿真做到哪一步了？', '', 'student', false, '', profile);
  assert.deepEqual(calls.at(-1).scope, { projectIds: ['tof'] });
});

test('technical project references reach retrieval and preserve dialogue without contaminating HR', async () => {
  const calls = [];
  const cache = createAnswerPrewarmCache(async (question, scope) => {
    calls.push({ question, scope });
    return { success: true, context: '已确认的接口和阶段性验证记录', matches: [] };
  });
  const profile = { company: '', position: '嵌入式软件工程师', role: 'embedded_linux', defaultProjectId: 'tof' };
  for (const question of [
    '为什么不直接在RK3568上采集相机并计算深度，而是多加一台N97？这套双平台设计解决了什么限制，又增加了什么代价？',
    '你说RK3568是从机，是直接使用RK的原生SPI控制器，还是中间有适配设备？另外刚才的表述像是只有v2带CRC，v1也有CRC校验吗？请按实际实现确认。',
    '你说改成双路同源外触发后复测通过。请具体说通过是看到了哪些现象或指标？如何证明两路同步正常，而不是仅仅SDK函数返回成功？没有实测记录的数值不要补。',
  ]) {
    const result = await cache.prewarm(question, 'Candidate: 上一轮项目回答。', 'mid', false, '', profile, ['tof']);
    assert.deepEqual(result.scope, { projectIds: ['tof'] });
    assert.equal(calls.at(-1).scope.projectIds[0], 'tof');
    assert.match(result.prompt, /上一轮项目回答/);
  }
  assert.equal(calls.length, 3);
  const hr = await cache.prewarm('那你上学累不累？', 'Candidate: 上一轮项目回答。', 'mid', false, '', profile, ['tof']);
  assert.deepEqual(hr.scope, {});
  assert.equal(calls.length, 3);
  assert.doesNotMatch(hr.prompt, /上一轮项目回答/);
});
