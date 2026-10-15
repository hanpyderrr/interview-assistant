export type RecordStatus = 'active' | 'completed' | 'interrupted';
export type ReviewRating = 'unreviewed' | 'good' | 'needs_work';
export interface RecordProfile {
  company: string; position: string; role: string; defaultProjectId: string;
}
export interface RecordSessionInput {
  title: string;
  profile: RecordProfile;
  source: 'system' | 'microphone' | 'manual';
  captureCandidate: boolean;
}
export interface RecordRound {
  id: number;
  revision: number;
  question: string;
  originalQuestion: string;
  answer: string;
  status: 'queued' | 'generating' | 'answered' | 'error' | 'interrupted';
  answerSource: 'model' | 'reference' | 'guidance' | 'unavailable';
  error?: string;
  answerLevel: string;
  englishMode: boolean;
  model: string;
  profile: RecordProfile;
  scope: { role?: string; projectIds?: string[] };
  askedAt: number;
  updatedAt: number;
  firstAnswerAt?: number;
  finishedAt?: number;
  hits: Array<{ id: string; title: string; source?: string }>;
}
export interface RecordCandidateTurn {
  id: string; text: string; at: number;
  audioStartMs?: number; audioEndMs?: number;
}
export interface RecordReview { rating: ReviewRating; note: string }
export interface SavedRecordRound extends RecordRound { review: RecordReview }
export interface RecordSessionSummary extends RecordSessionInput {
  id: string; startedAt: number; endedAt: number | null; status: RecordStatus;
  questionCount: number; failedCount: number; needsWorkCount: number;
}
export interface InterviewRecord extends RecordSessionSummary {
  schemaVersion: 1;
  rounds: SavedRecordRound[];
  candidateTurns: RecordCandidateTurn[];
}
export interface RecordResult { success: boolean; error?: string; disabled?: boolean }
export interface InterviewRecordsAPI {
  beginInterviewRecord: (input: RecordSessionInput) => Promise<RecordResult & { id?: string }>;
  saveInterviewRecord: (id: string, rounds: RecordRound[], candidateTurns: RecordCandidateTurn[]) => Promise<RecordResult>;
  setInterviewRecordCapture: (id: string, enabled: boolean) => Promise<RecordResult>;
  endInterviewRecord: (id: string, status: 'completed' | 'interrupted') => Promise<RecordResult>;
  listInterviewRecords: (offset?: number) => Promise<{ records: RecordSessionSummary[]; hasMore: boolean }>;
  getInterviewRecord: (id: string) => Promise<InterviewRecord | null>;
  reviewInterviewRound: (id: string, roundId: number, review: RecordReview) => Promise<RecordResult>;
  exportInterviewRecord: (id: string, format: 'json' | 'markdown') => Promise<RecordResult & { canceled?: boolean; path?: string }>;
}
