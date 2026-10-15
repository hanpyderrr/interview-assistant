// ChatGPT plan ("Sign in with ChatGPT") inference + model catalog tests.
//
// These tests pin the OFFICIAL ChatGPT-plan contract documented in
// .planning/2026-10-15-chatgpt-login/models-and-inference.md:
//
//   1. Model catalog: GET https://api.openai.com/v1/models with the same
//      OAuth bearer token, filter `visibility === "list"`, preserve server
//      order, map slug -> id and display_name -> label, 20s timeout.
//   2. Inference: POST https://api.openai.com/v1/responses with ONLY normal
//      headers (Bearer / JSON / SSE). No Codex impersonation headers
//      (`originator`, `chatgpt-account-id`, `session_id`).
//   3. Success requires `response.completed`. `response.failed`,
//      `response.incomplete`, explicit `error`, `[DONE]`-only and a bare
//      EOF must NOT be treated as success.
//   4. Once visible text has been yielded, a later failure must be surfaced
//      and MUST NOT be retried/replayed.
//   5. 401 -> refresh once and retry once.
//
// The service hard-depends on CodexOAuthService (which touches credentials)
// and on providerPayloadCapture. We bundle the service with the esbuild JS
// API and replace both with in-memory stubs, then drive `fetch` with local
// Response objects. No credentials, auth cache, or network are touched.
//
// Run: node --test electron/services/__tests__/ChatGPTPlanInference.test.mjs

import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import esbuild from 'esbuild';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../../..');

const OAUTH_STUB = `
export const __oauth = {
  signedIn: true,
  accessToken: 'test-access-token',
  refreshToken: 'test-refresh-token',
  refreshCalls: 0,
  getAccessTokenCalls: 0,
  refreshFails: false,
  reset() {
    this.signedIn = true;
    this.accessToken = 'test-access-token';
    this.refreshCalls = 0;
    this.getAccessTokenCalls = 0;
    this.refreshFails = false;
  },
  tokens() {
    return {
      accessToken: this.accessToken,
      refreshToken: this.refreshToken,
      expiresAt: Date.now() + 3600_000,
      accountId: 'acct-must-not-be-sent',
    };
  },
};
export const CodexOAuthService = {
  getInstance() {
    return {
      getStatus: () => ({ signedIn: __oauth.signedIn }),
      getCachedTokens: () => (__oauth.signedIn ? __oauth.tokens() : null),
      getAccessToken: async () => {
        __oauth.getAccessTokenCalls++;
        return __oauth.signedIn ? __oauth.accessToken : null;
      },
      refreshTokens: async () => {
        __oauth.refreshCalls++;
        if (__oauth.refreshFails || !__oauth.signedIn) return null;
        __oauth.accessToken = 'refreshed-access-token';
        return __oauth.tokens();
      },
    };
  },
};
`;

