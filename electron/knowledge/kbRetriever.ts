// electron/knowledge/kbRetriever.ts
//
// Interview knowledge base retrieval for the interview console.
//
// Two layers:
//  * PURE functions (scoreEntries / buildKbContext / buildKbFileCandidates /
//    resolveKbFilePath) — no I/O, no electron imports, testable under plain
//    Node with strip-types.
//  * A stateful service (createKbRetriever) with dependency-injected file
//    reads and a file-fingerprint cache. ASAR-resolved files are cached for
//    the process lifetime (asar is read-only and its stat mtime is synthetic);
//    external files revalidate on mtime+size.
//
// Scoring mirrors scripts/interview-retriever.mjs (keyword 5 / title 3 /
// content 1 + fact_status bonus + explicit-project relevance, tie-break score
// desc then id asc) so CLI and runtime agree on ranking.

export interface KbEntry {
  id: string;
  title?: string;
  category?: string;
  fact_status?: string;
  review_status?: string;
  content: string;
  source_paths?: string[];
  keywords: string[];
  project_ids?: string[];
  target_roles?: string[];
  evidence_status?: 'verified' | 'in_progress' | 'planned' | 'draft' | 'reference';
  [key: string]: unknown;
}

export interface KbMatch {
  entry: KbEntry;
  score: number;
}

export interface KbRetrieverDeps {
  readFile: (filePath: string) => string;
  /** Returns {mtimeMs,size} or null when the file cannot be stat'd. */
  stat: (filePath: string) => { mtimeMs: number; size: number } | null;
  isAsarPath?: (filePath: string) => boolean;
}

export interface KbRetrieveResult {
  context: string;
  matches: KbMatch[];
}

/** Pinned by kbRetriever.test.mjs — the renderer relies on this exact fallback
 *  text when nothing matches (do not reword without updating that test). */
export const NO_MATCH_CONTEXT =
  'No matching resume facts were found. Do not invent personal metrics; mark missing details for the candidate to fill in.';

