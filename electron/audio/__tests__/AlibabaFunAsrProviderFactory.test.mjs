import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { createAlibabaFunAsrProviderPair } = require(path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../../dist-electron/electron/audio/alibabaFunAsrProviderFactory.js',
));

const validConfig = {
    apiKey: 'fake-task6-key',
    region: 'cn-beijing',
    model: 'fun-asr-realtime',
    workspaceId: 'workspace-task6',
    vocabularyId: 'vocab-task6',
};

class FakeTimeline {
    constructor(log) {
        this.log = log;
    }

    beginSession(generation, originMonotonicMs) {
        this.log.push(['timeline', generation, originMonotonicMs]);
    }
}

class FakeProvider {
    constructor(options) {
        this.options = options;
        this.beginError = undefined;
        FakeProvider.instances.push(this);
    }

    beginCaptureSession(generation, originMonotonicMs) {
        FakeProvider.log.push([this.options.channel, generation, originMonotonicMs]);
        if (this.beginError) throw this.beginError;
    }

    static reset() {
        FakeProvider.instances = [];
        FakeProvider.log = [];
    }
}
FakeProvider.reset();

const createHarness = (config = validConfig) => {
    FakeProvider.reset();
    const timelineLog = [];
    const pair = createAlibabaFunAsrProviderPair(config, {
        createTimeline: () => new FakeTimeline(timelineLog),
        createProvider: options => new FakeProvider(options),
    });
    return { pair, timelineLog };
};

describe('createAlibabaFunAsrProviderPair', () => {
    test('constructs distinct fixed-channel providers sharing one timeline and propagates config', () => {
        const { pair } = createHarness();

        assert.notStrictEqual(pair.interviewer, pair.user);
        assert.strictEqual(pair.interviewer, FakeProvider.instances[0]);
        assert.strictEqual(pair.user, FakeProvider.instances[1]);
        assert.strictEqual(pair.interviewer.options.timeline, pair.user.options.timeline);
        assert.deepEqual(FakeProvider.instances.map(provider => provider.options.channel), [
            'interviewer',
            'user',
        ]);
        for (const provider of FakeProvider.instances) {
            assert.deepEqual({
                apiKey: provider.options.apiKey,
                region: provider.options.region,
                model: provider.options.model,
                workspaceId: provider.options.workspaceId,
                vocabularyId: provider.options.vocabularyId,
            }, validConfig);
        }
    });

    test('begins the shared timeline once before both providers with identical session values', () => {
        const calls = [];
        FakeProvider.reset();
        const pair = createAlibabaFunAsrProviderPair(validConfig, {
            createTimeline: () => ({
                beginSession: (generation, origin) => calls.push(['timeline', generation, origin]),
            }),
            createProvider: options => ({
                channel: options.channel,
                beginCaptureSession: (generation, origin) => calls.push([options.channel, generation, origin]),
            }),
        });

        pair.beginSession(17, 1234.5);

        assert.deepEqual(calls, [
            ['timeline', 17, 1234.5],
            ['interviewer', 17, 1234.5],
            ['user', 17, 1234.5],
        ]);
    });

    test('throws either provider begin failure without invoking a fallback', () => {
        for (const failingChannel of ['interviewer', 'user']) {
            const { pair, timelineLog } = createHarness();
            pair[failingChannel].beginError = new Error(`${failingChannel} begin failed`);

            assert.throws(() => pair.beginSession(8, 900), new RegExp(`${failingChannel} begin failed`));
            assert.deepEqual(timelineLog, [['timeline', 8, 900]]);
            assert.deepEqual(FakeProvider.log, failingChannel === 'interviewer'
                ? [['interviewer', 8, 900]]
                : [['interviewer', 8, 900], ['user', 8, 900]]);
            assert.equal(FakeProvider.instances.length, 2);
        }
    });

    test('rejects missing credentials and invalid public config before constructing dependencies', () => {
        for (const config of [
            { ...validConfig, apiKey: '' },
            { ...validConfig, workspaceId: '' },
            { ...validConfig, model: 'not-a-model' },
            { ...validConfig, region: 'not-a-region' },
        ]) {
            let constructions = 0;
            assert.throws(() => createAlibabaFunAsrProviderPair(config, {
                createTimeline: () => { constructions += 1; return new FakeTimeline([]); },
                createProvider: options => { constructions += 1; return new FakeProvider(options); },
            }), /Alibaba|region|model|workspace|key/i);
            assert.equal(constructions, 0);
        }
    });
});
