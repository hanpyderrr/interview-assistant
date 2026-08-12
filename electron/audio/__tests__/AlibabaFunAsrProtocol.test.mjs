import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
    ALIBABA_FUN_ASR_MODELS,
    ALIBABA_FUN_ASR_REGIONS,
    buildAlibabaEndpoint,
    buildContinueTask,
    buildFinishTask,
    buildRunTask,
    parseAlibabaServerEvent,
    redactAlibabaError,
} from '../AlibabaFunAsrProtocol.ts';

const TASK_ID = '123e4567-e89b-42d3-a456-426614174000';

describe('Alibaba Fun-ASR protocol', () => {
    test('builds only official workspace endpoints for confirmed regions', () => {
        assert.equal(
            buildAlibabaEndpoint('ws-1234567890abcdef', 'cn-beijing'),
            'wss://ws-1234567890abcdef.cn-beijing.maas.aliyuncs.com/api-ws/v1/inference',
        );
        assert.equal(
            buildAlibabaEndpoint('workspace123', 'ap-southeast-1'),
            'wss://workspace123.ap-southeast-1.maas.aliyuncs.com/api-ws/v1/inference',
        );

        for (const workspaceId of ['', '.evil.example', 'workspace.example', 'ws/a', '-ws', 'ws-', 'UPPER']) {
            assert.throws(() => buildAlibabaEndpoint(workspaceId, 'cn-beijing'));
        }
        assert.throws(() => buildAlibabaEndpoint('workspace123', 'us-east-1'));
        assert.throws(() => buildAlibabaEndpoint('wss://evil.example', 'cn-beijing'));
    });

    test('exposes exactly the confirmed immutable model allowlist', () => {
        assert.deepEqual(ALIBABA_FUN_ASR_MODELS, [
            'fun-asr-realtime',
            'fun-asr-realtime-2026-02-28',
        ]);
        assert.equal(Object.isFrozen(ALIBABA_FUN_ASR_MODELS), true);
    });

    test('exposes exactly the confirmed immutable region allowlist', () => {
        assert.deepEqual(ALIBABA_FUN_ASR_REGIONS, [
            'cn-beijing',
            'ap-southeast-1',
        ]);
        assert.equal(Object.isFrozen(ALIBABA_FUN_ASR_REGIONS), true);
    });

    test('builds the exact run-task schema and defaults to the stable model', () => {
        assert.deepEqual(buildRunTask(TASK_ID, { sampleRate: 16_000 }), {
            header: {
                action: 'run-task',
                task_id: TASK_ID,
                streaming: 'duplex',
            },
            payload: {
                task_group: 'audio',
                task: 'asr',
                function: 'recognition',
                model: 'fun-asr-realtime',
                parameters: {
                    format: 'pcm',
                    sample_rate: 16_000,
                    heartbeat: true,
                    semantic_punctuation_enabled: false,
                    max_sentence_silence: 1_300,
                },
                input: {},
            },
        });
    });

    test('adds one language hint and a precompiled vocabulary id without inline vocabulary', () => {
        const message = buildRunTask(TASK_ID, {
            sampleRate: 8_000,
            model: 'fun-asr-realtime-2026-02-28',
            languageHint: 'zh',
            vocabularyId: 'vocab-interview-01',
        });

        assert.deepEqual(message.payload.parameters.language_hints, ['zh']);
        assert.equal(message.payload.parameters.vocabulary_id, 'vocab-interview-01');
        assert.equal('vocabulary' in message.payload.parameters, false);
    });

    test('rejects arbitrary models and invalid run-task inputs', () => {
        assert.throws(() => buildRunTask(TASK_ID, { sampleRate: 16_000, model: 'arbitrary-model' }));
        assert.throws(() => buildRunTask('not-a-uuid', { sampleRate: 16_000 }));
        assert.throws(() => buildRunTask(TASK_ID, { sampleRate: 0 }));
        assert.throws(() => buildRunTask(TASK_ID, { sampleRate: 16_000, languageHint: '' }));
        assert.throws(() => buildRunTask(TASK_ID, { sampleRate: 16_000, vocabularyId: '' }));
    });

    test('builds continue-task only from validated context messages', () => {
        const context = [
            { role: 'user', content: [{ type: 'input_text', text: 'MySQL' }] },
            { role: 'assistant', content: [{ type: 'text', text: 'database' }] },
        ];
        assert.deepEqual(buildContinueTask(TASK_ID, context), {
            header: {
                action: 'continue-task',
                task_id: TASK_ID,
                streaming: 'duplex',
            },
            payload: { input: { context } },
        });
    });

    test('rejects arbitrary continue-task context shapes', () => {
        const invalidContexts = [
            { role: 'user', content: [{ type: 'input_text', text: 'not an array' }] },
            [{ role: 'system', content: [{ type: 'text', text: 'x' }] }],
            [{ role: 'user', content: [{ type: 'audio', text: 'x' }] }],
            [{ role: 'assistant', content: [{ type: 'text' }] }],
            [{ role: 'assistant', content: [{ type: 'text', text: 1 }] }],
            [{ role: 'user', content: [] }],
            [{ role: 'user', content: [{ type: 'text', text: 'x', arbitrary: true }] }],
        ];
        for (const context of invalidContexts) {
            assert.throws(() => buildContinueTask(TASK_ID, context));
        }
        assert.throws(() => buildContinueTask('not-a-uuid', []));
    });

    test('rejects context content types that do not match their roles', () => {
        assert.throws(() => buildContinueTask(TASK_ID, [
            { role: 'user', content: [{ type: 'text', text: 'wrong user type' }] },
        ]));
        assert.throws(() => buildContinueTask(TASK_ID, [
            { role: 'assistant', content: [{ type: 'input_text', text: 'wrong assistant type' }] },
        ]));
    });

    test('builds the exact finish-task schema', () => {
        assert.deepEqual(buildFinishTask(TASK_ID), {
            header: {
                action: 'finish-task',
                task_id: TASK_ID,
                streaming: 'duplex',
            },
            payload: { input: {} },
        });
        assert.throws(() => buildFinishTask('not-a-uuid'));
    });

    test('parses all supported server event types', () => {
        const started = parseAlibabaServerEvent(JSON.stringify({
            header: { event: 'task-started', task_id: TASK_ID },
            payload: {},
        }));
        assert.deepEqual(started, {
            ok: true,
            event: { type: 'task-started', taskId: TASK_ID },
        });

        const generated = parseAlibabaServerEvent(JSON.stringify({
            header: { event: 'result-generated', task_id: TASK_ID },
            payload: {
                output: {
                    sentence: {
                        begin_time: 10,
                        end_time: 120,
                        text: 'hello',
                        heartbeat: false,
                        sentence_end: true,
                        sentence_id: 7,
                        words: [{ begin_time: 10, end_time: 100, text: 'hello', punctuation: ',' }],
                    },
                },
            },
        }));
        assert.equal(generated.ok, true);
        assert.deepEqual(generated.event.sentence, {
            beginTime: 10,
            endTime: 120,
            text: 'hello',
            heartbeat: false,
            sentenceEnd: true,
            sentenceId: 7,
            words: [{ beginTime: 10, endTime: 100, text: 'hello', punctuation: ',' }],
        });

        assert.deepEqual(parseAlibabaServerEvent({
            header: { event: 'task-finished', task_id: TASK_ID },
            payload: {},
        }), { ok: true, event: { type: 'task-finished', taskId: TASK_ID } });

        assert.deepEqual(parseAlibabaServerEvent({
            header: {
                event: 'task-failed',
                task_id: TASK_ID,
                error_code: 'InvalidParameter',
                error_message: 'bad request',
            },
            payload: {},
        }), {
            ok: true,
            event: {
                type: 'task-failed',
                taskId: TASK_ID,
                errorCode: 'InvalidParameter',
                errorMessage: 'bad request',
            },
        });
    });

    test('accepts partial and heartbeat sentences with null end times', () => {
        const parseSentence = (heartbeat) => parseAlibabaServerEvent({
            header: { event: 'result-generated', task_id: TASK_ID },
            payload: {
                output: {
                    sentence: {
                        begin_time: 10,
                        end_time: null,
                        text: heartbeat ? '' : 'partial',
                        heartbeat,
                        sentence_end: false,
                        sentence_id: 8,
                        words: [],
                    },
                },
            },
        });

        for (const heartbeat of [false, true]) {
            const result = parseSentence(heartbeat);
            assert.equal(result.ok, true);
            assert.equal(result.event.sentence.endTime, null);
            assert.equal(result.event.sentence.heartbeat, heartbeat);
            assert.equal(result.event.sentence.sentenceEnd, false);
        }
    });

    test('returns typed protocol errors for unknown or malformed events without raw frames', () => {
        const raw = JSON.stringify({
            header: { event: 'surprise', task_id: TASK_ID, secret: 'fake-alibaba-api-key' },
        });
        const unknown = parseAlibabaServerEvent(raw);
        assert.deepEqual(unknown, {
            ok: false,
            error: {
                kind: 'alibaba-protocol-error',
                code: 'unknown-event',
                message: 'Unsupported Alibaba server event',
            },
        });
        assert.equal(JSON.stringify(unknown).includes('fake-alibaba-api-key'), false);

        const malformed = parseAlibabaServerEvent('{bad json fake-alibaba-api-key');
        assert.equal(malformed.ok, false);
        assert.equal(malformed.error.kind, 'alibaba-protocol-error');
        assert.equal(malformed.error.code, 'malformed-message');
        assert.equal(JSON.stringify(malformed).includes('fake-alibaba-api-key'), false);
    });

    test('rejects malformed sentence values, invalid time ranges, words, and task ids', () => {
        const sentence = {
            begin_time: 10,
            end_time: 20,
            text: 'hello',
            heartbeat: false,
            sentence_end: true,
            sentence_id: 1,
            words: [],
        };
        const resultFor = (overrides) => parseAlibabaServerEvent({
            header: { event: 'result-generated', task_id: TASK_ID },
            payload: { output: { sentence: { ...sentence, ...overrides } } },
        });

        for (const overrides of [
            { begin_time: -1 },
            { begin_time: Number.POSITIVE_INFINITY },
            { begin_time: 30, end_time: 20 },
            { end_time: null, sentence_end: true },
            { text: 1 },
            { heartbeat: 'false' },
            { sentence_end: 1 },
            { sentence_id: '1' },
            { words: [{ begin_time: 0, end_time: 1, text: 2 }] },
        ]) {
            const result = resultFor(overrides);
            assert.equal(result.ok, false);
            assert.equal(result.error.code, 'malformed-message');
        }

        const badTask = parseAlibabaServerEvent({
            header: { event: 'task-started', task_id: 'not-a-uuid' },
            payload: {},
        });
        assert.equal(badTask.ok, false);
        assert.equal(badTask.error.code, 'malformed-message');
    });

    test('redacts credentials, URL queries, control characters, and limits message length', () => {
        const redacted = redactAlibabaError(
            'Authorization: Bearer fake-alibaba-api-key\n' +
            'GET https://example.test/path?api_key=fake-alibaba-api-key&x=1\u0000 ' +
            'Bearer fake-alibaba-api-key ' + 'x'.repeat(1_000),
        );
        assert.equal(redacted.includes('fake-alibaba-api-key'), false);
        assert.equal(redacted.includes('?api_key='), false);
        assert.equal(/[\u0000-\u001f\u007f]/u.test(redacted), false);
        assert.ok(redacted.length <= 240);
    });

    test('redacts WebSocket URL queries and C1 control characters', () => {
        const redacted = redactAlibabaError(
            'connect wss://workspace123.cn-beijing.maas.aliyuncs.com/api-ws/v1/inference' +
            '?token=fake-alibaba-api-key&unknown_credential=fake-alibaba-api-key' +
            '\u0085middle\u009Bend',
        );
        assert.equal(redacted.includes('fake-alibaba-api-key'), false);
        assert.equal(redacted.includes('token='), false);
        assert.equal(redacted.includes('unknown_credential='), false);
        assert.equal(/[\u0080-\u009f]/u.test(redacted), false);
    });
});
