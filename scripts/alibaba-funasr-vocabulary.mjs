import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TARGET_MODEL = 'fun-asr-realtime';
const WORKSPACE_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const VOCABULARY_ID_PATTERN = /^vocab-[a-z0-9-]+$/i;

export function hashVocabulary(vocabulary) {
  return createHash('sha256').update(JSON.stringify(vocabulary)).digest('hex');
}

function validateVocabulary(vocabulary) {
  if (!Array.isArray(vocabulary) || vocabulary.length < 1 || vocabulary.length > 500) {
    throw new Error('vocabulary count must be between 1 and 500');
  }
  for (const entry of vocabulary) {
    if (!entry || typeof entry.text !== 'string' || !entry.text.trim()) throw new Error('invalid vocabulary text');
    if (!Number.isInteger(entry.weight) || entry.weight < 1 || entry.weight > 5) throw new Error('invalid vocabulary weight');
    if (entry.lang !== undefined && !['zh', 'en', 'ja'].includes(entry.lang)) throw new Error('invalid vocabulary language');
  }
}

async function requestVocabulary({ endpoint, apiKey, input, fetchImpl }) {
  const response = await fetchImpl(endpoint, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'speech-biasing', input }),
  });
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error(`Alibaba vocabulary API returned invalid JSON (${response.status || 'unknown'})`);
  }
  if (!response.ok) {
    const code = String(payload?.code || payload?.output?.code || 'request_failed').slice(0, 80);
    throw new Error(`Alibaba vocabulary API failed (${response.status || 'unknown'}, ${code})`);
  }
  return payload;
}

export async function createOrReuseVocabulary({
  apiKey,
  workspaceId,
  vocabulary,
  prefix,
  state,
  fetchImpl = fetch,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  maxPolls = 40,
  pollDelayMs = 3000,
}) {
  if (typeof apiKey !== 'string' || !apiKey.trim()) throw new Error('DASHSCOPE_API_KEY is required');
  if (!WORKSPACE_PATTERN.test(String(workspaceId || ''))) throw new Error('invalid Alibaba workspace ID');
  if (!/^[a-z0-9]{1,10}$/.test(String(prefix || ''))) throw new Error('invalid vocabulary prefix');
  validateVocabulary(vocabulary);

  const endpoint = `https://${workspaceId}.cn-beijing.maas.aliyuncs.com/api/v1/services/audio/asr/customization`;
  const vocabularyHash = hashVocabulary(vocabulary);
  let vocabularyId = state?.vocabularyHash === vocabularyHash ? state.vocabularyId : undefined;
  let createdAt = state?.createdAt;

  if (!vocabularyId) {
    const created = await requestVocabulary({
      endpoint, apiKey, fetchImpl,
      input: { action: 'create_vocabulary', target_model: TARGET_MODEL, prefix, vocabulary },
    });
    vocabularyId = created?.output?.vocabulary_id;
    if (!VOCABULARY_ID_PATTERN.test(String(vocabularyId || ''))) throw new Error('Alibaba vocabulary API returned an invalid vocabulary ID');
    createdAt = new Date().toISOString();
  }

  for (let poll = 1; poll <= maxPolls; poll += 1) {
    const queried = await requestVocabulary({
      endpoint, apiKey, fetchImpl,
      input: { action: 'query_vocabulary', vocabulary_id: vocabularyId },
    });
    const status = queried?.output?.status;
    const targetModel = queried?.output?.target_model;
    if (targetModel && targetModel !== TARGET_MODEL) throw new Error(`unexpected vocabulary target model: ${targetModel}`);
    if (status === 'OK') {
      const remoteVocabulary = queried?.output?.vocabulary;
      if (Array.isArray(remoteVocabulary) && remoteVocabulary.length !== vocabulary.length) {
        throw new Error(`remote vocabulary count mismatch: ${remoteVocabulary.length} != ${vocabulary.length}`);
      }
      return {
        vocabularyId,
        vocabularyHash,
        status,
        targetModel: TARGET_MODEL,
        prefix,
        count: vocabulary.length,
        createdAt,
        checkedAt: new Date().toISOString(),
      };
    }
    if (status !== 'UNDEPLOYED') throw new Error(`unexpected vocabulary status: ${String(status)}`);
    if (poll < maxPolls) await sleep(pollDelayMs);
  }
  throw new Error(`vocabulary ${vocabularyId} did not become ready after ${maxPolls} checks`);
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (!argv[i]?.startsWith('--') || !argv[i + 1]) throw new Error(`invalid argument: ${argv[i] || ''}`);
    args[argv[i].slice(2)] = argv[i + 1];
  }
  for (const key of ['settings', 'vocabulary', 'state']) {
    if (!args[key]) throw new Error(`--${key} is required`);
  }
  return args;
}

async function readOptionalJson(filePath) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

export async function main() {
  const args = parseArgs(process.argv.slice(2));
  const [settings, vocabulary, state] = await Promise.all([
    readOptionalJson(args.settings), readOptionalJson(args.vocabulary), readOptionalJson(args.state),
  ]);
  const result = await createOrReuseVocabulary({
    apiKey: process.env.DASHSCOPE_API_KEY,
    workspaceId: settings?.alibabaFunAsrWorkspaceId,
    vocabulary,
    prefix: args.prefix || 'ia829',
    state,
  });
  await writeFile(args.state, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify({ status: result.status, vocabularyId: result.vocabularyId, count: result.count, targetModel: result.targetModel })}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
