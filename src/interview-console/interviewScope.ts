/**
 * Interview retrieval scope: who the candidate is talking to (company / role)
 * and which project the current question is about.
 *
 * Everything here is deterministic and dependency-free apart from the rule-based
 * question classifier. It never calls an LLM and never auto-saves user input.
 */
import { classifyInterviewQuestion, isSelfIntroductionQuestion } from './questionIntent.ts';

export type InterviewRole = '' | 'ai_agent' | 'embedded_linux';

export interface InterviewProject {
  id: string;
  label: string;
  /** Empty means the project is relevant to either interview direction. */
  role: InterviewRole;
}

export interface InterviewProfile {
  company: string;
  position: string;
  role: InterviewRole;
  defaultProjectId: string;
}

export interface InterviewRetrievalScope {
  role?: InterviewRole;
  projectIds?: string[];
}

export const INTERVIEW_PROFILE_EVENT = 'natively-interview-profile-changed';
export const INTERVIEW_PROFILE_STORAGE_KEY = 'natively.interviewConsole.profile.v1';
export const INTERVIEW_PROFILE_TEXT_MAX_LENGTH = 200;

export const INTERVIEW_PROJECTS: InterviewProject[] = [
  { id: 'tof', label: '单光子 TOF', role: 'embedded_linux' },
  { id: 'ice_temperature', label: '冰体温度采集', role: 'embedded_linux' },
  { id: 'wing_icing', label: '机翼结冰', role: 'embedded_linux' },
  { id: 'plankiller', label: 'PlanKiller', role: 'ai_agent' },
  { id: 'career_evidence_lab', label: '面试验证台', role: 'ai_agent' },
  { id: 'genealogy_agent', label: '族谱 Agent', role: 'ai_agent' },
  { id: 'interview_assistant', label: '面试助手本地语音', role: '' },
];

const ROLES: InterviewRole[] = ['', 'ai_agent', 'embedded_linux'];
const PROJECT_BY_ID = new Map(INTERVIEW_PROJECTS.map((project) => [project.id, project]));

export const EMPTY_INTERVIEW_PROFILE: InterviewProfile = {
  company: '',
  position: '',
  role: '',
  defaultProjectId: '',
};

const ROLE_LABELS: Record<Exclude<InterviewRole, ''>, string> = {
  ai_agent: 'AI / Agent',
  embedded_linux: '嵌入式 / Linux',
};

/**
 * Explicit aliases only. Generic wording such as "Agent", "温度" or "SPI" must
 * never select a project: a project is named, not implied.
 */
const PROJECT_ALIASES: Record<string, RegExp> = {
  tof: /(?<![a-z0-9])(?:tof(?:frame)?|fog[ _-]?lidar(?:[ _-]?sim)?)(?![a-z0-9])|单光子|透雾仿真/i,
  ice_temperature: /(?<![a-z0-9])ice[ _-]?temperature(?![a-z0-9])|冰体(?:多点)?温度/i,
  wing_icing: /(?<![a-z0-9])wing[ _-]?icing(?![a-z0-9])|机翼结冰/i,
  plankiller: /(?<![a-z0-9])plan[ _-]?killer(?![a-z0-9])/i,
  career_evidence_lab: /(?<![a-z0-9])career[ _-]?evidence[ _-]?lab(?![a-z0-9])|面试验证台/i,
  genealogy_agent: /(?<![a-z0-9])genealogy[ _-]?agent(?![a-z0-9])|族谱/i,
  interview_assistant: /(?<![a-z0-9])interview[ _-]?assistant(?![a-z0-9])|面试助手/i,
};

function clampText(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, INTERVIEW_PROFILE_TEXT_MAX_LENGTH);
}

function isRole(value: unknown): value is InterviewRole {
  return typeof value === 'string' && (ROLES as string[]).includes(value);
}

function isProjectId(value: unknown): value is string {
  return typeof value === 'string' && PROJECT_BY_ID.has(value);
}

export function normalizeInterviewProfile(input: unknown): InterviewProfile {
  if (!input || typeof input !== 'object') return { ...EMPTY_INTERVIEW_PROFILE };
  const source = input as Record<string, unknown>;
  const role: InterviewRole = isRole(source.role) ? source.role : '';
  const requestedProject = typeof source.defaultProjectId === 'string' ? source.defaultProjectId : '';
  // A default project must exist and belong to the chosen role; an empty role
  // means "unconstrained" and accepts every project.
  const defaultProjectId = isProjectId(requestedProject)
    && (!role || !PROJECT_BY_ID.get(requestedProject)!.role || PROJECT_BY_ID.get(requestedProject)!.role === role)
    ? requestedProject
    : '';
  return {
    company: clampText(source.company),
    position: clampText(source.position),
    role,
    defaultProjectId,
  };
}

function resolveStorage<T extends 'getItem' | 'setItem'>(
  storage: Partial<Pick<Storage, T>> | undefined,
): Partial<Pick<Storage, T>> | undefined {
  if (storage) return storage;
  if (typeof localStorage !== 'undefined') return localStorage;
  return undefined;
}

export function loadInterviewProfile(
  storage?: Pick<Storage, 'getItem'>,
): InterviewProfile {
  try {
    const target = resolveStorage<'getItem'>(storage);
    const raw = target?.getItem?.(INTERVIEW_PROFILE_STORAGE_KEY) ?? null;
    if (!raw) return { ...EMPTY_INTERVIEW_PROFILE };
    return normalizeInterviewProfile(JSON.parse(raw));
  } catch {
    return { ...EMPTY_INTERVIEW_PROFILE };
  }
}

