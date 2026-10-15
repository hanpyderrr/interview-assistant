/** ChatGPT plan OAuth for Natively. Tokens stay in the main process and encrypted storage. */
import { EventEmitter } from 'events';
import * as http from 'http';
import * as crypto from 'crypto';
import { shell } from 'electron';
import { createRemoteJWKSet, jwtVerify, customFetch } from 'jose';
import { chatGPTFetch } from './ChatGPTTransport';

export const CODEX_OAUTH_CLIENT_ID = 'dynamic_agent_client';
export const CODEX_OAUTH_AUTHORIZE_URL = 'https://auth.openai.com/api/accounts/authorize';
export const CODEX_OAUTH_TOKEN_URL = 'https://auth.openai.com/api/accounts/oauth/token';
export const CODEX_OAUTH_SCOPE = 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct';
export const CODEX_OAUTH_PREFERRED_PORT = 1455;
export const CODEX_OAUTH_CALLBACK_PATH = '/auth/callback';
export const CODEX_OAUTH_REFRESH_LEAD_MS = 5 * 60 * 1000;
const ISSUER = 'https://auth.openai.com';
const RESOURCE = 'https://api.openai.com/v1';
const jwks = createRemoteJWKSet(new URL(`${ISSUER}/.well-known/jwks.json`), { timeoutDuration: 10000, [customFetch]: chatGPTFetch });

export interface ChatGPTRegistration { clientId: string; subject: string; issuer: string; email?: string }
export interface CodexOAuthTokens {
  accessToken: string;
  refreshToken: string;
  idToken?: string;
  expiresAt: number;
  email?: string;
  /** Optional fields allow loading legacy credentials, which require a fresh authorization. */
  clientId?: string;
  subject?: string;
  issuer?: string;
  scopes?: string[];
  lastRefreshAt?: number;
}
export interface CodexOAuthLoginResult { tokens: CodexOAuthTokens; email?: string }
export type CodexOAuthStatus = { signedIn: boolean; email?: string; expiresAt?: number; requiresReauth?: boolean };

function isPlanGrant(t: CodexOAuthTokens | null): t is CodexOAuthTokens & ChatGPTRegistration {
  return !!(t?.accessToken && t.refreshToken && t.clientId && t.clientId !== CODEX_OAUTH_CLIENT_ID &&
    t.subject && t.issuer === ISSUER && t.scopes?.includes('resource.invoke') && t.scopes.includes('chatgpt.tokens.use.direct'));
}

function tryListen(server: http.Server, port: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const failed = (error: Error) => { server.off('listening', ready); reject(error); };
    const ready = () => {
      server.off('error', failed);
      const address = server.address();
      if (address && typeof address !== 'string') resolve(address.port);
      else reject(new Error('无法启动登录回调服务。'));
    };
    server.once('error', failed); server.once('listening', ready); server.listen(port, '127.0.0.1');
  });
}

function startCallbackServer(state: string) {
  let resolve!: (params: URLSearchParams) => void;
  let reject!: (error: Error) => void;
  let settled = false;
  const result = new Promise<URLSearchParams>((yes, no) => { resolve = yes; reject = no; });
  // Binding/browser errors can precede awaiting the callback.
  void result.catch(() => {});
  const server = http.createServer((req, res) => {
    let url: URL;
    try { url = new URL(req.url || '/', 'http://127.0.0.1'); }
    catch { res.writeHead(400).end('Invalid callback'); return; }
    if (req.method !== 'GET' || url.pathname !== CODEX_OAUTH_CALLBACK_PATH) { res.writeHead(404).end(); return; }
    if (url.searchParams.get('state') !== state || settled) { res.writeHead(400).end('Invalid OAuth state'); return; }
    settled = true;
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end('<!doctype html><meta charset="utf-8"><title>Natively</title><p>授权回调已收到，请返回 Natively 查看登录结果。</p>');
    resolve(url.searchParams);
  });
  const portReady = tryListen(server, CODEX_OAUTH_PREFERRED_PORT).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'EADDRINUSE' || error.code === 'EACCES') return tryListen(server, 0);
    throw error;
  });
  return { result, portReady, close(error = new Error('登录已取消。')) {
    if (!settled) { settled = true; reject(error); }
    server.close(); server.closeAllConnections();
  } };
}

