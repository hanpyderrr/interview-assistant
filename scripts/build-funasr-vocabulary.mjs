import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const PROJECT_TERMS = [
  'PlanKiller', 'TofFrame', 'Career Evidence Lab', 'RK3568', 'Intel N97',
  'STM32F767', 'PF32', 'AD5940', 'MAX31865', 'ESP8266',
];

export const CURATED_TERMS = [
  'C语言', 'C++', 'volatile', 'static', 'const', 'define', 'malloc', 'free',
  '内存泄漏', '野指针', '悬空指针', '字节对齐', '大端', '小端', '位域',
  '回调函数', '函数指针', '中断', '中断服务程序', 'ISR', 'DMA', 'Cache',
  '内存屏障', '原子操作', '互斥锁', '信号量', '自旋锁', '死锁', '优先级反转',
  'FreeRTOS', '任务调度', '看门狗', 'IWDG', 'HardFault', 'Bootloader', '链接脚本',
  '设备树', 'Device Tree', '驱动模型', '字符设备', 'ioctl', 'mmap', 'epoll',
  '多进程', '多线程', '共享内存', '消息队列', '零拷贝', '环形缓冲区',
  'SPI', 'I2C', 'UART', 'RS485', 'CAN', 'TCP', 'UDP', 'MQTT', 'MIPI',
  'CPOL', 'CPHA', 'MOSI', 'MISO', 'SCK', 'spidev', 'SPI_IOC_MESSAGE',
  'CRC', 'CRC16', 'CRC16-Modbus', 'CRC32', '校验和', '半包', '粘包', '重同步',
  'RKNN', 'ONNX', '量化', '交叉编译', 'CMake', 'systemd', 'BusyBox', 'Qt',
  'Agent', 'Agent Loop', 'ReAct', 'Planner', 'Executor', 'Reflection', 'Replanning',
  'Workflow', 'Checkpoint', 'Task Replay', 'Tool Calling', 'Function Calling',
  'Tool Registry', 'JSON Schema', 'MCP', 'Model Context Protocol', 'Skills',
  'Skill Routing', 'Sandbox', 'allowlist', 'dry-run', '幂等性', '补偿事务',
  '状态机', '事件溯源', 'Cancellation Token', 'Fencing Token', 'Deadline',
  'Multi-Agent', 'A2A', 'Agent-to-Agent', 'Orchestrator', '任务租约', '舱壁隔离',
  '上下文工程', 'Context Engineering', 'Working Memory', 'Episodic Memory',
  'Semantic Memory', '长期记忆', '短期记忆', '上下文压缩', 'Context Pollution',
  'RAG', 'Embedding', 'Chunking', 'Parent-Child Chunk', 'BM25', 'ANN', 'HNSW',
  'IVF', 'Reranking', 'Recall@K', 'MRR', 'Hybrid Search', '向量检索', '混合检索',
  'Prompt', 'Prompt Injection', 'Structured Output', 'LLM-as-Judge', 'Badcase',
  'Trace', 'Trace回放', 'Trajectory Evaluation', 'Prefix Caching', 'KV Cache',
  '首Token延迟', 'TTFT', 'SLI', 'SLO', 'FastAPI', 'ASGI', 'SQLite', 'PostgreSQL',
  'Redis', 'Tauri', 'WebSocket', 'SSE', 'OpenAI-compatible', 'LoRA', 'RLHF',
  'Transformer', 'Tokenizer', 'Attention', 'LayerNorm', 'vLLM', 'Ollama',
];

function normalizeKey(value) {
  return value.trim().toLocaleLowerCase('en-US');
}

function isValidText(text) {
  if (!text || text.length > 64) return false;
  if (/[^\x00-\x7f]/.test(text)) return [...text].length <= 15;
  return text.trim().split(/\s+/).length <= 7;
}

function languageFor(text) {
  return /[\u3400-\u9fff]/u.test(text) ? 'zh' : 'en';
}

