/**
 * CodexCliService — direct HTTPS ChatGPT-plan provider (replaces subprocess)
 *
 * This service implements the official "Sign in with ChatGPT" flow documented
 * in .planning/2026-10-15-chatgpt-login/models-and-inference.md:
 *
 *   - Model catalog: GET https://api.openai.com/v1/models with the OAuth
 *     bearer token; keep `visibility === "list"`, preserve order, map
 *     slug -> id and display_name -> label (see listModels()).
 *   - Inference: POST https://api.openai.com/v1/responses with the same
 *     bearer token, `stream: true` and `store: false`, consumed as SSE.
 *
 * History: this replaces a subprocess implementation that spawned the
 * `codex` CLI and parsed its NDJSON event stream (ENOENT for users without
 * the binary; 5-8s cold model load on first invocation). The subprocess is
 * gone; we call the public Responses API directly with `fetch()` and
 * `ReadableStream` SSE.
 *
 * IMPORTANT — this is the PUBLIC api.openai.com surface, NOT ChatGPT's
 * `backend-api` routes. We deliberately do NOT impersonate the Codex CLI:
 * no `originator`, `chatgpt-account-id`, or `session_id` headers. Request
 * headers are limited to normal HTTP auth/content negotiation
 * (Authorization / Content-Type / Accept).
 *
 * Public surface preserved for backward compatibility:
 *   - DEFAULT_CODEX_CLI_CONFIG (shape unchanged)
 *   - CodexCliService.run / .stream (signature unchanged)
 *   - CodexCliService.normalizeConfig (signature unchanged)
 *   - CodexCliService.buildArgs (DEPRECATED — returns [] but kept so the
 *     few tests that import it don't break; new code should not call it)
 *   - resolveCodexReasoningEffort (unchanged, per-model VALID set)
 *   - CodexCliService.listModels (NEW — account-specific catalog)
 *
 * Success contract (see models-and-inference.md §3): a stream is successful
 * ONLY after `response.completed`. `response.failed` (including
 * `subscription_sharing_usage_limit_exceeded` /
 * `subscription_sharing_usage_unavailable`), `response.incomplete`, explicit
 * `error` events, `[DONE]`-only, and a bare EOF are all failures. Text
 * already yielded to the caller is preserved; once visible text has been
 * yielded, a later failure is surfaced and is NEVER retried or replayed.
 * Network retries only ever happen before the first visible delta.
 *
 *   - Bearer token is read from CodexOAuthService.getAccessToken()
 *   - Reasoning effort goes in `body.reasoning.effort`
 *   - `service_tier` goes in `body.service_tier`
 *   - 401 → refresh-once-and-retry
 *   - 429 / 5xx / network → exponential backoff with jitter (up to 3
 *     attempts), only before any visible text is yielded
 *   - AbortSignal cancels the in-flight fetch and propagates to the
 *     stream consumer; partial deltas yielded so far are NOT lost.
 */

import { CodexOAuthService } from './CodexOAuthService';
import { chatGPTFetch } from './ChatGPTTransport';

export type CodexSandboxMode = 'read-only' | 'workspace-write' | 'danger-full-access';
export type CodexServiceTier = 'default' | 'fast' | 'flex';
// 'none' is distinct from undefined: 'none' is the explicit user pick meaning
// "no reasoning_effort override"; undefined means "user didn't pick one" → also
// omit the field. 'minimal' is intentionally NOT in this union because no
// codex-supported model accepts it (OpenAI removed it after the original gpt-5
// line — see electron/llm/__tests__/OpenAiReasoningEffort.test.mjs).
export type CodexModelReasoningEffort = 'none' | 'low' | 'medium' | 'high' | 'xhigh';

export const CODEX_SANDBOX_MODES: readonly CodexSandboxMode[] = ['read-only', 'workspace-write', 'danger-full-access'] as const;
export const CODEX_SERVICE_TIERS: readonly CodexServiceTier[] = ['default', 'fast', 'flex'] as const;
export const CODEX_MODEL_REASONING_EFFORTS: readonly CodexModelReasoningEffort[] = ['none', 'low', 'medium', 'high', 'xhigh'] as const;

// Per-model valid reasoning_effort sets. Mirrors the OpenAI HTTP VALID map at
// electron/llm/__tests__/OpenAiReasoningEffort.test.mjs:27-45. Sending
// e.g. xhigh to gpt-5.3-codex over the wire triggers a 400 turn.failed event
// that our fallback chain swallows into "Let me come back to that in just a
// moment." The user's pick is validated against the per-model set;
// unsupported values are silently downgraded to the LOWEST-latency valid
// value (matches the OpenAI HTTP picker's behaviour).
//
// NOTE: this table is now ALSO used for the HTTP request body's
// reasoning.effort field — the same per-family constraints apply, so
// keeping it as the single source of truth avoids drift.
const CODEX_MODEL_REASONING_SETS: ReadonlyArray<readonly [string, readonly CodexModelReasoningEffort[]]> = [
  // Original gpt-5 line — minimal accepted (not exposed); low/medium/high.
  ['gpt-5-2025-08-07', ['low', 'medium', 'high']],
  ['gpt-5-mini',       ['low', 'medium', 'high']],
  ['gpt-5-nano',       ['low', 'medium', 'high']],
  // Bare 'gpt-5' (NOT 5.x) — must come AFTER 5.x entries to avoid swallowing them.
  ['gpt-5',            ['low', 'medium', 'high']],
  // gpt-5.1+ chat — `none` accepted; `xhigh` only on 5.2+.
  ['gpt-5.1',          ['none', 'low', 'medium', 'high']],
  ['gpt-5.2',          ['none', 'low', 'medium', 'high', 'xhigh']],
  ['gpt-5.4',          ['none', 'low', 'medium', 'high', 'xhigh']],
  ['gpt-5.5',          ['none', 'low', 'medium', 'high', 'xhigh']],
  // codex variants — `none` not supported; `xhigh` only on 5.2-codex+.
  ['gpt-5.5-codex',    ['low', 'medium', 'high', 'xhigh']],
  ['gpt-5.4-codex',    ['low', 'medium', 'high', 'xhigh']],
  ['gpt-5.3-codex-spark', ['low', 'medium', 'high']],
  ['gpt-5.3-codex',    ['low', 'medium', 'high']],
  ['gpt-5.2-codex',    ['low', 'medium', 'high', 'xhigh']],
  ['gpt-5.1-codex',    ['low', 'medium', 'high']],
  ['gpt-5-codex',      ['low', 'medium', 'high']],
];