async function verifiedIdentity(idToken: unknown, clientId: string, nonce?: string) {
  if (typeof idToken !== 'string') throw new Error('授权响应缺少 ID token，请重新登录。');
  try {
    const { payload } = await jwtVerify(idToken, jwks, {
      issuer: ISSUER, audience: clientId, algorithms: ['RS256'], clockTolerance: 5,
      requiredClaims: ['iss', 'sub', 'aud', 'exp', 'iat'],
    });
    if (typeof payload.sub !== 'string' || !payload.sub || (nonce !== undefined && payload.nonce !== nonce)) throw new Error('nonce mismatch');
    if (Array.isArray(payload.aud) && payload.aud.length > 1 && payload.azp !== clientId) throw new Error('Invalid authorized party');
    return { subject: payload.sub, issuer: ISSUER, email: typeof payload.email === 'string' ? payload.email : undefined };
  } catch { throw new Error('ChatGPT 身份验证失败（签名、有效期或 nonce 不匹配），请重新登录。'); }
}

async function requestTokens(fields: Record<string, string>, signal?: AbortSignal) {
  let response: Response;
  try {
    response = await chatGPTFetch(CODEX_OAUTH_TOKEN_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({ ...fields, resource: RESOURCE }).toString(),
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000),
    });
  } catch { throw new Error('ChatGPT 授权服务连接失败或超时，请重试。'); }
  const bundle = await response.json().catch((): null => null);
  if (!response.ok) {
    const code = typeof bundle?.error === 'string' ? bundle.error : bundle?.error?.code;
    // Only known error codes enter diagnostics; raw OAuth responses can contain credentials.
    const permanent = ['invalid_grant', 'invalid_refresh_token', 'token_expired', 'refresh_token_expired', 'refresh_token_reused', 'refresh_token_invalidated'].includes(code);
    const detail = code === 'unsupported_country_region_territory' ? '当前网络出口所在地区不受支持，请检查系统网络。' : '请重试。';
    const error = new Error(permanent ? 'ChatGPT 会话已失效，请重新登录。' : `ChatGPT 授权失败（HTTP ${response.status}），${detail}`);
    Object.assign(error, { permanent }); throw error;
  }
  if (!bundle || typeof bundle !== 'object') throw new Error('ChatGPT 返回了无效的授权响应。');
  return bundle;
}

