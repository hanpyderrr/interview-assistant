import test from 'node:test'
import assert from 'node:assert/strict'

import { createCandidateSpeechCleanupCoordinator } from '../candidateSpeechCleanup.ts'

const interviewer = (text) => ({ speaker: 'interviewer', text, final: true })
const user = (text) => ({ speaker: 'user', text, final: true })

test('consecutive candidate finals are merged and cleaned once', async () => {
  const calls = []
  const coordinator = createCandidateSpeechCleanupCoordinator({
    cleanup: async (text) => { calls.push(text); return { status: 'cleaned', text: '整理后的回答' } },
  })
  const turns = [interviewer('问题'), user('第一段回答内容比较长，'), user('第二段继续说明实现细节。')]
  coordinator.observe(turns, true)
  const built = await coordinator.buildContextTurns(turns, true, 30)
  assert.deepEqual(calls, ['第一段回答内容比较长， 第二段继续说明实现细节。'])
  assert.deepEqual(built.map((turn) => turn.text), ['问题', '整理后的回答'])
})

test('the prior candidate block is cleaned after the next interviewer question arrives', async () => {
  const coordinator = createCandidateSpeechCleanupCoordinator({
    cleanup: async () => ({ status: 'cleaned', text: '整理后的上一轮回答' }),
  })
  const beforeQuestion = [interviewer('问题一'), user('这是一段足够长的上一轮候选人回答，需要后台整理。')]
  coordinator.observe(beforeQuestion, true)
  const turns = [...beforeQuestion, interviewer('问题二')]
  const built = await coordinator.buildContextTurns(turns, true, 30)
  assert.deepEqual(built.map((turn) => turn.text), ['问题一', '整理后的上一轮回答', '问题二'])
})

test('disabled and short candidate speech never call the cleanup service', async () => {
  let calls = 0
  const coordinator = createCandidateSpeechCleanupCoordinator({ cleanup: async () => { calls += 1; return { status: 'cleaned', text: 'x' } } })
  coordinator.observe([interviewer('问题'), user('很短')], true)
  coordinator.observe([interviewer('问题'), user('这是一段足够长但开关已经关闭的候选人回答。')], false)
  assert.equal(calls, 0)
})

test('a newer short candidate block invalidates an older pending cleanup', async () => {
  let resolveOlder
  const statuses = []
  let cancellations = 0
  const coordinator = createCandidateSpeechCleanupCoordinator({
    cleanup: () => new Promise((resolve) => { resolveOlder = resolve }),
    cancelRemote: () => { cancellations += 1 },
    onStatus: (status) => statuses.push(status),
  })
  coordinator.observe([interviewer('问题一'), user('这是一段足够长的候选人回答，旧整理结果不能覆盖下一轮状态。')], true)
  coordinator.observe([
    interviewer('问题一'),
    user('这是一段足够长的候选人回答，旧整理结果不能覆盖下一轮状态。'),
    interviewer('问题二'),
    user('很短'),
  ], true)
  resolveOlder({ status: 'cleaned', text: '过期结果' })
  await Promise.resolve(); await Promise.resolve()
  assert.ok(cancellations >= 2)
  assert.equal(statuses.at(-1), 'original')
})

test('newer candidate block wins and stale completion is ignored', async () => {
  const resolvers = []
  const statuses = []
  const coordinator = createCandidateSpeechCleanupCoordinator({
    cleanup: (text) => new Promise((resolve) => resolvers.push({ text, resolve })),
    cancelRemote: () => {},
    onStatus: (status) => statuses.push(status),
  })
  const first = [interviewer('问题'), user('第一份候选人回答内容已经足够长，需要调用模型进行整理处理。')]
  const second = [interviewer('问题'), user('第二份候选人回答内容更新得更加完整，需要重新调用模型整理。')]
  coordinator.observe(first, true)
  coordinator.observe(second, true)
  resolvers[0].resolve({ status: 'cleaned', text: '过期结果' })
  resolvers[1].resolve({ status: 'cleaned', text: '最新结果' })
  await Promise.resolve(); await Promise.resolve()
  const built = await coordinator.buildContextTurns(second, true, 10)
  assert.equal(built.at(-1).text, '最新结果')
  assert.equal(statuses.at(-1), 'cleaned')
})

test('context falls back to original after the wait budget', async () => {
  const coordinator = createCandidateSpeechCleanupCoordinator({ cleanup: () => new Promise(() => {}) })
  const turns = [interviewer('问题'), user('这是一段需要整理但服务暂时没有返回的候选人回答。')]
  coordinator.observe(turns, true)
  const started = Date.now()
  const built = await coordinator.buildContextTurns(turns, true, 20)
  assert.ok(Date.now() - started < 150)
  assert.equal(built.at(-1).text, turns.at(-1).text)
})

test('cache is bounded to the newest 24 candidate blocks', async () => {
  let calls = 0
  const coordinator = createCandidateSpeechCleanupCoordinator({ cleanup: async (text) => { calls += 1; return { status: 'cleaned', text } } })
  const samples = Array.from({ length: 25 }, (_, index) => [interviewer(`问题${index}`), user(`第${index}段候选人回答内容足够长，用于测试缓存淘汰行为。`)])
  for (const turns of samples) { coordinator.observe(turns, true); await coordinator.buildContextTurns(turns, true, 20) }
  coordinator.observe(samples[0], true)
  await coordinator.buildContextTurns(samples[0], true, 20)
  assert.equal(calls, 26)
})