/**
 * Resolve the user's reasoning-effort pick against the model's per-family
 * VALID set. Mirrors getOpenAiReasoningEffort() (electron/llm/modelCapabilities.ts:217).
 *
 * Returns the value to emit as `body.reasoning.effort`, or undefined
 * to omit the field entirely (used when pick is undefined/null/empty).
 *
 * Downgrade policy (when the user's pick is NOT in the model's valid set):
 *  - If the user picked 'none' but the model doesn't accept 'none' → 'low'.
 *  - Otherwise → first entry of the valid set with 'none' removed (lowest-
 *    latency REASONING effort, not the lowest-latency of all values).
 *
 * Longest-key match wins so 'gpt-5.4-codex' resolves via its entry, not the
 * generic 'gpt-5' one.
 */
export function resolveCodexReasoningEffort(
  modelId: string,
  pick?: CodexModelReasoningEffort | string | null,
): CodexModelReasoningEffort | undefined {
  if (!pick) return undefined;
  const id = (modelId || '').toLowerCase();
  let bestEntry: readonly [string, readonly CodexModelReasoningEffort[]] | null = null;
  for (const entry of CODEX_MODEL_REASONING_SETS) {
    if (id.includes(entry[0]) && (!bestEntry || entry[0].length > bestEntry[0].length)) {
      bestEntry = entry;
    }
  }
  const valid = bestEntry ? bestEntry[1] : (['low', 'medium', 'high'] as const);
  // Exact match → honour the user's pick.
  if ((valid as readonly string[]).includes(pick)) return pick as CodexModelReasoningEffort;
  // Unsupported pick. Pick the lowest-latency REASONING effort (skip 'none').
  const reasoningOnly = (valid as readonly string[]).filter(v => v !== 'none');
  const fallback = reasoningOnly[0] || valid[0];
  return fallback as CodexModelReasoningEffort;
}

export interface CodexCliConfig {
  enabled: boolean;
  /**
   * @deprecated Kept for IPC backward-compat. The new implementation does
   * not spawn a CLI binary; `path` is ignored at runtime. The settings
   * field is still read/written so the Settings UI doesn't reset.
   */
  path: string;
  model: string;
  fastModel: string;
  timeoutMs: number;
  /** @deprecated Ignored — Codex CLI sandbox flags don't apply to HTTP. */
  sandboxMode: CodexSandboxMode;
  serviceTier: CodexServiceTier;
  modelReasoningEffort?: CodexModelReasoningEffort;
}

export interface CodexCliRunOptions {
  prompt: string;
  model: string;
  timeoutMs: number;
  imagePaths?: string[];
  /** @deprecated Ignored. */
  sandboxMode?: CodexSandboxMode;
  serviceTier?: CodexServiceTier;
  modelReasoningEffort?: CodexModelReasoningEffort;
  signal?: AbortSignal;
  /** Optional system prompt (used as the `instructions` field on the
   *  Responses API; matches open-sse CodexExecutor.transformRequest
   *  at codex.md:419-422). */
  instructions?: string;
  /**
   * Optional session-stable id used as the basis for `prompt_cache_key` and
   * the `session_id` request header. The Codex backend keys its server-side
   * cache + rate-limit bucket off `session_id`, so a stable value across
   * consecutive calls yields cache hits. When omitted, the service-wide
   * SESSION_ID (one per process) is used.
   */
  sessionId?: string;
}

// Default fast model: gpt-5.3-codex works with both ChatGPT-account and API-key
// auth. The faster gpt-5.3-codex-spark is API-key-only and 400s on ChatGPT auth.
export const DEFAULT_CODEX_CLI_CONFIG: CodexCliConfig = {
  enabled: false,
  path: 'codex', // deprecated — kept so older settings round-trip without resetting
  model: 'gpt-5.4',
  fastModel: 'gpt-5.3-codex',
  timeoutMs: 60_000,
  sandboxMode: 'read-only', // deprecated
  serviceTier: 'default',
  modelReasoningEffort: undefined,
};

// Official ChatGPT-plan inference endpoint. This is the PUBLIC Responses API
// surface the "Sign in with ChatGPT" documentation instructs us to call with
// the OAuth access token as a normal Bearer credential — NOT ChatGPT's
// `backend-api` routes and NOT the Codex CLI endpoint.
const CODEX_RESPONSES_URL = 'https://api.openai.com/v1/responses';

// Official model-catalog endpoint for the signed-in ChatGPT account.
const CODEX_MODELS_URL = 'https://api.openai.com/v1/models';
const CODEX_MODELS_TIMEOUT_MS = 20_000;

// Retry policy for transient upstream failures (network / 429 / 5xx). Retries
// are ONLY permitted before the first visible delta is yielded.
const TRANSIENT_RETRY_MAX = 3;
const TRANSIENT_RETRY_BASE_MS = 500;
const TRANSIENT_RETRY_CAP_MS = 8_000;

// Error surfaced from the SSE parser for a terminal failure. `code` carries the
// upstream error code when the payload provides one (e.g.
// `subscription_sharing_usage_limit_exceeded`). Non-transient by default:
// `response.failed` / `response.incomplete` must never be retried.
class CodexStreamError extends Error {
  readonly code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.name = 'CodexStreamError';
    this.code = code;
  }
}

// Transient sentinel reserved for explicit mid-stream `error` events whose
// message is a retryable overload signal (e.g. "servers are currently
// overloaded"). fetchDeltas only retries these BEFORE any visible delta.
class TransientStreamError extends CodexStreamError {
  readonly isTransient = true;
  constructor(message: string, code?: string) {
    super(message, code);
    this.name = 'TransientStreamError';
  }
}

function isTransientStreamMessage(msg: string): boolean {
  const lower = msg.toLowerCase();
  return lower.includes('overloaded') || lower.includes('try again') || lower.includes('service unavailable') || lower.includes('capacity');
}

// Usage-limit / sharing codes are hard account-level failures. Even when the
// message text looks transient we must surface them, never retry them.
function isQuotaOrSharingCode(code?: string): boolean {
  if (!code) return false;
  return code === 'subscription_sharing_usage_limit_exceeded'
    || code === 'subscription_sharing_usage_unavailable'
    || /subscription_sharing/.test(code);
}

