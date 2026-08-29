import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { createQuestionRoundCoordinator } from '../../../src/interview-console/questionRoundCoordinator.ts';

const require = createRequire(import.meta.url);
const dist = name => path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    `../../../dist-electron/electron/audio/${name}.js`,
);
const { CaptureAudioTimeline } = require(dist('CaptureAudioTimeline'));
const { LocalFunAsrSTT } = require(dist('LocalFunAsrSTT'));

const pcm = (durationMs, fill) => Buffer.alloc(Math.round(16_000 * durationMs / 1_000) * 2, fill);

function coordinator() {
    let answerId = 0;
    return createQuestionRoundCoordinator({ allocateAnswerId: () => ++answerId });
}

test('Local FunASR timestamps split real questions across a long silent keepalive gap', async () => {
    const timeline = new CaptureAudioTimeline();
    timeline.beginSession(1, 1_000);
    let now = 1_100;
    let response = 0;
    const provider = new LocalFunAsrSTT({
        channel: 'interviewer',
        timeline,
        monotonicNow: () => now,
        requestTranscription: async () => ({ text: `问题${++response}` }),
    });
    provider.beginCaptureSession(1, 1_000);
    const finals = [];
    provider.on('transcript', segment => finals.push(segment));

    provider.write(pcm(100, 5));
    provider.notifySpeechEnded();
    now = 1_200;
    provider.write(pcm(100, 0));
    now = 11_100;
    provider.write(pcm(100, 6));
    provider.notifySpeechEnded();
    await provider.flush();

    assert.equal(finals.length, 2);
    assert.deepEqual(
        finals.map(final => [final.audioStartMs, final.audioEndMs]),
        [[0, 100], [10_000, 10_100]],
    );

    const rounds = coordinator();
    rounds.acceptInterviewerFinal({
        ...finals[0], speaker: 'interviewer', final: true,
        sessionId: 1, sequence: 1, arrivalMs: 1_000,
    });
    const firstGenerate = rounds.tick(3_500).actions.find(action => action.type === 'generate');
    rounds.acceptInterviewerFinal({
        ...finals[1], speaker: 'interviewer', final: true,
        sessionId: 1, sequence: 2, arrivalMs: 11_000,
    });
    assert.equal(rounds.getSnapshot().boundaryReason, 'audio-gap');
    const secondGenerate = rounds.tick(13_500).actions.find(action => action.type === 'generate');

    assert.equal(typeof firstGenerate?.answerId, 'number');
    assert.equal(typeof secondGenerate?.answerId, 'number');
    assert.notEqual(firstGenerate.answerId, secondGenerate.answerId);
});

test('late final arrival does not split interviewer audio with a short real gap', () => {
    const rounds = coordinator();
    rounds.acceptInterviewerFinal({
        text: 'SPI 帧头怎么设计？', speaker: 'interviewer', final: true,
        sessionId: 1, sequence: 1, audioStartMs: 0, audioEndMs: 1_000, arrivalMs: 1_000,
    });
    const firstGenerate = rounds.tick(3_500).actions.find(action => action.type === 'generate');
    rounds.acceptInterviewerFinal({
        text: '半包呢？', speaker: 'interviewer', final: true,
        sessionId: 1, sequence: 2, audioStartMs: 1_500, audioEndMs: 2_000, arrivalMs: 12_000,
    });

    const snapshot = rounds.getSnapshot();
    assert.equal(snapshot.boundaryReason, 'first-round');
    assert.equal(snapshot.answerId, firstGenerate.answerId);
    assert.equal(snapshot.pendingQuestion, 'SPI 帧头怎么设计？ 半包呢？');
});