/**
 * Persist a profile and notify the renderer. Missing/broken storage rejects the
 * write; the caller decides how to surface it. Reading never throws.
 */
export function saveInterviewProfile(
  value: InterviewProfile,
  storage?: Pick<Storage, 'setItem'>,
): InterviewProfile {
  const normalized = normalizeInterviewProfile(value);
  const target = resolveStorage<'setItem'>(storage);
  if (!target?.setItem) throw new Error('本地设置暂不可用');
  target.setItem(INTERVIEW_PROFILE_STORAGE_KEY, JSON.stringify(normalized));
  dispatchInterviewProfileEvent(normalized);
  return normalized;
}

function dispatchInterviewProfileEvent(profile: InterviewProfile): void {
  try {
    if (typeof window === 'undefined' || typeof CustomEvent === 'undefined') return;
    if (typeof window.dispatchEvent !== 'function') return;
    window.dispatchEvent(new CustomEvent(INTERVIEW_PROFILE_EVENT, { detail: profile }));
  } catch {
    // Notification is best-effort; the persisted profile is the source of truth.
  }
}

/** Canonical, de-duplicated project ids in `INTERVIEW_PROJECTS` order. */
export function detectInterviewProjects(text: string): string[] {
  if (typeof text !== 'string' || !text.trim()) return [];
  return INTERVIEW_PROJECTS
    .filter((project) => PROJECT_ALIASES[project.id].test(text))
    .map((project) => project.id);
}

function sanitizeProjectIds(ids: unknown): string[] {
  if (!Array.isArray(ids)) return [];
  const seen = new Set<string>();
  for (const id of ids) {
    if (isProjectId(id)) seen.add(id);
  }
  return INTERVIEW_PROJECTS.filter((project) => seen.has(project.id)).map((project) => project.id);
}

/**
 * Resolve the retrieval scope for one question.
 *
 * Precedence: an explicitly named project wins (even across roles), then the
 * carried/current project for project and follow-up questions, then the role.
 * Plain technical questions keep the role but never bind the default project.
 */
export function resolveInterviewScope(
  question: string,
  profile: InterviewProfile,
  currentProjectIds: string[] = [],
): InterviewRetrievalScope {
  const safeProfile = normalizeInterviewProfile(profile);
  const route = classifyInterviewQuestion(question);
  if (isSelfIntroductionQuestion(question)) return safeProfile.role ? { role: safeProfile.role } : {}
  if (route.intent === 'personal' || route.intent === 'behavioral') {
    return {};
  }
  const named = detectInterviewProjects(question);
  if (named.length) return { projectIds: named };
  if (route.intent === 'unknown') return {};

  if (route.intent === 'project' || route.intent === 'follow_up') {
    const carried = sanitizeProjectIds(currentProjectIds);
    const fallback = carried.length
      ? carried
      : (safeProfile.defaultProjectId ? [safeProfile.defaultProjectId] : []);
    if (fallback.length) return { projectIds: fallback };
  }

  if (safeProfile.role) return { role: safeProfile.role };
  return {};
}

export function interviewScopeLabel(scope: InterviewRetrievalScope): string {
  const projects = sanitizeProjectIds(scope?.projectIds);
  const role = isRole(scope?.role) && scope.role ? scope.role : '';
  const projectLabel = projects
    .map((id) => PROJECT_BY_ID.get(id)!.label)
    .join('、');
  if (projectLabel && role) return `${projectLabel} · ${ROLE_LABELS[role]}`;
  if (projectLabel) return projectLabel;
  if (role) return ROLE_LABELS[role];
  return '未限定';
}

const ROLE_KEYWORDS: Array<[RegExp, Exclude<InterviewRole, ''>]> = [
  [/嵌入式|单片机|固件|驱动|内核|linux|rtos|freeRTOS|STM32|C\+\+/i, 'embedded_linux'],
  [/(?<![a-z0-9])AI(?![a-z0-9])|人工智能|大模型|(?<![a-z0-9])LLM(?![a-z0-9])|(?<![a-z0-9])RAG(?![a-z0-9])|(?<![a-z0-9])Agent(?![a-z0-9])|机器学习|深度学习/i, 'ai_agent'],
];

function detectRole(text: string): InterviewRole {
  for (const [pattern, role] of ROLE_KEYWORDS) {
    if (pattern.test(text)) return role;
  }
  return '';
}

function extractField(text: string, labels: string[]): string {
  const pattern = new RegExp(
    `(?:^|[\\n\\r。；;])\\s*(?:${labels.join('|')})\\s*[:：]\\s*([^\\n\\r。；;]+)`,
  );
  const match = pattern.exec(text);
  return match ? match[1].trim() : '';
}

/**
 * Deterministic suggestion parser for the settings textarea. It only reads
 * explicit `公司：` / `岗位：` / `方向：` / `主讲项目：` style fields and never
 * invents a value or saves anything itself.
 */
export function suggestInterviewProfile(text: string): InterviewProfile {
  const source = typeof text === 'string' ? text : '';
  const company = extractField(source, ['本场面试公司', '公司名称', '公司', '企业']);
  const position = extractField(source, ['应聘岗位', '岗位', '职位']);
  const direction = extractField(source, ['岗位方向', '技术方向', '方向']);
  const defaultProjectField = extractField(source, ['默认主讲项目', '主讲项目', '项目']);

  const role = direction ? detectRole(direction) : detectRole(position || source);
  const projects = detectInterviewProjects(defaultProjectField);

  return normalizeInterviewProfile({
    company,
    position,
    role,
    defaultProjectId: projects[0] ?? '',
  });
}