/**
 * Strip anything credential-shaped from an upstream error message before it
 * reaches a user-visible surface. We never echo raw response bodies, so this
 * is a defensive backstop for messages the backend embeds itself.
 */
function sanitizeErrorMessage(message: string): string {
  if (!message) return '';
  return truncate(
    message
      .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [redacted]')
      .replace(/\b(?:sk|sess|eyJ)[A-Za-z0-9._-]{12,}\b/g, '[redacted]'),
    500,
  );
}

/**
 * Mutable per-response state threaded from fetchDeltas into parseSseStream.
 * `private` on the parser would be erased anyway; an explicit out-param keeps
 * the completion contract observable without relying on a generator's return
 * value (which `for await` discards).
 */
interface SseStreamState {
  /** True only after a `response.completed` event. */
  completed: boolean;
  /** Set when a `response.incomplete` terminal event arrives. */
  incomplete: { reason?: string; code?: string } | null;
}

// =============================================================================
// CodexCliService — public static surface
// =============================================================================

export class CodexCliService {
  /**
   * Process-stable session id used as the default value for
   * `CodexCliRunOptions.sessionId`. Generated once at module load and
   * reused for every Codex call within this run. The Codex backend uses
   * this as the basis for `prompt_cache_key` + `session_id` header, so a
   * stable value yields cache hits across consecutive calls. Mirrors
   * open-sse's `resolveCacheSessionId()` (codex.md:195-204).
   */
  public static readonly SESSION_ID: string =
    `natively-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

  /**
   * @deprecated The HTTP-direct implementation does not use a CLI binary
   * and has no `argv`. Kept so callers that still import `buildArgs` for
   * tests/inspection don't crash; returns an empty array. The new
   * equivalents are `body.model`, `body.reasoning.effort`, and
   * `body.service_tier` in the request body.
   */
  public static buildArgs(
    _model: string,
    _imagePaths: string[] = [],
    _sandboxMode: CodexSandboxMode = 'read-only',
    _serviceTier?: CodexServiceTier,
    _modelReasoningEffort?: CodexModelReasoningEffort,
  ): string[] {
    return [];
  }

  public static normalizeConfig(config: Partial<CodexCliConfig> = {}): CodexCliConfig {
    const timeoutMs = Number(config.timeoutMs);
    const sandboxMode = (config.sandboxMode && (CODEX_SANDBOX_MODES as readonly string[]).includes(config.sandboxMode))
      ? config.sandboxMode
      : DEFAULT_CODEX_CLI_CONFIG.sandboxMode;
    const serviceTier = (config.serviceTier && (CODEX_SERVICE_TIERS as readonly string[]).includes(config.serviceTier))
      ? config.serviceTier
      : DEFAULT_CODEX_CLI_CONFIG.serviceTier;
    // Pick must be in the union type first; then resolveCodexReasoningEffort
    // downgrades unsupported values for the chosen model.
    let modelReasoningEffort: CodexModelReasoningEffort | undefined;
    if (config.modelReasoningEffort && (CODEX_MODEL_REASONING_EFFORTS as readonly string[]).includes(config.modelReasoningEffort)) {
      modelReasoningEffort = config.modelReasoningEffort;
    }
    const modelName = (config.model || DEFAULT_CODEX_CLI_CONFIG.model).trim() || DEFAULT_CODEX_CLI_CONFIG.model;
    modelReasoningEffort = resolveCodexReasoningEffort(modelName, modelReasoningEffort);
    return {
      enabled: !!config.enabled,
      // `path` is preserved verbatim for backward-compat (Settings UI
      // may still display it). New HTTP-direct code does not use it.
      path: (config.path || DEFAULT_CODEX_CLI_CONFIG.path).trim() || DEFAULT_CODEX_CLI_CONFIG.path,
      model: modelName,
      fastModel: (config.fastModel || DEFAULT_CODEX_CLI_CONFIG.fastModel).trim() || DEFAULT_CODEX_CLI_CONFIG.fastModel,
      timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_CODEX_CLI_CONFIG.timeoutMs,
      sandboxMode,
      serviceTier,
      modelReasoningEffort,
    };
  }

  /**
   * List the ChatGPT account's available models for the model picker.
   *
   * Official contract (models-and-inference.md §1): GET /v1/models with the
   * same OAuth bearer token used for inference, keep entries whose
   * `visibility === "list"`, preserve the server's ordering, and expose
   * `display_name` to the UI while passing `slug` as the `model` on the next
   * request. Refreshed by the caller when the user switches accounts.
   *
   * Bounded by a 20s timeout. Errors are safe: they never include the access
   * token or any raw response body.
   */
  public static async listModels(): Promise<Array<{ id: string; label: string }>> {
    const oauth = CodexOAuthService.getInstance();
    const status = oauth.getStatus();
    if (!status.signedIn) {
      throw new Error('Not signed in to ChatGPT. Please complete Codex OAuth login from Settings → AI Providers.');
    }

    const controller = new AbortController();
    const timer: ReturnType<typeof setTimeout> = setTimeout(() => controller.abort(), CODEX_MODELS_TIMEOUT_MS);

    const request = async (): Promise<Response> => {
      const accessToken = await this.getFreshAccessToken();
      return chatGPTFetch(CODEX_MODELS_URL, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
        },
        signal: controller.signal,
      });
    };

    try {
      let response = await request();
      if (response.status === 401) {
        // Force-refresh once, then retry once with the freshest token.
        const refreshed = await oauth.refreshTokens();
        if (!refreshed || !refreshed.accessToken) {
          throw new Error('ChatGPT session expired. Please sign in again from Settings → AI Providers.');
        }
        response = await request();
      }
      if (!response.ok) {
        // Deliberately do NOT read or echo the response body — it may contain
        // account-scoped detail. The status code is the safe diagnostic.
        throw new Error(`ChatGPT model catalog request failed (HTTP ${response.status}).`);
      }

      let payload: any;
      try {
        payload = await response.json();
      } catch {
        throw new Error('ChatGPT model catalog response was not valid JSON.');
      }
      const models = Array.isArray(payload?.models) ? payload.models : [];
      return models
        .filter((m: any) => m && typeof m.slug === 'string' && m.slug && m.visibility === 'list')
        .map((m: any) => ({
          id: m.slug as string,
          label: (typeof m.display_name === 'string' && m.display_name) ? m.display_name : (m.slug as string),
        }));
    } catch (e: any) {
      if (controller.signal.aborted || e?.name === 'AbortError') {
        throw new Error(`ChatGPT model catalog request timed out after ${Math.round(CODEX_MODELS_TIMEOUT_MS / 1000)}s.`);
      }
      if (e instanceof Error && /^ChatGPT /.test(e.message)) throw e;
      throw new Error(`ChatGPT model catalog request failed: ${sanitizeErrorMessage(String(e?.message || e))}`);
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Await a current bearer token from CodexOAuthService, refreshing when the
   * cached token is missing/stale. Throws a user-actionable error when the
   * user is not signed in.
   */
  private static async getFreshAccessToken(): Promise<string> {
    const oauth = CodexOAuthService.getInstance();
    const status = oauth.getStatus();
    if (!status.signedIn) {
      throw new Error('Not signed in to ChatGPT. Please complete Codex OAuth login from Settings → AI Providers.');
    }
    const accessToken = await oauth.getAccessToken();
    if (!accessToken) {
      throw new Error('Not signed in to ChatGPT. Please complete Codex OAuth login from Settings → AI Providers.');
    }
    return accessToken;
  }

  /**
   * Collect the full response into a single string. Thin wrapper over
   * `stream()` that buffers all deltas. Prefer `stream()` for user-visible
   * surfaces (so the UI can show progress).
   */
  public static async run(_path: string, options: CodexCliRunOptions): Promise<string> {
    if (options.signal?.aborted) throw new Error('Codex request aborted before start.');
    let out = '';
    for await (const chunk of this.stream('', options)) {
      out += chunk;
    }
    return out;
  }

  /**
   * Stream the Codex response as a series of text deltas.
   *
   * The `_path` parameter is preserved for backward-compat with the old
   * subprocess surface (LLMHelper.streamWithCodexCli still passes
   * `this.codexCliConfig.path`); it is ignored.
   */
  public static async *stream(_path: string, options: CodexCliRunOptions): AsyncGenerator<string, void, unknown> {
    if (options.signal?.aborted) throw new Error('Codex request aborted before start.');

    const oauth = CodexOAuthService.getInstance();
    const status = oauth.getStatus();
    if (!status.signedIn) {
      throw new Error('Not signed in to ChatGPT. Please complete Codex OAuth login from Settings → AI Providers.');
    }

    // Build the request body ONCE outside the retry loop — refreshing
    // tokens doesn't change the prompt.
    const body = this.buildRequestBody(options);
    const headers = this.buildHeaders();

    // Idle-timeout guard: aborts the HTTP connection if no bytes arrive for
    // `timeoutMs` ms. The timer RESETS on every yielded delta, so a long
    // answer that is actively streaming (even slowly) is never cut off.
    // This is intentionally NOT a wall-clock cap from request start — that
    // would abort long but healthy responses (e.g. gpt-5.5 with a large
    // system prompt routinely takes >30s total). The outer
    // raceStreamWithDeadline() already handles the first-useful-token
    // deadline and the inter-token stall guard independently; this guard
    // serves as a belt-and-suspenders kill for a truly stuck HTTP connection
    // (server accepted the request but sends nothing at all for timeoutMs).
    const deadlineController = new AbortController();
    let deadlineTimer: ReturnType<typeof setTimeout> = setTimeout(() => deadlineController.abort(), options.timeoutMs);
    const resetDeadline = () => {
      clearTimeout(deadlineTimer);
      deadlineTimer = setTimeout(() => deadlineController.abort(), options.timeoutMs);
    };
    // Combine user-supplied signal with our idle-timeout signal.
    const combinedSignal = combineSignals(options.signal, deadlineController.signal);
    const cleanup = () => {
      clearTimeout(deadlineTimer);
      combinedSignal.dispose();
    };

    try {
      const deltas = this.fetchDeltas(body, headers, combinedSignal.signal, options);
      for await (const delta of deltas) {
        resetDeadline();
        yield delta;
      }
    } finally {
      cleanup();
    }
  }

  // ---------------------------------------------------------------------------
  // Request body / headers
  // ---------------------------------------------------------------------------

  /**
   * Build the OpenAI Responses API body. Mirrors open-sse
   * CodexExecutor.transformRequest (codex.md:395-487):
   *  - `model` is the requested model (e.g. "gpt-5.4")
   *  - `input` is an array of message items (we only send one user turn
   *    because the existing LLMHelper assembles a self-contained prompt
   *    string at LLMHelper.buildCodexCliPrompt)
   *  - `instructions` is the system prompt (Codex uses this for its
   *    default behaviour + user customisations)
   *  - `reasoning.effort` is set from the resolved pick
   *  - `stream: true` is mandatory for the streaming endpoint
   *  - `store: false` is mandatory — we don't want the response saved
   *    server-side, and prior server-side item IDs would 404 the request
   *  - `service_tier` is "default" / "fast" / "flex" (or omitted)
   *  - `include: ["reasoning.encrypted_content"]` is required for the
   *    backend to surface reasoning items (codex.md:457-460)
   *  - `prompt_cache_key` is a stable session id so the backend can
   *    cache the prompt prefix (codex.md:428-430)
   */
  private static buildRequestBody(options: CodexCliRunOptions): Record<string, unknown> {
    const resolvedEffort = resolveCodexReasoningEffort(options.model, options.modelReasoningEffort);

    // Image inputs: Responses API wants `type: "input_image"` items.
    // We don't yet support image-bearing Codex calls in this rewrite
    // (LLMHelper.buildCodexCliPrompt only passes text) — the imagePaths
    // arg is accepted for backward-compat but ignored at the wire level.
    // Future: encode as data URLs the same way LocalWhisperSTT does.

    const input: Array<Record<string, unknown>> = [
      {
        type: 'message',
        role: 'user',
        content: [
          { type: 'input_text', text: options.prompt },
        ],
      },
    ];

    // Stable per-process session id. The Codex backend keys its server-side
    // prompt cache and rate-limit buckets off `session_id`, so a stable value
    // yields cache hits across consecutive calls (saving both latency and
    // input-token cost) instead of every call landing in a fresh bucket.
    // The open-sse reference resolves the same id once per session via
    // `resolveCacheSessionId()` (codex.md:195-204); we mirror it here.
    const sessionId = options.sessionId ?? CodexCliService.SESSION_ID;

    const body: Record<string, unknown> = {
      model: options.model,
      input,
      stream: true,
      store: false,
      // prompt_cache_key is a session-stable key so the backend can
      // cache the prompt prefix. Matches the open-sse pattern at
      // codex.md:427-430 where the key is derived from a stable session
      // id, NOT a per-minute timestamp (which would defeat the cache).
      prompt_cache_key: `codex-${options.model}-${sessionId}`,
    };

    if (options.instructions && options.instructions.trim()) {
      body.instructions = options.instructions;
    }

    if (resolvedEffort) {
      body.reasoning = { effort: resolvedEffort, summary: 'auto' };
      // Required so the backend surfaces the reasoning items in the
      // stream (open-sse includes this for all non-'none' efforts).
      if (resolvedEffort !== 'none') {
        body.include = ['reasoning.encrypted_content'];
      }
    }

    if (options.serviceTier && options.serviceTier !== 'default') {
      body.service_tier = options.serviceTier;
    }

    return body;
  }

  /**
   * Build the request headers for the public Responses API. The bearer token
   * comes from CodexOAuthService; everything else is standard HTTP content
   * negotiation. We intentionally send NO Codex-CLI identity headers
   * (`originator`, `chatgpt-account-id`, `session_id`) — this is the official
   * ChatGPT-plan flow, not the Codex backend.
   */
  private static async buildHeadersAsync(): Promise<Record<string, string>> {
    const accessToken = await this.getFreshAccessToken();
    return {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      Authorization: `Bearer ${accessToken}`,
    };
  }

  /**
   * Sync wrapper for callers that already have a token in hand. Most
   * callers should use the async builder; this exists so the retry loop
   * can refresh-and-retry without re-awaiting the same access token
   * check twice in a row.
   */
  private static buildHeaders(): Record<string, string> {
    const oauth = CodexOAuthService.getInstance();
    const tokens = oauth.getCachedTokens();
    if (!tokens || !tokens.accessToken) {
      throw new Error('Not signed in to ChatGPT. Please complete Codex OAuth login from Settings → AI Providers.');
    }
    return {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      Authorization: `Bearer ${tokens.accessToken}`,
    };
  }

  // ---------------------------------------------------------------------------
  // SSE fetch + parsing
  // ---------------------------------------------------------------------------

  /**
   * Execute the fetch and yield text deltas as they arrive. Handles:
   *  - success ONLY when `response.completed` was observed
   *  - 401 → force-refresh the token and retry ONCE
   *  - 429 / 5xx / network → exponential backoff with jitter, up to
   *    TRANSIENT_RETRY_MAX, but ONLY before the first visible delta
   *  - AbortSignal / deadline → propagate to the fetch + reader
   *  - SSE parsing (event: / data: / [DONE] / multi-line data)
   *
   * Failure events (`response.failed`, `response.incomplete`, `error`) are
   * surfaced as explicit, sanitized errors. `[DONE]` and a bare EOF are NOT
   * success: a stream that ends without `response.completed` throws. Deltas
   * already yielded to the caller are always preserved.
   */
  private static async *fetchDeltas(
    body: Record<string, unknown>,
    headers: Record<string, string>,
    signal: AbortSignal,
    _options: CodexCliRunOptions,
  ): AsyncGenerator<string, void, unknown> {
    let attempt = 0;
    let refreshedOnce = false;
    // Once any delta has been yielded to the caller, replaying the request
    // would duplicate visible text. Retries are therefore forbidden from
    // this point on — the failure is surfaced instead.
    let visibleYielded = false;

    while (true) {
      if (signal.aborted) {
        throw new Error('Codex request aborted.');
      }

      // Re-mint headers on each attempt so a 401-retry uses the FRESH
      // access token (after the refresh succeeded, not before).
      const currentHeaders = await this.buildHeadersAsync();
      const merged: Record<string, string> = { ...headers, ...currentHeaders };

      let response: Response;
      try {
        const serializedBody = JSON.stringify(body);
        require('../llm/providerPayloadCapture').captureProviderPayload({
          provider: 'codex',
          classification: 'exact_serialized_provider_payload',
          payload: body,
          serializedPayload: serializedBody,
        });
        response = await chatGPTFetch(CODEX_RESPONSES_URL, {
          method: 'POST',
          headers: merged,
          body: serializedBody,
          signal,
        });
      } catch (e: any) {
        // AbortError: re-throw so the generator halts cleanly.
        if (e?.name === 'AbortError') {
          throw new Error('Codex request aborted.');
        }
        // Network error: retry with backoff, but never after visible text.
        if (visibleYielded || attempt >= TRANSIENT_RETRY_MAX) {
          throw new Error(`Codex request failed after ${attempt + 1} attempt(s): ${sanitizeErrorMessage(String(e?.message || e))}`);
        }
        await sleepWithJitter(attempt);
        attempt++;
        continue;
      }

      if (response.status === 401 && !refreshedOnce) {
        // Force a refresh and retry exactly once.
        refreshedOnce = true;
        const oauth = CodexOAuthService.getInstance();
        const refreshed = await oauth.refreshTokens();
        if (!refreshed) {
          throw new Error('Codex session expired. Please sign in again from Settings → AI Providers.');
        }
        continue;
      }

      if (response.status === 429 || (response.status >= 500 && response.status < 600)) {
        // Transient upstream — safe to retry ONLY before any visible text.
        if (!visibleYielded && attempt < TRANSIENT_RETRY_MAX) {
          attempt++;
          const retryAfter = parseRetryAfter(response.headers.get('retry-after'));
          await sleepWithJitter(attempt - 1, retryAfter);
          continue;
        }
        throw new Error(`Codex upstream ${response.status}${visibleYielded ? ' (after partial response)' : ` after ${TRANSIENT_RETRY_MAX} retries`}.`);
      }

      if (!response.ok) {
        // Non-retryable upstream error. Read the body (it's small — usually
        // an error envelope) and surface the message so the user sees e.g.
        // "model not supported when using Codex with a ChatGPT account"
        // instead of the canned fallback. Messages are sanitized.
        const text = await safeReadText(response);
        const message = sanitizeErrorMessage(extractResponsesErrorMessage(text)) || `Codex upstream ${response.status}`;
        throw new CodexStreamError(message);
      }

      // Happy path: stream SSE. parseSseStream throws for terminal failures
      // and records completion/incompletion into `state`.
      const state: SseStreamState = { completed: false, incomplete: null };
      try {
        for await (const delta of this.parseSseStream(response, signal, state)) {
          visibleYielded = true;
          yield delta;
        }
      } catch (e: any) {
        if (e instanceof TransientStreamError && !visibleYielded && attempt < TRANSIENT_RETRY_MAX) {
          await sleepWithJitter(attempt);
          attempt++;
          continue;
        }
        // A real failure after visible text was yielded: surface it. Never
        // retry/replay — that would duplicate the partial answer.
        throw e;
      }

      if (state.incomplete) {
        throw new CodexStreamError(formatIncompleteError(state.incomplete), state.incomplete.code);
      }
      if (!state.completed) {
        // EOF or bare [DONE] without response.completed is NOT success.
        throw new CodexStreamError('Codex stream ended without response.completed.');
      }
      attempt = 0; // reset for the next request in a long-lived session
      return;
    }
  }

  /**
   * Parse an SSE byte stream into text deltas. Responses API SSE events:
   *   event: response.created
   *   data: {"type":"response.created",...}
   *
   *   event: response.output_text.delta
   *   data: {"type":"response.output_text.delta","delta":"Hello",...}
   *
   *   event: response.output_text.done
   *   data: {...,"text":"Hello world",...}
   *
   *   event: response.completed
   *   data: {"type":"response.completed",...}
   *
   *   data: [DONE]
   *
   * We extract deltas (response.output_text.delta) and yield them as
   * strings. The done event carries the full text; we don't yield it
   * because the deltas already produced the same content (avoids
   * double-yielding).
   *
   * Terminal-event policy (models-and-inference.md §3):
   *   - `response.completed` → success. Recorded on `state.completed`.
   *   - `response.incomplete` → failure. Recorded on `state.incomplete`
   *     (the caller throws after the yielded text is preserved).
   *   - `response.failed` / `error` → throw a sanitized CodexStreamError
   *     immediately. Usage-limit / sharing codes are never transient.
   *   - `[DONE]` is ignored and a bare EOF records nothing, so the caller's
   *     `state.completed` check turns both into an explicit failure.
   *
   * When `state` is omitted (legacy two-arg direct calls), terminal events
   * are still classified but completion is simply not recorded anywhere.
   */
  private static parseSseStream(response: Response, signal: AbortSignal): AsyncGenerator<string, void, unknown>;
  private static parseSseStream(response: Response, signal: AbortSignal, state: SseStreamState): AsyncGenerator<string, void, unknown>;
  private static async *parseSseStream(response: Response, signal: AbortSignal, state?: SseStreamState): AsyncGenerator<string, void, unknown> {
    if (!response.body) {
      throw new Error('Codex response had no body.');
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    // Tracks whether the stream for THIS response has finished normally.
    // Set to `true` when ANY of the following happens:
    //   - a terminal event arrives: response.completed / .incomplete / .failed
    //   - the SSE body closes cleanly (reader.read() returns done: true)
    //
    // Once set, an AbortError on a subsequent reader.read() is a benign
    // cleanup event (the ChatGPT OAuth endpoint keeps the SSE body open
    // with :keepalive for ~30s after the model finishes; if our outer
    // controller.abort() fires during that window, the still-bound
    // fetch rejects reader.read() with AbortError — even though the
    // response was already fully delivered). Surfacing such an abort
    // as "Codex request aborted." is the bug this flag was added to
    // address.
    //
    // CRITICAL: this flag MUST also cover the clean-close path (`done:
    // true`) below. The 30s-late AbortError can ALSO fire on a stream
    // that finished via `done: true` without a terminal event name we
    // recognize (in practice chatgpt.com sometimes sends the final
    // delta + closes the body without emitting response.completed).
    let sawTerminalEvent = false;
    try {
      while (true) {
        if (signal.aborted) {
          throw new Error('Codex request aborted.');
        }
        const { value, done } = await reader.read();
        if (done) {
          // Body closed cleanly (server sent EOF, or our own prior
          // reader.cancel() in the finally of an earlier code path
          // unwound the body). NOTE: a bare EOF is NOT success — only
          // `response.completed` is (enforced by the caller via
          // `state.completed`). `sawTerminalEvent` here only governs the
          // post-completion AbortError swallow below: a stream that ended
          // (even without a recognised terminal event) must not surface a
          // late abort as a stream error.
          sawTerminalEvent = true;
          break;
        }
        buffer += decoder.decode(value, { stream: true });

        // SSE messages are separated by a blank line ("\n\n" in
        // practice; some servers use \r\n\r\n).
        let idx: number;
        // eslint-disable-next-line no-cond-assign
        while ((idx = buffer.search(/\r?\n\r?\n/)) >= 0) {
          const raw = buffer.slice(0, idx);
          buffer = buffer.slice(idx + (buffer[idx] === '\r' ? 4 : 2));
          const parsed = parseSseEvent(raw);
          if (!parsed) continue;
          // The `[DONE]` sentinel was historically used by the old
          // chat-completions SSE protocol to signal end-of-stream. The
          // new Responses API uses `response.completed` / .incomplete /
          // .failed events instead — those drive sawTerminalEvent
          // (the flag that gates the post-completion AbortError
          // swallow). We intentionally IGNORE `[DONE]` here: ignoring
          // it lets the parser keep reading the body until the real
          // terminal event arrives or the body closes, which matches
          // the natively path at LLMHelper.ts:4897-4900 (also ignores
          // `[DONE]` and relies on the terminal event).
          if (parsed.data === '[DONE]') continue;
          let json: any;
          try {
            json = JSON.parse(parsed.data);
          } catch {
            // Tolerate non-JSON lines (e.g. comments). Don't yield.
            continue;
          }
          const { delta, terminal } = CodexCliService.classifySseEvent(json, state);
          if (delta) yield delta;
          if (terminal) {
            sawTerminalEvent = true;
            break;
          }
        }
        if (sawTerminalEvent) break;
      }
      // Drain any trailing buffer (last event without trailing blank line).
      if (buffer.trim()) {
        const parsed = parseSseEvent(buffer);
        if (parsed && parsed.data && parsed.data !== '[DONE]') {
          let json: any;
          let isJson = true;
          try {
            json = JSON.parse(parsed.data);
          } catch {
            isJson = false; // not JSON, ignore
          }
          if (isJson) {
            const { delta, terminal } = CodexCliService.classifySseEvent(json, state);
            if (delta) yield delta;
            if (terminal) sawTerminalEvent = true;
          }
        }
      }
    } catch (e: any) {
      // POST-COMPLETION SWALLOW: an AbortError thrown by reader.read()
      // AFTER we've seen a terminal event is benign. The ChatGPT OAuth
      // endpoint keeps the SSE body open with trailing :keepalive for
      // ~30s after the model finishes; any outer controller.abort()
      // (supersession, user stop, deadline teardown) that fires in
      // that window rejects the reader.read() with AbortError, which
      // is a cleanup event — NOT a stream error. The deltas were
      // already flushed upstream before the terminal event arrived.
      const isAbort = e?.name === 'AbortError' || /aborted/i.test(String(e?.message));
      if (isAbort && sawTerminalEvent) {
        // Best-effort log; the IPC handler's catch at ipcHandlers.ts:2299
        // uses the message text to classify, so swallowing here is what
        // removes the "Codex request aborted." log line from the user's
        // session.
        if (process.env.CODEX_DEBUG) {
          console.warn('[Codex] parseSseStream: reader throw AFTER normal completion; swallowed.', {
            stage: 'post_completion_cleanup',
            reason: e?.name || 'unknown',
          });
        }
        return;
      }
      // Pre-completion abort: still surface as before. The outer
      // raceStreamWithDeadline / chatStreamGuard consumes this for
      // supersession/cancel; user's gemini-stream-error UI is the
      // correct signal in that case (matches Escape / Cmd+R behaviour).
      if (isAbort) throw new Error('Codex request aborted.');
      throw e;
    } finally {
      // CANCEL — not releaseLock — to actively tear down the HTTP
      // body. The natively path at LLMHelper.ts:4935 uses the same
      // pattern; releaseLock() only drops the consumer lock on the
      // stream and leaves the body open on the server. The ChatGPT
      // OAuth endpoint specifically keeps the SSE body alive for
      // ~30s after the model finishes; if our outer controller fires
      // a real abort (supersession of the next user request, user
      // presses Cmd+R, etc.) during that window, the still-open body
      // throws AbortError on the next reader.read() — the very error
      // the catch above swallows when sawTerminalEvent is true.
      //
      // reader.cancel() returns a Promise. We attach .catch() because
      // the synchronous try/catch around a Promise-returning call does
      // NOT catch Promise rejections — those surface as
      // unhandledRejection events which Electron's main process treats
      // as fatal under --unhandled-rejections=strict. The reject is
      // benign (the body is already torn down by the abort path or by
      // a prior cancel) — we just need to absorb it.
      reader.cancel().catch(() => { /* already torn down */ });
    }
    // Reaching here does NOT imply success. A bare EOF or a `[DONE]`-only
    // stream records no `state.completed`; the caller (fetchDeltas) turns
    // that into an explicit "ended without response.completed" failure.
  }

  /**
   * Classify one Responses SSE event payload.
   *
   * Returns the text delta (if any) plus whether the event is terminal.
   * Throws a sanitized `CodexStreamError` for `response.failed` / `error`
   * events; transient overload `error` events become `TransientStreamError`
   * (retryable only before visible text) unless they carry a usage-limit /
   * sharing code, which is always a hard failure.
   */
  private static classifySseEvent(
    json: any,
    state?: SseStreamState,
  ): { delta: string; terminal: boolean } {
    const delta = extractResponsesTextDelta(json);
    const type = json?.type;

    if (type === 'response.completed') {
      if (state) state.completed = true;
      return { delta, terminal: true };
    }

    if (type === 'response.incomplete') {
      const details = json?.response?.incomplete_details;
      if (state) {
        state.incomplete = {
          reason: typeof details?.reason === 'string' ? details.reason : undefined,
          code: typeof details?.code === 'string' ? details.code : undefined,
        };
      }
      return { delta, terminal: true };
    }

    if (type === 'response.failed') {
      const failure = extractResponsesFailure(json);
      throw new CodexStreamError(sanitizeErrorMessage(formatResponsesFailure(failure)), failure.code);
    }

    if (type === 'error') {
      const failure = extractResponsesFailure(json);
      const message = sanitizeErrorMessage(formatResponsesFailure(failure)) || 'Codex stream error.';
      if (!isQuotaOrSharingCode(failure.code) && isTransientStreamMessage(message)) {
        throw new TransientStreamError(message, failure.code);
      }
      throw new CodexStreamError(message, failure.code);
    }

    return { delta, terminal: false };
  }

  // ---------------------------------------------------------------------------
  // Text extraction (preserved for legacy callers)
  // ---------------------------------------------------------------------------

  /**
   * @deprecated Kept for the existing test suite. The HTTP-direct path
   * uses the SSE parser above; this method is only used by legacy code
   * that passes raw text dumps to it (the test fixtures do this).
   */
  public static extractText(raw: string): string {
    const text = raw.trim();
    if (!text) return '';

    const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    let sawJson = false;
    const extracted = lines.map(line => {
      const parsed = this.tryParseJson(line);
      if (parsed.ok) {
        sawJson = true;
        return this.findText(parsed.value);
      }
      return '';
    }).filter(Boolean).join('');
    if (extracted.trim()) return extracted.trim();
    if (sawJson && lines.every(line => this.tryParseJson(line).ok)) return '';

    return text
      .replace(/^\s*```(?:json)?/i, '')
      .replace(/```\s*$/i, '')
      .trim();
  }

  private static tryParseJson(line: string): { ok: true; value: any } | { ok: false } {
    try {
      return { ok: true, value: JSON.parse(line) };
    } catch {
      return { ok: false };
    }
  }

  /**
   * @deprecated Legacy error extraction for the old NDJSON event format.
   * The Responses API stream uses a different envelope; for the new
   * HTTP-direct path, errors are surfaced through `fetchDeltas` directly.
   */
  public static extractCodexError(raw: string): string {
    if (!raw) return '';
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const parsed = this.tryParseJson(trimmed);
      if (!parsed.ok) continue;
      const v = parsed.value;
      if (!v || typeof v !== 'object') continue;
      const isError = v.type === 'error' || v.type === 'turn.failed' || v.item?.type === 'error';
      if (!isError) continue;
      const candidates = [v.error?.message, v.error?.error?.message, v.message, v.item?.message];
      for (const c of candidates) {
        if (typeof c !== 'string' || !c) continue;
        const inner = this.tryParseJson(c);
        if (inner.ok && inner.value?.error?.message) return inner.value.error.message;
        return c;
      }
    }
    return '';
  }

  private static findText(value: any): string {
    if (!value) return '';
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) return value.map(item => this.findText(item)).filter(Boolean).join('');
    if (typeof value !== 'object') return '';

    if (value.type === 'error' || value.type === 'thread.started' || value.type === 'turn.started' || value.type === 'turn.completed' || value.type === 'turn.failed') return '';
    if (value.item?.type === 'error') return '';
    if (value.item?.type === 'agent_message') return this.findText(value.item.text);
    if (value.type === 'agent_message') return this.findText(value.text);

    for (const key of ['delta', 'text', 'content', 'output_text', 'output', 'response']) {
      const candidate = this.findText(value[key]);
      if (candidate) return candidate;
    }
    if (value.message) return this.findText(value.message);
    if (value.item) return this.findText(value.item);
    if (value.data) return this.findText(value.data);
    return '';
  }
}

