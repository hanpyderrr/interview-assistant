import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export async function buildAiGapFragment({ candidatesPath, outputPath, sourceFile }) {
  if (!sourceFile) throw new Error('sourceFile is required');
  const payload = JSON.parse(await readFile(candidatesPath, 'utf8'));
  const items = payload.items;
  if (!Array.isArray(items)) throw new Error('items must be an array');

  const seen = new Set();
  const records = items.map((item) => {
    const id = String(item.formal_id || '').trim();
    if (!id) throw new Error('missing id');
    if (seen.has(id)) throw new Error(`duplicate id: ${id}`);
    seen.add(id);
    if (!item.title || !item.oral_answer || !Array.isArray(item.keywords)) {
      throw new Error(`${id}: title, oral_answer and keywords are required`);
    }
    return {
      id,
      direction: 'ai',
      category: item.category || 'AI Agent补充题',
      title: item.title,
      fact_status: 'prepared_answer',
      review_status: 'cc_pending',
      content: item.oral_answer,
      source: { file: sourceFile, ref: item.candidate_id || id },
      keywords: item.keywords,
      target_roles: ['ai_agent'],
      evidence_status: 'draft',
    };
  });

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(records, null, 2)}\n`, 'utf8');
  return { count: records.length, outputPath };
}

async function main() {
  const [candidatesPath, outputPath, sourceFile] = process.argv.slice(2);
  if (!candidatesPath || !outputPath || !sourceFile) {
    throw new Error('usage: node build-ai-gap-fragment.mjs <answers.json> <fragment.json> <source-file>');
  }
  const result = await buildAiGapFragment({ candidatesPath, outputPath, sourceFile });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
