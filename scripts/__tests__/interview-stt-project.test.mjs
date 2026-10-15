import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeInterviewProfile, resolveInterviewScope, detectInterviewProjects } from '../../src/interview-console/interviewScope.ts';
import { createKbRetriever } from '../../electron/knowledge/kbRetriever.ts';
import { validateInterviewAnswerTopic } from '../../src/interview-console/answerTopicValidation.ts';

for (const role of ['ai_agent', 'embedded_linux']) {
  test(`STT can be the default project for ${role}`, () => {
    const profile = normalizeInterviewProfile({ role, defaultProjectId: 'interview_assistant' });
    assert.equal(profile.defaultProjectId, 'interview_assistant');
    assert.deepEqual(resolveInterviewScope('这个项目遇到什么难题？', profile), { projectIds: ['interview_assistant'] });
  });
}
test('explicit STT project overrides other interview defaults without generic ASR selecting it', () => {
  assert.deepEqual(resolveInterviewScope('面试助手的本地语音转文字如何工作？', {role:'embedded_linux',defaultProjectId:'tof'}), {projectIds:['interview_assistant']});
  assert.deepEqual(detectInterviewProjects('什么是语音转文字？'), []);
});
test('STT evidence can be retrieved in both roles without leaking unrelated projects', () => {
  const entries = [
    {id:'stt',content:'本地语音转文字 FunASR PCM',keywords:['语音转文字'],project_ids:['interview_assistant'],target_roles:['ai_agent','embedded_linux']},
    {id:'other',content:'本地语音转文字',keywords:['语音转文字'],project_ids:['plankiller'],target_roles:['ai_agent']},
  ];
  const kb = createKbRetriever({readFile:()=>entries.map(x=>JSON.stringify(x)).join('\n'),stat:()=>null});
  for (const role of ['ai_agent','embedded_linux']) {
    assert.deepEqual(kb.retrieve('语音转文字','fixture',5,{role,projectIds:['interview_assistant']}).matches.map(x=>x.entry.id), ['stt']);
  }
});
test('STT project facts do not leak into a different project answer', () => {
  const input = { question:'项目中的难题？', answer:'面试助手用 Paraformer 和 FunASR 处理分句转写。' };
  assert.ok(validateInterviewAnswerTopic({...input,allowedProjectIds:['plankiller']}).violations.some(v=>v.code==='project_scope_leak'));
  assert.equal(validateInterviewAnswerTopic({...input,allowedProjectIds:['interview_assistant']}).ok,true);
});
