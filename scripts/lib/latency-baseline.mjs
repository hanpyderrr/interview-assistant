const NORMAL_EVENTS = ['audioEnd', 'firstInterviewerFinal', 'questionSettled', 'retrievalReady', 'firstAnswerToken', 'answerDone'];
const FALLBACK_EVENTS = ['audioEnd', 'firstInterviewerFinal', 'questionSettled', 'retrievalReady', 'providerDeadline', 'providerError', 'fallbackAnswerStart', 'firstAnswerToken', 'answerDone'];
const CSV_COLUMNS = [
  'fixture', 'questionGenerationId', ...FALLBACK_EVENTS,
  'providerOutcome', 'providerDeadlineMs', 'providerTtftMs', 'providerTimeout', 'tokensPerSecond',
];

function strictlyIncreasing(events, names) {
  let previous = -Infinity;
  return names.every((name) => {
    const value = events?.[name];
    const valid = typeof value === 'number' && Number.isFinite(value) && value > previous;
    if (valid) previous = value;
    return valid;
  });
}

export function isCompleteBaselineRecord(record) {
  const outcome = record?.provider?.outcome;
  if (outcome === 'timeout' || outcome === 'error') return strictlyIncreasing(record.events, FALLBACK_EVENTS);
  if (outcome !== 'success') return false;
  return strictlyIncreasing(record.events, NORMAL_EVENTS);
}

function percentile(values, percentileRank) {
  if (values.length === 0) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(percentileRank * sorted.length) - 1));
  return sorted[index];
}

function numericValues(records, selector) {
  return records.map(selector).filter((value) => typeof value === 'number' && Number.isFinite(value));
}

function summarize(values) {
  return { p50: percentile(values, 0.5), p95: percentile(values, 0.95) };
}

export function aggregateLatencyRecords(records) {
  const safeRecords = Array.isArray(records) ? records : [];
  const complete = safeRecords.filter(isCompleteBaselineRecord).length;
  const providerFailures = safeRecords.filter((record) => record?.provider?.outcome === 'timeout' || record?.provider?.outcome === 'error');
  const providerSuccesses = safeRecords.filter((record) => record?.provider?.outcome === 'success');
  const ttft = numericValues(providerSuccesses, (record) => record.provider.ttftMs);
  const deadlines = numericValues(safeRecords, (record) => record.provider?.deadlineMs);
  const tokenRates = numericValues(providerSuccesses, (record) => record.provider.tokensPerSecond);
  const timeoutCount = safeRecords.filter((record) => record?.provider?.timeout === true || record?.provider?.outcome === 'timeout').length;
  return {
    sampleCount: safeRecords.length,
    eventCompletenessRate: safeRecords.length ? complete / safeRecords.length : 0,
    providerFailureRate: safeRecords.length ? providerFailures.length / safeRecords.length : 0,
    providerTimeoutFrequency: safeRecords.length ? timeoutCount / safeRecords.length : 0,
    providerDeadlineMs: summarize(deadlines),
    providerSuccessTtftMs: summarize(ttft),
    tokensPerSecond: summarize(tokenRates),
  };
}

function csvValue(value) {
  if (value === undefined || value === null) return '';
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function latencyRecordsToCsv(records) {
  const rows = [CSV_COLUMNS.join(',')];
  for (const record of records || []) {
    rows.push(CSV_COLUMNS.map((column) => {
      if (column === 'fixture' || column === 'questionGenerationId') return csvValue(record?.[column]);
      if (column === 'providerOutcome') return csvValue(record?.provider?.outcome);
      if (column === 'providerDeadlineMs') return csvValue(record?.provider?.deadlineMs);
      if (column === 'providerTtftMs') return csvValue(record?.provider?.ttftMs);
      if (column === 'providerTimeout') return csvValue(record?.provider?.timeout);
      if (column === 'tokensPerSecond') return csvValue(record?.provider?.tokensPerSecond);
      return csvValue(record?.events?.[column]);
    }).join(','));
  }
  return `${rows.join('\n')}\n`;
}
