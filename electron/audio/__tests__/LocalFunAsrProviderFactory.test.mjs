import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { createLocalFunAsrProviderPair } = require(path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../../dist-electron/electron/audio/localFunAsrProviderFactory.js',
));

test('local pair creates two channels over one timeline and begins them atomically', () => {
    const calls = [];
    const providers = [];
    const timeline = {
        beginSession: (generation, origin) => calls.push(['timeline', generation, origin]),
    };
    const pair = createLocalFunAsrProviderPair({}, {
        createTimeline: () => timeline,
        createProvider: options => {
            const provider = {
                options,
                beginCaptureSession: (generation, origin) => calls.push([options.channel, generation, origin]),
            };
            providers.push(provider);
            return provider;
        },
    });

    assert.strictEqual(pair.interviewer, providers[0]);
    assert.strictEqual(pair.user, providers[1]);
    assert.strictEqual(providers[0].options.timeline, timeline);
    assert.strictEqual(providers[1].options.timeline, timeline);
    assert.deepEqual(providers.map(provider => provider.options.channel), ['interviewer', 'user']);

    pair.beginSession(9, 2500.5);
    assert.deepEqual(calls, [
        ['timeline', 9, 2500.5],
        ['interviewer', 9, 2500.5],
        ['user', 9, 2500.5],
    ]);
});