async function bundleService() {
  const result = await esbuild.build({
    stdin: {
      contents:
        "export { CodexCliService, resolveCodexReasoningEffort, DEFAULT_CODEX_CLI_CONFIG } from './CodexCliService';\n" +
        "export { __oauth } from './CodexOAuthService';\n",
      resolveDir: path.join(root, 'electron/services'),
      sourcefile: 'codex-plan-entry.ts',
      loader: 'ts',
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    write: false,
    logLevel: 'silent',
    plugins: [
      {
        name: 'stub-codex-deps',
        setup(build) {
          build.onResolve({ filter: /^electron$/ }, () => ({path: 'electron-net-stub', namespace: 'codexstub'}));
          build.onResolve({ filter: /CodexOAuthService$/ }, () => ({
            path: 'oauth-stub',
            namespace: 'codexstub',
          }));
          build.onResolve({ filter: /providerPayloadCapture$/ }, () => ({
            path: 'ppc-stub',
            namespace: 'codexstub',
          }));
          build.onLoad({ filter: /.*/, namespace: 'codexstub' }, (args) => {
            if (args.path === 'electron-net-stub') return { contents: 'export const net = { fetch: (...args) => globalThis.fetch(...args) };', loader: 'js' };
            if (args.path === 'oauth-stub') {
              return { contents: OAUTH_STUB, loader: 'js' };
            }
            if (args.path === 'ppc-stub') {
              return {
                contents: 'export function captureProviderPayload() { /* noop */ }\n',
                loader: 'js',
              };
            }
            return null;
          });
        },
      },
    ],
  });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-plan-test-'));
  const file = path.join(dir, 'bundle.mjs');
  fs.writeFileSync(file, result.outputFiles[0].text);
  const mod = await import(pathToFileURL(file).href);
  return mod;
}

const mod = await bundleService();
const { CodexCliService, __oauth } = mod;

const realFetch = globalThis.fetch;
let fetchCalls = [];

function installFetch(handler) {
  globalThis.fetch = async (url, init = {}) => {
    const call = { url: String(url), init };
    fetchCalls.push(call);
    return handler(call, fetchCalls.length - 1);
  };
}

function sseResponse(events, { status = 200 } = {}) {
  const encoder = new TextEncoder();
  const chunks = events.map((e) => encoder.encode(e));
  let i = 0;
  const body = new ReadableStream({
    pull(controller) {
      if (i < chunks.length) controller.enqueue(chunks[i++]);
      else controller.close();
    },
  });
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

function jsonResponse(value, { status = 200 } = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function collectStream(gen) {
  const deltas = [];
  try {
    for await (const d of gen) deltas.push(d);
    return { deltas, error: null };
  } catch (error) {
    return { deltas, error };
  }
}

beforeEach(() => {
  fetchCalls = [];
  __oauth.reset();
  delete globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

// =============================================================================
// 1. Model catalog — listModels()
// =============================================================================

test('listModels: GET /v1/models, visibility=list, preserves order, maps slug/display_name', async () => {
  installFetch(() =>
    jsonResponse({
      models: [
        { slug: 'gpt-6.1-sol', display_name: 'GPT-6.1 Sol', visibility: 'list' },
        { slug: 'internal-hidden', display_name: 'Hidden', visibility: 'hidden' },
        { slug: 'gpt-6.1-mini', display_name: 'GPT-6.1 Mini', visibility: 'list' },
        { slug: 'gpt-6.1-nano', display_name: 'GPT-6.1 Nano', visibility: 'list' },
      ],
    }),
  );

  const models = await CodexCliService.listModels();

  assert.deepEqual(
    models,
    [
      { id: 'gpt-6.1-sol', label: 'GPT-6.1 Sol' },
      { id: 'gpt-6.1-mini', label: 'GPT-6.1 Mini' },
      { id: 'gpt-6.1-nano', label: 'GPT-6.1 Nano' },
    ],
    'only visibility=list entries, in server order, mapped to {id,label}',
  );
  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0].url, 'https://api.openai.com/v1/models');
  assert.equal(fetchCalls[0].init.method, 'GET');
  const headers = fetchCalls[0].init.headers;
  assert.equal(headers.Authorization, 'Bearer test-access-token');
  assert.equal(headers.originator, undefined, 'no Codex originator header');
  assert.equal(headers['chatgpt-account-id'], undefined, 'no account-id header');
  assert.equal(headers.session_id, undefined, 'no Codex session_id header');
});

test('listModels: non-2xx yields a safe error without raw body or token', async () => {
  const secret = 'SECRET_RAW_BODY_eyJhbGciOiJIUzI1NiJ9';
  installFetch(() => new Response(secret, { status: 500 }));

  await assert.rejects(
    () => CodexCliService.listModels(),
    (err) => {
      assert.doesNotMatch(err.message, /SECRET_RAW_BODY/);
      assert.doesNotMatch(err.message, /test-access-token/);
      assert.match(err.message, /500/);
      return true;
    },
  );
});

test('listModels: 401 refreshes once and retries once with the fresh token', async () => {
  installFetch((_call, idx) => {
    if (idx === 0) return new Response('unauthorized', { status: 401 });
    return jsonResponse({ models: [{ slug: 'gpt-6.1-sol', display_name: 'GPT-6.1 Sol', visibility: 'list' }] });
  });

  const models = await CodexCliService.listModels();

  assert.deepEqual(models, [{ id: 'gpt-6.1-sol', label: 'GPT-6.1 Sol' }]);
  assert.equal(fetchCalls.length, 2, '401 then retry = exactly two attempts');
  assert.equal(__oauth.refreshCalls, 1, 'refresh exactly once');
  assert.equal(fetchCalls[1].init.headers.Authorization, 'Bearer refreshed-access-token');
});

test('listModels: 20s timeout aborts and surfaces a safe error', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  installFetch((call) => new Promise((_resolve, reject) => {
    if (call.init.signal?.aborted) { reject(new DOMException('aborted', 'AbortError')); return; }
    if (call.init.signal) {
      call.init.signal.addEventListener('abort', () =>
        reject(new DOMException('aborted', 'AbortError')),
      );
    }
  }));

  const pending = CodexCliService.listModels();
  t.mock.timers.tick(20_000);

  await assert.rejects(pending, /timed out|timeout/i);
  t.mock.timers.reset();
});

// =============================================================================
// 2. Inference — completed success, official URL/headers/body
// =============================================================================

test('stream: hits api.openai.com/v1/responses with normal headers and official body', async () => {
  installFetch(() =>
    sseResponse([
      'data: {"type":"response.created","response":{}}\n\n',
      'data: {"type":"response.output_text.delta","delta":"Hello"}\n\n',
      'data: {"type":"response.completed","response":{}}\n\n',
    ]),
  );

  const res = await collectStream(
    CodexCliService.stream('', {
      prompt: 'Say exactly: Hello',
      model: 'gpt-6.1-sol',
      timeoutMs: 5_000,
      instructions: 'system prompt',
    }),
  );

  assert.equal(res.error, null, 'response.completed => success');
  assert.equal(res.deltas.join(''), 'Hello');
  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0].url, 'https://api.openai.com/v1/responses');
  assert.equal(fetchCalls[0].init.method, 'POST');

  const headers = fetchCalls[0].init.headers;
  assert.equal(headers.Authorization, 'Bearer test-access-token');
  assert.equal(headers['Content-Type'], 'application/json');
  assert.equal(headers.Accept, 'text/event-stream');
  assert.equal(headers.originator, undefined, 'Codex impersonation originator must be gone');
  assert.equal(headers['chatgpt-account-id'], undefined, 'account-id header must be gone');
  assert.equal(headers.session_id, undefined, 'session_id header must be gone');

  const body = JSON.parse(fetchCalls[0].init.body);
  assert.equal(body.model, 'gpt-6.1-sol');
  assert.equal(body.stream, true);
  assert.equal(body.store, false);
  assert.equal(body.instructions, 'system prompt');
  for (const unsupported of ['max_output_tokens', 'temperature', 'top_p', 'previous_response_id']) {
    assert.equal(unsupported in body, false, `${unsupported} must not be sent`);
  }
});

