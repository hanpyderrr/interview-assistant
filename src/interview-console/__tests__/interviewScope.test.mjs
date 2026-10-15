import test from 'node:test';
import assert from 'node:assert/strict';
import {
  INTERVIEW_PROFILE_EVENT,
  INTERVIEW_PROJECTS,
  normalizeInterviewProfile,
  loadInterviewProfile,
  saveInterviewProfile,
  detectInterviewProjects,
  resolveInterviewScope,
  interviewScopeLabel,
  suggestInterviewProfile,
} from '../interviewScope.ts';

function memoryStorage() {
  const values = new Map();
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
    _values: values,
  };
}

const EMBEDDED = { company: '', position: '', role: 'embedded_linux', defaultProjectId: 'tof' };
const AI = { company: '', position: '', role: 'ai_agent', defaultProjectId: 'genealogy_agent' };
const EMPTY = { company: '', position: '', role: '', defaultProjectId: '' };

test('self introductions use the role but project references in an introduction select the named project', () => {
  assert.deepEqual(resolveInterviewScope(
    '你好，请用一分钟做个自我介绍，重点说一下与你应聘嵌入式软件工程师相关的项目经历。',
    { ...EMBEDDED, defaultProjectId: '' }, ['tof'],
  ), { role: 'embedded_linux' });
  assert.deepEqual(resolveInterviewScope(
    '再回到你自我介绍里提到的冰体温度采集项目：STM32F767、PT1000和MAX31865之间怎么连接？',
    EMBEDDED, ['tof'],
  ), { projectIds: ['ice_temperature'] });
});

test('seven interview projects expose stable ids, labels and roles', () => {
  assert.equal(INTERVIEW_PROJECTS.length, 7);
  assert.deepEqual(INTERVIEW_PROJECTS.map(p => p.id), [
    'tof', 'ice_temperature', 'wing_icing', 'plankiller', 'career_evidence_lab', 'genealogy_agent', 'interview_assistant',
  ]);
  assert.equal(INTERVIEW_PROFILE_EVENT, 'natively-interview-profile-changed');
});

test('explicit named project overrides role and default project', () => {
  const scope = resolveInterviewScope('单光子 TOF 的采样精度怎么保证？', AI, []);
  assert.deepEqual(scope, { projectIds: ['tof'] });
  assert.equal('role' in scope, false);
  const back = resolveInterviewScope('族谱 Agent 怎么做检索？', EMBEDDED, []);
  assert.deepEqual(back, { projectIds: ['genealogy_agent'] });
});

test('explicit fog simulation names select TOF without binding generic simulation topics', () => {
  for (const question of ['透雾仿真做到哪一步了？', 'fog-lidar怎么做？', 'FOG-LIDAR-SIM做了什么？']) {
    assert.deepEqual(detectInterviewProjects(question), ['tof'], question);
    assert.deepEqual(resolveInterviewScope(question, AI, ['genealogy_agent']), { projectIds: ['tof'] }, question);
  }
  for (const question of ['仿真怎么做？', 'Mie散射是什么？', 'TCSPC是什么？', 'prefog-lidarized']) {
    assert.deepEqual(detectInterviewProjects(question), [], question);
  }
  assert.deepEqual(resolveInterviewScope('仿真怎么做？', AI, ['tof']), { role: 'ai_agent' });
  assert.deepEqual(resolveInterviewScope('仿真怎么做？', EMBEDDED, ['tof']), { role: 'embedded_linux' });
  assert.deepEqual(resolveInterviewScope('学习透雾仿真有什么心得？', AI, ['tof']), {});
  assert.deepEqual(resolveInterviewScope('先不聊技术，透雾仿真让你有什么收获？', AI, ['tof']), {});
});

test('comparison questions may name several projects', () => {
  const projects = detectInterviewProjects('对比一下机翼结冰和单光子 TOF 的调试方法');
  assert.deepEqual(projects, ['tof', 'wing_icing']);
  assert.deepEqual(resolveInterviewScope('对比机翼结冰和 PlanKiller', EMPTY, []), {
    projectIds: ['wing_icing', 'plankiller'],
  });
});

test('follow-up carries the current project, then falls back to the default project', () => {
  assert.deepEqual(resolveInterviewScope('那它的精度怎么保证？', EMBEDDED, ['wing_icing']), {
    projectIds: ['wing_icing'],
  });
  assert.deepEqual(resolveInterviewScope('那它的精度怎么保证？', EMBEDDED, []), {
    projectIds: ['tof'],
  });
});

test('independent technical question keeps only the role and never binds the default project', () => {
  assert.deepEqual(resolveInterviewScope('Redis 缓存击穿怎么解决？', AI, []), { role: 'ai_agent' });
  assert.deepEqual(resolveInterviewScope('Redis 缓存击穿怎么解决？', EMBEDDED, []), { role: 'embedded_linux' });
  assert.deepEqual(resolveInterviewScope('Redis 缓存击穿怎么解决？', EMPTY, []), {});
});

test('HR and unknown questions are not scoped at all', () => {
  assert.deepEqual(resolveInterviewScope('你最大的缺点是什么？', AI, ['genealogy_agent']), {});
  assert.deepEqual(resolveInterviewScope('讲一次你和同事发生冲突的经历', AI, []), {});
  assert.deepEqual(resolveInterviewScope('', AI, []), {});
  assert.deepEqual(resolveInterviewScope('嗯嗯', AI, []), {});
});

