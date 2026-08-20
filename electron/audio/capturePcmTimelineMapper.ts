type CaptureLedgerEntry = {
  compressedStartMs: number;
  compressedEndMs: number;
  captureStartMs: number;
  captureEndMs: number;
};

export class CapturePcmTimelineMapper {
  readonly originMonotonicMs: number;
  private entries: CaptureLedgerEntry[] = [];
  private captureCursorMs = 0;
  compressedCursorMs = 0;

  get ledgerEntryCount(): number {
    return this.entries.length;
  }

  constructor({ originMonotonicMs }: { originMonotonicMs: number }) {
    this.originMonotonicMs = originMonotonicMs;
  }

  appendChunk(durationMs: number, captureEndMonotonicMs: number): void {
    if (!Number.isFinite(durationMs) || durationMs <= 0) return;
    const arrivalEndMs = Math.max(0, captureEndMonotonicMs - this.originMonotonicMs);
    const captureStartMs = Math.max(this.captureCursorMs, arrivalEndMs - durationMs);
    const entry: CaptureLedgerEntry = {
      compressedStartMs: this.compressedCursorMs,
      compressedEndMs: this.compressedCursorMs + durationMs,
      captureStartMs,
      captureEndMs: captureStartMs + durationMs,
    };
    const previous = this.entries[this.entries.length - 1];
    if (
      previous
      && Math.abs(previous.compressedEndMs - entry.compressedStartMs) < 0.000_001
      && Math.abs(previous.captureEndMs - entry.captureStartMs) < 0.000_001
    ) {
      previous.compressedEndMs = entry.compressedEndMs;
      previous.captureEndMs = entry.captureEndMs;
    } else {
      this.entries.push(entry);
    }
    this.compressedCursorMs = entry.compressedEndMs;
    this.captureCursorMs = entry.captureEndMs;
  }

  pruneBefore(compressedFloorMs: number): void {
    if (this.entries.length < 2 || !Number.isFinite(compressedFloorMs)) return;
    let low = 0;
    let high = this.entries.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (this.entries[middle].compressedEndMs <= compressedFloorMs) low = middle + 1;
      else high = middle;
    }
    if (low > 0) this.entries.splice(0, low);
  }

  mapRange(compressedStartMs: number, compressedEndMs: number): { startMs: number; endMs: number } {
    const startMs = this.mapPoint(compressedStartMs, 'start');
    const endMs = this.mapPoint(compressedEndMs, 'end');
    return { startMs, endMs: Math.max(startMs, endMs) };
  }

  private mapPoint(pointMs: number, edge: 'start' | 'end'): number {
    if (this.entries.length === 0) return Math.max(0, pointMs);
    let low = 0;
    let high = this.entries.length;
    if (edge === 'start') {
      while (low < high) {
        const middle = (low + high) >>> 1;
        if (this.entries[middle].compressedStartMs <= pointMs) low = middle + 1;
        else high = middle;
      }
      low = Math.max(0, low - 1);
    } else {
      while (low < high) {
        const middle = (low + high) >>> 1;
        if (this.entries[middle].compressedEndMs < pointMs) low = middle + 1;
        else high = middle;
      }
      low = Math.min(low, this.entries.length - 1);
    }
    const resolved = this.entries[low];
    const clampedPoint = Math.max(resolved.compressedStartMs, Math.min(pointMs, resolved.compressedEndMs));
    return resolved.captureStartMs + (clampedPoint - resolved.compressedStartMs);
  }
}
