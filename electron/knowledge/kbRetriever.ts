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
  // Preserve the complete identifier and also index compound protocol names.
  // CRC variants share the generic checksum name; hardware model numbers stay exact.
  const latin = (lowered.match(/[a-z0-9_+#.-]{2,}/g) ?? []).flatMap(term => [
    term,
    ...term.split(/[_ .-]+/).filter(part => part.length > 1),
    ...(/^crc(?:16|32|64)(?:-|$)/.test(term) ? ['crc'] : []),
  ]);
  const chineseText = lowered.replace(/\s+/g, '');
  const chinese = [...chineseText.matchAll(/[一-鿿]{2,}/g)].flatMap((match) => {
    const text = match[0];
    return Array.from({ length: Math.max(0, text.length - 1) }, (_, index) => text.slice(index, index + 2));
  });
  // These conversational question fragments create false matches across almost
  // every Chinese interview question (for example, an interests question used
  // to match technical entries containing "有什么区别"). They carry no
  // retrieval meaning on their own.
  const chineseQuestionStopTerms = new Set(['有什', '什么', '怎么', '么办', '发生']);
  return new Set([...latin, ...chinese.filter((term) => !chineseQuestionStopTerms.has(term))]);
}

const PROJECT_PATTERNS: Record<string, RegExp> = {
  tof: /单光子|\btof\b|tofframe|tcspc|pf32|getnextframes|intel\s*n97/i,
  ice_temperature: /ice_temperature|冰体|109\s*(?:个|路|点)|stm32f767|\bf767\b|onenet|多点温度/i,
  wing_icing: /wing_icing|机翼结冰|ad5940|冰风洞|fl-?61|运-?12/i,
  plankiller: /plankiller|执行力管理|计划管理|习惯复盘/i,
  career_evidence_lab: /career_evidence_lab|career\s*evidence\s*lab|求证面试|面试验证台|证据驱动的求职/i,
  genealogy_agent: /genealogy_agent|族谱|世系|paddleocr/i,
  interview_assistant: /interview[ _-]?assistant|面试助手|funasr|paraformer/i,
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
  const declaredProjects = new Set(entry.project_ids ?? []);
  const entryProjects = new Set([
    ...declaredProjects,
    ...projectTags([
    entry.title,
    entry.category,
    ...(entry.keywords ?? []),
    entry.content,
    ].join(' ')),
  ]);
  if ([...queryProjects].some((project) => entryProjects.has(project))) {
    // A portfolio summary may mention every project. It is useful supporting
    // context, but must not outrank evidence dedicated to the named project.
    return declaredProjects.size > 1 ? 10 : 100;
  }
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
      // Provenance is only a tie-breaker. It must never manufacture a match for
      // an otherwise unrelated résumé entry.
      if (score <= 0) return { entry, score: 0 };
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

export interface KbScope { role?: '' | 'ai_agent' | 'embedded_linux'; projectIds?: string[] }

export function validateKbScope(input: unknown): KbScope {
  if (input == null) return {};
  if (typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid interview scope');
  const scope = input as KbScope;
  if (scope.role !== undefined && !['', 'ai_agent', 'embedded_linux'].includes(scope.role)) throw new Error('Invalid interview scope role');
  const projects = ['tof', 'ice_temperature', 'wing_icing', 'plankiller', 'career_evidence_lab', 'genealogy_agent', 'interview_assistant'];
  if (scope.projectIds !== undefined && (!Array.isArray(scope.projectIds) || scope.projectIds.some(id => !projects.includes(id)))) throw new Error('Invalid interview scope projects');
  return { role: scope.role, projectIds: scope.projectIds ? [...new Set(scope.projectIds)] : undefined };
}

export interface KbRetriever {
  retrieve: (question: string, kbPath: string, topK?: number, scope?: KbScope) => KbRetrieveResult;
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
    retrieve(question, kbPath, topK = 5, inputScope) {
      const scope = validateKbScope(inputScope);
      const eligible = getEntries(kbPath).filter(entry => {
        if (scope.projectIds?.length) {
          // A portfolio row can contain foreign facts even if one tag matches.
          return !!entry.project_ids?.length && entry.project_ids.every(id => scope.projectIds!.includes(id));
        }
        return true; // Role is a ranking preference; other projects remain available.
      });
      const rankProjectSubjects = (query: string, hits: KbMatch[]): KbMatch[] => {
        if (!scope.projectIds?.length) return hits;
        // Explicit versions and API/protocol names carry more meaning than
        // recurring project-summary wording; do not strip hardware suffixes.
        const latinTerms = [...terms(query)].filter(term => /^[a-z]/.test(term) && !scope.projectIds!.includes(term));
        const subjects = latinTerms.filter(term => !latinTerms.some(other => other !== term
          && other.startsWith(term) && /^\d+$/.test(other.slice(term.length))));
        const coverage = new Map(hits.map(({ entry }) => {
          const entryTerms = terms([entry.title, entry.content, ...(entry.keywords ?? [])].join(' '));
          return [entry, subjects.filter(subject => entryTerms.has(subject)).length];
        }));
        return hits.sort((a, b) => coverage.get(b.entry)! - coverage.get(a.entry)! || b.score - a.score || a.entry.id.localeCompare(b.entry.id));
      };
      const ranked = rankProjectSubjects(question, scoreEntries(question, eligible, eligible.length));
      if (scope.role && !scope.projectIds?.length) {
        for (const match of ranked) {
          if (match.entry.target_roles?.includes(scope.role)) match.score *= 1.3;
        }
        const introduction = /自我介绍|介绍(?:一下)?(?:你自己|您自己|自己)|introduce yourself|tell me about yourself/i.test(question);
        // Acronyms are explicit subjects; generic "difficulty" overlaps must not win.
        const subjects: string[] = question.match(/\b[A-Z][A-Z0-9]{1,}\b/g) ?? [];
        const topicHits = (entry: KbEntry) => {
          const entryTerms = terms([entry.title, entry.content, ...(entry.keywords ?? [])].join(' '));
          return subjects.filter(subject => entryTerms.has(subject.toLowerCase())).length;
        };
        const subjectScores = new Map(ranked.map(({ entry }) => [entry, subjects.length ? topicHits(entry) : 0]));
        ranked.sort((a, b) => {
          const subjectDifference = subjectScores.get(b.entry)! - subjectScores.get(a.entry)!;
          const roleDifference = introduction
            ? Number(b.entry.target_roles?.includes(scope.role!)) - Number(a.entry.target_roles?.includes(scope.role!)) : 0;
          return subjectDifference || roleDifference || b.score - a.score || a.entry.id.localeCompare(b.entry.id);
        });
      }
      // Multi-part project questions need evidence for each ask. Repeated cards
      // with identical bodies must not consume the entire small context budget.
      const clauses = scope.projectIds?.length
        ? question.split(/[？?。；;]|[，,](?=如何|怎么|是否|有没有|有哪些|当前[^，。？?]{0,12}有没有)/).map(clause => clause.trim()).filter(clause => clause.length >= 8 && !/^(?:请按|没有实测|不要|请勿)/.test(clause))
        : [];
      const perClause = clauses.length > 1
        ? clauses.map(clause => rankProjectSubjects(clause, scoreEntries(clause, eligible, eligible.length)).slice(0, 2)) : [];
      const seeds = [0, 1].flatMap(index => perClause.flatMap(hits => hits[index] ? [hits[index]] : []));
      const seen = new Set<string>();
      const matches = [...seeds, ...ranked].filter(({ entry }) => {
        // Distinct provenance/status can change how the same wording is used.
        const key = JSON.stringify([entry.content.replace(/\s+/g, ''), entry.fact_status, entry.evidence_status, entry.project_ids]);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }).slice(0, Math.max(1, topK));
      return { context: buildKbContext(matches), matches };
    },
    invalidate(kbPath) {
      if (kbPath) cache.delete(kbPath);
      else cache.clear();
    },
  };
}
