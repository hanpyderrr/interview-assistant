export type LocalWhisperChannel = 'interviewer' | 'user';

export class LocalWhisperSequenceCoordinator {
  private sessionId: number | null = null;
  private counters: Record<LocalWhisperChannel, number> = { interviewer: 0, user: 0 };
  private mappings: Record<LocalWhisperChannel, Map<string, number>> = {
    interviewer: new Map(),
    user: new Map(),
  };
  private readonly maxMappingsPerChannel: number;

  constructor({ maxMappingsPerChannel = 256 }: { maxMappingsPerChannel?: number } = {}) {
    this.maxMappingsPerChannel = Math.max(1, Math.floor(maxMappingsPerChannel));
  }

  beginMeeting(sessionId: number): void {
    if (this.sessionId === sessionId) return;
    this.sessionId = sessionId;
    this.counters = { interviewer: 0, user: 0 };
    this.mappings = { interviewer: new Map(), user: new Map() };
  }

  isCurrentSession(sessionId: number | undefined): boolean {
    return typeof sessionId === 'number' && sessionId === this.sessionId;
  }

  resolve(
    channel: LocalWhisperChannel,
    sessionId: number | undefined,
    instanceEpoch: number | null,
    providerSegmentId: number | undefined,
    _isFinal: boolean,
  ): number | null {
    if (!this.isCurrentSession(sessionId)) return null;
    if (instanceEpoch === null || !Number.isFinite(instanceEpoch) || !Number.isFinite(providerSegmentId)) return null;
    const key = `${instanceEpoch}:${providerSegmentId}`;
    const mappings = this.mappings[channel];
    const existing = mappings.get(key);
    if (existing !== undefined) {
      mappings.delete(key);
      mappings.set(key, existing);
      return existing;
    }
    const resolved = ++this.counters[channel];
    mappings.set(key, resolved);
    while (mappings.size > this.maxMappingsPerChannel) {
      const oldest = mappings.keys().next().value;
      if (oldest === undefined) break;
      mappings.delete(oldest);
    }
    return resolved;
  }

  mappingCount(channel: LocalWhisperChannel): number {
    return this.mappings[channel].size;
  }
}
