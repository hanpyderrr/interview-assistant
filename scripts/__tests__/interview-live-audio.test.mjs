import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPowerShellPlaybackCommand,
  collectInterviewSnapshot,
  findInterviewLauncherPage,
  waitForAnswerArtifacts,
} from '../interview-live-audio.mjs';

function makeLocator(entry = {}) {
  return {
    async isVisible() {
      return Boolean(entry.visible);
    },
    async innerText() {
      return entry.text ?? '';
    },
    async count() {
      return entry.count ?? (entry.visible ? 1 : 0);
    },
  };
}

function makePage(routeMap) {
  return {
    url() {
      return routeMap.url;
    },
    locator(selector) {
      return makeLocator(routeMap[selector] || {});
    },
  };
}

test('findInterviewLauncherPage returns the launcher interview page from a page list', () => {
  const launcher = { url: () => 'http://localhost:5180/?interview=1&window=launcher' };
  const settings = { url: () => 'http://localhost:5180/?interview=1&window=settings' };

  assert.equal(findInterviewLauncherPage([settings, launcher]), launcher);
});

test('buildPowerShellPlaybackCommand plays a WAV synchronously', () => {
  const command = buildPowerShellPlaybackCommand('C:\\temp\\question-01.wav');
  const joined = command.join(' ');

  assert.match(joined, /System\.Media\.SoundPlayer/);
  assert.match(joined, /PlaySync/);
  assert.match(joined, /question-01\.wav/);
});

test('collectInterviewSnapshot reads the live transcript and answer DOM contract', async () => {
  const page = makePage({
    url: 'http://localhost:5180/?interview=1&window=launcher',
    '.candidate-transcript': { visible: true },
    '.candidate-transcript p': { visible: true, text: '我的回答' },
    '.interviewer-transcript .live-caption': { text: '面试官问题' },
    '.confirmed-question p': { visible: true, text: '已确认问题' },
    '.spoken-answer p': { visible: true, text: '口述版回答' },
    '.signal-header': { text: '输入信号 LIVE' },
    '.session-meta': { text: '停止采集 / LIVE / 00:12' },
    '.hit-row': { count: 5, visible: true },
  });

  const snapshot = await collectInterviewSnapshot(page);

  assert.equal(snapshot.url, 'http://localhost:5180/?interview=1&window=launcher');
  assert.equal(snapshot.candidateVisible, true);
  assert.equal(snapshot.candidateText, '我的回答');
  assert.equal(snapshot.interviewerText, '面试官问题');
  assert.equal(snapshot.confirmedQuestion, '已确认问题');
  assert.equal(snapshot.answerText, '口述版回答');
  assert.equal(snapshot.liveText, '输入信号 LIVE');
  assert.equal(snapshot.statusText, '停止采集 / LIVE / 00:12');
  assert.equal(snapshot.hitCount, 5);
});

test('waitForAnswerArtifacts waits for the answered status before returning', async () => {
  const state = {
    confirmedVisible: true,
    confirmedQuestion: '已确认问题',
    answerText: '这个项目是在 **RK',
    hitVisible: true,
    statusAnswered: false,
  };

  let releaseStatus;
  const statusReady = new Promise((resolve) => {
    releaseStatus = resolve;
  });

  const page = {
    locator(selector) {
      if (selector === '.confirmed-question') {
        return {
          async waitFor() {
            assert.equal(state.confirmedVisible, true);
          },
        };
      }
      if (selector === '.confirmed-question p') {
        return {
          async innerText() {
            return state.confirmedQuestion;
          },
        };
      }
      if (selector === '.session-meta .status-answered') {
        return {
          async waitFor() {
            await statusReady;
          },
        };
      }
      if (selector === '.hit-row') {
        return {
          first() {
            return {
              async waitFor() {
                assert.equal(state.hitVisible, true);
              },
            };
          },
        };
      }
      if (selector === '.spoken-answer p') {
        return {
          async innerText() {
            return state.answerText;
          },
        };
      }
      throw new Error(`Unexpected selector: ${selector}`);
    },
    async waitForFunction(predicate, args) {
      const previousDocument = globalThis.document;
      globalThis.document = {
        querySelector(selector) {
          if (selector === '.confirmed-question p') return { textContent: state.confirmedQuestion };
          if (selector === '.spoken-answer p') return { textContent: state.answerText };
          return null;
        },
      };
      try {
        assert.equal(await predicate(args), true);
      } finally {
        globalThis.document = previousDocument;
      }
    },
  };

  const startedAt = Date.now();
  const replay = waitForAnswerArtifacts(page, 1_000);
  setTimeout(() => {
    state.statusAnswered = true;
    releaseStatus();
  }, 40);
  await replay;
  assert.ok(Date.now() - startedAt >= 35);
});
