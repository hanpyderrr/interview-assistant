export function validatePartialEventSequence(events) {
  const safeEvents = Array.isArray(events) ? events : [];
  const partials = safeEvents.filter((event) => event?.kind === 'partial' && event?.speaker === 'interviewer');
  const finals = safeEvents.filter((event) => event?.kind === 'final' && event?.speaker === 'interviewer');
  const resets = safeEvents.filter((event) => event?.kind === 'reset');
  const summary = {
    valid: false,
    partialCount: partials.length,
    finalCount: finals.length,
    resetCount: resets.length,
  };
  if (!partials.length || !finals.length || !resets.length) return summary;

  const sessionIds = new Set(safeEvents.map((event) => event?.sessionId).filter(Number.isFinite));
  if (sessionIds.size !== 1 || safeEvents.some((event) => !Number.isFinite(event?.sessionId))) return summary;

  let previousSequence = -Infinity;
  for (const event of safeEvents) {
    if (!Number.isFinite(event?.sequence) || event.sequence <= previousSequence) return summary;
    previousSequence = event.sequence;
  }

  const partialSegmentIds = new Set(partials.map((event) => event.segmentId).filter(Number.isFinite));
  if (!partialSegmentIds.size) return summary;
  if (!finals.every((event) => Number.isFinite(event.segmentId) && partialSegmentIds.has(event.segmentId))) return summary;
  if (resets[0].sequence <= finals.at(-1).sequence) return summary;
  return { ...summary, valid: true };
}
