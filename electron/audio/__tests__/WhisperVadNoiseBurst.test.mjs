import test from 'node:test'
import assert from 'node:assert/strict'

import { VadProcessor } from '../whisper/vadProcessor.ts'

const frame = (amplitude) => new Float32Array(480).fill(amplitude)

function join(frames) {
  const samples = new Float32Array(frames.length * 480)
  frames.forEach((item, index) => samples.set(item, index * 480))
  return samples
}

test('a single above-threshold noise burst is not promoted by hangover frames', () => {
  const vad = new VadProcessor()
  const segments = vad.push(join([frame(0.02), ...Array.from({ length: 10 }, () => frame(0))]))
  assert.equal(segments.length, 0)
})

test('three voiced frames are still too short to transcribe', () => {
  const vad = new VadProcessor()
  const segments = vad.push(join([
    ...Array.from({ length: 3 }, () => frame(0.02)),
    ...Array.from({ length: 10 }, () => frame(0)),
  ]))
  assert.equal(segments.length, 0)
})

test('a final keeps the opened segment id after an earlier noise-only segment', () => {
  const vad = new VadProcessor()
  vad.push(join([frame(0.02), ...Array.from({ length: 10 }, () => frame(0))]))
  const segments = vad.push(join([
    ...Array.from({ length: 4 }, () => frame(0.02)),
    ...Array.from({ length: 10 }, () => frame(0)),
  ]))
  assert.equal(segments.length, 1)
  assert.equal(segments[0].sequenceId, 2)
  assert.equal(vad.currentSegmentId(), 2)
})

test('eight actual voiced frames produce a speech segment', () => {
  const vad = new VadProcessor()
  const segments = vad.push(join([
    ...Array.from({ length: 8 }, () => frame(0.02)),
    ...Array.from({ length: 10 }, () => frame(0)),
  ]))
  assert.equal(segments.length, 1)
  assert.equal(segments[0].durationMs, 540)
  assert.equal(segments[0].startMs, 0)
  assert.equal(segments[0].endMs, 540)
})

test('emits explicit compressed-axis bounds for multiple segments in one write', () => {
  const vad = new VadProcessor()
  const segments = vad.push(join([
    ...Array.from({ length: 4 }, () => frame(0.02)),
    ...Array.from({ length: 10 }, () => frame(0)),
    ...Array.from({ length: 4 }, () => frame(0.02)),
    ...Array.from({ length: 10 }, () => frame(0)),
  ]))
  assert.deepEqual(segments.map(({ startMs, endMs }) => [startMs, endMs]), [[0, 420], [420, 840]])
})

test('soft commit exposes the exact 300ms overlap on the compressed axis', () => {
  const vad = new VadProcessor()
  vad.push(join(Array.from({ length: 20 }, () => frame(0.02))))
  const first = vad.softCommit()
  vad.push(join(Array.from({ length: 4 }, () => frame(0.02))))
  const second = vad.flush()[0]
  assert.equal(first.startMs, 0)
  assert.equal(first.endMs, 600)
  assert.equal(first.sequenceId, 1)
  assert.equal(second.startMs, 300)
  assert.equal(second.endMs, 720)
  assert.equal(second.sequenceId, 2)
})

test('an active-session flush does not reset the compressed timeline cursor', () => {
  const vad = new VadProcessor()
  vad.push(join(Array.from({ length: 4 }, () => frame(0.02))))
  assert.deepEqual(vad.flush().map(({ startMs, endMs }) => [startMs, endMs]), [[0, 120]])
  const next = vad.push(join([
    ...Array.from({ length: 4 }, () => frame(0.02)),
    ...Array.from({ length: 10 }, () => frame(0)),
  ]))
  assert.deepEqual(next.map(({ startMs, endMs }) => [startMs, endMs]), [[120, 540]])
})

test('flush advances past a discarded sub-frame remainder on the compressed axis', () => {
  const vad = new VadProcessor()
  vad.push(new Float32Array((4 * 480) + 20).fill(0.02))
  assert.deepEqual(vad.flush().map(({ startMs, endMs }) => [startMs, endMs]), [[0, 120]])
  const next = vad.push(join([
    ...Array.from({ length: 4 }, () => frame(0.02)),
    ...Array.from({ length: 10 }, () => frame(0)),
  ]))
  assert.deepEqual(next.map(({ startMs, endMs }) => [startMs, endMs]), [[121.25, 541.25]])
})

test('sustained subthreshold loopback noise stays below the speech gate', () => {
  const vad = new VadProcessor()
  const segments = vad.push(join([
    ...Array.from({ length: 12 }, () => frame(0.006)),
    ...Array.from({ length: 10 }, () => frame(0)),
  ]))
  assert.equal(segments.length, 0)
})

test('quiet speech above the original baseline threshold is not discarded', () => {
  const vad = new VadProcessor()
  const segments = vad.push(join([
    ...Array.from({ length: 4 }, () => frame(0.01)),
    ...Array.from({ length: 10 }, () => frame(0)),
  ]))
  assert.equal(segments.length, 1)
})

test('speech onset includes the preceding 300ms pre-roll', () => {
  const vad = new VadProcessor()
  vad.push(join(Array.from({ length: 10 }, () => frame(0.004))))
  const segments = vad.push(join([
    ...Array.from({ length: 8 }, () => frame(0.03)),
    ...Array.from({ length: 10 }, () => frame(0)),
  ]))
  assert.equal(segments.length, 1)
  assert.ok(segments[0].samples.length >= (10 + 8) * 480)
  assert.ok(Math.abs(segments[0].samples[0]) > 0)
})
