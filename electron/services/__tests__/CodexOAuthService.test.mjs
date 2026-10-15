import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { SignJWT, exportJWK, generateKeyPair } from 'jose';
const require = createRequire(import.meta.url);
const store = { tokens: null, registration: null, writes: 0 };
let opened;
let openedCount = 0;
globalThis.__oauthTest = {
 shell: { openExternal: async url => { opened = new URL(url); openedCount++; } },
 cm: {
  getCodexOAuthTokens: () => store.tokens,
  getChatGPTRegistration: () => store.registration,
  setChatGPTRegistration: r => { store.registration = r; },
  getChatGPTHostId: () => 'urn:uuid:test-host',
  setCodexOAuthTokens: t => { store.tokens=t;store.registration={clientId:t.clientId,subject:t.subject,issuer:t.issuer};store.writes++; },
  clearCodexOAuthTokens: () => { store.tokens=null; },
 },
};
const bundled = await build({entryPoints:['electron/services/CodexOAuthService.ts'],bundle:true,platform:'node',format:'cjs',write:false,plugins:[{name:'mock',setup(b){
 b.onResolve({filter:/^electron$|\.\/CredentialsManager$/},a=>({path:a.path,namespace:'mock'}));
 b.onLoad({filter:/.*/,namespace:'mock'},a=>({contents:a.path==='electron'?'module.exports={shell:globalThis.__oauthTest.shell,net:{fetch:(...args)=>globalThis.fetch(...args)}};':'module.exports={CredentialsManager:{getInstance:()=>globalThis.__oauthTest.cm}};',loader:'js'}));
}}]});
const mod={exports:{}};new Function('require','module','exports',bundled.outputFiles[0].text)(require,mod,mod.exports);
const {CodexOAuthService:Service}=mod.exports;
const service=Service.getInstance();
const originalFetch=globalThis.fetch;
const keys=await generateKeyPair('RS256'); const jwk={...await exportJWK(keys.publicKey),kid:'test-key',use:'sig',alg:'RS256'};
async function token(claims={}) {return new SignJWT({nonce:opened?.searchParams.get('nonce'),...claims}).setProtectedHeader({alg:'RS256',kid:'test-key'}).setIssuer('https://auth.openai.com').setAudience('oaiapp_test').setSubject('test-subject').setExpirationTime('1h').setIssuedAt().sign(keys.privateKey);}
function reset(){service.__resetForTest();store.tokens=null;store.registration=null;store.writes=0;opened=null;openedCount=0;globalThis.fetch=originalFetch;}
async function start(){const pending=service.startLogin();pending.catch(()=>{});for(let i=0;!opened&&i<50;i++)await new Promise(r=>setTimeout(r,10));assert.ok(opened);return {pending};}
async function callback(params={}) {const url=new URL(opened.searchParams.get('redirect_uri'));url.search=new URLSearchParams({state:opened.searchParams.get('state'),code:'test-code',client_id:'oaiapp_test',...params}).toString();return originalFetch(url);}
const scopes='openid profile email offline_access resource.invoke chatgpt.tokens.use.direct';
function mockToken(extra={}) {globalThis.fetch=async(url,init)=>{
 if(String(url).includes('jwks')) return Response.json({keys:[jwk]});
 assert.equal(String(url),'https://auth.openai.com/api/accounts/oauth/token');
 const f=new URLSearchParams(init.body);assert.equal(f.get('client_id'),'oaiapp_test');assert.equal(f.get('resource'),'https://api.openai.com/v1');
 return Response.json({access_token:'synthetic-access',refresh_token:'synthetic-refresh',id_token:await token(),token_type:'Bearer',expires_in:3600,scope:scopes,...extra});
};}