function terms(value: string): Set<string> {
  const lowered = String(value ?? '').toLowerCase();
  const latin = lowered.match(/[a-z0-9_+#.-]{2,}/g) ?? [];
  const chineseText = lowered.replace(/\s+/g, '');
  const chinese = [...chineseText.matchAll(/[一-鿿]{2,}/g)].flatMap((match) => {
    const text = match[0];
    return Array.from({ length: Math.max(0, text.length - 1) }, (_, index) => text.slice(index, index + 2));
  });
  return new Set([...latin, ...chinese]);
}

const PROJECT_PATTERNS: Record<string, RegExp> = {
  tof: /单光子|\btof\b|tofframe|tcspc|pf32|getnextframes|intel\s*n97/i,
  ice_temperature: /ice_temperature|冰体|109\s*(?:个|路|点)|stm32f767|\bf767\b|onenet|多点温度/i,
  wing_icing: /wing_icing|机翼结冰|ad5940|冰风洞|fl-?61|运-?12/i,
  plankiller: /plankiller|执行力管理|计划管理|习惯复盘/i,
  career_evidence_lab: /career_evidence_lab|career\s*evidence\s*lab|求证面试|证据驱动的求职/i,
  genealogy_agent: /genealogy_agent|族谱|世系|paddleocr/i,
};

function projectTags(value: unknown): Set<string> {
  const text = String(value ?? '');
  return new Set(Object.entries(PROJECT_PATTERNS)
    .filter(([, pattern]) => pattern.test(text))
    .map(([project]) => project));
}

function projectScore(question: string, entry: KbEntry): number {
  const queryProjects = projectTags(question);
  if (queryProjects.size === 0) return 0;
  const entryProjects = new Set([
    ...(entry.project_ids ?? []),
    ...projectTags([
    entry.title,
    entry.category,
    ...(entry.keywords ?? []),
    entry.content,
    ].join(' ')),
  ]);
  if ([...queryProjects].some((project) => entryProjects.has(project))) return 40;
  return entryProjects.size > 0 ? -20 : 0;
}

// ── pure scoring ────────────────────────────────────────────────────────────

export function scoreEntries(question: string, entries: KbEntry[], topK = 5): KbMatch[] {
  const queryTerms = terms(question);
  if (queryTerms.size === 0) return [];
  return entries
    .map((entry) => {
      const keywordTerms = terms((entry.keywords ?? []).join(' '));
      const titleTerms = terms(entry.title ?? '');
      const contentTerms = terms(entry.content ?? '');
      let score = 0;
      for (const term of queryTerms) {
        if (keywordTerms.has(term)) score += 5;
        else if (titleTerms.has(term)) score += 3;
        else if (contentTerms.has(term)) score += 1;
      }
      if (entry.fact_status === 'resume_fact') score += 0.25;
      else if (entry.fact_status === 'prepared_answer') score += 0.15;
      score += projectScore(question, entry);
      return { entry, score };
    })
    .filter((result) => result.score > 0)
    .sort((left, right) => right.score - left.score || left.entry.id.localeCompare(right.entry.id))
    .slice(0, Math.max(1, topK));
}

// ── pure context building ───────────────────────────────────────────────────

export function buildKbContext(matches: KbMatch[], maxChars = 6000): string {
  if (matches.length === 0) return NO_MATCH_CONTEXT;
  const sections = matches.map(({ entry, score }) => {
    const sources = (entry.source_paths ?? []).length
      ? entry.source_paths!.join('；')
      : '（未记录来源）';
    const claimWarning =
      entry.fact_status === 'prepared_answer'
        ? '\n（此内容为口述草稿，未经本人逐条确认；涉及个人指标、团队分工、故障根因时以简历事实为准。）'
        : '';
    const evidenceWarning = entry.evidence_status === 'planned'
      ? '\n（规划能力：当前只有设计或实施计划，不得表述为已实现、已上线或已验证。）'
      : entry.evidence_status === 'in_progress'
        ? '\n（开发在研：回答时必须说明当前完成阶段，不得把最终产品能力写成现有成果。）'
        : '';
    return [
      `[${entry.id}] ${entry.title ?? ''} (score=${score.toFixed(2)}, source=${entry.fact_status ?? 'unknown'})`,
      `${entry.content}${claimWarning}${evidenceWarning}`,
      `来源：${sources}`,
    ].join('\n');
  });
  const context = sections.join('\n\n');
  return context.length <= maxChars ? context : `${context.slice(0, Math.max(0, maxChars - 1))}…`;
}

// ── pure path resolution ────────────────────────────────────────────────────
//
// Candidates are knowledge_source ROOT directories (not files). Runtime puts
// the private userData root first and the development checkout second.
// Fail-closed: there is one unified KB and no fallback to legacy direction files.

export function buildKbFileCandidates(
  rootCandidates: string[],
): { filePaths: string[] } {
  const fileName = 'interview_kb.jsonl';
  return {
    filePaths: rootCandidates.map((root) => {
      const clean = root.replace(/[\\/]+$/, '');
      return `${clean}/${fileName}`;
    }),
  };
}

export function resolveKbFilePath(
  rootCandidates: string[],
  exists: (filePath: string) => boolean,
): { kbPath: string } | { error: string } {
  const { filePaths } = buildKbFileCandidates(rootCandidates);
  for (const filePath of filePaths) {
    if (exists(filePath)) return { kbPath: filePath };
  }
  return { error: 'Unified interview knowledge base is unavailable' };
}

// ── stateful retriever service ──────────────────────────────────────────────

export interface KbRetriever {
  retrieve: (question: string, kbPath: string, topK?: number) => KbRetrieveResult;
  invalidate: (kbPath?: string) => void;
}

function defaultIsAsar(filePath: string): boolean {
  return filePath.replace(/\\/g, '/').includes('/app.asar/');
}

export function createKbRetriever(deps: KbRetrieverDeps): KbRetriever {
  const isAsar = deps.isAsarPath ?? defaultIsAsar;
  const cache = new Map<string, { fingerprint: string; entries: KbEntry[] }>();

  const fingerprint = (kbPath: string): string | null => {
    if (isAsar(kbPath)) return `asar:${kbPath}`; // process-lifetime; asar is immutable
    const st = deps.stat(kbPath);
    return st ? `${st.mtimeMs}:${st.size}` : null;
  };

  const load = (kbPath: string): KbEntry[] => {
    const content = deps.readFile(kbPath);
    const entries = content
      .split(/\r?\n/)
      .map((line, index) => ({ line, lineNumber: index + 1 }))
      .filter(({ line }) => line.trim())
      .map(({ line, lineNumber }) => {
        let entry: KbEntry;
        try {
          entry = JSON.parse(line);
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          throw new Error(`Invalid knowledge JSON on line ${lineNumber}: ${message}`, { cause: error });
        }
        if (!entry.id || !entry.content || !Array.isArray(entry.keywords)) {
          throw new Error(`Knowledge entry on line ${lineNumber} is missing id, content, or keywords`);
        }
        return entry;
      });
    const ids = new Set(entries.map((entry) => entry.id));
    if (ids.size !== entries.length) throw new Error('Knowledge base contains duplicate IDs');
    return entries;
  };

  const getEntries = (kbPath: string): KbEntry[] => {
    const fp = fingerprint(kbPath);
    if (fp === null) return load(kbPath); // cannot stat: read every time, never cache
    const cached = cache.get(kbPath);
    if (cached && cached.fingerprint === fp) return cached.entries;
    const entries = load(kbPath);
    cache.set(kbPath, { fingerprint: fp, entries });
    return entries;
  };

  return {
    retrieve(question, kbPath, topK = 5) {
      const matches = scoreEntries(question, getEntries(kbPath), topK);
      return { context: buildKbContext(matches), matches };
    },
    invalidate(kbPath) {
      if (kbPath) cache.delete(kbPath);
      else cache.clear();
    },
  };
}
