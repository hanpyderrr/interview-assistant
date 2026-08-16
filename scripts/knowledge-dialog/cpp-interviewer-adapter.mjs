import { spawn } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';

const CREDENTIAL_FIELD = /api[-_]?key|token|password|authorization|cookie|secret/i;

function findCredentialField(value, seen = new WeakSet()) {
  if (value === null || typeof value !== 'object' || seen.has(value)) return null;
  seen.add(value);
  for (const [key, child] of Object.entries(value)) {
    if (CREDENTIAL_FIELD.test(key)) return key;
    const nested = findCredentialField(child, seen);
    if (nested) return nested;
  }
  return null;
}

function parseResponse(line) {
  let response;
  try {
    response = JSON.parse(line);
  } catch (error) {
    throw new Error(`C++ interviewer emitted invalid JSON: ${error.message}`);
  }
  if (!response || typeof response !== 'object' || response.protocol_version !== 1) {
    throw new Error('C++ interviewer response has an invalid protocol_version');
  }
  if (typeof response.request_id !== 'string' || !response.request_id) {
    throw new Error('C++ interviewer response is missing request_id');
  }
  if (!['success', 'error', 'complete'].includes(response.type)) {
    throw new Error('C++ interviewer response has an invalid type');
  }
  const credential = findCredentialField(response);
  if (credential) throw new Error(`C++ interviewer response contains credential-like field: ${credential}`);
  if (response.type === 'error') {
    if (typeof response.error?.code !== 'string' || typeof response.error?.message !== 'string') {
      throw new Error('C++ interviewer error response is malformed');
    }
  } else if (!('result' in response)) {
    throw new Error('C++ interviewer response is missing result');
  }
  return response;
}

export function createCppInterviewerAdapter({
  executable,
  configPath,
  timeoutMs = 30_000,
  spawnImpl = spawn,
} = {}) {
  if (typeof executable !== 'string' || !executable) throw new Error('executable is required');
  if (typeof configPath !== 'string' || !configPath) throw new Error('configPath is required');
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('timeoutMs must be positive');

  const child = spawnImpl(executable, ['--config', configPath], {
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  });
  const pending = new Map();
  const decoder = new StringDecoder('utf8');
  let stdoutBuffer = '';
  let sequence = 0;
  let exited = false;
  let closingPromise;

  const rejectAll = (error) => {
    for (const entry of pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(error);
    }
    pending.clear();
  };

  const handleLine = (line) => {
    if (!line.trim()) return;
    let response;
    try {
      response = parseResponse(line);
    } catch (error) {
      rejectAll(error);
      return;
    }
    const entry = pending.get(response.request_id);
    if (!entry) return;
    pending.delete(response.request_id);
    clearTimeout(entry.timer);
    if (response.type === 'error') {
      entry.reject(new Error(`C++ interviewer ${response.error.code}: ${response.error.message}`));
    } else {
      entry.resolve(response.result);
    }
  };

  child.stdout.on('data', (chunk) => {
    stdoutBuffer += typeof chunk === 'string' ? chunk : decoder.write(chunk);
    const lines = stdoutBuffer.split(/\r?\n/);
    stdoutBuffer = lines.pop() ?? '';
    lines.forEach(handleLine);
  });
  child.stderr.on('data', () => {});
  child.on('error', (error) => {
    exited = true;
    rejectAll(new Error(`C++ interviewer failed: ${error.message}`));
  });
  child.on('exit', (code, signal) => {
    exited = true;
    rejectAll(new Error(`C++ interviewer exited (code=${code ?? 'null'}, signal=${signal ?? 'null'})`));
  });

  const request = (operation, payload) => {
    if (exited) return Promise.reject(new Error('C++ interviewer has exited'));
    const requestId = `node-${++sequence}`;
    const message = { protocol_version: 1, request_id: requestId, operation, payload };
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(requestId);
        reject(new Error(`C++ interviewer request ${requestId} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      pending.set(requestId, { resolve, reject, timer });
      try {
        child.stdin.write(`${JSON.stringify(message)}\n`);
      } catch (error) {
        clearTimeout(timer);
        pending.delete(requestId);
        reject(error);
      }
    });
  };

  return {
    generateQuestions(resumeText, minQuestions = 5) {
      return request('generate_questions', { resume_text: resumeText, min_questions: minQuestions });
    },
    evaluateAnswer(question, answer) {
      return request('evaluate_answer', { question, answer });
    },
    generateSummary(records, resumeText = '') {
      return request('generate_summary', { records, resume_text: resumeText });
    },
    close() {
      if (closingPromise) return closingPromise;
      if (exited) return Promise.resolve();
      closingPromise = request('shutdown', {}).then(() => {
        child.stdin.end();
      }, (error) => {
        child.stdin.end();
        throw error;
      });
      return closingPromise;
    },
  };
}
