import test from 'node:test'
import assert from 'node:assert/strict'

import { createInterviewerDisplayCorrectionCoordinator } from '../interviewerDisplayCorrection.ts'

const turn = (text, segmentId) => ({ speaker: 'interviewer', text, final: true, segmentId })

test('applies correction to a copied display turn without mutating raw turns', async () => {
  const coordinator = createInterviewerDisplayCorrectionCoordinator({
    correct: async () => ({ status: 'corrected', text: '你在 RK3568 上做 Buildroot Linux 裁剪时？' }),
  })
  const raw = [turn('你在 RK356E 上做 Budrude Linux 才简时？', 1)]
  await coordinator.request(raw[0])
  const display = coordinator.apply(raw)
  assert.equal(raw[0].text, '你在 RK356E 上做 Budrude Linux 才简时？')
  assert.equal(display[0].text, '你在 RK3568 上做 Buildroot Linux 裁剪时？')
  assert.notStrictEqual(display, raw)
  assert.notStrictEqual(display[0], raw[0])
})

test('short text bypasses correction and failure keeps original', async () => {
  let calls = 0
  const coordinator = createInterviewerDisplayCorrectionCoordinator({
    correct: async () => { calls += 1; throw new Error('offline') },
  })
  const short = [turn('为什么', 1)]
  await coordinator.request(short[0])
  assert.equal(calls, 0)
  const longer = [turn('你主要负责什么模块？', 2)]
  await coordinator.request(longer[0])
  assert.equal(coordinator.apply(longer)[0].text, longer[0].text)
})

test('newer request wins and stale completion is ignored', async () => {
  const pending = []
  const coordinator = createInterviewerDisplayCorrectionCoordinator({
    correct: (text) => new Promise((resolve) => pending.push({ text, resolve })),
    cancelRemote: () => {},
  })
  const first = turn('第一段需要异步修正的面试官问题？', 1)
  const second = turn('第二段需要异步修正的面试官问题？', 2)
  const firstRequest = coordinator.request(first)
  const secondRequest = coordinator.request(second)
  pending[0].resolve({ status: 'corrected', text: '过期修正结果？' })
  pending[1].resolve({ status: 'corrected', text: '第二段修正后的面试官问题？' })
  await Promise.all([firstRequest, secondRequest])
  assert.equal(coordinator.apply([first, second])[0].text, first.text)
  assert.equal(coordinator.apply([first, second])[1].text, '第二段修正后的面试官问题？')
})

test('clear invalidates in-flight completion', async () => {
  let resolveRequest
  const coordinator = createInterviewerDisplayCorrectionCoordinator({
    correct: () => new Promise((resolve) => { resolveRequest = resolve }),
    cancelRemote: () => {},
  })
  const raw = [turn('这是一段需要异步修正的问题文本？', 1)]
  const request = coordinator.request(raw[0])
  coordinator.clear()
  resolveRequest({ status: 'corrected', text: '不应显示的旧会话修正？' })
  await request
  assert.equal(coordinator.apply(raw)[0].text, raw[0].text)
})

test('cache is bounded to the newest 32 display corrections', async () => {
  let calls = 0
  const coordinator = createInterviewerDisplayCorrectionCoordinator({
    correct: async (text) => { calls += 1; return { status: 'corrected', text: `${text}（已修正）` } },
  })
  const samples = Array.from({ length: 33 }, (_, index) => turn(`第${index}个足够长的面试官问题文本？`, index + 1))
  for (const sample of samples) await coordinator.request(sample)
  await coordinator.request(samples[0])
  assert.equal(calls, 34)
})

test('updated text for the same segment receives a fresh correction', async () => {
  let calls = 0
  const coordinator = createInterviewerDisplayCorrectionCoordinator({
    correct: async (text) => {
      calls += 1
      return { status: 'corrected', text: `${text} corrected` }
    },
  })
  const initial = turn('Explain Buildroot briefly', 7)
  const expanded = turn('Explain Buildroot package trimming briefly', 7)
  await coordinator.request(initial)
  await coordinator.request(expanded)
  assert.equal(calls, 2)
  assert.equal(coordinator.apply([expanded])[0].text, `${expanded.text} corrected`)
})

test('external correction by text matches a turn without segment metadata', async () => {
  const coordinator = createInterviewerDisplayCorrectionCoordinator({
    correct: async (text) => ({ status: 'original', text }),
  })
  const noMetadata = { speaker: 'interviewer', text: '请介绍 SPI 帧同步的设计', final: true }
  coordinator.putExternalByText('请介绍 SPI 帧同步的设计', '请介绍 SPI 帧同步的设计')
  const display = coordinator.apply([noMetadata])
  assert.equal(display[0].text, '请介绍 SPI 帧同步的设计')
  assert.equal(noMetadata.text, '请介绍 SPI 帧同步的设计')
})

test('external correction outranks a later internal correction', async () => {
  const coordinator = createInterviewerDisplayCorrectionCoordinator({
    correct: async (text) => ({ status: 'corrected', text: '内部校对结果' }),
  })
  const raw = turn('原始转写问题？', 3)
  coordinator.putExternalByText('原始转写问题？', '答案链路修正的问题？')
  await coordinator.request(raw)
  const display = coordinator.apply([raw])
  assert.equal(display[0].text, '答案链路修正的问题？')
})

test('identical external text is ignored and clear removes it', async () => {
  let displayChanged = 0
  const coordinator = createInterviewerDisplayCorrectionCoordinator({
    correct: async (text) => ({ status: 'original', text }),
    onDisplayChanged: () => { displayChanged += 1 },
  })
  coordinator.putExternalByText('同样的问题', '同样的问题')
  assert.equal(displayChanged, 0)
  const raw = [turn('另一个问题', 5)]
  coordinator.putExternalByText('另一个问题', '另一个问题（修正）')
  assert.equal(displayChanged, 1)
  coordinator.clear()
  assert.equal(coordinator.apply(raw)[0].text, '另一个问题')
})
