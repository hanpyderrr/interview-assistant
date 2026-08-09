// @ts-check
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createProviderDeadlineController } from '../../src/interview-console/providerDeadlineController.ts'

/**
 * Behavior test for the identity model actually used by InterviewConsole.tsx:
 * `controller.start(...)`, `observeToken(...)`, and `complete(...)` must all be called
 * with the SAME identity domain (the answer id), not a mix of answer id and session
 * generation. Session-generation validity is a separate check owned by
 * `handleProviderTimeout`, not by the controller itself.
 */

describe('provider deadline controller identity wiring', () => {
  it('answer 2 useful token must be observed when start/observeToken/complete share one identity domain', () => {
    const controller = createProviderDeadlineController({ deadlineMs: 100, onTimeout: () => {} })

    // Answer 1: id=1 in session generation=1.
    controller.start(1)
    assert.equal(controller.observeToken(1, '答案'), true)
    controller.complete(1, 'done')

    // Answer 2 in the SAME session (generation still 1), but a new answer id=2.
    // Regression: if start() is called with the session generation (1) instead of the
    // answer id (2), observeToken(2, ...) below reports a generation mismatch and the
    // useful streamed token is dropped even though the stream is legitimate.
    controller.start(2)
    assert.equal(
      controller.observeToken(2, '第二个答案'),
      true,
      'useful token for answer 2 must be observed and protect the stream',
    )
  })

  it('second answer timeout in same session releases the third queued answer', () => {
    let timerCallback = null
    const timeoutAnswerIds = []
    const completedAnswers = []

    // Minimal simulation of InterviewConsole's actual identity model after the fix:
    // controller identity == answer id; session validity is checked separately.
    let sessionGeneration = 1
    let answerSequence = 0
    let activeAnswer = null
    const answerQueue = []

    function enqueueAnswer(question) {
      const id = ++answerSequence
      answerQueue.push({ id, question, generation: sessionGeneration })
      return id
    }

    function pumpAnswerQueue(controller) {
      if (activeAnswer) return
      const job = answerQueue.shift()
      if (!job || job.generation !== sessionGeneration) return
      activeAnswer = { ...job, settled: false }
      controller.start(activeAnswer.id)
    }

    function handleProviderTimeout(answerId, controller) {
      const active = activeAnswer
      if (!active || active.id !== answerId || active.generation !== sessionGeneration || active.settled) return
      timeoutAnswerIds.push(answerId)
      active.settled = true
      completedAnswers.push({ id: active.id, outcome: 'timeout' })
      controller.clear()
      activeAnswer = null
      pumpAnswerQueue(controller)
    }

    const controller = createProviderDeadlineController({
      deadlineMs: 100,
      setTimeout: (cb) => {
        timerCallback = cb
        return Symbol('timer')
      },
      clearTimeout: () => {
        timerCallback = null
      },
      onTimeout: (answerId) => handleProviderTimeout(answerId, controller),
    })

    enqueueAnswer('Question 1')
    enqueueAnswer('Question 2')
    enqueueAnswer('Question 3')

    pumpAnswerQueue(controller)
    assert.equal(activeAnswer?.id, 1)

    controller.complete(1, 'done')
    activeAnswer.settled = true
    completedAnswers.push({ id: activeAnswer.id, outcome: 'done' })
    activeAnswer = null
    pumpAnswerQueue(controller)
    assert.equal(activeAnswer?.id, 2)

    assert.ok(timerCallback, 'Timer should be scheduled for answer 2')
    timerCallback()

    assert.equal(timeoutAnswerIds.length, 1)
    assert.equal(timeoutAnswerIds[0], 2)
    assert.equal(activeAnswer?.id, 3, 'Third answer should be pumped after second times out')
    assert.deepEqual(
      completedAnswers.map((a) => ({ id: a.id, outcome: a.outcome })),
      [
        { id: 1, outcome: 'done' },
        { id: 2, outcome: 'timeout' },
      ],
    )
  })

  it('timeout on a stale session generation is inert', () => {
    let timerCallback = null
    const timeoutAnswerIds = []
    let sessionGeneration = 1
    let activeAnswer = { id: 1, generation: 1, settled: false }
    const completedAnswers = []

    const controller = createProviderDeadlineController({
      deadlineMs: 50,
      setTimeout: (cb) => {
        timerCallback = cb
        return Symbol('timer')
      },
      clearTimeout: () => {
        timerCallback = null
      },
      onTimeout: (answerId) => {
        if (!activeAnswer || activeAnswer.id !== answerId || activeAnswer.generation !== sessionGeneration || activeAnswer.settled) return
        timeoutAnswerIds.push(answerId)
        activeAnswer.settled = true
        completedAnswers.push({ id: activeAnswer.id, outcome: 'timeout' })
        controller.clear()
        activeAnswer = null
      },
    })

    controller.start(1)
    assert.ok(timerCallback, 'Timer scheduled')

    sessionGeneration += 1
    activeAnswer = null

    timerCallback()

    assert.equal(timeoutAnswerIds.length, 0, 'Stale-session timeout must not mutate state')
    assert.equal(completedAnswers.length, 0)
  })
})