// =============================================================================
// 3. Failure semantics — no false success
// =============================================================================

test('stream: deltas then EOF without response.completed is NOT a false success', async () => {
  installFetch(() =>
    sseResponse(['data: {"type":"response.output_text.delta","delta":"partial answer"}\n\n']),
  );

  const res = await collectStream(
    CodexCliService.stream('', { prompt: 'hi', model: 'gpt-6.1-sol', timeoutMs: 5_000 }),
  );

  assert.deepEqual(res.deltas, ['partial answer'], 'already-yielded text must be preserved');
  assert.ok(res.error, 'EOF without response.completed must throw');
  assert.match(res.error.message, /completed/i);
});

test('stream: [DONE] alone is NOT a false success', async () => {
  installFetch(() =>
    sseResponse([
      'data: {"type":"response.output_text.delta","delta":"hi"}\n\n',
      'data: [DONE]\n\n',
    ]),
  );

  const res = await collectStream(
    CodexCliService.stream('', { prompt: 'hi', model: 'gpt-6.1-sol', timeoutMs: 5_000 }),
  );

  assert.deepEqual(res.deltas, ['hi']);
  assert.ok(res.error, '[DONE] without response.completed must not be treated as success');
});

test('stream: response.failed with usage limit after deltas throws and does NOT retry', async () => {
  installFetch(() =>
    sseResponse([
      'data: {"type":"response.output_text.delta","delta":"partial"}\n\n',
      'data: {"type":"response.failed","response":{"error":{"code":"subscription_sharing_usage_limit_exceeded","message":"usage limit"}}}\n\n',
    ]),
  );

  const res = await collectStream(
    CodexCliService.stream('', { prompt: 'hi', model: 'gpt-6.1-sol', timeoutMs: 5_000 }),
  );

  assert.deepEqual(res.deltas, ['partial'], 'already-yielded text must be preserved');
  assert.ok(res.error, 'response.failed must throw');
  assert.match(res.error.message, /subscription_sharing_usage_limit_exceeded/);
  assert.equal(fetchCalls.length, 1, 'no retry/replay after visible text was yielded');
});

test('stream: response.failed with subscription_sharing_usage_unavailable throws and does NOT retry', async () => {
  installFetch(() =>
    sseResponse([
      'data: {"type":"response.output_text.delta","delta":"partial"}\n\n',
      'data: {"type":"response.failed","response":{"error":{"code":"subscription_sharing_usage_unavailable","message":"temporarily unavailable"}}}\n\n',
    ]),
  );

  const res = await collectStream(
    CodexCliService.stream('', { prompt: 'hi', model: 'gpt-6.1-sol', timeoutMs: 5_000 }),
  );

  assert.deepEqual(res.deltas, ['partial']);
  assert.ok(res.error, 'response.failed must throw even when the message sounds transient');
  assert.match(res.error.message, /subscription_sharing_usage_unavailable/);
  assert.equal(fetchCalls.length, 1, 'must not treat the failure as a retryable transient error');
});