export function buildVocabularyEntries({
  sourceText,
  historicalText = '',
  projectTerms = PROJECT_TERMS,
  curatedTerms = CURATED_TERMS,
}) {
  const source = sourceText.toLocaleLowerCase('en-US');
  const historical = historicalText.toLocaleLowerCase('en-US');
  const selected = new Map();

  const add = (raw, weight, rank) => {
    const text = String(raw || '').trim();
    const key = normalizeKey(text);
    if (!isValidText(text) || !source.includes(key)) return;
    const previous = selected.get(key);
    if (!previous || weight > previous.weight || rank < previous.rank) {
      selected.set(key, { text, lang: languageFor(text), weight, rank });
    }
  };

  for (const term of curatedTerms) add(term, 3, 3);
  for (const term of curatedTerms) {
    if (historical.includes(normalizeKey(term))) add(term, 4, 2);
  }
  for (const term of projectTerms) add(term, 4, 1);

  return [...selected.values()]
    .sort((a, b) => a.rank - b.rank || b.weight - a.weight || a.text.localeCompare(b.text, 'en'))
    .map(({ rank: _rank, ...entry }) => entry);
}

export function extractHistoricalTranscriptText(benchmarkText) {
  const payload = JSON.parse(benchmarkText);
  const rows = Array.isArray(payload) ? payload : payload.rows;
  if (!Array.isArray(rows)) throw new Error('benchmark rows must be an array');
  return rows.map((row) => row.transcribedText || row.transcription || '').join('\n');
}

function parseArgs(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i]?.replace(/^--/, '');
    if (!key || !argv[i + 1]) throw new Error(`invalid argument: ${argv[i] || ''}`);
    result[key] = argv[i + 1];
  }
  for (const key of ['kb', 'candidates', 'benchmark', 'out-dir']) {
    if (!result[key]) throw new Error(`--${key} is required`);
  }
  return result;
}

export async function buildVocabularyFiles({ kbPath, candidatesPath, benchmarkPath, outDir }) {
  const [kbText, candidatesText, benchmarkText] = await Promise.all([
    readFile(kbPath, 'utf8'),
    readFile(candidatesPath, 'utf8'),
    readFile(benchmarkPath, 'utf8'),
  ]);
  const sourceText = `${kbText}\n${candidatesText}`;
  const entries = buildVocabularyEntries({
    sourceText,
    historicalText: extractHistoricalTranscriptText(benchmarkText),
  });
  if (entries.length === 0 || entries.length > 500) throw new Error(`invalid vocabulary count: ${entries.length}`);

  await mkdir(outDir, { recursive: true });
  const jsonPath = path.join(outDir, 'funasr-vocabulary.json');
  const tsvPath = path.join(outDir, 'funasr-vocabulary.tsv');
  const reviewPath = path.join(outDir, 'funasr-vocabulary-review.md');
  const weightCounts = Object.fromEntries([3, 4, 5].map((weight) => [weight, entries.filter((x) => x.weight === weight).length]));
  const langCounts = Object.fromEntries(['zh', 'en'].map((lang) => [lang, entries.filter((x) => x.lang === lang).length]));

  await writeFile(jsonPath, `${JSON.stringify(entries, null, 2)}\n`, 'utf8');
  await writeFile(tsvPath, `text\tlang\tweight\n${entries.map((x) => `${x.text}\t${x.lang}\t${x.weight}`).join('\n')}\n`, 'utf8');
  const review = `# Fun-ASR 预编译热词审查\n\n` +
    `- 词条数：${entries.length}（Fun-ASR 主版本上限 2000，本表保守低于 500）\n` +
    `- 权重：3=${weightCounts[3]}，4=${weightCounts[4]}，5=${weightCounts[5]}\n` +
    `- 语言：zh=${langCounts.zh}，en=${langCounts.en}\n` +
    `- 来源：正式 440 条运行库、新增 AI Agent 候选、上一轮 53 音频转写。\n` +
    `- 策略：普通技术术语权重 3；历史音频中出现过或项目专名权重 4；不使用 Fun-ASR 不支持的 50。\n\n` +
    `## 偏置检查\n\n` +
    `- 未收录普通口语、完整问句、答案句子或个人敏感信息。\n` +
    `- 大小写不敏感去重；含非 ASCII 的词不超过 15 字符，纯 ASCII 不超过 7 个片段。\n` +
    `- 最终是否采用只由同音频、同配置的无热词/有热词 A/B 决定。\n`;
  await writeFile(reviewPath, review, 'utf8');
  return { count: entries.length, jsonPath, tsvPath, reviewPath, weightCounts, langCounts };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = await buildVocabularyFiles({
    kbPath: args.kb,
    candidatesPath: args.candidates,
    benchmarkPath: args.benchmark,
    outDir: args['out-dir'],
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
