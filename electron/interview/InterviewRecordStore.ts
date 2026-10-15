import type Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import type { InterviewRecord, RecordCandidateTurn, RecordProfile, RecordReview, RecordRound, RecordSessionInput, RecordSessionSummary } from '../../shared/interviewRecords';

function text(value: unknown, max: number): string {
  if (typeof value !== 'string' || value.length > max) throw new Error('记录文本格式或长度无效');
  return value;
}
function number(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new Error('记录时间或编号无效');
  return value;
}
function choice<T extends string>(value: unknown, choices: readonly T[]): T {
  if (!choices.includes(value as T)) throw new Error('记录状态无效');
  return value as T;
}
function profile(p: RecordProfile): RecordProfile {
  return { company: text(p?.company, 200), position: text(p?.position, 200), role: text(p?.role, 80), defaultProjectId: text(p?.defaultProjectId, 120) };
}
function cleanRound(r: RecordRound): RecordRound {
  if (!r || !Number.isSafeInteger(r.id) || r.id < 1 || !Number.isSafeInteger(r.revision) || r.revision < 1) throw new Error('题目编号无效');
  if (typeof r.englishMode !== 'boolean' || !Array.isArray(r.hits) || r.hits.length > 20) throw new Error('题目元数据无效');
  if (r.scope?.projectIds && (!Array.isArray(r.scope.projectIds) || r.scope.projectIds.length > 20)) throw new Error('项目范围无效');
  const clean: RecordRound = {
    id: r.id, revision: r.revision, question: text(r.question, 16000), originalQuestion: text(r.originalQuestion, 16000),
    answer: text(r.answer, 150000), status: choice(r.status, ['queued', 'generating', 'answered', 'error', 'interrupted']),
    answerSource: choice(r.answerSource, ['model', 'reference', 'guidance', 'unavailable']),
    answerLevel: text(r.answerLevel, 40), englishMode: r.englishMode, model: text(r.model, 200), profile: profile(r.profile),
    scope: { ...(r.scope?.role ? { role: text(r.scope.role, 80) } : {}), ...(r.scope?.projectIds ? { projectIds: r.scope.projectIds.map(p => text(p, 120)) } : {}) },
    askedAt: number(r.askedAt), updatedAt: number(r.updatedAt),
    hits: r.hits.map(h => ({ id: text(h.id, 200), title: text(h.title, 1000), ...(h.source ? { source: text(h.source, 80) } : {}) })),
  };
  if (!clean.question.trim()) throw new Error('问题不能为空');
  if (r.error !== undefined) clean.error = text(r.error, 8000);
  if (r.firstAnswerAt !== undefined) clean.firstAnswerAt = number(r.firstAnswerAt);
  if (r.finishedAt !== undefined) clean.finishedAt = number(r.finishedAt);
  return clean;
}

/** Dedicated structured records share the app DB; they never enter meeting RAG or memory. */
export class InterviewRecordStore {
  private db: Database.Database;
  constructor(db: Database.Database) {
    this.db = db;
    this.initialize();
    this.recover();
  }