export class CodexOAuthService extends EventEmitter {
  private cachedTokens: CodexOAuthTokens | null = null;
  private refreshInFlight: Promise<CodexOAuthTokens | null> | null = null;
  private activeLogin: { close: (error?: Error) => void; controller: AbortController } | null = null;
  private revision = 0;
  private signedOut = false;
  private signingOut = false;
  private pendingClientId: string | null = null;
  private constructor() { super(); }
  public static getInstance(): CodexOAuthService {
    // Electron bundles this service at multiple entry points; share one refresh lock.
    const g = globalThis as typeof globalThis & { __nativelyChatGPTPlanOAuth?: CodexOAuthService };
    return g.__nativelyChatGPTPlanOAuth ??= new CodexOAuthService();
  }
  private getCredentialsManager(): any {
    return require('./CredentialsManager').CredentialsManager.getInstance();
  }
  private loadFromStorage(): CodexOAuthTokens | null {
    if (this.signedOut) return null;
    try { return this.getCredentialsManager().getCodexOAuthTokens(); } catch { return null; }
  }
  private persist(tokens: CodexOAuthTokens) {
    this.getCredentialsManager().setCodexOAuthTokens(tokens);
    this.cachedTokens = tokens; this.signedOut = false;
  }
  public getCachedTokens(): CodexOAuthTokens | null { return this.cachedTokens || this.loadFromStorage(); }
  public getStatus(): CodexOAuthStatus {
    const t = this.signingOut ? null : this.getCachedTokens();
    return isPlanGrant(t) ? { signedIn: true, email: t.email, expiresAt: t.expiresAt } : { signedIn: false, requiresReauth: !!t };
  }
  public async getAccessToken(): Promise<string | null> {
    if (this.signingOut) return null;
    const t = this.getCachedTokens();
    if (!isPlanGrant(t)) return null;
    if (t.expiresAt - Date.now() > CODEX_OAUTH_REFRESH_LEAD_MS) return t.accessToken;
    const refreshed = await this.refreshTokens();
    return this.signingOut || this.signedOut ? null : refreshed?.accessToken || null;
  }
  public async refreshTokens(): Promise<CodexOAuthTokens | null> {
    if (this.signingOut) return null;
    if (this.activeLogin) throw new Error('正在登录 ChatGPT，请完成浏览器授权后重试。');
    if (this.refreshInFlight) return this.refreshInFlight;
    const revision = this.revision;
    const inflight = (async () => {
      const t = this.getCachedTokens();
      if (!isPlanGrant(t)) return null;
      try {
        const bundle = await requestTokens({ grant_type: 'refresh_token', client_id: t.clientId, refresh_token: t.refreshToken });
        const identity = bundle.id_token ? await verifiedIdentity(bundle.id_token, t.clientId) : t;
        if (identity.subject !== t.subject || identity.issuer !== t.issuer) throw new Error('ChatGPT 返回了不同的账户身份，未替换原登录。');
        const next = this.bundleToTokens(bundle, t.clientId, identity, t);
        if (revision !== this.revision) return null;
        this.persist(next); this.emit('tokens:refreshed', { expiresAt: next.expiresAt }); return next;
      } catch (error: any) {
        if (revision === this.revision && error?.permanent) {
          this.cachedTokens = null; this.signedOut = true;
          this.getCredentialsManager().clearCodexOAuthTokens();
          this.emit('signed-out');
        }
        throw error;
      }
    })();
    this.refreshInFlight = inflight.finally(() => { this.refreshInFlight = null; });
    return this.refreshInFlight;
  }
  private bundleToTokens(bundle: any, clientId: string, identity: { subject: string; issuer: string; email?: string }, previous?: CodexOAuthTokens): CodexOAuthTokens {
    const scopes = typeof bundle.scope === 'string' ? bundle.scope.split(/\s+/).filter(Boolean) : previous?.scopes || [];
    if (!scopes.includes('chatgpt.tokens.use.direct') || !scopes.includes('resource.invoke')) throw new Error('尚未授权 ChatGPT 会员额度使用权限，请重新登录并允许使用套餐。');
  if (!bundle || typeof bundle.access_token !== 'string' || !bundle.access_token ||
    typeof bundle.refresh_token !== 'string' || !bundle.refresh_token ||
    typeof bundle.expires_in !== 'number' || !Number.isFinite(bundle.expires_in) || bundle.expires_in <= 0 ||
    typeof bundle.token_type !== 'string' || bundle.token_type.toLowerCase() !== 'bearer') {
    throw new Error('ChatGPT 返回了不完整的授权信息，请重新登录。');
  }
    return {
      accessToken: bundle.access_token, refreshToken: bundle.refresh_token,
      idToken: bundle.id_token || previous?.idToken, expiresAt: Date.now() + bundle.expires_in * 1000,
      clientId, subject: identity.subject, issuer: identity.issuer, email: identity.email, scopes, lastRefreshAt: Date.now(),
    };
  }
  public async startLogin(): Promise<CodexOAuthLoginResult> {
    if (this.activeLogin) throw new Error('ChatGPT 登录已在进行中，请完成浏览器授权。');
    if (this.signingOut) throw new Error('正在退出 ChatGPT，请稍后重试。');
    if (this.refreshInFlight) throw new Error('正在刷新 ChatGPT 会话，请稍后重试登录。');
    const cm = this.getCredentialsManager();
    const previous = this.getCachedTokens();
    const registration: ChatGPTRegistration | null = isPlanGrant(previous) ? previous : cm.getChatGPTRegistration();
    const clientId = registration?.clientId || this.pendingClientId || CODEX_OAUTH_CLIENT_ID;
    const state = crypto.randomBytes(16).toString('base64url');
    const nonce = crypto.randomBytes(32).toString('base64url');
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    const challenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
    const listener = startCallbackServer(state);
    const controller = new AbortController();
    const attempt = { close: listener.close, controller };
    this.activeLogin = attempt;
    const revision = ++this.revision;
    const timer = setTimeout(() => { controller.abort(); listener.close(new Error('登录超时（5 分钟），请重试。')); }, 300000);
    try {
      const port = await listener.portReady;
      const redirectUri = `http://127.0.0.1:${port}${CODEX_OAUTH_CALLBACK_PATH}`;
      const params = new URLSearchParams({ response_type: 'code', client_id: clientId, redirect_uri: redirectUri,
        scope: CODEX_OAUTH_SCOPE, resource: RESOURCE, state, nonce, code_challenge: challenge,
        code_challenge_method: 'S256', ext_agent_host_id: cm.getChatGPTHostId() });
      if (clientId === CODEX_OAUTH_CLIENT_ID) params.set('agent_name_hint', 'Natively');
      else {
        if (!isPlanGrant(previous)) params.set('prompt', 'consent');
        if (previous?.idToken) params.set('id_token_hint', previous.idToken);
        if (registration?.email) params.set('login_hint', registration.email);
      }
      try { await shell.openExternal(`${CODEX_OAUTH_AUTHORIZE_URL}?${params}`); }
      catch { throw new Error('无法打开登录浏览器，请检查默认浏览器后重试。'); }
      const callback = await listener.result;
      // State was checked by the listener before handling either success or denial.
      if (callback.has('error')) throw new Error('ChatGPT 授权被拒绝或取消，请重新登录并允许使用套餐。');
      const code = callback.get('code');
      const issuedClient = callback.get('client_id') || (clientId !== CODEX_OAUTH_CLIENT_ID ? clientId : '');
      if (!code || !issuedClient || issuedClient === CODEX_OAUTH_CLIENT_ID) throw new Error('授权注册未完成，缺少 code 或 issued client ID，请重试。');
      if (clientId !== CODEX_OAUTH_CLIENT_ID && issuedClient !== clientId) throw new Error('授权 client ID 与所选注册不一致，未替换原登录。');
      this.pendingClientId = issuedClient;
      const bundle = await requestTokens({ grant_type: 'authorization_code', client_id: issuedClient, code,
        code_verifier: codeVerifier, redirect_uri: redirectUri }, controller.signal);
      const identity = await verifiedIdentity(bundle.id_token, issuedClient, nonce);
      if (registration && (identity.subject !== registration.subject || identity.issuer !== registration.issuer)) throw new Error('登录账户与原注册不一致，未替换原登录。');
      if (controller.signal.aborted || revision !== this.revision) throw new Error('登录已取消。');
      // Retain the verified registration even if plan access was not granted.
      if (!isPlanGrant(previous)) cm.setChatGPTRegistration({ clientId: issuedClient, ...identity });
      const tokens = this.bundleToTokens(bundle, issuedClient, identity);
      if (controller.signal.aborted || revision !== this.revision) throw new Error('登录已取消。');
      this.persist(tokens);
      this.pendingClientId = null; ++this.revision;
      this.emit('login:complete', { email: tokens.email, expiresAt: tokens.expiresAt });
      return { tokens, email: tokens.email };
    } catch (error) {
      this.emit('login:failed', error); throw error;
    } finally {
      clearTimeout(timer); listener.close();
      if (this.activeLogin === attempt) this.activeLogin = null;
    }
  }
  public async signOut(): Promise<{ remoteRevoked: boolean }> {
    if (this.signingOut) throw new Error('正在退出 ChatGPT。');
    this.signingOut = true;
    this.activeLogin?.controller.abort(); this.activeLogin?.close();
    // Wait for rotation so revocation uses the latest renewable token.
    if (this.refreshInFlight) await this.refreshInFlight.catch((): null => null);
    ++this.revision;
    this.pendingClientId = null;
    const old = this.getCachedTokens();
    this.cachedTokens = null; this.signedOut = true;
    // Local sign-out remains effective even if the remote service is unavailable.
    let storageError: unknown;
    try { this.getCredentialsManager().clearCodexOAuthTokens(); }
    catch (error) { storageError = error; }
    this.emit('signed-out');
    if (!isPlanGrant(old)) { this.signingOut = false; if (storageError) throw storageError; return { remoteRevoked: true }; }
    let remoteRevoked = false;
    try {
      const discovery = await chatGPTFetch(`${ISSUER}/.well-known/openid-configuration`, { signal: AbortSignal.timeout(10000) });
      const metadata = await discovery.json();
      const url = new URL(metadata.revocation_endpoint);
      if (url.origin !== ISSUER || url.username || url.password) throw new Error('Invalid revocation endpoint');
      for (let i = 0; i < 2; i++) {
        const response = await chatGPTFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ token: old.refreshToken, token_type_hint: 'refresh_token', client_id: old.clientId }).toString(),
          signal: AbortSignal.timeout(10000) });
        if (response.status === 200) { remoteRevoked = true; break; }
        if (response.status < 500) break;
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    } catch { /* Report unconfirmed remote revocation to the caller. */ }
    this.signingOut = false;
    if (storageError) throw storageError;
    return { remoteRevoked };
  }
  public __resetForTest(): void {
    ++this.revision; this.activeLogin?.controller.abort(); this.activeLogin?.close(); this.activeLogin = null;
    this.cachedTokens = null; this.signedOut = false; this.signingOut = false; this.pendingClientId = null; this.refreshInFlight = null;
  }
  public __setCachedTokensForTest(tokens: CodexOAuthTokens): void { this.cachedTokens = tokens; this.signedOut = false; }
}