// =============================================================================
// Module-private helpers
// =============================================================================

/** Sleep for `attempt` retries, with full jitter, capped. Honours Retry-After
 *  when the server supplies it (overrides the jitter wait). */
function sleepWithJitter(attempt: number, retryAfterMs?: number): Promise<void> {
  if (retryAfterMs && retryAfterMs > 0) {
    return new Promise(r => setTimeout(r, Math.min(retryAfterMs, TRANSIENT_RETRY_CAP_MS * 4)));
  }
  const base = Math.min(TRANSIENT_RETRY_CAP_MS, TRANSIENT_RETRY_BASE_MS * 2 ** attempt);
  const capped = Math.min(TRANSIENT_RETRY_CAP_MS, base);
  const jitter = Math.random() * capped;
  return new Promise(r => setTimeout(r, jitter));
}

function parseRetryAfter(header: string | null | undefined): number | undefined {
  if (!header) return undefined;
  // Retry-After is either an HTTP-date or a delta-seconds. We only
  // handle the seconds form (the Responses backend uses it).
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.floor(seconds * 1000);
  return undefined;
}

function safeReadText(response: Response): Promise<string> {
  return response.text().catch(() => '');
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n) + '…';
}

interface ParsedSse {
  event?: string;
  data: string;
}

function parseSseEvent(raw: string): ParsedSse | null {
  if (!raw.trim()) return null;
  let event: string | undefined;
  const dataLines: string[] = [];
  for (const line of raw.split(/\r?\n/)) {
    if (!line) continue;
    if (line.startsWith(':')) continue; // comment
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const field = line.slice(0, colon);
    let value = line.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'event') event = value;
    else if (field === 'data') dataLines.push(value);
  }
  if (!dataLines.length) return null;
  return { event, data: dataLines.join('\n') };
}