test('invalid current project ids are dropped', () => {
  assert.deepEqual(resolveInterviewScope('那它的精度怎么保证？', EMBEDDED, ['not_a_project']), {
    projectIds: ['tof'],
  });
  assert.deepEqual(resolveInterviewScope('那它的精度怎么保证？', EMPTY, ['not_a_project']), {});
});

test('project detection ignores generic Agent, 温度 and SPI wording', () => {
  assert.deepEqual(detectInterviewProjects('你们用的 Agent 框架怎么选？温度怎么控制？SPI 怎么配置？'), []);
  assert.deepEqual(detectInterviewProjects('unknown_project 和 inspired 都不要匹配'), []);
  assert.deepEqual(detectInterviewProjects('单光子 TOF 与 tof 只算一个项目'), ['tof']);
});

test('normalize limits text, validates the role enum and clears mismatched projects', () => {
  const normalized = normalizeInterviewProfile({
    company: '  Acme  ',
    position: 'x'.repeat(400),
    role: 'embedded_linux',
    defaultProjectId: 'genealogy_agent',
  });
  assert.equal(normalized.company, 'Acme');
  assert.equal(normalized.position.length, 200);
  assert.equal(normalized.role, 'embedded_linux');
  assert.equal(normalized.defaultProjectId, '');

  const badRole = normalizeInterviewProfile({ role: 'hacker', defaultProjectId: 'unknown' });
  assert.deepEqual(badRole, EMPTY);
  assert.deepEqual(normalizeInterviewProfile(null), EMPTY);
  assert.deepEqual(normalizeInterviewProfile({ role: 'ai_agent', defaultProjectId: 'genealogy_agent' }), {
    company: '', position: '', role: 'ai_agent', defaultProjectId: 'genealogy_agent',
  });
  // An empty role accepts every project.
  assert.equal(normalizeInterviewProfile({ role: '', defaultProjectId: 'tof' }).defaultProjectId, 'tof');
});

test('load tolerates missing, malformed and throwing storage', () => {
  assert.deepEqual(loadInterviewProfile(), EMPTY);
  const storage = memoryStorage();
  assert.deepEqual(loadInterviewProfile(storage), EMPTY);
  storage.setItem('natively.interviewConsole.profile.v1', '{not json');
  assert.deepEqual(loadInterviewProfile(storage), EMPTY);
  storage.setItem('natively.interviewConsole.profile.v1', JSON.stringify(EMBEDDED));
  assert.deepEqual(loadInterviewProfile(storage), EMBEDDED);
  const broken = { getItem() { throw Error('unavailable'); } };
  assert.deepEqual(loadInterviewProfile(broken), EMPTY);
});

test('save persists a normalized profile and reports storage failure', () => {
  const storage = memoryStorage();
  const saved = saveInterviewProfile({ ...EMBEDDED, company: ' Acme ' }, storage);
  assert.equal(saved.company, 'Acme');
  assert.deepEqual(JSON.parse(storage.getItem('natively.interviewConsole.profile.v1')), saved);
  assert.deepEqual(loadInterviewProfile(storage), saved);
  const broken = { setItem() { throw Error('unavailable'); } };
  assert.throws(() => saveInterviewProfile(EMBEDDED, broken), /unavailable/);
});

test('changing the role clears a now-mismatched default project', () => {
  const ai = normalizeInterviewProfile({ role: 'ai_agent', defaultProjectId: 'genealogy_agent' });
  assert.equal(ai.defaultProjectId, 'genealogy_agent');
  const switched = normalizeInterviewProfile({ ...ai, role: 'embedded_linux' });
  assert.equal(switched.defaultProjectId, '');
  assert.equal(normalizeInterviewProfile({ ...ai, role: '' }).defaultProjectId, 'genealogy_agent');
});

test('scope labels are human readable and unscoped means unconstrained', () => {
  assert.equal(interviewScopeLabel({}), '未限定');
  assert.equal(interviewScopeLabel({ role: 'ai_agent' }), 'AI / Agent');
  assert.equal(interviewScopeLabel({ role: 'embedded_linux' }), '嵌入式 / Linux');
  assert.equal(interviewScopeLabel({ projectIds: ['tof'] }), '单光子 TOF');
  assert.equal(interviewScopeLabel({ role: 'embedded_linux', projectIds: ['tof', 'wing_icing'] }), '单光子 TOF、机翼结冰 · 嵌入式 / Linux');
  assert.equal(interviewScopeLabel({ projectIds: ['not_a_project'] }), '未限定');
});

test('suggestions are deterministic, never invent a company and never auto-save', () => {
  const suggested = suggestInterviewProfile('公司：字节跳动\n岗位：嵌入式软件工程师\n主讲项目：单光子 TOF');
  assert.equal(suggested.company, '字节跳动');
  assert.equal(suggested.position, '嵌入式软件工程师');
  assert.equal(suggested.role, 'embedded_linux');
  assert.equal(suggested.defaultProjectId, 'tof');
  const empty = suggestInterviewProfile('我平时做了一些项目，喜欢折腾。');
  assert.equal(empty.company, '');
  assert.equal(empty.position, '');
  assert.equal(empty.role, '');
  assert.equal(empty.defaultProjectId, '');
  const ai = suggestInterviewProfile('方向：AI 应用\n默认主讲项目：族谱 Agent');
  assert.equal(ai.role, 'ai_agent');
  assert.equal(ai.defaultProjectId, 'genealogy_agent');
  assert.equal(ai.company, '');
});