test('stream: response.incomplete throws a clear error and preserves yielded text', async () => {
  installFetch(() =>
    sseResponse([
      'data: {"type":"response.output_text.delta","delta":"partial"}\n\n',
      'data: {"type":"response.incomplete","response":{"incomplete_details":{"reason":"max_output_tokens"}}}\n\n',
    ]),
  );

  const res = await collectStream(
    CodexCliService.stream('', { prompt: 'hi', model: 'gpt-6.1-sol', timeoutMs: 5_000 }),
  );

  assert.deepEqual(res.deltas, ['partial']);
  assert.ok(res.error, 'response.incomplete must throw');
  assert.match(res.error.message, /incomplete/i);
});

test('stream: explicit error event throws a safe error without leaking the token', async () => {
  installFetch(() =>
    sseResponse([
      'data: {"type":"error","error":{"message":"upstream model error"}}\n\n',
    ]),
  );

  const res = await collectStream(
    CodexCliService.stream('', { prompt: 'hi', model: 'gpt-6.1-sol', timeoutMs: 5_000 }),
  );

  assert.ok(res.error);
  assert.match(res.error.message, /upstream model error/);
  assert.doesNotMatch(res.error.message, /test-access-token/);
});

// =============================================================================
// 4. 401 refresh-once
// =============================================================================

test('stream: 401 refreshes once and retries once with the fresh token', async () => {
  installFetch((_call, idx) => {
    if (idx === 0) return new Response('unauthorized', { status: 401 });
    return sseResponse([
      'data: {"type":"response.output_text.delta","delta":"ok"}\n\n',
      'data: {"type":"response.completed","response":{}}\n\n',
    ]);
  });

  const res = await collectStream(
    CodexCliService.stream('', { prompt: 'hi', model: 'gpt-6.1-sol', timeoutMs: 5_000 }),
  );

  assert.equal(res.error, null);
  assert.equal(res.deltas.join(''), 'ok');
  assert.equal(fetchCalls.length, 2);
  assert.equal(__oauth.refreshCalls, 1);
  assert.equal(fetchCalls[1].init.headers.Authorization, 'Bearer refreshed-access-token');
});

test('stream: repeated 401 does NOT loop (refresh once, then surface)', async () => {
  installFetch(() => new Response('unauthorized', { status: 401 }));

  const res = await collectStream(
    CodexCliService.stream('', { prompt: 'hi', model: 'gpt-6.1-sol', timeoutMs: 5_000 }),
  );

  assert.ok(res.error);
  assert.equal(fetchCalls.length, 2, 'exactly one retry after the single refresh');
  assert.equal(__oauth.refreshCalls, 1, 'refresh must happen at most once');
});

// =============================================================================
// 5. SSE framing: CRLF, chunk splitting, no trailing newline
// =============================================================================

test('stream: tolerates CRLF, arbitrary chunk splits, and a final event without trailing newline', async () => {
  const raw =
    'data: {"type":"response.output_text.delta","delta":"Hello "}\r\n\r\n' +
    'data: {"type":"response.output_text.delta","delta":"world"}\r\n\r\n' +
    'data: {"type":"response.completed","response":{}}';
  const pieces = raw.match(/[\s\S]{1,7}/g) || [raw];
  installFetch(() => sseResponse(pieces));

  const res = await collectStream(
    CodexCliService.stream('', { prompt: 'hi', model: 'gpt-6.1-sol', timeoutMs: 5_000 }),
  );

  assert.equal(res.error, null);
  assert.equal(res.deltas.join(''), 'Hello world');
});

test('run: buffers a completed stream and resolves with the full text', async () => {
  installFetch(() =>
    sseResponse([
      'data: {"type":"response.output_text.delta","delta":"full "}\n\n',
      'data: {"type":"response.output_text.delta","delta":"answer"}\n\n',
      'data: {"type":"response.completed","response":{}}\n\n',
    ]),
  );

  const text = await CodexCliService.run('', {
    prompt: 'hi',
    model: 'gpt-6.1-sol',
    timeoutMs: 5_000,
  });

  assert.equal(text, 'full answer');
});
