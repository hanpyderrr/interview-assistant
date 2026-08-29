import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const dist = name => path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    `../../../dist-electron/electron/audio/${name}.js`,
);
const { CaptureAudioTimeline } = require(dist('CaptureAudioTimeline'));
const { LocalFunAsrSTT } = require(dist('LocalFunAsrSTT'));

const pcm = (durationMs, sampleRate = 16_000, fill = 1) =>
    Buffer.alloc(Math.round(sampleRate * durationMs / 1_000) * 2, fill);

function harness(requestTranscription) {
    const timeline = new CaptureAudioTimeline();
    timeline.beginSession(4, 1_000);
    let now = 1_100;
    const stt = new LocalFunAsrSTT({
        channel: 'interviewer',
        timeline,
        requestTranscription,
        monotonicNow: () => now,
    });
    stt.beginCaptureSession(4, 1_000);
    return { stt, timeline, setNow: value => { now = value; } };
}

describe('LocalFunAsrSTT', () => {
    test('buffers one PCM utterance and emits one final with shared-timeline metadata', async () => {
        const requests = [];
        const h = harness(async request => {
            requests.push(request);
            return { text: 'static关键字有什么作用？', inference_seconds: 0.5 };
        });
        const finals = [];
        h.stt.on('transcript', segment => finals.push(segment));

        h.stt.write(pcm(100, 16_000, 3));
        h.setNow(1_200);
        h.stt.write(pcm(100, 16_000, 4));
        h.stt.notifySpeechEnded();
        await h.stt.finalize();

        assert.equal(requests.length, 1);
        assert.equal(requests[0].sampleRate, 16_000);
        assert.equal(requests[0].pcm.length, 6_400);
        assert.deepEqual(finals, [{
            text: 'static关键字有什么作用？',
            isFinal: true,
            confidence: 0.9,
            segmentId: 1,
            audioStartMs: 0,
            audioEndMs: 200,
            sttSessionGeneration: 4,
        }]);
    });

    test('serializes utterance requests and preserves final order', async () => {
        const resolvers = [];
        const h = harness(request => new Promise(resolve => resolvers.push({ request, resolve })));
        const texts = [];
        h.stt.on('transcript', segment => texts.push(segment.text));

        h.stt.write(pcm(100));
        h.stt.notifySpeechEnded();
        h.setNow(1_300);
        h.stt.write(pcm(100));
        h.stt.notifySpeechEnded();
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(resolvers.length, 1);

        resolvers[0].resolve({ text: '第一句' });
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(resolvers.length, 2);
        resolvers[1].resolve({ text: '第二句' });
        await h.stt.finalize();

        assert.deepEqual(texts, ['第一句', '第二句']);
    });

    test('finalize flushes trailing PCM and empty model text emits no transcript', async () => {
        let requests = 0;
        const h = harness(async () => { requests += 1; return { text: '   ' }; });
        const finals = [];
        h.stt.on('transcript', segment => finals.push(segment));

        h.stt.write(pcm(50));
        await h.stt.finalize();

        assert.equal(requests, 1);
        assert.deepEqual(finals, []);
        assert.throws(() => h.stt.write(pcm(50)), /closed|final/i);
    });

    test('reports request failures without poisoning the next queued utterance', async () => {
        let calls = 0;
        const h = harness(async () => {
            calls += 1;
            if (calls === 1) throw new Error('local service unavailable');
            return { text: '恢复后的句子' };
        });
        const errors = [];
        const finals = [];
        h.stt.on('error', error => errors.push(error.message));
        h.stt.on('transcript', segment => finals.push(segment.text));

        h.stt.write(pcm(50));
        h.stt.notifySpeechEnded();
        h.stt.write(pcm(50));
        h.stt.notifySpeechEnded();
        await h.stt.finalize();

        assert.deepEqual(errors, ['local service unavailable']);
        assert.deepEqual(finals, ['恢复后的句子']);
    });

    test('manual flush waits for the final without closing the live write gate', async () => {
        const h = harness(async () => ({ text: '第一问' }));
        const finals = [];
        h.stt.on('transcript', segment => finals.push(segment.text));

        h.stt.write(pcm(50));
        await h.stt.flush();
        assert.deepEqual(finals, ['第一问']);

        assert.doesNotThrow(() => h.stt.write(pcm(50)));
        await h.stt.finalize();
        assert.deepEqual(finals, ['第一问', '第一问']);
    });

    test('leading zero keepalive does not anchor the next utterance', async () => {
        const h = harness(async () => ({ text: '第二问' }));
        const finals = [];
        h.stt.on('transcript', segment => finals.push(segment));

        h.stt.write(pcm(100, 16_000, 0));
        h.setNow(11_100);
        h.stt.write(pcm(100, 16_000, 7));
        h.stt.notifySpeechEnded();
        await h.stt.flush();

        assert.equal(finals.length, 1);
        assert.equal(finals[0].audioStartMs, 10_000);
        assert.equal(finals[0].audioEndMs, 10_100);
    });

    test('zero PCM inside an active utterance is preserved', async () => {
        const requests = [];
        const h = harness(async request => {
            requests.push(request);
            return { text: '一句话' };
        });

        h.stt.write(pcm(100, 16_000, 9));
        h.stt.write(pcm(100, 16_000, 0));
        h.stt.notifySpeechEnded();
        await h.stt.flush();

        assert.equal(requests.length, 1);
        assert.equal(requests[0].pcm.length, 6_400);
    });

    test('leading zero filtering does not accept malformed PCM', () => {
        const h = harness(async () => ({ text: '不会调用' }));
        assert.throws(() => h.stt.write(Buffer.alloc(0)), /empty/i);
        assert.throws(() => h.stt.write(Buffer.alloc(3)), /even/i);
    });

    test('suppresses stale finals and errors after stop and a new capture session', async () => {
        const pending = [];
        const h = harness(() => new Promise((resolve, reject) => pending.push({ resolve, reject })));
        const finals = [];
        const errors = [];
        h.stt.on('transcript', segment => finals.push(segment.text));
        h.stt.on('error', error => errors.push(error.message));

        h.stt.write(pcm(50));
        h.stt.notifySpeechEnded();
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(pending.length, 1);

        h.stt.stop();
        h.timeline.beginSession(5, 2_000);
        h.setNow(2_100);
        h.stt.beginCaptureSession(5, 2_000);
        pending[0].resolve({ text: '上一场尾句' });
        await new Promise(resolve => setImmediate(resolve));

        h.stt.write(pcm(50));
        h.stt.notifySpeechEnded();
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(pending.length, 2);
        h.stt.stop();
        h.timeline.beginSession(6, 3_000);
        h.setNow(3_100);
        h.stt.beginCaptureSession(6, 3_000);
        pending[1].reject(new Error('上一场失败'));
        await new Promise(resolve => setImmediate(resolve));

        assert.deepEqual(finals, []);
        assert.deepEqual(errors, []);
    });
});