/** Extract a text delta from a Responses API SSE event payload. */
function extractResponsesTextDelta(payload: any): string {
  if (!payload || typeof payload !== 'object') return '';
  const type = payload.type;
  if (type === 'response.output_text.delta' && typeof payload.delta === 'string') {
    return payload.delta;
  }
  // Some OpenAI proxies emit a Chat-Completions-style chunk instead of
  // a Responses-native event; tolerate it as a fallback.
  if (Array.isArray(payload.choices) && payload.choices[0]?.delta?.content) {
    return String(payload.choices[0].delta.content);
  }
  return '';
}

/** Pull a structured failure out of a Responses API SSE event. Covers both
 *  `response.failed` (error under `response.error`) and explicit `error`
 *  events (error at the top level). */
function extractResponsesFailure(payload: any): { message: string; code?: string } {
  if (!payload || typeof payload !== 'object') return { message: '' };
  const err = payload.response?.error || payload.error;
  const code = typeof err?.code === 'string' ? err.code : undefined;
  const rawMessage =
    (typeof err?.message === 'string' && err.message)
    || (typeof payload.message === 'string' && payload.message)
    || '';
  return { message: rawMessage, code };
}

/** Map a structured failure to a user-facing message. Usage-limit / sharing
 *  codes get an explicit, actionable string even when the backend omits a
 *  message. */