  initialize(): void {
    // Additive, idempotent migration: no changes to existing meetings/transcripts.
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS interview_record_sessions (
        id TEXT PRIMARY KEY, data_json TEXT NOT NULL, started_at INTEGER NOT NULL,
        ended_at INTEGER, status TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS interview_record_sessions_date ON interview_record_sessions(started_at DESC);
      CREATE TABLE IF NOT EXISTS interview_record_rounds (
        session_id TEXT NOT NULL REFERENCES interview_record_sessions(id) ON DELETE CASCADE,
        id INTEGER NOT NULL, revision INTEGER NOT NULL, data_json TEXT NOT NULL,
        rating TEXT NOT NULL DEFAULT 'unreviewed', note TEXT NOT NULL DEFAULT '',
        PRIMARY KEY(session_id,id)
      );
      CREATE TABLE IF NOT EXISTS interview_record_candidate_turns (
        session_id TEXT NOT NULL REFERENCES interview_record_sessions(id) ON DELETE CASCADE,
        id TEXT NOT NULL, at INTEGER NOT NULL, data_json TEXT NOT NULL,
        PRIMARY KEY(session_id,id)
      );
    `);
  }

  private recover(): void {
    const active = this.db.prepare("SELECT id FROM interview_record_sessions WHERE status='active'").all() as { id: string }[];
    for (const { id } of active) this.end(id, 'interrupted');
  }

  begin(input: RecordSessionInput): string {
    const clean: RecordSessionInput = {
      title: text(input?.title, 500), profile: profile(input?.profile),
      source: choice(input?.source, ['system', 'microphone', 'manual']), captureCandidate: input?.source !== 'manual' && input?.captureCandidate === true,
    };
    // Renderer reload/new session must not leave the previous session looking live.
    this.recover();
    const id = randomUUID();
    this.db.prepare('INSERT INTO interview_record_sessions (id,data_json,started_at,status) VALUES (?,?,?,?)')
      .run(id, JSON.stringify(clean), Date.now(), 'active');
    return id;
  }

  save(id: string, rounds: RecordRound[], candidateTurns: RecordCandidateTurn[]): void {
    if (!Array.isArray(rounds) || rounds.length > 100 || !Array.isArray(candidateTurns) || candidateTurns.length > 200) throw new Error('记录批次过大');
    const session = this.db.prepare('SELECT data_json,status FROM interview_record_sessions WHERE id=?').get(text(id, 100)) as any;
    if (!session || session.status !== 'active') throw new Error('面试记录已结束或不存在');
    if (candidateTurns.length && !JSON.parse(session.data_json).captureCandidate) throw new Error('本场未开启本人回答采集');
    const clean = rounds.map(cleanRound);
    const turns = candidateTurns.map(t => ({
      id: text(t?.id, 160), text: text(t?.text, 16000), at: number(t?.at),
      ...(t.audioStartMs !== undefined ? { audioStartMs: number(t.audioStartMs) } : {}),
      ...(t.audioEndMs !== undefined ? { audioEndMs: number(t.audioEndMs) } : {}),
    }));
    const write = this.db.prepare(`INSERT INTO interview_record_rounds (session_id,id,revision,data_json) VALUES (?,?,?,?)
      ON CONFLICT(session_id,id) DO UPDATE SET revision=excluded.revision,data_json=excluded.data_json
      WHERE excluded.revision > interview_record_rounds.revision`);
    const turn = this.db.prepare(`INSERT INTO interview_record_candidate_turns (session_id,id,at,data_json) VALUES (?,?,?,?)
      ON CONFLICT(session_id,id) DO UPDATE SET data_json=excluded.data_json`);
    this.db.transaction(() => {
      for (const r of clean) write.run(id, r.id, r.revision, JSON.stringify(r));
      for (const t of turns) turn.run(id, t.id, t.at, JSON.stringify(t));
    })();
  }

  setCapture(id: string, enabled: boolean): void {
    if (typeof enabled !== 'boolean') throw new Error('采集设置无效');
    const row = this.db.prepare("SELECT data_json FROM interview_record_sessions WHERE id=? AND status='active'").get(text(id, 100)) as any;
    if (!row) throw new Error('面试记录已结束或不存在');
    if (enabled && JSON.parse(row.data_json).source === 'manual') throw new Error('手动测试不采集本人回答');
    this.db.prepare('UPDATE interview_record_sessions SET data_json=? WHERE id=?')
      .run(JSON.stringify({ ...JSON.parse(row.data_json), captureCandidate: enabled }), id);
  }

  end(id: string, status: 'completed' | 'interrupted'): void {
    choice(status, ['completed', 'interrupted']);
    const session = this.db.prepare('SELECT started_at,status FROM interview_record_sessions WHERE id=?').get(text(id, 100)) as any;
    if (!session || session.status !== 'active') return;
    const rows = this.db.prepare('SELECT id,data_json FROM interview_record_rounds WHERE session_id=?').all(id) as any[];
    const latestSpeech = this.db.prepare('SELECT MAX(at) AS at FROM interview_record_candidate_turns WHERE session_id=?').get(id) as any;
    const endedAt = status === 'completed' ? Date.now() : Math.max(session.started_at, latestSpeech.at || 0, ...rows.map(r => JSON.parse(r.data_json).updatedAt));
    this.db.transaction(() => {
      for (const row of rows) {
        const r = JSON.parse(row.data_json) as RecordRound;
        if (r.status === 'queued' || r.status === 'generating') {
          r.status = 'interrupted'; r.finishedAt = endedAt;
          this.db.prepare('UPDATE interview_record_rounds SET data_json=? WHERE session_id=? AND id=?').run(JSON.stringify(r), id, row.id);
        }
      }
      this.db.prepare('UPDATE interview_record_sessions SET ended_at=?,status=? WHERE id=?').run(endedAt, status, id);
    })();
  }

  private summary(row: any): RecordSessionSummary {
    return { ...JSON.parse(row.data_json), id: row.id, startedAt: row.started_at, endedAt: row.ended_at,
      status: row.status, questionCount: row.question_count || 0, failedCount: row.failed_count || 0, needsWorkCount: row.needs_work_count || 0 };
  }

  list(offset = 0): { records: RecordSessionSummary[]; hasMore: boolean } {
    if (!Number.isSafeInteger(offset) || offset < 0) throw new Error('分页参数无效');
    const rows = this.db.prepare(`SELECT s.*,COUNT(r.id) AS question_count,
      SUM(CASE WHEN json_extract(r.data_json,'$.status') IN ('error','interrupted') THEN 1 ELSE 0 END) AS failed_count,
      SUM(CASE WHEN r.rating='needs_work' THEN 1 ELSE 0 END) AS needs_work_count
      FROM interview_record_sessions s LEFT JOIN interview_record_rounds r ON s.id=r.session_id
      GROUP BY s.id ORDER BY s.started_at DESC,s.rowid DESC LIMIT 26 OFFSET ?`).all(offset) as any[];
    return { records: rows.slice(0, 25).map(r => this.summary(r)), hasMore: rows.length > 25 };
  }

  get(id: string): InterviewRecord | null {
    const row = this.db.prepare('SELECT * FROM interview_record_sessions WHERE id=?').get(text(id, 100)) as any;
    if (!row) return null;
    const rounds = (this.db.prepare('SELECT data_json,rating,note FROM interview_record_rounds WHERE session_id=? ORDER BY id').all(id) as any[])
      .map(r => ({ ...JSON.parse(r.data_json), review: { rating: r.rating, note: r.note } }));
    const candidateTurns = (this.db.prepare('SELECT data_json FROM interview_record_candidate_turns WHERE session_id=? ORDER BY at,id').all(id) as any[]).map(r => JSON.parse(r.data_json));
    return { ...this.summary(row), schemaVersion: 1, questionCount: rounds.length,
      failedCount: rounds.filter(r => ['error', 'interrupted'].includes(r.status)).length,
      needsWorkCount: rounds.filter(r => r.review.rating === 'needs_work').length, rounds, candidateTurns };
  }

  review(id: string, roundId: number, review: RecordReview): void {
    const result = this.db.prepare('UPDATE interview_record_rounds SET rating=?,note=? WHERE session_id=? AND id=?')
      .run(choice(review?.rating, ['unreviewed', 'good', 'needs_work']), text(review?.note, 8000), text(id, 100), number(roundId));
    if (!result.changes) throw new Error('题目不存在');
  }

  discard(id: string): void {
    this.db.transaction(() => {
      this.db.prepare('DELETE FROM interview_record_candidate_turns WHERE session_id=?').run(id);
      this.db.prepare('DELETE FROM interview_record_rounds WHERE session_id=?').run(id);
      this.db.prepare('DELETE FROM interview_record_sessions WHERE id=?').run(id);
    })();
  }

  prune(days: number, now = Date.now()): void {
    if (![7, 30].includes(days)) return;
    const rows = this.db.prepare("SELECT id FROM interview_record_sessions WHERE status!='active' AND started_at < ?").all(now - days * 86400000) as { id: string }[];
    this.db.transaction(() => { for (const { id } of rows) this.discard(id); })();
  }
}
