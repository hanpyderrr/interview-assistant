import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function normalizeText(value) {
  return String(value || '').normalize('NFKC').toLocaleLowerCase('zh-CN').replace(/[\p{P}\p{S}\s]+/gu, '');
}

function levenshtein(left, right) {
  const a = [...left];
  const b = [...right];
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    previous = current;
  }
  return previous[b.length];
}

function similarity(left, right) {
  const a = normalizeText(left);
  const b = normalizeText(right);
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  return 1 - levenshtein(a, b) / Math.max([...a].length, [...b].length);
}

function containsTerm(text, term) {
  return String(text || '').normalize('NFKC').toLocaleLowerCase('zh-CN')
    .includes(String(term || '').normalize('NFKC').toLocaleLowerCase('zh-CN'));
}

function quantile(values, fraction) {
  const sorted = values.filter(Number.isFinite).slice().sort((a, b) => a - b);
  if (!sorted.length) return null;
  const position = (sorted.length - 1) * fraction;
  const low = Math.floor(position);
  const high = Math.ceil(position);
  return low === high ? sorted[low] : sorted[low] + (sorted[high] - sorted[low]) * (position - low);
}

function mean(values) {
  const usable = values.filter(Number.isFinite);
  return usable.length ? usable.reduce((sum, value) => sum + value, 0) / usable.length : null;
}

function rounded(value, digits = 4) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
}

export function buildReferenceDocument(baseline, vocabulary) {
  const terms = vocabulary.map(entry => entry.text);
  return {
    generatedAt: new Date().toISOString(),
    referencePolicy: 'Model-normalized reference copied from the 2026-08-28 successful Fun-ASR run; use for paired stability and target-term recall only, not CER/WER.',
    items: (baseline.rows || []).map(row => ({
      file: row.file,
      group: row.group,
      referenceText: row.asrStatus === 'ok' ? row.transcribedText : '',
      referenceType: row.asrStatus === 'ok' ? 'model_normalized_reference' : 'missing_reference',
      targetTerms: row.asrStatus === 'ok' ? terms.filter(term => containsTerm(row.transcribedText, term)) : [],
    })),
  };
}

export function compareConditions(reference, aDocument, bDocument) {
  const aFingerprint = aDocument.metadata?.configFingerprint;
  const bFingerprint = bDocument.metadata?.configFingerprint;
  if (!aFingerprint || !bFingerprint || aFingerprint === bFingerprint) {
    throw new Error('A/B config fingerprints must both exist and differ');
  }
  const aRows = new Map((aDocument.rows || []).map(row => [`${row.group}:${row.file}`, row]));
  const bRows = new Map((bDocument.rows || []).map(row => [`${row.group}:${row.file}`, row]));
  const rows = [];
  for (const item of reference.items || []) {
    if (!item.referenceText) continue;
    const key = `${item.group}:${item.file}`;
    const a = aRows.get(key);
    const b = bRows.get(key);
    const aSimilarity = a?.asrStatus === 'ok' ? similarity(item.referenceText, a.transcribedText) : 0;
    const bSimilarity = b?.asrStatus === 'ok' ? similarity(item.referenceText, b.transcribedText) : 0;
    const targetCount = item.targetTerms.length;
    const aTargetHits = item.targetTerms.filter(term => containsTerm(a?.transcribedText, term)).length;
    const bTargetHits = item.targetTerms.filter(term => containsTerm(b?.transcribedText, term)).length;
    rows.push({
      file: item.file, group: item.group, referenceType: item.referenceType, targetTerms: item.targetTerms,
      aStatus: a?.asrStatus || 'missing', bStatus: b?.asrStatus || 'missing',
      aText: a?.transcribedText || '', bText: b?.transcribedText || '',
      aSimilarity: rounded(aSimilarity), bSimilarity: rounded(bSimilarity), deltaSimilarity: rounded(bSimilarity - aSimilarity),
      targetCount, aTargetHits, bTargetHits,
      aFirstResultMs: a?.firstResultMs ?? null, bFirstResultMs: b?.firstResultMs ?? null,
      aFinalizeMs: a?.postAudioFinalizeMs ?? null, bFinalizeMs: b?.postAudioFinalizeMs ?? null,
    });
  }
  const targetTotal = rows.reduce((sum, row) => sum + row.targetCount, 0);
  const aTargetHits = rows.reduce((sum, row) => sum + row.aTargetHits, 0);
  const bTargetHits = rows.reduce((sum, row) => sum + row.bTargetHits, 0);
  const summary = {
    pairedCount: rows.length,
    aSuccess: rows.filter(row => row.aStatus === 'ok').length,
    bSuccess: rows.filter(row => row.bStatus === 'ok').length,
    aMeanSimilarity: rounded(mean(rows.map(row => row.aSimilarity))),
    bMeanSimilarity: rounded(mean(rows.map(row => row.bSimilarity))),
    targetTermTotal: targetTotal,
    aTargetRecall: targetTotal ? rounded(aTargetHits / targetTotal) : null,
    bTargetRecall: targetTotal ? rounded(bTargetHits / targetTotal) : null,
    improved: rows.filter(row => row.deltaSimilarity > 0.02).length,
    regressed: rows.filter(row => row.deltaSimilarity < -0.02).length,
    aFirstResultMedianMs: rounded(quantile(rows.map(row => row.aFirstResultMs), 0.5), 1),
    bFirstResultMedianMs: rounded(quantile(rows.map(row => row.bFirstResultMs), 0.5), 1),
    aFinalizeP95Ms: rounded(quantile(rows.map(row => row.aFinalizeMs), 0.95), 1),
    bFinalizeP95Ms: rounded(quantile(rows.map(row => row.bFinalizeMs), 0.95), 1),
  };
  const enoughPairs = rows.length >= 20;
  const targetImproved = summary.bTargetRecall !== null && summary.aTargetRecall !== null && summary.bTargetRecall > summary.aTargetRecall;
  const qualitySafe = summary.bMeanSimilarity >= summary.aMeanSimilarity - 0.005;
  const finalizeSafe = summary.bFinalizeP95Ms === null || summary.aFinalizeP95Ms === null || summary.bFinalizeP95Ms - summary.aFinalizeP95Ms <= 150;
  return { summary, adoptVocabulary: Boolean(enoughPairs && targetImproved && qualitySafe && finalizeSafe), rows };
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (!argv[i]?.startsWith('--') || !argv[i + 1]) throw new Error(`invalid argument: ${argv[i] || ''}`);
    args[argv[i].slice(2)] = argv[i + 1];
  }
  for (const key of ['baseline-source', 'vocabulary', 'reference']) if (!args[key]) throw new Error(`--${key} is required`);
  return args;
}