function formatResponsesFailure(failure: { message: string; code?: string }): string {
  switch (failure.code) {
    case 'subscription_sharing_usage_limit_exceeded':
      return 'ChatGPT plan usage limit reached (subscription_sharing_usage_limit_exceeded).';
    case 'subscription_sharing_usage_unavailable':
      return 'ChatGPT plan usage is temporarily unavailable (subscription_sharing_usage_unavailable).';
    default:
      return failure.message;
  }
}

/** Human-readable message for a `response.incomplete` terminal event. */
function formatIncompleteError(incomplete: { reason?: string; code?: string }): string {
  const detail = incomplete.reason || incomplete.code;
  return detail ? `Codex response incomplete (${detail}).` : 'Codex response incomplete.';
}

/** Pull a human-readable error from a non-2xx JSON body. */
function extractResponsesErrorMessage(text: string): string {
  if (!text) return '';
  try {
    const json = JSON.parse(text);
    if (json?.error?.message) return String(json.error.message);
    if (typeof json?.message === 'string') return json.message;
  } catch { /* not JSON */ }
  return text;
}

// =============================================================================
// Signal combination (AbortSignal.any() is Node 20+; keep our own for
// compat with the Electron versions we ship)
// =============================================================================

interface CombinedSignal {
  readonly signal: AbortSignal;
  dispose(): void;
}

function combineSignals(...signals: (AbortSignal | undefined)[]): CombinedSignal {
  const filtered = signals.filter((s): s is AbortSignal => !!s);
  const ctrl = new AbortController();
  const onAbort = (e: Event) => {
    const reason = (e.target as AbortSignal)?.reason;
    ctrl.abort(reason);
  };
  for (const s of filtered) {
    if (s.aborted) {
      ctrl.abort(s.reason);
      break;
    }
    s.addEventListener('abort', onAbort, { once: true });
  }
  return {
    signal: ctrl.signal,
    dispose() {
      for (const s of filtered) {
        try { s.removeEventListener('abort', onAbort); } catch { /* swallow */ }
      }
    },
  };
}