test('official dynamic registration, PKCE, nonce, verified token and scopes',async()=>{reset();mockToken();const {pending}=await start();
 assert.equal(opened.origin+opened.pathname,'https://auth.openai.com/api/accounts/authorize');assert.equal(opened.searchParams.get('client_id'),'dynamic_agent_client');assert.equal(opened.searchParams.get('agent_name_hint'),'Natively');assert.equal(opened.searchParams.get('ext_agent_host_id'),'urn:uuid:test-host');assert.equal(opened.searchParams.get('resource'),'https://api.openai.com/v1');assert.ok(opened.searchParams.get('nonce'));assert.equal(new URL(opened.searchParams.get('redirect_uri')).hostname,'127.0.0.1');
 await callback();await pending;assert.equal(service.getStatus().signedIn,true);assert.equal(store.tokens.subject,'test-subject');assert.equal(store.tokens.clientId,'oaiapp_test');
});
test('forged state cannot cancel or complete pending login',async()=>{reset();mockToken();const {pending}=await start();assert.equal((await callback({state:'forged',error:'access_denied'})).status,400);assert.equal(store.writes,0);await callback();await pending;});
test('denial with valid state performs no token exchange',async()=>{reset();let calls=0;globalThis.fetch=async()=>{calls++;throw Error('unexpected');};const {pending}=await start();await callback({error:'access_denied'});await assert.rejects(pending,/denied|取消|拒绝/i);assert.equal(calls,0);assert.equal(store.writes,0);});
test('missing direct plan scope is not a signed-in connection',async()=>{reset();mockToken({scope:'openid profile email'});const {pending}=await start();await callback();await assert.rejects(pending,/permission|授权|scope/i);assert.equal(store.writes,0);});
test('ID token nonce mismatch is rejected',async()=>{reset();const {pending}=await start();mockToken({id_token:await token({nonce:'wrong'})});await callback();await assert.rejects(pending,/nonce|身份/i);assert.equal(store.writes,0);});
test('returning client mismatch preserves old registration',async()=>{reset();store.registration={clientId:'oaiapp_existing',subject:'existing-sub',issuer:'https://auth.openai.com'};const {pending}=await start();assert.equal(opened.searchParams.get('client_id'),'oaiapp_existing');assert.equal(opened.searchParams.has('agent_name_hint'),false);await callback();await assert.rejects(pending,/client|注册/i);assert.equal(store.writes,0);});
test('legacy tokens require reauthorization instead of public API use',async()=>{reset();store.tokens={accessToken:'legacy',refreshToken:'legacy-refresh',expiresAt:Date.now()+9999999};assert.equal(service.getStatus().signedIn,false);assert.equal(await service.getAccessToken(),null);});
test('refresh rotates atomically, deduplicates and preserves scopes', async()=>{
 reset();mockToken();const {pending}=await start();await callback();await pending;
 const before=store.tokens;let calls=0;
 globalThis.fetch=async(url,init)=>{calls++;const body=new URLSearchParams(init.body);assert.equal(body.get('grant_type'),'refresh_token');assert.equal(body.get('client_id'),'oaiapp_test');assert.equal(body.get('resource'),'https://api.openai.com/v1');assert.equal(body.has('scope'),false);await new Promise(r=>setTimeout(r,15));return Response.json({access_token:'rotated-access',refresh_token:'rotated-refresh',expires_in:3600,token_type:'Bearer'});};
 const [a,b]=await Promise.all([service.refreshTokens(),service.refreshTokens()]);assert.equal(calls,1);assert.equal(a.refreshToken,'rotated-refresh');assert.deepEqual(a,b);assert.deepEqual(a.scopes,before.scopes);
});
test('transient refresh failure keeps credentials; permanent failure requires reauth',async()=>{
 reset();mockToken();const {pending}=await start();await callback();await pending;const before=store.tokens;
 globalThis.fetch=async()=>Response.json({error:'temporarily_unavailable'},{status:503});await assert.rejects(service.refreshTokens());assert.deepEqual(store.tokens,before);
 globalThis.fetch=async()=>Response.json({error:'invalid_grant'},{status:400});await assert.rejects(service.refreshTokens());assert.equal(service.getStatus().signedIn,false);assert.equal(store.registration.clientId,'oaiapp_test');
});
test('cancellation prevents a late authorization from signing back in',async()=>{
 reset();mockToken();const {pending}=await start();await service.signOut();await assert.rejects(pending,/取消/);assert.equal(service.getStatus().signedIn,false);
});
test('persist failure must not report a successful login',async()=>{
 reset();mockToken();const saved=globalThis.__oauthTest.cm.setCodexOAuthTokens;globalThis.__oauthTest.cm.setCodexOAuthTokens=()=>{throw Error('storage failed');};
 try{const {pending}=await start();await callback();await assert.rejects(pending,/storage failed/);assert.equal(service.getStatus().signedIn,false);}finally{globalThis.__oauthTest.cm.setCodexOAuthTokens=saved;}
});
test('concurrent login opens one browser and blocks refresh until authorization finishes', async () => {
 reset();
 mockToken();
 const {pending} = await start();
 try {
  await assert.rejects(service.startLogin(), /登录已在进行中/);
  await assert.rejects(service.refreshTokens(), /正在登录/);
  assert.equal(openedCount, 1);
  assert.equal(store.writes, 0);
  await callback();
  await pending;
  assert.equal(service.getStatus().signedIn, true);
  assert.equal(openedCount, 1);
 } finally {
  service.__resetForTest();
  await pending.catch(() => {});
 }
});
test('login during token rotation is rejected without opening another browser', async () => {
 reset();
 mockToken();
 const {pending} = await start();
 await callback();
 await pending;
 let releaseRefresh;
 let refreshStarted;
 const started = new Promise(resolve => { refreshStarted = resolve; });
 const gate = new Promise(resolve => { releaseRefresh = resolve; });
 globalThis.fetch = async (url, init) => {
  assert.equal(String(url), 'https://auth.openai.com/api/accounts/oauth/token');
  assert.equal(new URLSearchParams(init.body).get('grant_type'), 'refresh_token');
  refreshStarted();
  await gate;
  return Response.json({access_token: 'rotated-access', refresh_token: 'rotated-refresh', expires_in: 3600, token_type: 'Bearer'});
 };
 const refresh = service.refreshTokens();
 try {
  await started;
  await assert.rejects(service.startLogin(), /正在刷新/);
  await assert.rejects(service.startLogin(), /正在刷新/);
  assert.equal(openedCount, 1);
 } finally {
  releaseRefresh();
  await refresh;
 }
 assert.equal(openedCount, 1);
 assert.equal(store.tokens.refreshToken, 'rotated-refresh');
});
test('sign out waits for rotation, revokes the latest refresh token and blocks access-token delivery', async () => {
 reset();
 mockToken();
 const {pending} = await start();
 await callback();
 await pending;
 service.__setCachedTokensForTest({...store.tokens, expiresAt: Date.now() - 1});
 let releaseRefresh;
 let refreshStarted;
 let revokedToken;
 let refreshCalls = 0;
 const started = new Promise(resolve => { refreshStarted = resolve; });
 const gate = new Promise(resolve => { releaseRefresh = resolve; });
 globalThis.fetch = async (url, init) => {
  if (String(url) === 'https://auth.openai.com/api/accounts/oauth/token') {
   refreshCalls++;
   assert.equal(new URLSearchParams(init.body).get('refresh_token'), 'synthetic-refresh');
   refreshStarted();
   await gate;
   return Response.json({access_token: 'rotated-access', refresh_token: 'rotated-refresh', expires_in: 3600, token_type: 'Bearer'});
  }
  if (String(url) === 'https://auth.openai.com/.well-known/openid-configuration') {
   return Response.json({revocation_endpoint: 'https://auth.openai.com/api/accounts/oauth/revoke'});
  }
  assert.equal(String(url), 'https://auth.openai.com/api/accounts/oauth/revoke');
  const body = new URLSearchParams(init.body);
  assert.equal(body.get('token_type_hint'), 'refresh_token');
  assert.equal(body.get('client_id'), 'oaiapp_test');
  revokedToken = body.get('token');
  return new Response('', {status: 200});
 };
 const access = service.getAccessToken();
 await started;
 const logout = service.signOut();
 try {
  assert.equal(service.getStatus().signedIn, false);
  assert.equal(await service.getAccessToken(), null);
  assert.equal(await service.refreshTokens(), null);
  await assert.rejects(service.startLogin(), /正在退出/);
  assert.equal(revokedToken, undefined);
 } finally {
  releaseRefresh();
 }
 assert.equal(await access, null);
 assert.deepEqual(await logout, {remoteRevoked: true});
 assert.equal(refreshCalls, 1);
 assert.equal(revokedToken, 'rotated-refresh');
 assert.equal(store.tokens, null);
 assert.equal(store.registration.clientId, 'oaiapp_test');
 assert.equal(await service.getAccessToken(), null);
});
test('a modified ID token payload fails signature validation', async () => {
 reset();
 const {pending} = await start();
 const parts = (await token()).split('.');
 const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
 parts[1] = Buffer.from(JSON.stringify({...payload, sub: 'tampered-subject'})).toString('base64url');
 mockToken({id_token: parts.join('.')});
 await callback();
 await assert.rejects(pending, /身份验证失败/);
 assert.equal(store.writes, 0);
 assert.equal(store.registration, null);
});
test('returning sign in rejects a validly signed ID token for a different subject', async () => {
 reset();
 const registration = {clientId: 'oaiapp_test', subject: 'original-subject', issuer: 'https://auth.openai.com'};
 store.registration = registration;
 mockToken();
 const {pending} = await start();
 await callback();
 await assert.rejects(pending, /登录账户与原注册不一致/);
 assert.equal(store.writes, 0);
 assert.deepEqual(store.registration, registration);
 assert.equal(await service.getAccessToken(), null);
});
test.after(()=>{service.__resetForTest();globalThis.fetch=originalFetch;delete globalThis.__oauthTest;});