function report(result) {
  const s = result.summary;
  const lines = [
    '# Fun-ASR 热词 A/B 报告', '',
    '> 参考文本来自 2026-08-28 的 Fun-ASR 成功转写，只用于同音频配对稳定性与目标术语召回；不是人工逐字标注，因此不报告 CER/WER。', '',
    `- 配对样本：${s.pairedCount}`,
    `- A/B 成功：${s.aSuccess} / ${s.bSuccess}`,
    `- 平均参考相似度 A/B：${s.aMeanSimilarity ?? '—'} / ${s.bMeanSimilarity ?? '—'}`,
    `- 目标术语召回 A/B：${s.aTargetRecall ?? '—'} / ${s.bTargetRecall ?? '—'}（${s.targetTermTotal} 个目标）`,
    `- 改善 / 回退样本：${s.improved} / ${s.regressed}`,
    `- 首结果中位数 A/B：${s.aFirstResultMedianMs ?? '—'} / ${s.bFirstResultMedianMs ?? '—'} ms`,
    `- 收尾 P95 A/B：${s.aFinalizeP95Ms ?? '—'} / ${s.bFinalizeP95Ms ?? '—'} ms`,
    `- 采用 Vocabulary：${result.adoptVocabulary ? '是' : '否'}`, '',
    '| 文件 | 目标词 | A | B | A相似度 | B相似度 | Δ |',
    '|---|---|---|---|---:|---:|---:|',
  ];
  for (const row of result.rows) {
    const safe = value => String(value || '').replaceAll('|', '\\|').replace(/\s+/g, ' ').slice(0, 80);
    lines.push(`| ${row.file} | ${row.targetTerms.join('、')} | ${safe(row.aText)} | ${safe(row.bText)} | ${row.aSimilarity} | ${row.bSimilarity} | ${row.deltaSimilarity} |`);
  }
  return `${lines.join('\n')}\n`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const [baseline, vocabulary] = await Promise.all([
    readFile(args['baseline-source'], 'utf8').then(JSON.parse),
    readFile(args.vocabulary, 'utf8').then(JSON.parse),
  ]);
  const reference = buildReferenceDocument(baseline, vocabulary);
  await writeFile(args.reference, `${JSON.stringify(reference, null, 2)}\n`, 'utf8');
  if (args.a && args.b && args.output) {
    const [a, b] = await Promise.all([readFile(args.a, 'utf8').then(JSON.parse), readFile(args.b, 'utf8').then(JSON.parse)]);
    const result = compareConditions(reference, a, b);
    await writeFile(args.output, report(result), 'utf8');
    const jsonOutput = args['json-output'] || args.output.replace(/\.md$/i, '.json');
    await writeFile(jsonOutput, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
    process.stdout.write(`${JSON.stringify({ ...result.summary, adoptVocabulary: result.adoptVocabulary })}\n`);
  } else {
    process.stdout.write(`${JSON.stringify({ referenceItems: reference.items.length, usable: reference.items.filter(x => x.referenceText).length })}\n`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
}
