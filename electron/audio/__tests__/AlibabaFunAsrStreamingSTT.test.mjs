import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { existsSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

registerHooks({
    resolve(specifier, context, nextResolve) {
        if (specifier.startsWith('.') && !/\.[cm]?[jt]s$/u.test(specifier)) {
            const candidate = new URL(`${specifier}.ts`, context.parentURL);
            if (existsSync(fileURLToPath(candidate))) {
                return nextResolve(candidate.href, context);
            }
        }
        return nextResolve(specifier, context);
    },
});

const { CaptureAudioTimeline } = await import('../CaptureAudioTimeline.ts');
const {
    AlibabaFunAsrStreamingSTT,
    appendSentAudioLedger,
    mapSentAudioOffset,
} = await import('../AlibabaFunAsrStreamingSTT.ts');

const TASK_IDS = [
    '123e4567-e89b-42d3-a456-426614174000',
    '223e4567-e89b-42d3-a456-426614174001',
    '323e4567-e89b-42d3-a456-426614174002',
    '423e4567-e89b-42d3-a456-426614174003',
    '523e4567-e89b-42d3-a456-426614174004',
    '623e4567-e89b-42d3-a456-426614174005',
    '723e4567-e89b-42d3-a456-426614174006',
    '823e4567-e89b-42d3-a456-426614174007',
    '923e4567-e89b-42d3-a456-426614174008',
    'a23e4567-e89b-42d3-a456-426614174009',
    'b23e4567-e89b-42d3-a456-42661417400a',
    'c23e4567-e89b-42d3-a456-42661417400b',
];

class FakeSocket extends EventEmitter {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;

    readyState = FakeSocket.CONNECTING;
    sent = [];
    closeCalls = [];

    open() {
        this.readyState = FakeSocket.OPEN;
        this.emit('open');
    }

    message(value) {
        const bytes = Buffer.from(typeof value === 'string' ? value : JSON.stringify(value));
        this.emit('message', bytes);
    }

    send(value) {
        if (this.readyState !== FakeSocket.OPEN) throw new Error('socket is not open');
        this.sent.push(Buffer.isBuffer(value) ? Buffer.from(value) : value);
    }

    close(code = 1000, reason = '') {
        this.closeCalls.push([code, reason]);
        this.readyState = FakeSocket.CLOSED;
    }

    serverClose(code = 1006, reason = '') {
        this.readyState = FakeSocket.CLOSED;
        this.emit('close', code, Buffer.from(reason));
    }
}

class FakeTimers {
    now = 0;
    nextId = 1;
    jobs = new Map();

    setTimeout = (callback, delay) => {
        const id = this.nextId++;
        this.jobs.set(id, { callback, due: this.now + delay, delay });
        return id;
    };

    clearTimeout = (id) => {
        this.jobs.delete(id);
    };

    delays() {
        return [...this.jobs.values()].map(job => job.delay).sort((a, b) => a - b);
    }

    advance(ms) {
        const target = this.now + ms;
        while (true) {
            const next = [...this.jobs.entries()]
                .filter(([, job]) => job.due <= target)
                .sort((a, b) => a[1].due - b[1].due || a[0] - b[0])[0];
            if (!next) break;
            const [id, job] = next;
            this.jobs.delete(id);
            this.now = job.due;
            job.callback();
        }
        this.now = target;
    }
}

const pcm = (durationMs, sampleRate = 16_000, fill = 0) =>
    Buffer.alloc(Math.round(sampleRate * durationMs / 1_000) * 2, fill);

const runFrames = socket => socket.sent
    .filter(value => typeof value === 'string')
    .map(value => JSON.parse(value))
    .filter(value => value.header.action === 'run-task');

const finishFrames = socket => socket.sent
    .filter(value => typeof value === 'string')
    .map(value => JSON.parse(value))
    .filter(value => value.header.action === 'finish-task');

const result = (taskId, overrides = {}) => ({
    header: { event: 'result-generated', task_id: taskId },
    payload: {
        output: {
            sentence: {
                begin_time: 0,
                end_time: 50,
                text: 'hello',
                heartbeat: false,
                sentence_end: true,
                sentence_id: 1,
                words: [],
                ...overrides,
            },
        },
    },
});

function makeHarness(overrides = {}) {
    const timers = new FakeTimers();
    let monotonicMs = 1_100;
    let uuidIndex = 0;
    const sockets = [];
    const factoryCalls = [];
    const timeline = new CaptureAudioTimeline();
    timeline.beginSession(1, 1_000);
    const wsFactory = (url, options) => {
        factoryCalls.push({ url, options });
        const socket = new FakeSocket();
        sockets.push(socket);
        return socket;
    };
    const stt = new AlibabaFunAsrStreamingSTT({
        apiKey: 'fake-alibaba-api-key',
        region: 'cn-beijing',
        model: 'fun-asr-realtime',
        workspaceId: 'workspace123',
        vocabularyId: 'vocab-1',
        channel: 'interviewer',
        timeline,
        wsFactory,
        uuid: () => TASK_IDS[uuidIndex++],
        monotonicNow: () => monotonicMs,
        timers,
        ...overrides,
    });
    stt.beginCaptureSession(1, 1_000);
    return {
        stt,
        timeline,
        timers,
        sockets,
        factoryCalls,
        setMonotonic: value => { monotonicMs = value; },
    };
}

function startTask(harness, chunk = pcm(100)) {
    harness.stt.write(chunk);
    const socket = harness.sockets.at(-1);
    socket.open();
    const taskId = runFrames(socket)[0].header.task_id;
    socket.message({ header: { event: 'task-started', task_id: taskId }, payload: {} });
    return { socket, taskId };
}

describe('AlibabaFunAsrStreamingSTT', () => {
    test('connects lazily, sends authenticated official endpoint options, and gates PCM until matching task-started', () => {
        const h = makeHarness();
        assert.equal(h.sockets.length, 0);

        const audio = pcm(100, 16_000, 7);
        h.stt.write(audio);
        assert.equal(h.sockets.length, 1);
        assert.deepEqual(h.factoryCalls, [{
            url: 'wss://workspace123.cn-beijing.maas.aliyuncs.com/api-ws/v1/inference',
            options: {
                headers: {
                    Authorization: 'Bearer fake-alibaba-api-key',
                    'user-agent': 'Natively AlibabaFunAsrStreamingSTT/1',
                },
            },
        }]);

        const socket = h.sockets[0];
        assert.deepEqual(socket.sent, []);
        socket.open();
        const frames = runFrames(socket);
        assert.equal(frames.length, 1);
        assert.equal(frames[0].payload.parameters.sample_rate, 16_000);
        assert.equal(frames[0].payload.parameters.vocabulary_id, 'vocab-1');
        assert.equal(socket.sent.some(Buffer.isBuffer), false);

        socket.message({ header: { event: 'task-started', task_id: TASK_IDS[1] }, payload: {} });
        assert.equal(socket.sent.some(Buffer.isBuffer), false);
        socket.message({ header: { event: 'task-started', task_id: TASK_IDS[0] }, payload: {} });
        assert.deepEqual(socket.sent.filter(Buffer.isBuffer), [audio]);
    });

    test('caps queued audio by duration at five seconds, drops oldest chunks, and warns with metadata only', () => {
        const h = makeHarness();
        const warnings = [];
        h.stt.on('warning', warning => warnings.push(warning));
        for (let index = 1; index <= 6; index++) {
            h.stt.write(pcm(1_000, 16_000, index));
        }

        const socket = h.sockets[0];
        socket.open();
        socket.message({ header: { event: 'task-started', task_id: TASK_IDS[0] }, payload: {} });
        const binary = socket.sent.filter(Buffer.isBuffer);
        assert.equal(binary.length, 5);
        assert.deepEqual(binary.map(value => value[0]), [2, 3, 4, 5, 6]);
        assert.deepEqual(warnings, [{
            kind: 'alibaba-streaming-warning',
            code: 'audio-queue-overflow',
            generation: 1,
            droppedDurationMs: 1_000,
        }]);
        const serialized = JSON.stringify(warnings);
        assert.equal(serialized.includes('audio'), true);
        assert.equal(serialized.includes('text'), false);
        assert.equal(serialized.includes('fake-alibaba-api-key'), false);
        assert.equal(serialized.includes(Buffer.alloc(4).toString('base64')), false);
    });

    test('maps only provable server ranges to the first actually sent chunk and emits monotonic local segment ids', () => {
        const h = makeHarness();
        h.setMonotonic(1_200);
        const { socket, taskId } = startTask(h, pcm(100));
        const transcripts = [];
        h.stt.on('transcript', transcript => transcripts.push(transcript));

        socket.message(result(taskId, { begin_time: 10, end_time: 90, text: 'part', sentence_end: false }));
        socket.message(result(taskId, { begin_time: 20, end_time: 100, text: 'final', sentence_id: 2 }));

        assert.deepEqual(transcripts, [
            { text: 'part', isFinal: false, confidence: 1, segmentId: 1, audioStartMs: 110, audioEndMs: 190 },
            { text: 'final', isFinal: true, confidence: 1, segmentId: 2, audioStartMs: 120, audioEndMs: 200 },
        ]);
    });

    test('uses the first retained chunk as task base after queue overflow', () => {
        const h = makeHarness();
        for (let index = 0; index < 6; index++) {
            h.setMonotonic(2_000 + index * 1_000);
            h.stt.write(pcm(1_000, 16_000, index));
        }
        const socket = h.sockets[0];
        socket.open();
        socket.message({ header: { event: 'task-started', task_id: TASK_IDS[0] }, payload: {} });
        const transcripts = [];
        h.stt.on('transcript', value => transcripts.push(value));
        socket.message(result(TASK_IDS[0], { begin_time: 0, end_time: 100, text: 'retained' }));
        assert.equal(transcripts[0].audioStartMs, 1_000);
        assert.equal(transcripts[0].audioEndMs, 1_100);
    });

    test('maps continuous task offsets through capture gaps with explicit boundary semantics', () => {
        const h = makeHarness();
        h.stt.write(pcm(100)); // task [0,100], capture [0,100]
        h.setMonotonic(2_000);
        h.stt.write(pcm(100)); // task [100,200], capture [900,1000]
        const socket = h.sockets[0];
        socket.open();
        socket.message({ header: { event: 'task-started', task_id: TASK_IDS[0] }, payload: {} });
        const transcripts = [];
        h.stt.on('transcript', value => transcripts.push(value));

        socket.message(result(TASK_IDS[0], {
            begin_time: 100,
            end_time: 200,
            text: 'second chunk',
            sentence_end: false,
        }));
        socket.message(result(TASK_IDS[0], {
            begin_time: 50,
            end_time: 150,
            text: 'cross gap',
            sentence_id: 2,
            sentence_end: false,
        }));

        assert.deepEqual(
            transcripts.map(value => [value.audioStartMs, value.audioEndMs]),
            [[900, 1_000], [50, 950]],
        );
    });

    test('compacts a long continuous sent-audio ledger while preserving real capture gaps', () => {
        const ledger = [];
        for (let index = 0; index < 10_000; index++) {
            appendSentAudioLedger(ledger, {
                taskStartMs: index,
                taskEndMs: index + 1,
                captureStartMs: index,
                captureEndMs: index + 1,
            });
        }
        assert.equal(ledger.length, 1);
        appendSentAudioLedger(ledger, {
            taskStartMs: 10_000,
            taskEndMs: 10_001,
            captureStartMs: 20_000,
            captureEndMs: 20_001,
        });
        assert.equal(ledger.length, 2);
        assert.equal(mapSentAudioOffset(ledger, 10_000, 'begin'), 20_000);
        assert.equal(mapSentAudioOffset(ledger, 10_000, 'end'), 10_000);
    });

    test('maps a 48 kHz twelve-chunk 400ms endpoint despite floating accumulation', () => {
        const h = makeHarness();
        h.stt.setSampleRate(48_000);
        for (let index = 1; index <= 12; index++) {
            h.setMonotonic(1_000 + index * (400 / 12));
            h.stt.write(pcm(400 / 12, 48_000));
        }
        const socket = h.sockets[0];
        socket.open();
        socket.message({ header: { event: 'task-started', task_id: TASK_IDS[0] }, payload: {} });
        const transcripts = [];
        h.stt.on('transcript', value => transcripts.push(value));

        socket.message(result(TASK_IDS[0], {
            begin_time: 0,
            end_time: 400,
            text: 'exact endpoint',
            sentence_end: false,
        }));

        assert.equal(transcripts.length, 1);
        assert.ok(Math.abs(transcripts[0].audioStartMs) <= 1e-6);
        assert.ok(Math.abs(transcripts[0].audioEndMs - 400) <= 1e-6);
    });

    test('never exposes unprovable server time as cross-speaker audio metadata', () => {
        const h = makeHarness();
        const { socket, taskId } = startTask(h, pcm(100));
        const transcripts = [];
        const warnings = [];
        h.stt.on('transcript', value => transcripts.push(value));
        h.stt.on('warning', value => warnings.push(value));

        socket.message(result(taskId, { begin_time: 5_000, end_time: 5_100, text: 'unsafe range' }));
        assert.deepEqual(transcripts, [{
            text: 'unsafe range', isFinal: true, confidence: 1, segmentId: 1,
        }]);
        assert.deepEqual(warnings, [{
            kind: 'alibaba-streaming-warning',
            code: 'unmapped-server-time',
            generation: 1,
            taskId,
        }]);
        assert.equal(JSON.stringify(warnings).includes('unsafe range'), false);
        assert.equal(JSON.stringify(transcripts).includes('5000'), false);
    });

    test('emits partial null-end text without fabricating either member of an audio range', () => {
        const h = makeHarness();
        const { socket, taskId } = startTask(h);
        const transcripts = [];
        const warnings = [];
        h.stt.on('transcript', value => transcripts.push(value));
        h.stt.on('warning', value => warnings.push(value));
        socket.message(result(taskId, {
            begin_time: 10,
            end_time: null,
            text: 'still speaking',
            sentence_end: false,
        }));
        assert.deepEqual(transcripts, [{
            text: 'still speaking', isFinal: false, confidence: 1, segmentId: 1,
        }]);
        assert.deepEqual(warnings, [{
            kind: 'alibaba-streaming-warning',
            code: 'unmapped-server-time',
            generation: 1,
            taskId,
        }]);
        const serialized = JSON.stringify(warnings);
        assert.equal(serialized.includes('still speaking'), false);
        assert.equal(serialized.includes('fake-alibaba-api-key'), false);
        assert.equal(serialized.includes('begin_time'), false);
    });

    test('heartbeat and empty text refresh liveness without emitting transcripts', () => {
        const h = makeHarness();
        const { socket, taskId } = startTask(h);
        const transcripts = [];
        h.stt.on('transcript', value => transcripts.push(value));
        h.timers.advance(70_000);
        socket.message(result(taskId, {
            end_time: null,
            text: '',
            heartbeat: true,
            sentence_end: false,
        }));
        h.timers.advance(70_000);
        assert.equal(transcripts.length, 0);
        assert.equal(h.sockets.length, 1);
        h.timers.advance(5_000);
        assert.deepEqual(h.timers.delays(), [1_000]);
    });

    test('finalize sends finish once, drains trailing results, and waits for matching task-finished', async () => {
        const h = makeHarness();
        const { socket, taskId } = startTask(h);
        const transcripts = [];
        h.stt.on('transcript', value => transcripts.push(value));
        const first = h.stt.finalize();
        const second = h.stt.finalize();
        assert.equal(first, second);
        assert.equal(finishFrames(socket).length, 1);

        socket.message({ header: { event: 'task-finished', task_id: TASK_IDS[1] }, payload: {} });
        let settled = false;
        first.finally(() => { settled = true; });
        await Promise.resolve();
        assert.equal(settled, false);
        socket.message(result(taskId, { begin_time: 10, end_time: 90, text: 'trailing final' }));
        await Promise.resolve();
        assert.deepEqual(transcripts.map(value => value.text), ['trailing final']);
        assert.equal(settled, false);
        assert.equal(finishFrames(socket).length, 1);
        socket.message({ header: { event: 'task-finished', task_id: taskId }, payload: {} });
        await first;
        assert.equal(settled, true);
        assert.equal(finishFrames(socket).length, 1);
    });

    test('finalize closes the write gate immediately and task-finished closes the task and watchdog', async () => {
        const h = makeHarness();
        const { socket, taskId } = startTask(h);
        const binaryBefore = socket.sent.filter(Buffer.isBuffer).length;
        const finalized = h.stt.finalize();

        assert.throws(() => h.stt.write(pcm(10)), /finaliz|write/i);
        assert.equal(socket.sent.filter(Buffer.isBuffer).length, binaryBefore);
        socket.message({ header: { event: 'task-finished', task_id: taskId }, payload: {} });
        await finalized;

        assert.throws(() => h.stt.write(pcm(10)), /finaliz|write/i);
        assert.equal(socket.sent.filter(Buffer.isBuffer).length, binaryBefore);
        assert.equal(socket.closeCalls.length, 1);
        assert.equal(h.timers.jobs.size, 0);
    });

    test('finalize deadline leaves the write gate closed', async () => {
        const h = makeHarness();
        const { socket } = startTask(h);
        const binaryBefore = socket.sent.filter(Buffer.isBuffer).length;
        const finalized = h.stt.finalize();
        h.timers.advance(10_000);
        await finalized;

        assert.throws(() => h.stt.write(pcm(10)), /finaliz|write/i);
        assert.equal(socket.sent.filter(Buffer.isBuffer).length, binaryBefore);
    });

    test('unsolicited matching task-finished is terminal and closes later writes', () => {
        const h = makeHarness();
        const { socket, taskId } = startTask(h);
        socket.message({ header: { event: 'task-finished', task_id: taskId }, payload: {} });

        assert.throws(() => h.stt.write(pcm(10)), /closed|finaliz|write/i);
        assert.equal(socket.closeCalls.length, 1);
        assert.equal(h.timers.jobs.size, 0);
    });

    test('task-failed rejects finalize with a redacted metadata-only error', async () => {
        const h = makeHarness();
        const { socket, taskId } = startTask(h);
        const errors = [];
        h.stt.on('error', error => errors.push(error));
        const finalized = h.stt.finalize();
        socket.message({
            header: {
                event: 'task-failed', task_id: taskId,
                error_code: 'InvalidParameter',
                error_message: 'Bearer fake-alibaba-api-key raw provider body',
            },
            payload: {},
        });
        await assert.rejects(finalized, error => {
            assert.equal(error.code, 'alibaba-task-failed');
            assert.equal(error.taskId, taskId);
            assert.equal(error.message.includes('fake-alibaba-api-key'), false);
            assert.equal(error.message.includes('raw provider body'), false);
            return true;
        });
        assert.equal(errors.length, 1);
    });

    test('task-failed without finalize is a terminal metadata-only error and rejects later writes', () => {
        const h = makeHarness();
        const { socket, taskId } = startTask(h);
        const errors = [];
        const binaryBefore = socket.sent.filter(Buffer.isBuffer).length;
        h.stt.on('error', error => errors.push(error));

        socket.message({
            header: {
                event: 'task-failed',
                task_id: taskId,
                error_code: 'ProviderFailure',
                error_message: 'Bearer fake-alibaba-api-key raw transcript body',
            },
            payload: {},
        });

        assert.equal(errors.length, 1);
        assert.equal(errors[0].code, 'alibaba-task-failed');
        assert.equal(errors[0].taskId, taskId);
        assert.equal(errors[0].message.includes('fake-alibaba-api-key'), false);
        assert.equal(errors[0].message.includes('raw transcript body'), false);
        assert.equal(socket.closeCalls.length, 1);
        assert.equal(h.timers.jobs.size, 0);
        assert.throws(() => h.stt.write(pcm(10)), /closed|failed|write/i);
        assert.equal(socket.sent.filter(Buffer.isBuffer).length, binaryBefore);
    });

    test('socket close rejects an active finalize while its deadline and no-task finalize settle finitely', async () => {
        const closed = makeHarness();
        const active = startTask(closed);
        const closePromise = closed.stt.finalize();
        active.socket.serverClose(1006, 'network details');
        await assert.rejects(closePromise, error => error.code === 'alibaba-socket-closed');

        const deadline = makeHarness();
        const running = startTask(deadline);
        const deadlinePromise = deadline.stt.finalize();
        deadline.timers.advance(10_000);
        await deadlinePromise;
        assert.equal(finishFrames(running.socket).length, 1);

        const idle = makeHarness();
        await idle.stt.finalize();
        assert.equal(idle.sockets.length, 0);
    });

    test('isolates old generation and old task callbacks without resetting the shared timeline', () => {
        const h = makeHarness();
        const old = startTask(h);
        const transcripts = [];
        h.stt.on('transcript', value => transcripts.push(value));

        h.timeline.beginSession(2, 5_000);
        h.stt.beginCaptureSession(2, 123_456);
        h.setMonotonic(5_100);
        const current = startTask(h);
        old.socket.message(result(old.taskId, { text: 'old generation' }));
        old.socket.emit('close', 1006, Buffer.from('late close'));
        current.socket.message(result(TASK_IDS[0], { text: 'old task id' }));
        current.socket.message(result(current.taskId, { text: 'current' }));

        assert.deepEqual(transcripts.map(value => value.text), ['current']);
        assert.equal(h.sockets.length, 2);
        assert.equal(transcripts[0].segmentId, 1);
    });

    test('a new capture generation gets its own finalize promise and finish frame', async () => {
        const h = makeHarness();
        const first = startTask(h);
        const firstFinalize = h.stt.finalize();
        first.socket.message({ header: { event: 'task-finished', task_id: first.taskId }, payload: {} });
        await firstFinalize;

        h.timeline.beginSession(2, 5_000);
        h.stt.beginCaptureSession(2, 5_000);
        h.setMonotonic(5_100);
        const second = startTask(h);
        const secondFinalize = h.stt.finalize();
        assert.notEqual(secondFinalize, firstFinalize);
        assert.equal(finishFrames(second.socket).length, 1);
        second.socket.message({ header: { event: 'task-finished', task_id: second.taskId }, payload: {} });
        await secondFinalize;
    });

    test('stop invalidates callbacks, cancels timers, closes the socket, and rejects later writes', () => {
        const h = makeHarness();
        const { socket, taskId } = startTask(h);
        const transcripts = [];
        h.stt.on('transcript', value => transcripts.push(value));
        h.stt.stop();
        assert.equal(h.timers.jobs.size, 0);
        assert.equal(socket.closeCalls.length, 1);
        assert.throws(() => h.stt.write(pcm(10)), /stopped/i);
        socket.message(result(taskId, { text: 'late' }));
        assert.deepEqual(transcripts, []);
    });

    test('reconnects with capped exponential backoff, a new task id, and never replays sent PCM', () => {
        const h = makeHarness();
        const first = startTask(h, pcm(100, 16_000, 1));
        first.socket.serverClose(1006, 'network');
        assert.deepEqual(h.timers.delays(), [1_000]);
        h.stt.write(pcm(100, 16_000, 2));
        h.timers.advance(1_000);
        const secondSocket = h.sockets[1];
        secondSocket.open();
        const secondTaskId = runFrames(secondSocket)[0].header.task_id;
        assert.notEqual(secondTaskId, first.taskId);
        secondSocket.message({ header: { event: 'task-started', task_id: secondTaskId }, payload: {} });
        assert.deepEqual(secondSocket.sent.filter(Buffer.isBuffer).map(value => value[0]), [2]);

        const observed = [];
        for (let attempt = 0; attempt < 9; attempt++) {
            const current = h.sockets.at(-1);
            current.serverClose(1006, 'network');
            const delay = h.timers.delays()[0];
            observed.push(delay);
            h.stt.write(pcm(10, 16_000, attempt + 3));
            h.timers.advance(delay);
            h.sockets.at(-1).open();
            const taskId = runFrames(h.sockets.at(-1))[0].header.task_id;
            h.sockets.at(-1).message({ header: { event: 'task-started', task_id: taskId }, payload: {} });
        }
        assert.deepEqual(observed, [2_000, 4_000, 8_000, 16_000, 30_000, 30_000, 30_000, 30_000, 30_000]);
        h.sockets.at(-1).serverClose(1006, 'network');
        assert.equal(h.timers.jobs.size, 0);
        const exhaustedSocketCount = h.sockets.length;
        assert.throws(() => h.stt.write(pcm(10)), /reconnect|exhaust/i);
        assert.equal(h.sockets.length, exhaustedSocketCount);

        h.timeline.beginSession(2, 5_000);
        h.stt.beginCaptureSession(2, 5_000);
        h.setMonotonic(5_100);
        h.stt.write(pcm(10));
        assert.equal(h.sockets.length, exhaustedSocketCount + 1);
    });

    test('disconnect before task-started drops old queued audio and empty backoff does not create a task', () => {
        const h = makeHarness();
        h.stt.write(pcm(100, 16_000, 7));
        h.sockets[0].serverClose(1006, 'network');

        h.timers.advance(1_000);

        assert.equal(h.sockets.length, 1);
        assert.equal(h.sockets[0].sent.filter(Buffer.isBuffer).length, 0);
    });

    test('finalize clears an already scheduled retry when no task remains', async () => {
        const h = makeHarness();
        const { socket } = startTask(h);
        socket.serverClose(1006, 'network');
        assert.equal(h.timers.jobs.size, 1);

        await h.stt.finalize();

        assert.equal(h.timers.jobs.size, 0);
    });

    test('only audio written after disconnect enters the replacement task queue', () => {
        const h = makeHarness();
        h.stt.write(pcm(100, 16_000, 7));
        h.sockets[0].serverClose(1006, 'network');
        h.stt.write(pcm(100, 16_000, 9));

        h.timers.advance(1_000);
        const replacement = h.sockets[1];
        replacement.open();
        const replacementTaskId = runFrames(replacement)[0].header.task_id;
        replacement.message({ header: { event: 'task-started', task_id: replacementTaskId }, payload: {} });

        assert.deepEqual(replacement.sent.filter(Buffer.isBuffer).map(value => value[0]), [9]);
    });

    test('treats 401 and 403 handshake responses as fatal without reconnecting', () => {
        for (const statusCode of [401, 403]) {
            const h = makeHarness();
            h.stt.write(pcm(100));
            const errors = [];
            const warnings = [];
            h.stt.on('error', error => errors.push(error));
            h.stt.on('warning', warning => warnings.push(warning));
            h.sockets[0].emit('unexpected-response', {}, { statusCode });
            assert.equal(h.timers.jobs.size, 0);
            assert.equal(errors.length, 1);
            assert.equal(errors[0].code, 'alibaba-auth-failed');
            assert.equal(errors[0].message.includes(String(statusCode)), true);
            assert.equal(errors[0].message.includes('fake-alibaba-api-key'), false);
            assert.throws(() => h.stt.write(pcm(6_000)), /auth|closed|terminal/i);
            assert.equal(h.sockets.length, 1);
            assert.deepEqual(warnings, []);
        }
    });

    test('handles 429 and 500 handshake responses as retryable bounded failures', () => {
        for (const statusCode of [429, 500]) {
            const h = makeHarness();
            h.stt.write(pcm(100));
            const socket = h.sockets[0];

            socket.emit('unexpected-response', {}, { statusCode });

            assert.equal(socket.closeCalls.length, 1);
            assert.deepEqual(h.timers.delays(), [1_000]);
        }
    });

    test('retryable handshake failure rejects finalize without scheduling reconnect', async () => {
        const h = makeHarness();
        h.stt.write(pcm(100));
        const socket = h.sockets[0];
        const finalized = h.stt.finalize();

        socket.emit('unexpected-response', {}, { statusCode: 500 });

        await assert.rejects(finalized, error => {
            assert.equal(error.code, 'alibaba-handshake-failed');
            assert.equal(error.message.includes('500'), true);
            assert.equal(error.message.includes('fake-alibaba-api-key'), false);
            return true;
        });
        assert.equal(socket.closeCalls.length, 1);
        assert.equal(h.timers.jobs.size, 0);
    });

    test('stale unexpected-response cannot terminate or schedule retries for a new generation', () => {
        const h = makeHarness();
        h.stt.write(pcm(100));
        const oldSocket = h.sockets[0];
        h.timeline.beginSession(2, 5_000);
        h.stt.beginCaptureSession(2, 5_000);
        h.setMonotonic(5_100);
        h.stt.write(pcm(100));
        const currentSocket = h.sockets[1];

        oldSocket.emit('unexpected-response', {}, { statusCode: 500 });

        assert.equal(currentSocket.closeCalls.length, 0);
        assert.equal(h.timers.jobs.size, 0);
        assert.doesNotThrow(() => h.stt.write(pcm(10)));
    });

    test('socket close during finalize does not schedule a reconnect timer', async () => {
        const h = makeHarness();
        const { socket } = startTask(h);
        const finalized = h.stt.finalize();

        socket.serverClose(1006, 'network');

        await assert.rejects(finalized, error => error.code === 'alibaba-socket-closed');
        assert.equal(h.timers.jobs.size, 0);
    });

    test('watchdog reconnects after 75 seconds and any parseable event refreshes liveness', () => {
        const h = makeHarness();
        const { socket, taskId } = startTask(h);
        h.timers.advance(70_000);
        socket.message({ header: { event: 'task-started', task_id: taskId }, payload: {} });
        h.timers.advance(70_000);
        assert.equal(h.sockets.length, 1);
        h.timers.advance(5_000);
        assert.deepEqual(h.timers.delays(), [1_000]);
    });

    test('watchdog starts when run-task is sent even if task-started never arrives', () => {
        const h = makeHarness();
        h.stt.write(pcm(100));
        const socket = h.sockets[0];
        socket.open();

        h.timers.advance(75_000);

        assert.equal(socket.closeCalls.length, 1);
        assert.deepEqual(h.timers.delays(), [1_000]);
    });

    test('validates configuration and sends only the official language hint without continue-task context', () => {
        const h = makeHarness();
        assert.throws(() => h.stt.setSampleRate(0), /sample rate/i);
        assert.throws(() => h.stt.setSampleRate(16_000.5), /sample rate/i);
        assert.throws(() => h.stt.setAudioChannelCount(2), /mono|channel/i);
        h.stt.setAudioChannelCount(1);
        h.stt.setSampleRate(8_000);
        h.stt.setRecognitionLanguage('chinese');
        const started = startTask(h, pcm(100, 8_000));
        const runTask = runFrames(started.socket)[0];
        assert.equal(runTask.payload.parameters.sample_rate, 8_000);
        assert.deepEqual(runTask.payload.parameters.language_hints, ['zh']);
        assert.equal(started.socket.sent.some(value => typeof value === 'string' && value.includes('continue-task')), false);
        assert.throws(() => h.stt.setSampleRate(16_000), /active task/i);
        assert.throws(() => h.stt.setRecognitionLanguage('not-a-language'), /language/i);
    });
});
