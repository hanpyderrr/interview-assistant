import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { CaptureAudioTimeline } from '../CaptureAudioTimeline.ts';

const pcm = (byteLength) => Buffer.alloc(byteLength);

describe('CaptureAudioTimeline', () => {
    test('uses the shared meeting origin while keeping channel cursors independent', () => {
        const timeline = new CaptureAudioTimeline();
        timeline.beginSession(1, 1_000);

        assert.deepEqual(timeline.stamp('interviewer', pcm(3_200), 16_000, 1_150), {
            bytes: pcm(3_200),
            captureStartMs: 50,
            captureEndMs: 150,
        });
        assert.deepEqual(timeline.stamp('user', pcm(1_600), 16_000, 1_100), {
            bytes: pcm(1_600),
            captureStartMs: 50,
            captureEndMs: 100,
        });
    });

    test('advances a channel to a provably later arrival position', () => {
        const timeline = new CaptureAudioTimeline();
        timeline.beginSession(1, 1_000);

        timeline.stamp('interviewer', pcm(3_200), 16_000, 1_150);
        const chunk = timeline.stamp('interviewer', pcm(3_200), 16_000, 1_400);

        assert.equal(chunk.captureStartMs, 300);
        assert.equal(chunk.captureEndMs, 400);
    });

    test('keeps overlapping or early chunks continuous from the channel cursor', () => {
        const timeline = new CaptureAudioTimeline();
        timeline.beginSession(1, 1_000);

        timeline.stamp('interviewer', pcm(3_200), 16_000, 1_150);
        const overlapping = timeline.stamp('interviewer', pcm(3_200), 16_000, 1_200);
        const early = timeline.stamp('interviewer', pcm(3_200), 16_000, 1_100);

        assert.deepEqual(
            [overlapping.captureStartMs, overlapping.captureEndMs],
            [150, 250],
        );
        assert.deepEqual([early.captureStartMs, early.captureEndMs], [250, 350]);
    });

    test('uses each chunk sample rate for duration while preserving monotonicity', () => {
        const timeline = new CaptureAudioTimeline();
        timeline.beginSession(1, 1_000);

        timeline.stamp('user', pcm(3_200), 16_000, 1_150);
        const changedRate = timeline.stamp('user', pcm(1_600), 8_000, 1_175);

        assert.deepEqual(
            [changedRate.captureStartMs, changedRate.captureEndMs],
            [150, 250],
        );
    });

    test('resets both channel cursors and the origin for a new generation', () => {
        const timeline = new CaptureAudioTimeline();
        timeline.beginSession(1, 1_000);
        timeline.stamp('interviewer', pcm(3_200), 16_000, 1_400);
        timeline.stamp('user', pcm(3_200), 16_000, 1_300);

        timeline.beginSession(2, 5_000);

        for (const channel of ['interviewer', 'user']) {
            const chunk = timeline.stamp(channel, pcm(3_200), 16_000, 5_150);
            assert.deepEqual([chunk.captureStartMs, chunk.captureEndMs], [50, 150]);
        }
    });

    test('treats the same generation and origin as idempotent while preserving both cursors', () => {
        const timeline = new CaptureAudioTimeline();
        timeline.beginSession(7, 1_000);
        timeline.stamp('interviewer', pcm(3_200), 16_000, 1_150);
        timeline.stamp('user', pcm(3_200), 16_000, 1_200);

        timeline.beginSession(7, 1_000);

        const interviewer = timeline.stamp('interviewer', pcm(3_200), 16_000, 1_200);
        const user = timeline.stamp('user', pcm(3_200), 16_000, 1_150);
        assert.deepEqual([interviewer.captureStartMs, interviewer.captureEndMs], [150, 250]);
        assert.deepEqual([user.captureStartMs, user.captureEndMs], [200, 300]);
    });

    test('rejects a different origin for the same generation without resetting cursors', () => {
        const timeline = new CaptureAudioTimeline();
        timeline.beginSession(7, 1_000);
        timeline.stamp('interviewer', pcm(3_200), 16_000, 1_150);

        assert.throws(() => timeline.beginSession(7, 2_000), /origin/i);
        const chunk = timeline.stamp('interviewer', pcm(3_200), 16_000, 1_200);
        assert.deepEqual([chunk.captureStartMs, chunk.captureEndMs], [150, 250]);
    });

    test('rejects an older generation while preserving the origin and both channel cursors', () => {
        const timeline = new CaptureAudioTimeline();
        timeline.beginSession(2, 1_000);
        timeline.stamp('interviewer', pcm(3_200), 16_000, 1_150);
        timeline.stamp('user', pcm(3_200), 16_000, 1_200);

        assert.throws(() => timeline.beginSession(1, 5_000), /generation/i);

        const interviewer = timeline.stamp('interviewer', pcm(3_200), 16_000, 1_200);
        const user = timeline.stamp('user', pcm(3_200), 16_000, 1_150);
        assert.deepEqual([interviewer.captureStartMs, interviewer.captureEndMs], [150, 250]);
        assert.deepEqual([user.captureStartMs, user.captureEndMs], [200, 300]);
    });

    test('requires an active session and valid finite session values', () => {
        const timeline = new CaptureAudioTimeline();
        assert.throws(() => timeline.stamp('user', pcm(2), 16_000, 1_000), /session/i);

        for (const generation of [
            Number.NaN,
            Number.POSITIVE_INFINITY,
            -1,
            1.5,
            Number.MAX_SAFE_INTEGER + 1,
        ]) {
            assert.throws(() => timeline.beginSession(generation, 1_000));
        }
        for (const origin of [Number.NaN, Number.POSITIVE_INFINITY, -1]) {
            assert.throws(() => timeline.beginSession(1, origin));
        }
    });

    test('rejects invalid channels, buffers, sample rates, and monotonic timestamps', () => {
        const timeline = new CaptureAudioTimeline();
        timeline.beginSession(1, 1_000);

        assert.throws(() => timeline.stamp('speaker', pcm(2), 16_000, 1_000), /channel/i);
        assert.throws(() => timeline.stamp('user', new Uint8Array(2), 16_000, 1_000), /buffer/i);
        assert.throws(() => timeline.stamp('user', pcm(0), 16_000, 1_000), /empty/i);
        assert.throws(() => timeline.stamp('user', pcm(3), 16_000, 1_000), /even/i);

        for (const sampleRate of [
            0,
            -1,
            16_000.5,
            Number.MAX_SAFE_INTEGER + 1,
            Number.MAX_VALUE,
            Number.NaN,
            Number.POSITIVE_INFINITY,
        ]) {
            assert.throws(() => timeline.stamp('user', pcm(2), sampleRate, 1_000), /sample rate/i);
        }
        for (const now of [-1, 999, Number.NaN, Number.POSITIVE_INFINITY]) {
            assert.throws(() => timeline.stamp('user', pcm(2), 16_000, now), /monotonic/i);
        }
        assert.throws(
            () => timeline.stamp('user', pcm(2), Number.MAX_SAFE_INTEGER, Number.MAX_VALUE),
            /duration|end time/i,
        );
    });
});
