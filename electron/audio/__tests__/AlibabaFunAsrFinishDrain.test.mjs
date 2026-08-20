import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, '..', '..', '..');

const loadDrainModule = () => import('../sttDrain.ts');

const deferred = () => {
    let resolve;
    let reject;
    const promise = new Promise((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });
    return { promise, resolve, reject };
};

test('waitForSttDrain waits for both provider finalizers', async () => {
    const { waitForSttDrain } = await loadDrainModule();
    const interviewer = deferred();
    const user = deferred();
    let settled = false;

    const resultPromise = waitForSttDrain([interviewer.promise, user.promise], 2000)
        .then(result => {
            settled = true;
            return result;
        });

    await Promise.resolve();
    assert.equal(settled, false);
    interviewer.resolve();
    await Promise.resolve();
    assert.equal(settled, false);
    user.resolve();

    assert.equal(await resultPromise, 'completed');
});

test('waitForSttDrain treats rejection as settled and bounds a stuck provider', async () => {
    const { waitForSttDrain } = await loadDrainModule();
    const rejected = Promise.reject(new Error('finish failed'));
    assert.equal(await waitForSttDrain([rejected], 2000), 'completed');

    const stuck = deferred();
    let fireTimeout;
    let clearedTimer;
    const resultPromise = waitForSttDrain([stuck.promise], 2000, {
        setTimeout(callback, delayMs) {
            assert.equal(delayMs, 2000);
            fireTimeout = callback;
            return 41;
        },
        clearTimeout(timer) {
            clearedTimer = timer;
        },
    });

    assert.equal(typeof fireTimeout, 'function');
    fireTimeout();
    assert.equal(await resultPromise, 'timed-out');
    assert.equal(clearedTimer, 41);
});

test('waitForSttDrain can preserve the legacy trailing-final grace without exceeding the deadline', async () => {
    const { waitForSttDrain } = await loadDrainModule();
    const callbacks = new Map();
    let nextTimer = 0;
    let settled = false;
    const resultPromise = waitForSttDrain([Promise.resolve()], 2000, {
        minimumWaitMs: 250,
        setTimeout(callback, delayMs) {
            nextTimer += 1;
            callbacks.set(delayMs, { callback, timer: nextTimer });
            return nextTimer;
        },
        clearTimeout(timer) {
            for (const [delayMs, entry] of callbacks) {
                if (entry.timer === timer) callbacks.delete(delayMs);
            }
        },
    }).then(result => {
        settled = true;
        return result;
    });

    await Promise.resolve();
    await Promise.resolve();
    assert.equal(settled, false);
    callbacks.get(250).callback();
    assert.equal(await resultPromise, 'completed');
    assert.equal(callbacks.has(2000), false);
});

test('main snapshots providers, finalizes once, awaits the bounded drain, then stops the same providers', () => {
    const source = fs.readFileSync(path.join(repoRoot, 'electron', 'main.ts'), 'utf8');
    assert.match(source, /import\s+\{\s*waitForSttDrain\s*\}\s+from\s+["']\.\/audio\/sttDrain["']/);
    assert.match(source, /const drainingSttProviders = \[this\.googleSTT, this\.googleSTT_User\]/);
    assert.match(source, /const finishPromises = drainingSttProviders[\s\S]*?provider\.finalize\?\.\(\)/);

    const teardown = source.match(/this\._pendingTeardown = \(async \(\) => \{([\s\S]*?)\n\s*}\)\(\);/);
    assert.ok(teardown, 'background teardown should exist');
    const waitIndex = teardown[1].indexOf('await waitForSttDrain(finishPromises, 2000, { minimumWaitMs: 250 })');
    const stopIndex = teardown[1].indexOf('drainingSttProviders.forEach');
    assert.ok(waitIndex >= 0, 'background teardown should await both finish promises');
    assert.ok(stopIndex > waitIndex, 'the snapshotted providers must stop only after the drain');
    assert.doesNotMatch(teardown[1], /setTimeout\(resolve, 250\)/);
});
